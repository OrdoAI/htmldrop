import { generateId as defaultGenerateId, generatePassword, utf8ByteLength } from "./utils";
import { type PageRecord, verifyPassword } from "./auth";
import { applyAnchorRemaps, validateAnchorRemaps } from "./comments";
import { publicOrigin, withTransportSecurity } from "./security";

const MAX_HTML_BYTES = 24 * 1024 * 1024; // 24 MiB content limit
const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MiB body guard
const MAX_RETRIES = 3;
const TTL_SECONDS = 604800; // 7 days

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
    const updated: PageRecord = {
      html,
      password: existing.password,
      filename,
      createdAt: new Date().toISOString(), // refresh the 7-day expiry on update
      version: crypto.randomUUID(), // changes on every overwrite for cache + probe
    };
    await env.BUCKET.put(`page:${updateId}`, JSON.stringify(updated));
    // Agent-assisted migration: the document structure changed, so patch the
    // surviving root comments to their remapped quotes (or explicit orphan).
    await applyAnchorRemaps(env.BUCKET, updateId, remap.remaps);
    const updatedExpiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
    return Response.json({
      url: `${publicOrigin(request)}/${updateId}?p=${existing.password}`,
      id: updateId,
      password: existing.password,
      expiresAt: updatedExpiresAt,
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

  const record: PageRecord = {
    html,
    password,
    filename,
    createdAt: new Date().toISOString(),
    version: crypto.randomUUID(),
  };

  await env.BUCKET.put(`page:${id}`, JSON.stringify(record));

  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  return Response.json({
    url: `${publicOrigin(request)}/${id}?p=${password}`,
    id,
    password,
    expiresAt,
  }, {
    headers: withTransportSecurity({}, request),
  });
}
