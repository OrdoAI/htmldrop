import { hmacSign, hmacVerify, parseCookies } from "./utils";

export interface PageRecord {
  html: string;
  password: string;
  filename: string;
  createdAt: string;
  // Random, regenerated on every write so it changes even for two updates in
  // the same millisecond. Optional for records written before this field.
  version?: string;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Opaque, version-probe-only token minted into authenticated preview HTML so the
// sandboxed page (which cannot send the auth cookie) can poll for a new version.
// A distinct HMAC namespace from the auth cookie: this is JS-visible and must
// never double as a content credential.
const NOTICE_NS = "update-notice:v1";

export async function mintNoticeToken(
  secret: string,
  id: string,
  password: string,
): Promise<string> {
  return hmacSign(secret, `${NOTICE_NS}:${id}:${password}`);
}

export async function verifyNoticeToken(
  secret: string,
  id: string,
  password: string,
  token: string,
): Promise<boolean> {
  return hmacVerify(secret, `${NOTICE_NS}:${id}:${password}`, token);
}

// Comment capability token. A distinct namespace from the notice token: a
// notice token must not read or write comments, and a comment token must not
// work on `/:id/v`. Like the notice token it is JS-visible (minted into the
// sandboxed preview so the opaque-origin widget can reach the comment API) and
// bound to id+password, so it stays valid across in-place re-uploads (which
// keep the same password) but never doubles as the password itself.
const COMMENT_NS = "comments:v1";

export async function mintCommentToken(
  secret: string,
  id: string,
  password: string,
): Promise<string> {
  return hmacSign(secret, `${COMMENT_NS}:${id}:${password}`);
}

export async function verifyCommentToken(
  secret: string,
  id: string,
  password: string,
  token: string,
): Promise<boolean> {
  return hmacVerify(secret, `${COMMENT_NS}:${id}:${password}`, token);
}

export function cookieName(id: string): string {
  return `_hd_${id}`;
}

export async function mintCookie(secret: string, id: string): Promise<string> {
  return hmacSign(secret, id);
}

export async function validateCookie(
  secret: string,
  id: string,
  cookieValue: string,
): Promise<boolean> {
  return hmacVerify(secret, id, cookieValue);
}

export function setAuthCookieHeader(id: string, token: string): string {
  return `${cookieName(id)}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export function getAuthCookie(request: Request, id: string): string | null {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return cookies[cookieName(id)] ?? null;
}

// Version validator for ETag / probe. Falls back to createdAt for records
// written before the `version` field existed.
export function recordVersion(record: PageRecord): string {
  return record.version ?? record.createdAt;
}

export async function getPage(
  bucket: R2Bucket,
  id: string,
): Promise<PageRecord | null> {
  const obj = await bucket.get(`page:${id}`);
  if (!obj) return null;
  const record: PageRecord = JSON.parse(await obj.text());
  if (Date.now() - new Date(record.createdAt).getTime() > TTL_MS) {
    await bucket.delete(`page:${id}`);
    return null;
  }
  return record;
}

export async function verifyPassword(
  bucket: R2Bucket,
  id: string,
  password: string,
): Promise<PageRecord | null> {
  const record = await getPage(bucket, id);
  if (!record) return null;
  if (record.password.length !== password.length) return null;
  let mismatch = 0;
  for (let i = 0; i < record.password.length; i++) {
    mismatch |= record.password.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return mismatch === 0 ? record : null;
}
