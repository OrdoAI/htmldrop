import { hmacSign, hmacVerify, parseCookies } from "./utils";
import {
  type LegacyPage,
  type PageKey,
  type StoredPage,
  type StoredPageV3,
  type V3Opened,
  V3_PREFIX_BYTES,
  bytesEqual,
  bytesToStream,
  derivePageKey,
  isLegacyPage,
  isStoredPage,
  isV3Prefix,
  legacyMeta,
  openPage,
  openPageV3,
  parseV3Header,
  publicKeyOf,
  publicKeyOfV3,
  stringsEqual,
  unwrapKey,
  v3ObjectLength,
  wrapKey,
} from "./envelope";

// A page as the Worker sees it after authentication: its metadata, the page
// key that every later write (re-seal, comment) and token needs, and a way to
// stream the content. Never store this shape; `sealPageV3` produces what goes
// to R2. `body()` is the only thing that touches the page bytes: comments,
// the version probe, cookie bootstrap and HEAD never call it.
export interface PageRecord {
  filename: string;
  createdAt: string;
  version: string;
  pinned?: boolean;
  ttlDays?: number;
  public: boolean;
  key: Uint8Array;
  verifier: string;
  body: () => Promise<PageBody>;
}

export interface PageBody {
  stream: ReadableStream<Uint8Array>;
  bytes: number;
}

// What can be known about a page without its key.
export interface PageMetaOnly {
  verifier: string;
  version: string;
  createdAt: string;
  pinned?: boolean;
}

export const DEFAULT_TTL_DAYS = 7;
export const MAX_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function expiresAtOf(createdAt: string, ttlDays: number | undefined): string {
  return new Date(new Date(createdAt).getTime() + (ttlDays ?? DEFAULT_TTL_DAYS) * DAY_MS).toISOString();
}

export function isExpired(
  createdAt: string,
  ttlDays: number | undefined,
  pinned: boolean | undefined,
  now: number = Date.now(),
): boolean {
  return !pinned && now > new Date(expiresAtOf(createdAt, ttlDays)).getTime();
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

type Stored =
  | { kind: "v2"; stored: StoredPage }
  | { kind: "legacy"; stored: LegacyPage }
  | { kind: "v3"; header: StoredPageV3; end: number; etag: string };

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

// Reads the object's leading bytes. A v3 object is described entirely by that
// prefix (header cap + 8 bytes), so the page body is never fetched here; a v2
// or legacy JSON record has to be read whole. Purges expired pages (pinned
// ones are exempt). A corrupt v3 object yields null without being deleted.
async function loadStored(bucket: R2Bucket, id: string): Promise<Stored | null> {
  const key = `page:${id}`;
  const head = await bucket.get(key, { range: { offset: 0, length: V3_PREFIX_BYTES } });
  if (!head) return null;
  const prefix = new Uint8Array(await head.arrayBuffer());
  let loaded: Stored;
  if (isV3Prefix(prefix)) {
    const parsed = parseV3Header(prefix);
    if (!parsed) return null;
    const { header, end } = parsed;
    if (v3ObjectLength(end - 8, header.bytes, header.chunk) !== head.size) return null;
    loaded = { kind: "v3", header, end, etag: head.etag };
  } else {
    let text: string;
    if (head.size <= prefix.length) {
      text = new TextDecoder().decode(prefix);
    } else {
      // Same object as the prefix read: a page rewritten as v3 in between
      // must not be read whole as if it were JSON.
      const full = await bucket.get(key, { onlyIf: { etagMatches: head.etag } });
      if (!full || !("body" in full)) return null;
      text = await full.text();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (isStoredPage(parsed)) loaded = { kind: "v2", stored: parsed };
    else if (isLegacyPage(parsed)) loaded = { kind: "legacy", stored: parsed };
    else return null;
  }
  const { createdAt, ttlDays, pinned } = expiryOf(loaded);
  if (isExpired(createdAt, ttlDays, pinned)) {
    await bucket.delete(key);
    return null;
  }
  return loaded;
}

function expiryOf(s: Stored): { createdAt: string; ttlDays: number | undefined; pinned: boolean | undefined } {
  switch (s.kind) {
    case "v3":
      return { createdAt: s.header.createdAt, ttlDays: s.header.ttlDays, pinned: s.header.pinned };
    case "v2":
      return { createdAt: s.stored.createdAt, ttlDays: s.stored.ttlDays, pinned: s.stored.pinned };
    case "legacy":
      return { createdAt: s.stored.createdAt, ttlDays: undefined, pinned: s.stored.pinned };
  }
}

// Thrown by `PageRecord.body()` when the page was rewritten between the
// header read and the body read. The caller re-runs the whole lookup (and
// its authorization) rather than mixing two versions or letting a key that
// opened version A stream version B.
export class PageChangedError extends Error {
  constructor() {
    super("page changed between reads");
    this.name = "PageChangedError";
  }
}

// Streams a v3 body: one ranged read from the frame offset, conditional on
// the etag the header read saw.
async function v3Body(
  bucket: R2Bucket,
  id: string,
  s: { header: StoredPageV3; end: number; etag: string },
  opened: V3Opened,
): Promise<PageBody> {
  const obj = await bucket.get(`page:${id}`, {
    range: { offset: s.end },
    onlyIf: { etagMatches: s.etag },
  });
  if (!obj || !("body" in obj) || !obj.body) throw new PageChangedError();
  return { stream: opened.decrypt(obj.body), bytes: s.header.bytes };
}

async function openStoredV3(
  bucket: R2Bucket,
  id: string,
  s: { header: StoredPageV3; end: number; etag: string },
  key: Uint8Array,
): Promise<PageRecord | null> {
  const opened = await openPageV3(key, id, s.header);
  if (!opened) return null;
  const h = s.header;
  return {
    filename: opened.filename,
    createdAt: h.createdAt,
    version: h.version,
    ...(h.pinned ? { pinned: true } : {}),
    ...(h.ttlDays !== undefined ? { ttlDays: h.ttlDays } : {}),
    public: h.open !== undefined,
    key,
    verifier: h.verifier,
    body: () => v3Body(bucket, id, s, opened),
  };
}

function textBody(html: string): () => Promise<PageBody> {
  return async () => {
    const bytes = enc(html);
    return { stream: bytesToStream(bytes), bytes: bytes.length };
  };
}

async function openStoredV2(
  id: string,
  stored: StoredPage,
  key: Uint8Array,
): Promise<PageRecord | null> {
  const payload = await openPage(key, id, stored);
  if (!payload) return null;
  return {
    filename: payload.filename,
    createdAt: stored.createdAt,
    version: stored.version,
    ...(stored.pinned ? { pinned: true } : {}),
    ...(stored.ttlDays !== undefined ? { ttlDays: stored.ttlDays } : {}),
    public: stored.open !== undefined,
    key,
    verifier: stored.verifier,
    body: textBody(payload.html),
  };
}

function fromLegacy(id: string, legacy: LegacyPage, pageKey: PageKey): PageRecord {
  const meta = legacyMeta(id, legacy);
  return {
    filename: legacy.filename,
    createdAt: meta.createdAt,
    version: meta.version,
    ...(meta.pinned ? { pinned: true } : {}),
    public: false,
    key: pageKey.key,
    verifier: pageKey.verifier,
    body: textBody(legacy.html),
  };
}

export async function getPageMeta(
  bucket: R2Bucket,
  id: string,
): Promise<PageMetaOnly | null> {
  const s = await loadStored(bucket, id);
  if (!s) return null;
  if (s.kind === "v3") {
    const h = s.header;
    return { verifier: h.verifier, version: h.version, createdAt: h.createdAt, ...(h.pinned ? { pinned: true } : {}) };
  }
  if (s.kind === "v2") {
    const r = s.stored;
    return { verifier: r.verifier, version: r.version, createdAt: r.createdAt, ...(r.pinned ? { pinned: true } : {}) };
  }
  const meta = legacyMeta(id, s.stored);
  const { verifier } = await derivePageKey(id, s.stored.password);
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
  const s = await loadStored(bucket, id);
  if (!s) return null;
  const pageKey = await derivePageKey(id, password);
  if (s.kind === "v3") {
    if (!stringsEqual(pageKey.verifier, s.header.verifier)) return null;
    return openStoredV3(bucket, id, s, pageKey.key);
  }
  if (s.kind === "v2") {
    if (!stringsEqual(pageKey.verifier, s.stored.verifier)) return null;
    return openStoredV2(id, s.stored, pageKey.key);
  }
  if (!stringsEqual(password, s.stored.password)) return null;
  return fromLegacy(id, s.stored, pageKey);
}

// The key (from a cookie or comment token) is the credential: a wrong key
// simply fails to decrypt.
export async function openWithKey(
  bucket: R2Bucket,
  id: string,
  key: Uint8Array,
): Promise<PageRecord | null> {
  const s = await loadStored(bucket, id);
  if (!s) return null;
  if (s.kind === "v3") return openStoredV3(bucket, id, s, key);
  if (s.kind === "v2") return openStoredV2(id, s.stored, key);
  const pageKey = await derivePageKey(id, s.stored.password);
  if (!bytesEqual(pageKey.key, key)) return null;
  return fromLegacy(id, s.stored, pageKey);
}

// A public page opens with the key stored beside it; no credential needed.
export async function openPublic(bucket: R2Bucket, id: string): Promise<PageRecord | null> {
  const s = await loadStored(bucket, id);
  if (!s) return null;
  if (s.kind === "v3") {
    const key = publicKeyOfV3(s.header);
    return key ? openStoredV3(bucket, id, s, key) : null;
  }
  if (s.kind === "v2") {
    const key = publicKeyOf(s.stored);
    return key ? openStoredV2(id, s.stored, key) : null;
  }
  return null;
}

// Test and script convenience: the whole page as text.
export async function readPageHtml(record: PageRecord): Promise<string> {
  const { stream } = await record.body();
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
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
