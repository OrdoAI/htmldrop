import { hmacSign, hmacVerify, parseCookies } from "./utils";
import {
  type LegacyPage,
  type PageKey,
  type StoredPage,
  bytesEqual,
  derivePageKey,
  isLegacyPage,
  isStoredPage,
  legacyMeta,
  openPage,
  stringsEqual,
  unwrapKey,
  wrapKey,
} from "./envelope";

// A page as the Worker sees it after authentication: decrypted content plus
// the page key that every later write (re-seal, comment) and token needs.
// Never store this shape; `sealPage` produces what goes to R2.
export interface PageRecord {
  html: string;
  filename: string;
  createdAt: string;
  version: string;
  pinned?: boolean;
  key: Uint8Array;
  verifier: string;
}

// What can be known about a page without its key.
export interface PageMetaOnly {
  verifier: string;
  version: string;
  createdAt: string;
  pinned?: boolean;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpired(createdAt: string, pinned: boolean | undefined, now: number = Date.now()): boolean {
  return !pinned && now - new Date(createdAt).getTime() > TTL_MS;
}

// Wrapping namespaces. Bound into the ciphertext so a cookie never works as a
// comment token or vice versa.
const COOKIE_NS = "cookie";
const COMMENT_NS = "comments";

// Version-probe-only token minted into authenticated preview HTML so the
// sandboxed page (which cannot send the auth cookie) can poll for a new
// version. An HMAC over the verifier, not a wrapped key: it is JS-visible and
// must never yield content.
const NOTICE_NS = "update-notice:v2";

// Loads the raw record and purges it once past the TTL (pinned records are
// exempt). Both storage formats are accepted while scripts/migrate-encrypt.mjs
// converts the legacy plaintext ones.
async function loadStored(
  bucket: R2Bucket,
  id: string,
): Promise<StoredPage | LegacyPage | null> {
  const obj = await bucket.get(`page:${id}`);
  if (!obj) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await obj.text());
  } catch {
    return null;
  }
  if (!isStoredPage(parsed) && !isLegacyPage(parsed)) return null;
  if (isExpired(parsed.createdAt, parsed.pinned)) {
    await bucket.delete(`page:${id}`);
    return null;
  }
  return parsed;
}

async function openStored(
  id: string,
  stored: StoredPage,
  key: Uint8Array,
): Promise<PageRecord | null> {
  const payload = await openPage(key, id, stored);
  if (!payload) return null;
  return {
    ...payload,
    createdAt: stored.createdAt,
    version: stored.version,
    ...(stored.pinned ? { pinned: true } : {}),
    key,
    verifier: stored.verifier,
  };
}

function fromLegacy(id: string, legacy: LegacyPage, pageKey: PageKey): PageRecord {
  const meta = legacyMeta(id, legacy);
  return {
    html: legacy.html,
    filename: legacy.filename,
    createdAt: meta.createdAt,
    version: meta.version,
    ...(meta.pinned ? { pinned: true } : {}),
    key: pageKey.key,
    verifier: pageKey.verifier,
  };
}

export async function getPageMeta(
  bucket: R2Bucket,
  id: string,
): Promise<PageMetaOnly | null> {
  const stored = await loadStored(bucket, id);
  if (!stored) return null;
  if (isStoredPage(stored)) {
    return {
      verifier: stored.verifier,
      version: stored.version,
      createdAt: stored.createdAt,
      ...(stored.pinned ? { pinned: true } : {}),
    };
  }
  const meta = legacyMeta(id, stored);
  const { verifier } = await derivePageKey(id, stored.password);
  return {
    verifier,
    version: meta.version,
    createdAt: meta.createdAt,
    ...(meta.pinned ? { pinned: true } : {}),
  };
}

export async function verifyPassword(
  bucket: R2Bucket,
  id: string,
  password: string,
): Promise<PageRecord | null> {
  const stored = await loadStored(bucket, id);
  if (!stored) return null;
  const pageKey = await derivePageKey(id, password);
  if (isStoredPage(stored)) {
    if (!stringsEqual(pageKey.verifier, stored.verifier)) return null;
    return openStored(id, stored, pageKey.key);
  }
  if (!stringsEqual(password, stored.password)) return null;
  return fromLegacy(id, stored, pageKey);
}

// The key (from a cookie or comment token) is the credential: a wrong key
// simply fails to decrypt.
export async function openWithKey(
  bucket: R2Bucket,
  id: string,
  key: Uint8Array,
): Promise<PageRecord | null> {
  const stored = await loadStored(bucket, id);
  if (!stored) return null;
  if (isStoredPage(stored)) return openStored(id, stored, key);
  const pageKey = await derivePageKey(id, stored.password);
  if (!bytesEqual(pageKey.key, key)) return null;
  return fromLegacy(id, stored, pageKey);
}

export async function mintNoticeToken(
  secret: string,
  id: string,
  verifier: string,
): Promise<string> {
  return hmacSign(secret, `${NOTICE_NS}:${id}:${verifier}`);
}

export async function verifyNoticeToken(
  secret: string,
  id: string,
  verifier: string,
  token: string,
): Promise<boolean> {
  return hmacVerify(secret, `${NOTICE_NS}:${id}:${verifier}`, token);
}

// Comment capability token: the page key wrapped for the sandbox widget. Bound
// to id + key, so it stays valid across in-place re-uploads (same password,
// same key) but never doubles as the password or the cookie.
export async function mintCommentToken(
  secret: string,
  id: string,
  key: Uint8Array,
): Promise<string> {
  return wrapKey(secret, COMMENT_NS, id, key);
}

export async function verifyCommentToken(
  secret: string,
  id: string,
  token: string,
): Promise<Uint8Array | null> {
  return unwrapKey(secret, COMMENT_NS, id, token);
}

export function cookieName(id: string): string {
  return `_hd_${id}`;
}

export async function mintCookie(secret: string, id: string, key: Uint8Array): Promise<string> {
  return wrapKey(secret, COOKIE_NS, id, key);
}

export async function validateCookie(
  secret: string,
  id: string,
  cookieValue: string,
): Promise<Uint8Array | null> {
  return unwrapKey(secret, COOKIE_NS, id, cookieValue);
}

export function setAuthCookieHeader(id: string, token: string): string {
  return `${cookieName(id)}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export function getAuthCookie(request: Request, id: string): string | null {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return cookies[cookieName(id)] ?? null;
}

// Version validator for ETag / probe.
export function recordVersion(record: PageRecord): string {
  return record.version;
}
