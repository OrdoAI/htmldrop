import { generateId as defaultGenerateId, generatePassword, utf8ByteLength } from "./utils";
import { MAX_TTL_DAYS, expiresAtOf, verifyPassword } from "./auth";
import { derivePageKey, sealPage } from "./envelope";
import { applyAnchorRemaps, resealLegacyComments, validateAnchorRemaps } from "./comments";
import { publicOrigin, withTransportSecurity } from "./security";

const MAX_HTML_BYTES = 24 * 1024 * 1024; // 24 MiB content limit
const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MiB body guard
const MAX_RETRIES = 3;

interface Env {
  BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

interface UploadBody {
  html: unknown;
  filename: unknown;
  id?: unknown;
  password?: unknown;
  // Optional agent-assisted anchor migration on the update path.
  commentAnchors?: unknown;
  // Visibility and lifetime. Both default to private / 7 days on create and
  // to the stored values on update.
  public?: unknown;
  expiresInDays?: unknown;
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

function textResponse(body: BodyInit, init: ResponseInit, request: Request): Response {
  return new Response(body, {
    ...init,
    headers: withTransportSecurity(init.headers ?? {}, request),
  });
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
  if (!contentType.includes("application/json")) {
    return textResponse("Content-Type must be application/json", { status: 415 }, request);
  }

  const rawBody = await request.text();
  const rawByteLength = utf8ByteLength(rawBody);
  if (rawByteLength > MAX_BODY_BYTES) {
    return textResponse(
      `Request body too large: ${rawByteLength} bytes exceeds ${MAX_BODY_BYTES} byte limit`,
      { status: 413 },
      request,
    );
  }

  let body: UploadBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return textResponse("Invalid JSON", { status: 400 }, request);
  }

  if (!body || typeof body !== "object") {
    return textResponse("Invalid body", { status: 400 }, request);
  }

  const { html, filename, id: updateId, password: updatePassword } = body;

  if (typeof html !== "string" || html.length === 0) {
    return textResponse("Missing or invalid 'html' field", { status: 400 }, request);
  }

  if (typeof filename !== "string" || filename.length === 0) {
    return textResponse("Missing or invalid 'filename' field", { status: 400 }, request);
  }

  const wantPublic = readPublic(body.public);
  if (wantPublic === "invalid") {
    return textResponse("'public' must be a boolean", { status: 400 }, request);
  }
  const wantTtl = readTtl(body.expiresInDays);
  if (wantTtl === "invalid") {
    return textResponse(
      `'expiresInDays' must be an integer from 1 to ${MAX_TTL_DAYS}`,
      { status: 400 },
      request,
    );
  }

  const htmlByteLength = utf8ByteLength(html);
  if (htmlByteLength > MAX_HTML_BYTES) {
    return textResponse(
      `File too large: ${htmlByteLength} bytes exceeds ${MAX_HTML_BYTES} byte limit`,
      { status: 413 },
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
    const remap = validateAnchorRemaps(body.commentAnchors);
    if ("error" in remap) {
      return textResponse(`Invalid commentAnchors: ${remap.error}`, { status: 400 }, request);
    }
    // Same password, so the same key re-seals the new content. The pin is
    // carried forward from the stored record; the request body can never set it.
    // Visibility and lifetime keep their stored values unless the body says so.
    const isPublic = wantPublic ?? existing.public;
    const ttlDays = wantTtl ?? existing.ttlDays;
    const createdAt = new Date().toISOString(); // the expiry window restarts on update
    const updated = await sealPage(
      { key: existing.key, verifier: existing.verifier },
      {
        id: updateId,
        createdAt,
        version: crypto.randomUUID(), // changes on every overwrite for cache + probe
        ...(existing.pinned ? { pinned: true } : {}),
        ...(ttlDays !== undefined ? { ttlDays } : {}),
        ...(isPublic ? { public: true } : {}),
      },
      { html, filename },
    );
    await env.BUCKET.put(`page:${updateId}`, JSON.stringify(updated));
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
  const record = await sealPage(
    await derivePageKey(id, password),
    {
      id,
      createdAt,
      version: crypto.randomUUID(),
      ...(wantTtl !== undefined ? { ttlDays: wantTtl } : {}),
      ...(isPublic ? { public: true } : {}),
    },
    { html, filename },
  );

  await env.BUCKET.put(`page:${id}`, JSON.stringify(record));

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
