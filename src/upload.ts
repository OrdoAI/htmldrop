import { generateId as defaultGenerateId, generatePassword } from "./utils";
import { MAX_TTL_DAYS, expiresAtOf, verifyPassword } from "./auth";
import { type PageKey, type PageMeta, V3_MAX_PAGE_BYTES, derivePageKey, sealPageV3 } from "./envelope";
import { applyAnchorRemaps, resealLegacyComments, validateAnchorRemaps } from "./comments";
import { publicOrigin, withTransportSecurity } from "./security";

// Two request shapes share one handler.
//
// `application/x-htmldrop-upload` is the streaming one: a single JSON line of
// metadata (the same fields as the JSON API minus `html`, plus the page's
// UTF-8 length as `bytes`), a newline, then the raw page. The page is sealed
// frame by frame straight into R2, so a 50 MiB upload costs the Worker about
// two frames of memory. `bytes` is what the sealer checks the body against;
// a body that is shorter or longer fails the put, and nothing is written.
//
// `application/json` is the original API, kept for older CLI installs. It has
// to hold the whole request as a string before it can see the page, so its
// limits stay where the memory budget put them (24 MiB page, 25 MiB body).
export const RAW_CONTENT_TYPE = "application/x-htmldrop-upload";
export const MAX_PAGE_BYTES = V3_MAX_PAGE_BYTES; // 50 MiB
// Room for the worst legal `commentAnchors` (500 remaps of escaped CJK text,
// about 4.6 MB) with margin.
const MAX_PREAMBLE_BYTES = 8 * 1024 * 1024;
const MAX_JSON_HTML_BYTES = 24 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 25 * 1024 * 1024;
const MAX_FILENAME_BYTES = 1024;
const MAX_RETRIES = 3;

interface Env {
  BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

interface UploadMeta {
  filename: unknown;
  id?: unknown;
  password?: unknown;
  // Optional agent-assisted anchor migration on the update path.
  commentAnchors?: unknown;
  // Visibility and lifetime. Both default to private / 7 days on create and
  // to the stored values on update.
  public?: unknown;
  expiresInDays?: unknown;
  // Streaming shape only: UTF-8 length of the page that follows the newline.
  bytes?: unknown;
}

interface PageContent {
  stream: ReadableStream<Uint8Array>;
  bytes: number;
}

function readPublic(v: unknown): boolean | undefined | "invalid" {
  if (v === undefined) return undefined;
  return typeof v === "boolean" ? v : "invalid";
}

function readTtl(v: unknown): number | undefined | "invalid" {
  if (v === undefined) return undefined;
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_TTL_DAYS
    ? (v as number)
    : "invalid";
}

export interface UploadDeps {
  generateId: () => string;
}

const defaultDeps: UploadDeps = { generateId: defaultGenerateId };

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function textResponse(body: BodyInit, init: ResponseInit, request: Request): Response {
  return new Response(body, {
    ...init,
    headers: withTransportSecurity(init.headers ?? {}, request),
  });
}

function tooLarge(request: Request, what: string, size: number | null, limit: number): Response {
  const seen = size === null ? "" : `${size} bytes `;
  return textResponse(`${what} too large: ${seen}exceeds ${limit} byte limit`, { status: 413 }, request);
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get("Content-Length");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Reads a body in full, giving up (null) as soon as it passes `limit` bytes
// rather than after buffering all of an oversized request.
async function readCapped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  return concat(parts, total);
}

type Parsed = { meta: UploadMeta; content: PageContent } | Response;

async function readJsonUpload(request: Request): Promise<Parsed> {
  const declared = declaredLength(request);
  if (declared !== null && declared > MAX_JSON_BODY_BYTES) {
    return tooLarge(request, "Request body", declared, MAX_JSON_BODY_BYTES);
  }
  const raw = await readCapped(request.body, MAX_JSON_BODY_BYTES);
  if (raw === null) return tooLarge(request, "Request body", null, MAX_JSON_BODY_BYTES);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return textResponse("Invalid JSON", { status: 400 }, request);
  }
  if (!body || typeof body !== "object") {
    return textResponse("Invalid body", { status: 400 }, request);
  }
  const { html, ...meta } = body as UploadMeta & { html: unknown };
  if (typeof html !== "string" || html.length === 0) {
    return textResponse("Missing or invalid 'html' field", { status: 400 }, request);
  }
  const page = enc(html);
  if (page.length > MAX_JSON_HTML_BYTES) return tooLarge(request, "File", page.length, MAX_JSON_HTML_BYTES);
  return {
    meta,
    content: {
      bytes: page.length,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(page);
          controller.close();
        },
      }),
    },
  };
}

async function readRawUpload(request: Request): Promise<Parsed> {
  const declared = declaredLength(request);
  if (declared !== null && declared > MAX_PREAMBLE_BYTES + 1 + MAX_PAGE_BYTES) {
    return tooLarge(request, "Request body", declared, MAX_PREAMBLE_BYTES + 1 + MAX_PAGE_BYTES);
  }
  if (!request.body) return textResponse("Missing body", { status: 400 }, request);
  const reader = request.body.getReader();
  // Buffer only the metadata: the bytes before the first newline. The rest of
  // the chunk that holds the newline is the start of the page.
  const parts: Uint8Array[] = [];
  let total = 0;
  let newline = -1;
  let rest = new Uint8Array(0);
  while (newline < 0) {
    const { value, done } = await reader.read();
    if (done) break;
    const at = value.indexOf(0x0a);
    if (at >= 0) {
      newline = total + at;
      parts.push(value.subarray(0, at));
      total += at;
      rest = value.subarray(at + 1);
      break;
    }
    parts.push(value);
    total += value.length;
    if (total > MAX_PREAMBLE_BYTES) {
      await reader.cancel();
      return tooLarge(request, "Upload metadata", null, MAX_PREAMBLE_BYTES);
    }
  }
  if (newline < 0) {
    return textResponse("Missing metadata line: expected one JSON line, a newline, then the page", { status: 400 }, request);
  }
  if (newline > MAX_PREAMBLE_BYTES) {
    await reader.cancel();
    return tooLarge(request, "Upload metadata", newline, MAX_PREAMBLE_BYTES);
  }
  let meta: unknown;
  try {
    meta = JSON.parse(new TextDecoder().decode(concat(parts, total)));
  } catch {
    await reader.cancel();
    return textResponse("Invalid metadata JSON", { status: 400 }, request);
  }
  if (!meta || typeof meta !== "object") {
    await reader.cancel();
    return textResponse("Invalid metadata", { status: 400 }, request);
  }
  const bytes = (meta as UploadMeta).bytes;
  if (!Number.isInteger(bytes) || (bytes as number) < 1) {
    await reader.cancel();
    return textResponse("'bytes' must be the page's UTF-8 length, a positive integer", { status: 400 }, request);
  }
  if ((bytes as number) > MAX_PAGE_BYTES) {
    await reader.cancel();
    return tooLarge(request, "File", bytes as number, MAX_PAGE_BYTES);
  }
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (rest.length) controller.enqueue(rest);
    },
    async pull(controller) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch (err) {
        // A read still in flight when the sealer cancels this stream rejects
        // too; the consumer already has its error, nothing left to report.
        if (!cancelled) controller.error(err);
        return;
      }
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel() {
      cancelled = true;
      return reader.cancel().catch(() => {});
    },
  });
  return { meta: meta as UploadMeta, content: { stream, bytes: bytes as number } };
}

// Seals the page straight into R2. The put is atomic: any stream error
// (body length mismatch, client disconnect) leaves the previous object, if
// any, untouched.
async function storePage(
  bucket: R2Bucket,
  id: string,
  pageKey: PageKey,
  meta: PageMeta,
  filename: string,
  content: PageContent,
): Promise<void> {
  const sealer = await sealPageV3(pageKey, meta, filename, content.bytes);
  const sealed = sealer.seal(content.stream);
  // R2 wants a known length, hence the FixedLengthStream, pumped by hand.
  // Whichever side fails first (the sealer, the request body, or the put)
  // takes the other down with the same reason, so the handler always
  // finishes and the first error is the one reported.
  const fixed = new FixedLengthStream(sealer.objectBytes);
  const writer = fixed.writable.getWriter();
  const reader = sealed.getReader();
  let failure: unknown;
  const fail = (err: unknown) => {
    failure ??= err;
    writer.abort(err).catch(() => {});
    reader.cancel(err).catch(() => {});
  };
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (err) {
      fail(err);
      throw err;
    }
  })();
  const put = bucket.put(`page:${id}`, fixed.readable).catch((err: unknown) => {
    fail(err);
    throw err;
  });
  const settled = await Promise.allSettled([pump, put]);
  if (settled.some((r) => r.status === "rejected")) throw failure instanceof Error ? failure : new Error(String(failure));
}

export async function handleUpload(
  request: Request,
  env: Env,
  deps: UploadDeps = defaultDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return textResponse("Method Not Allowed", { status: 405 }, request);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  let parsed: Parsed;
  if (contentType.includes(RAW_CONTENT_TYPE)) {
    parsed = await readRawUpload(request);
  } else if (contentType.includes("application/json")) {
    parsed = await readJsonUpload(request);
  } else {
    return textResponse(`Content-Type must be ${RAW_CONTENT_TYPE} or application/json`, { status: 415 }, request);
  }
  if (parsed instanceof Response) return parsed;
  const { meta, content } = parsed;
  const { filename, id: updateId, password: updatePassword } = meta;

  if (typeof filename !== "string" || filename.length === 0) {
    return textResponse("Missing or invalid 'filename' field", { status: 400 }, request);
  }
  if (enc(filename).length > MAX_FILENAME_BYTES) {
    return textResponse(`'filename' must be at most ${MAX_FILENAME_BYTES} bytes`, { status: 400 }, request);
  }

  const wantPublic = readPublic(meta.public);
  if (wantPublic === "invalid") {
    return textResponse("'public' must be a boolean", { status: 400 }, request);
  }
  const wantTtl = readTtl(meta.expiresInDays);
  if (wantTtl === "invalid") {
    return textResponse(
      `'expiresInDays' must be an integer from 1 to ${MAX_TTL_DAYS}`,
      { status: 400 },
      request,
    );
  }

  // Update path: a holder of the existing id + password overwrites that page in
  // place, keeping the same URL. Anything other than both-present-and-valid is
  // rejected; a rejected update never touches the stored record.
  if (updateId !== undefined || updatePassword !== undefined) {
    if (typeof updateId !== "string" || typeof updatePassword !== "string") {
      return textResponse(
        "Both 'id' and 'password' are required to update an existing preview",
        { status: 400 },
        request,
      );
    }
    const existing = await verifyPassword(env.BUCKET, updateId, updatePassword);
    if (!existing) {
      return textResponse("Invalid id or password", { status: 403 }, request);
    }
    // Validate the optional anchor remaps before any write, so a malformed
    // remap leaves both the page record and every comment record unchanged.
    const remap = validateAnchorRemaps(meta.commentAnchors);
    if ("error" in remap) {
      return textResponse(`Invalid commentAnchors: ${remap.error}`, { status: 400 }, request);
    }
    // Same password, so the same key re-seals the new content. The pin is
    // carried forward from the stored record; the request body can never set it.
    // Visibility and lifetime keep their stored values unless the body says so.
    const isPublic = wantPublic ?? existing.public;
    const ttlDays = wantTtl ?? existing.ttlDays;
    const createdAt = new Date().toISOString(); // the expiry window restarts on update
    try {
      await storePage(
        env.BUCKET,
        updateId,
        { key: existing.key, verifier: existing.verifier },
        {
          id: updateId,
          createdAt,
          version: crypto.randomUUID(), // changes on every overwrite for cache + probe
          ...(existing.pinned ? { pinned: true } : {}),
          ...(ttlDays !== undefined ? { ttlDays } : {}),
          ...(isPublic ? { public: true } : {}),
        },
        filename,
        content,
      );
    } catch (err) {
      return textResponse(`Upload failed: ${(err as Error).message}`, { status: 400 }, request);
    }
    // Agent-assisted migration: the document structure changed, so patch the
    // surviving root comments to their remapped quotes (or explicit orphan).
    await applyAnchorRemaps(env.BUCKET, updateId, existing.key, remap.remaps);
    await resealLegacyComments(env.BUCKET, updateId, existing.key);
    return Response.json({
      url: `${publicOrigin(request)}/${updateId}?p=${updatePassword}`,
      id: updateId,
      password: updatePassword,
      expiresAt: existing.pinned ? null : expiresAtOf(createdAt, ttlDays),
      public: isPublic,
      ...(isPublic ? { publicUrl: `${publicOrigin(request)}/${updateId}` } : {}),
    }, {
      headers: withTransportSecurity({}, request),
    });
  }

  const password = generatePassword();

  let id: string | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidate = deps.generateId();
    const existing = await env.BUCKET.head(`page:${candidate}`);
    if (existing === null) {
      id = candidate;
      break;
    }
  }

  if (id === null) {
    return textResponse("Failed to generate unique ID, try again", { status: 503 }, request);
  }

  const createdAt = new Date().toISOString();
  const isPublic = wantPublic === true;
  try {
    await storePage(
      env.BUCKET,
      id,
      await derivePageKey(id, password),
      {
        id,
        createdAt,
        version: crypto.randomUUID(),
        ...(wantTtl !== undefined ? { ttlDays: wantTtl } : {}),
        ...(isPublic ? { public: true } : {}),
      },
      filename,
      content,
    );
  } catch (err) {
    return textResponse(`Upload failed: ${(err as Error).message}`, { status: 400 }, request);
  }

  return Response.json({
    url: `${publicOrigin(request)}/${id}?p=${password}`,
    id,
    password,
    expiresAt: expiresAtOf(createdAt, wantTtl),
    public: isPublic,
    ...(isPublic ? { publicUrl: `${publicOrigin(request)}/${id}` } : {}),
  }, {
    headers: withTransportSecurity({}, request),
  });
}
