import { type QuoteAnchor } from "./anchor";
import { getPage, verifyCommentToken } from "./auth";
import { withTransportSecurity } from "./security";
import { utf8ByteLength } from "./utils";

interface Env {
  BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

// A root comment is anchored to a quote (or explicitly orphaned with
// `anchor: null`). A reply carries `parentId` and never an anchor. One R2
// object per comment/reply under `comment:${id}:${cid}` so concurrent creates
// never lose-update; resolve rewrites a single object (last write wins on that
// one record only).
export interface CommentRecord {
  cid: string;
  parentId?: string;
  anchor?: QuoteAnchor | null;
  author: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

const MAX_TEXT = 4000;
const MAX_EXACT = 1000;
const MAX_CONTEXT = 256; // prefix and suffix each
const MAX_AUTHOR = 80;
const MAX_COMMENTS = 500; // per page
const MAX_BODY_BYTES = 64 * 1024; // request body guard

const COMMENT_HEADERS: HeadersInit = {
  "Content-Type": "application/json; charset=utf-8",
  // The widget runs in the `sandbox allow-scripts` preview (opaque origin), so
  // its fetch is cross-origin and needs CORS to read the body.
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

function commentKey(id: string, cid: string): string {
  return `comment:${id}:${cid}`;
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withTransportSecurity(COMMENT_HEADERS, request),
  });
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

// Returns the page record only when the page exists AND the comment token is
// valid. Returns null for missing page, missing/wrong/expired/cross-page token
// alike, so callers respond identically and nothing about page existence leaks.
async function authorize(env: Env, id: string, token: string | null) {
  if (!token || !env.AUTH_SECRET) return null;
  const record = await getPage(env.BUCKET, id);
  if (!record) return null;
  const ok = await verifyCommentToken(env.AUTH_SECRET, id, record.password, token);
  return ok ? record : null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// Read access for the comment list: either the sandbox widget's comment token,
// or the page password (owner/agent export, used by the CLI before a re-upload
// to remap anchors). The password authorizes reads only; writes still require
// the comment token. Returns null uniformly for missing page / bad credentials
// so a GET never enumerates page existence.
async function authorizeRead(
  env: Env,
  id: string,
  token: string | null,
  password: string | null,
) {
  if (!env.AUTH_SECRET) return null;
  const record = await getPage(env.BUCKET, id);
  if (!record) return null;
  if (token && await verifyCommentToken(env.AUTH_SECRET, id, record.password, token)) return record;
  if (password && timingSafeEqual(password, record.password)) return record;
  return null;
}

function isValidRecord(value: unknown): value is CommentRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return isString(r.cid) && isString(r.author) && isString(r.text) && isString(r.createdAt);
}

async function listComments(bucket: R2Bucket, id: string): Promise<CommentRecord[]> {
  const listed = await bucket.list({ prefix: `comment:${id}:`, limit: 1000 });
  const records: CommentRecord[] = [];
  for (const obj of listed.objects) {
    const stored = await bucket.get(obj.key);
    if (!stored) continue;
    try {
      const parsed: unknown = JSON.parse(await stored.text());
      // Skip malformed records rather than break the whole response.
      if (isValidRecord(parsed)) records.push(parsed);
    } catch {
      continue;
    }
  }
  records.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return records;
}

function readQuoteAnchor(value: unknown): QuoteAnchor | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return "invalid";
  const a = value as Record<string, unknown>;
  const exact = a.exact;
  const prefix = a.prefix ?? "";
  const suffix = a.suffix ?? "";
  if (!isString(exact) || !isString(prefix) || !isString(suffix)) return "invalid";
  if (exact.length === 0 || exact.length > MAX_EXACT) return "invalid";
  if (prefix.length > MAX_CONTEXT || suffix.length > MAX_CONTEXT) return "invalid";
  return { exact, prefix, suffix };
}

export interface AnchorRemap {
  cid: string;
  anchor: QuoteAnchor | null;
}

// Validate the optional `commentAnchors` upload payload with no I/O, so the
// caller can reject a malformed remap before touching the page record or any
// comment. Limits mirror create. Returns parsed remaps or an error message.
export function validateAnchorRemaps(
  raw: unknown,
): { remaps: AnchorRemap[] } | { error: string } {
  if (raw === undefined || raw === null) return { remaps: [] };
  if (!Array.isArray(raw)) return { error: "must be an array" };
  if (raw.length > MAX_COMMENTS) return { error: "too many entries" };
  const remaps: AnchorRemap[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "invalid entry" };
    const cid = (item as Record<string, unknown>).cid;
    if (!isString(cid) || cid.length === 0 || cid.length > 64) return { error: "invalid cid" };
    const anchor = readQuoteAnchor((item as Record<string, unknown>).anchor);
    if (anchor === "invalid") return { error: "invalid anchor" };
    remaps.push({ cid, anchor });
  }
  return { remaps };
}

// Apply validated remaps: patch the anchor of each existing ROOT comment for
// this page (or set the explicit orphan `null`). Unknown cids, reply cids, and
// malformed records are skipped so an agent mistake stays recoverable.
export async function applyAnchorRemaps(
  bucket: R2Bucket,
  id: string,
  remaps: AnchorRemap[],
): Promise<void> {
  for (const { cid, anchor } of remaps) {
    const stored = await bucket.get(commentKey(id, cid));
    if (!stored) continue;
    let record: CommentRecord;
    try {
      const parsed: unknown = JSON.parse(await stored.text());
      if (!isValidRecord(parsed) || parsed.parentId) continue;
      record = parsed;
    } catch {
      continue;
    }
    record.anchor = anchor;
    await bucket.put(commentKey(id, cid), JSON.stringify(record));
  }
}

async function createComment(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const raw = await request.text();
  if (utf8ByteLength(raw) > MAX_BODY_BYTES) {
    return json(request, { error: "too large" }, 413);
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return json(request, { error: "invalid body" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json(request, { error: "invalid json" }, 400);
  }

  const text = body.text;
  if (!isString(text) || text.trim().length === 0) {
    return json(request, { error: "missing text" }, 400);
  }
  if (text.length > MAX_TEXT) {
    return json(request, { error: "text too long" }, 413);
  }

  const authorRaw = isString(body.author) ? body.author.trim() : "";
  if (authorRaw.length > MAX_AUTHOR) {
    return json(request, { error: "author too long" }, 413);
  }
  const author = authorRaw.length > 0 ? authorRaw : "匿名";

  // A reply targets an existing root; the parent must exist and itself be a
  // root (no nested reply chains in v1).
  let parentId: string | undefined;
  let anchor: QuoteAnchor | null = null;
  if (body.parentId !== undefined && body.parentId !== null) {
    if (!isString(body.parentId)) return json(request, { error: "invalid parentId" }, 400);
    const parent = await env.BUCKET.get(commentKey(id, body.parentId));
    if (!parent) return json(request, { error: "parent not found" }, 404);
    try {
      const parsed: unknown = JSON.parse(await parent.text());
      if (!isValidRecord(parsed) || parsed.parentId) {
        return json(request, { error: "invalid parent" }, 400);
      }
    } catch {
      return json(request, { error: "invalid parent" }, 400);
    }
    parentId = body.parentId;
  } else {
    const parsedAnchor = readQuoteAnchor(body.anchor);
    if (parsedAnchor === "invalid") return json(request, { error: "invalid anchor" }, 400);
    anchor = parsedAnchor;
  }

  // Cap total objects per page. list().objects length is exact because the cap
  // is well under the 1000 list limit.
  const existing = await env.BUCKET.list({ prefix: `comment:${id}:`, limit: 1000 });
  if (existing.objects.length >= MAX_COMMENTS) {
    return json(request, { error: "comment limit reached" }, 409);
  }

  const cid = crypto.randomUUID();
  const record: CommentRecord = {
    cid,
    ...(parentId ? { parentId } : {}),
    anchor: parentId ? undefined : anchor,
    author,
    text,
    createdAt: new Date().toISOString(),
    resolved: false,
  };
  await env.BUCKET.put(commentKey(id, cid), JSON.stringify(record));
  return json(request, { comment: record }, 201);
}

// GET lists comments, POST creates a comment or reply. Auth failure (bad token
// or missing page) yields an empty list on GET and 403 on POST, identical
// whether or not the page exists, so the endpoint never enumerates pages.
export async function handleComments(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withTransportSecurity({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      }, request),
    });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json(request, { error: "method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  if (request.method === "GET") {
    // Sandbox widget (comment token) or owner/agent export (page password).
    const record = await authorizeRead(env, id, token, url.searchParams.get("p"));
    if (!record) return json(request, { comments: [] });
    return json(request, { comments: await listComments(env.BUCKET, id) });
  }

  // POST writes require the comment token; the password authorizes reads only.
  const record = await authorize(env, id, token);
  if (!record) return json(request, { error: "unauthorized" }, 403);
  return createComment(request, env, id);
}

// POST /:id/comments/:cid with `{ "action": "resolve" | "reopen" | "delete" }`.
// Plain POST (text/plain JSON) to avoid a CORS preflight; PATCH would force one
// for no added value. Only root comments can be resolved; delete works on a root
// (cascading to its replies) or on a single reply.
export async function handleCommentMutate(
  request: Request,
  env: Env,
  id: string,
  cid: string,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withTransportSecurity({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      }, request),
    });
  }
  if (request.method !== "POST") {
    return json(request, { error: "method not allowed" }, 405);
  }

  const token = new URL(request.url).searchParams.get("t");
  const record = await authorize(env, id, token);
  if (!record) return json(request, { error: "unauthorized" }, 403);

  const raw = await request.text();
  if (utf8ByteLength(raw) > MAX_BODY_BYTES) return json(request, { error: "too large" }, 413);
  let action: unknown;
  try {
    const parsed: unknown = JSON.parse(raw);
    action = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).action : undefined;
  } catch {
    return json(request, { error: "invalid json" }, 400);
  }
  if (action !== "resolve" && action !== "reopen" && action !== "delete") {
    return json(request, { error: "invalid action" }, 400);
  }

  const stored = await env.BUCKET.get(commentKey(id, cid));
  if (!stored) return json(request, { error: "not found" }, 404);
  let target: CommentRecord;
  try {
    const parsed: unknown = JSON.parse(await stored.text());
    if (!isValidRecord(parsed)) return json(request, { error: "not found" }, 404);
    target = parsed;
  } catch {
    return json(request, { error: "not found" }, 404);
  }

  if (action === "delete") {
    // Permanently remove the comment. Deleting a root cascades to its replies so
    // no orphaned reply records linger; deleting a reply removes just that one.
    await env.BUCKET.delete(commentKey(id, cid));
    if (!target.parentId) {
      const all = await listComments(env.BUCKET, id);
      for (const c of all) {
        if (c.parentId === cid) await env.BUCKET.delete(commentKey(id, c.cid));
      }
    }
    return json(request, { deleted: cid });
  }

  if (target.parentId) return json(request, { error: "cannot resolve a reply" }, 400);

  target.resolved = action === "resolve";
  await env.BUCKET.put(commentKey(id, cid), JSON.stringify(target));
  return json(request, { comment: target });
}
