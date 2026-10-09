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
  // Renew when opened (v3 only), and the last counted visit from the
  // `seen:<id>` sidecar, read only for renew pages.
  renew: boolean;
  lastSeen?: string;
  key: Uint8Array;
  verifier: string;
  // R2 etag of the object this record was read from, so a rewrite can be made
  // conditional on nothing having changed since.
  etag: string;
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

// What a record without `ttlDays` means. Pages stored before new creates
// wrote their window explicitly rely on it, so it stays 7.
export const DEFAULT_TTL_DAYS = 7;
// The window every new page is created with unless the request picks one.
export const NEW_PAGE_TTL_DAYS = 14;
export const MAX_TTL_DAYS = 30;
// A renew-on-view page is deleted this long after createdAt however often it
// is opened. createdAt restarts on upload and on a new expiresInDays.
export const RENEW_CAP_DAYS = 365;
// A visit is written to the sidecar at most this often per page.
export const SEEN_THROTTLE_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The plaintext sidecar holding a renew page's last counted visit (an ISO
// timestamp). Kept out of the page so a view never re-seals up to 50 MiB.
// It can only move expiry within the authenticated cap: someone with bucket
// access could keep a renew page alive until createdAt + RENEW_CAP_DAYS, or
// delete it so the page expires a window after its last write.
export function seenKey(id: string): string {
  return `seen:${id}`;
}

export interface ExpiryState {
  createdAt: string;
  ttlDays?: number;
  pinned?: boolean;
  renew?: boolean;
  lastSeen?: string | null;
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

// When the current window started: the later of createdAt and the last
// counted visit for a renew page, createdAt otherwise.
export function windowStartOf(e: ExpiryState): number {
  const created = Date.parse(e.createdAt);
  if (!e.renew) return created;
  const seen = timeOf(e.lastSeen);
  return seen !== null && seen > created ? seen : created;
}

// Last moment a renew page may exist, or null for a fixed or pinned page.
export function renewUntilMs(e: ExpiryState): number | null {
  if (e.pinned || !e.renew) return null;
  return Date.parse(e.createdAt) + RENEW_CAP_DAYS * DAY_MS;
}

// When the page is deleted if nobody opens it again; null when pinned.
export function expiresAtMs(e: ExpiryState): number | null {
  if (e.pinned) return null;
  const end = windowStartOf(e) + (e.ttlDays ?? DEFAULT_TTL_DAYS) * DAY_MS;
  const cap = renewUntilMs(e);
  return cap !== null && cap < end ? cap : end;
}

export function isPageExpired(e: ExpiryState, now: number = Date.now()): boolean {
  const at = expiresAtMs(e);
  return at !== null && now > at;
}

// ISO forms for API responses.
export function expiryFields(e: ExpiryState): { expiresAt: string | null; renewOnView: boolean; renewUntil?: string } {
  const at = expiresAtMs(e);
  const until = renewUntilMs(e);
  return {
    expiresAt: at === null ? null : new Date(at).toISOString(),
    renewOnView: e.renew === true,
    ...(until !== null ? { renewUntil: new Date(until).toISOString() } : {}),
  };
}

// Fixed-window forms, kept for callers that have no renew state.
export function expiresAtOf(createdAt: string, ttlDays: number | undefined): string {
  return new Date(new Date(createdAt).getTime() + (ttlDays ?? DEFAULT_TTL_DAYS) * DAY_MS).toISOString();
}

export function isExpired(
  createdAt: string,
  ttlDays: number | undefined,
  pinned: boolean | undefined,
  now: number = Date.now(),
): boolean {
  return isPageExpired({ createdAt, ttlDays, pinned }, now);
}

// Reads a renew page's last visit. A missing, oversized or malformed sidecar
// counts as no visit, so the window runs from createdAt. A failed read
// throws: taking it for "never opened" would delete a page that visits are
// keeping alive, so callers must not decide expiry without it.
const MAX_SEEN_BYTES = 64;

export async function readLastSeen(bucket: R2Bucket, id: string): Promise<string | undefined> {
  // Not a ranged read: R2 rejects a range on an empty object, which would turn
  // a harmless empty sidecar into a permanent read failure.
  const obj = await bucket.get(seenKey(id));
  if (!obj) return undefined;
  if (obj.size > MAX_SEEN_BYTES) {
    await obj.body.cancel();
    return undefined;
  }
  const text = (await obj.text()).trim();
  return timeOf(text) !== null ? text : undefined;
}

// Counts a visit to a renew page: writes the sidecar only when the current
// window started more than SEEN_THROTTLE_MS ago, so a busy page costs at most
// about one small put a day. A failed write never fails the view.
export async function recordVisit(
  bucket: R2Bucket,
  id: string,
  record: Pick<PageRecord, "createdAt" | "ttlDays" | "pinned" | "renew" | "lastSeen">,
  now: number = Date.now(),
): Promise<boolean> {
  if (!record.renew || record.pinned) return false;
  if (now - windowStartOf(record) <= SEEN_THROTTLE_MS) return false;
  try {
    await bucket.put(seenKey(id), new Date(now).toISOString(), {
      httpMetadata: { contentType: "text/plain" },
    });
    return true;
  } catch {
    return false;
  }
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
  | { kind: "v2"; stored: StoredPage; etag: string }
  | { kind: "legacy"; stored: LegacyPage; etag: string }
  | { kind: "v3"; header: StoredPageV3; end: number; etag: string; lastSeen?: string };

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
    // Only a renew page needs its last visit; a fixed page costs no extra read.
    // A failed sidecar read propagates and fails the request rather than
    // purging a page whose visits could not be checked.
    const lastSeen = header.renew && !header.pinned ? await readLastSeen(bucket, id) : undefined;
    loaded = { kind: "v3", header, end, etag: head.etag, ...(lastSeen ? { lastSeen } : {}) };
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
    if (isStoredPage(parsed)) loaded = { kind: "v2", stored: parsed, etag: head.etag };
    else if (isLegacyPage(parsed)) loaded = { kind: "legacy", stored: parsed, etag: head.etag };
    else return null;
  }
  if (isPageExpired(expiryOf(loaded))) {
    await bucket.delete([key, seenKey(id)]);
    return null;
  }
  return loaded;
}

function expiryOf(s: Stored): ExpiryState {
  switch (s.kind) {
    case "v3":
      return {
        createdAt: s.header.createdAt,
        ttlDays: s.header.ttlDays,
        pinned: s.header.pinned,
        renew: s.header.renew === true,
        lastSeen: s.lastSeen,
      };
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
  s: { header: StoredPageV3; end: number; etag: string; lastSeen?: string },
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
    renew: h.renew === true,
    ...(s.lastSeen ? { lastSeen: s.lastSeen } : {}),
    key,
    verifier: h.verifier,
    etag: s.etag,
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
  etag: string,
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
    renew: false,
    key,
    verifier: stored.verifier,
    etag,
    body: textBody(payload.html),
  };
}

function fromLegacy(id: string, legacy: LegacyPage, etag: string, pageKey: PageKey): PageRecord {
  const meta = legacyMeta(id, legacy);
  return {
    filename: legacy.filename,
    createdAt: meta.createdAt,
    version: meta.version,
    ...(meta.pinned ? { pinned: true } : {}),
    public: false,
    renew: false,
    key: pageKey.key,
    verifier: pageKey.verifier,
    etag,
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
    return openStoredV2(id, s.stored, s.etag, pageKey.key);
  }
  if (!stringsEqual(password, s.stored.password)) return null;
  return fromLegacy(id, s.stored, s.etag, pageKey);
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
  if (s.kind === "v2") return openStoredV2(id, s.stored, s.etag, key);
  const pageKey = await derivePageKey(id, s.stored.password);
  if (!bytesEqual(pageKey.key, key)) return null;
  return fromLegacy(id, s.stored, s.etag, pageKey);
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
    return key ? openStoredV2(id, s.stored, s.etag, key) : null;
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
