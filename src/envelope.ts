// Encryption at rest for page and comment records.
//
// Threat model. Anyone holding the R2 credentials (the operator, the deploy
// token in CI, a leaked backup) must not be able to read a page, learn its
// password, or silently change its metadata. The page key is derived from the
// link password, which the bucket never sees: R2 holds a verifier plus
// AES-256-GCM ciphertext whose additional data binds id, createdAt, version
// and the pin flag, so a metadata edit made without the key fails closed at
// the next read. The Worker still handles the password on every `?p=`
// request, so this defends the storage layer, not against a malicious Worker
// deploy.
//
// Dependency-free on purpose: scripts/*.mjs import this file directly under
// Node's type stripping, so keep it to erasable TypeScript syntax with no
// relative imports.

export interface PageMeta {
  id: string;
  createdAt: string;
  version: string;
  pinned?: boolean;
  // Days until expiry, counted from createdAt. Absent means the 7-day default.
  ttlDays?: number;
  // Public: the content key is stored alongside the ciphertext (`open`), so a
  // bare GET can read the page without the password. Public content is by
  // definition readable, and with bucket access also editable; only private
  // pages get the operator-cannot-read/modify guarantee.
  public?: boolean;
}

export interface PagePayload {
  html: string;
  filename: string;
}

// On-disk shape written since storage v2.
export interface StoredPage {
  v: 2;
  verifier: string;
  createdAt: string;
  version: string;
  pinned?: boolean;
  ttlDays?: number;
  open?: string; // base64url content key; present only on public pages
  iv: string;
  ct: string;
}

// Plaintext shape written before v2. Read-only: scripts/migrate-encrypt.mjs
// converts these in bulk and the update path rewrites them as v2.
export interface LegacyPage {
  html: string;
  password: string;
  filename: string;
  createdAt: string;
  version?: string;
  pinned?: boolean;
}

export interface StoredComment {
  v: 2;
  cid: string;
  iv: string;
  ct: string;
}

export interface PageKey {
  key: Uint8Array;
  verifier: string;
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export function stringsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hkdf(ikm: Uint8Array, salt: string, info: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc(salt), info: enc(info) },
    base,
    256,
  );
  return new Uint8Array(bits);
}

// Passwords are always server-generated (16 base62 chars, ~95 bits), so plain
// HKDF is enough: there is no low-entropy input to stretch. The verifier is a
// second HKDF output, so knowing it reveals nothing about the key.
export async function derivePageKey(id: string, password: string): Promise<PageKey> {
  const salt = `htmldrop:page:v2|${id}`;
  const ikm = enc(password);
  const [key, verifier] = await Promise.all([
    hkdf(ikm, salt, "key"),
    hkdf(ikm, salt, "verifier"),
  ]);
  return { key, verifier: toHex(verifier) };
}

async function aesKey(raw: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [usage]);
}

interface Sealed {
  iv: string;
  ct: string;
}

async function sealBytes(raw: Uint8Array, aad: string, plaintext: Uint8Array): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc(aad) },
    await aesKey(raw, "encrypt"),
    plaintext,
  );
  return { iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

async function openBytes(raw: Uint8Array, aad: string, sealed: Sealed): Promise<Uint8Array | null> {
  const iv = fromBase64Url(sealed.iv);
  const ct = fromBase64Url(sealed.ct);
  if (!iv || !ct || iv.length !== 12) return null;
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: enc(aad) },
      await aesKey(raw, "decrypt"),
      ct,
    );
    return new Uint8Array(pt);
  } catch {
    return null;
  }
}

async function sealJson(raw: Uint8Array, aad: string, value: unknown): Promise<Sealed> {
  return sealBytes(raw, aad, enc(JSON.stringify(value)));
}

async function openJson(raw: Uint8Array, aad: string, sealed: Sealed): Promise<unknown | null> {
  const pt = await openBytes(raw, aad, sealed);
  if (!pt) return null;
  try {
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

function pageAad(meta: PageMeta): string {
  let aad = `htmldrop:page:v2|${meta.id}|${meta.createdAt}|${meta.version}|${meta.pinned ? 1 : 0}`;
  // Appended only when set, so records sealed before the field existed still open.
  if (meta.ttlDays !== undefined) aad += `|ttl=${meta.ttlDays}`;
  return aad;
}

export function storedMeta(id: string, stored: StoredPage): PageMeta {
  return {
    id,
    createdAt: stored.createdAt,
    version: stored.version,
    ...(stored.pinned ? { pinned: true } : {}),
    ...(stored.ttlDays !== undefined ? { ttlDays: stored.ttlDays } : {}),
    ...(stored.open ? { public: true } : {}),
  };
}

// The content key of a public page, or null for a private one.
export function publicKeyOf(stored: StoredPage): Uint8Array | null {
  if (!stored.open) return null;
  const key = fromBase64Url(stored.open);
  return key && key.length === 32 ? key : null;
}

export async function sealPage(
  pageKey: PageKey,
  meta: PageMeta,
  payload: PagePayload,
): Promise<StoredPage> {
  const { iv, ct } = await sealJson(pageKey.key, pageAad(meta), payload);
  return {
    v: 2,
    verifier: pageKey.verifier,
    createdAt: meta.createdAt,
    version: meta.version,
    ...(meta.pinned ? { pinned: true } : {}),
    ...(meta.ttlDays !== undefined ? { ttlDays: meta.ttlDays } : {}),
    ...(meta.public ? { open: toBase64Url(pageKey.key) } : {}),
    iv,
    ct,
  };
}

// Null when the key is wrong or any of id/createdAt/version/pinned was changed
// after sealing.
export async function openPage(
  key: Uint8Array,
  id: string,
  stored: StoredPage,
): Promise<PagePayload | null> {
  const parsed = await openJson(key, pageAad(storedMeta(id, stored)), stored);
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.html !== "string" || typeof p.filename !== "string") return null;
  return { html: p.html, filename: p.filename };
}

function commentAad(id: string, cid: string): string {
  return `htmldrop:comment:v2|${id}|${cid}`;
}

export async function sealComment(
  key: Uint8Array,
  id: string,
  cid: string,
  record: unknown,
): Promise<StoredComment> {
  const { iv, ct } = await sealJson(key, commentAad(id, cid), record);
  return { v: 2, cid, iv, ct };
}

export async function openComment(
  key: Uint8Array,
  id: string,
  stored: StoredComment,
): Promise<unknown | null> {
  return openJson(key, commentAad(id, stored.cid), stored);
}

// Key wrapping for the auth cookie and the sandbox comment token: the page key
// sealed under a key derived from AUTH_SECRET, with the namespace and page id
// as additional data so a cookie never doubles as a comment token and neither
// works on another page. AUTH_SECRET alone cannot mint one, because the
// plaintext is the page key that only the password yields.
async function wrappingKey(secret: string, ns: string): Promise<Uint8Array> {
  return hkdf(enc(secret), "htmldrop:wrap:v2", ns);
}

export async function wrapKey(
  secret: string,
  ns: string,
  id: string,
  key: Uint8Array,
): Promise<string> {
  const { iv, ct } = await sealBytes(await wrappingKey(secret, ns), `htmldrop:wrap:v2|${ns}|${id}`, key);
  return `${iv}.${ct}`;
}

export async function unwrapKey(
  secret: string,
  ns: string,
  id: string,
  token: string,
): Promise<Uint8Array | null> {
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const key = await openBytes(
    await wrappingKey(secret, ns),
    `htmldrop:wrap:v2|${ns}|${id}`,
    { iv: token.slice(0, dot), ct: token.slice(dot + 1) },
  );
  return key && key.length === 32 ? key : null;
}

export function isStoredPage(value: unknown): value is StoredPage {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return r.v === 2
    && typeof r.verifier === "string"
    && typeof r.createdAt === "string"
    && typeof r.version === "string"
    && typeof r.iv === "string"
    && typeof r.ct === "string"
    && (r.ttlDays === undefined || (Number.isInteger(r.ttlDays) && (r.ttlDays as number) > 0))
    && (r.open === undefined || typeof r.open === "string");
}

export function isLegacyPage(value: unknown): value is LegacyPage {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.html === "string"
    && typeof r.password === "string"
    && typeof r.filename === "string"
    && typeof r.createdAt === "string";
}

export function isStoredComment(value: unknown): value is StoredComment {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return r.v === 2 && typeof r.cid === "string" && typeof r.iv === "string" && typeof r.ct === "string";
}

// Legacy records had no `version` before that field existed; the old Worker
// used createdAt as the ETag then, so keep that value and open previews see no
// spurious update notice.
export function legacyMeta(id: string, legacy: LegacyPage): PageMeta {
  return {
    id,
    createdAt: legacy.createdAt,
    version: legacy.version ?? legacy.createdAt,
    ...(legacy.pinned ? { pinned: true } : {}),
  };
}

// --- Operator transforms, used by scripts/. Each needs the password. ---

export async function migrateLegacyPage(id: string, legacy: LegacyPage): Promise<StoredPage> {
  const pageKey = await derivePageKey(id, legacy.password);
  return sealPage(pageKey, legacyMeta(id, legacy), { html: legacy.html, filename: legacy.filename });
}

// Re-seal with new metadata (pin, unpin, renew, visibility, expiry). Content
// and `version` are kept. Null when the password does not match or the
// ciphertext fails to authenticate.
export async function resealPage(
  id: string,
  password: string,
  stored: StoredPage | LegacyPage,
  patch: { createdAt?: string; pinned?: boolean; public?: boolean; ttlDays?: number },
): Promise<StoredPage | null> {
  const pageKey = await derivePageKey(id, password);
  let payload: PagePayload;
  let meta: PageMeta;
  if (isStoredPage(stored)) {
    if (!stringsEqual(pageKey.verifier, stored.verifier)) return null;
    const opened = await openPage(pageKey.key, id, stored);
    if (!opened) return null;
    payload = opened;
    meta = storedMeta(id, stored);
  } else {
    if (!stringsEqual(password, stored.password)) return null;
    payload = { html: stored.html, filename: stored.filename };
    meta = legacyMeta(id, stored);
  }
  const next: PageMeta = { ...meta, ...patch };
  if (!next.pinned) delete next.pinned;
  if (!next.public) delete next.public;
  return sealPage(pageKey, next, payload);
}

// --- Storage v3: chunked binary object, written for every page since the
// 50 MiB limit. The Worker streams both directions, so nothing here may hold
// a whole page; the *Bytes helpers at the end exist for scripts and tests.
//
//   "HDP3" | u32 BE header length L | header JSON (L bytes) | frame 0 | ... | frame n-1
//
// The header carries the metadata and a sealed {filename}. Frames are
// AES-256-GCM over consecutive `chunk`-byte slices of the UTF-8 page, each
// with its 16-byte tag; n = max(1, ceil(bytes / chunk)), the last frame holds
// the remainder (possibly empty). Every seal draws a fresh 16-byte `seal` id
// and derives two subkeys from the page key with it, one for the frames and
// one for the filename, so a frame nonce is just its index and a re-upload
// under the same password never reuses a (key, nonce) pair. The additional
// data of the filename and of every frame is the full header (every field,
// including verifier, open and seal) plus the frame index, and the reader
// knows n and each frame's exact size from the header, so an edited header,
// a wrong key, a truncated, extended, reordered or swapped frame, or a frame
// from another seal of the same page all fail to authenticate. Not covered:
// putting a complete older object back under the same key (rollback); nothing
// outside the bucket anchors "the latest version".

export const V3_CHUNK_BYTES = 1024 * 1024;
export const V3_MAX_HEADER_BYTES = 16 * 1024;
export const V3_MAX_PAGE_BYTES = 50 * 1024 * 1024;
export const V3_PREFIX_BYTES = 8 + V3_MAX_HEADER_BYTES; // one ranged read always covers a valid header
const V3_MAGIC = [0x48, 0x44, 0x50, 0x33]; // "HDP3"
const V3_MIN_CHUNK = 1024;
const V3_MAX_CHUNK = 8 * 1024 * 1024;
const TAG_BYTES = 16;

export interface StoredPageV3 {
  v: 3;
  verifier: string;
  createdAt: string;
  version: string;
  pinned?: boolean;
  ttlDays?: number;
  open?: string; // base64url page key; present only on public pages
  bytes: number; // UTF-8 length of the page
  chunk: number; // plaintext bytes per frame
  seal: string; // base64url 16-byte seal id
  meta: Sealed; // {filename} under the meta subkey
}

export function isStoredPageV3(value: unknown): value is StoredPageV3 {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  const meta = r.meta as Record<string, unknown> | undefined;
  return r.v === 3
    && typeof r.verifier === "string" && /^[0-9a-f]{64}$/.test(r.verifier)
    && typeof r.createdAt === "string" && !Number.isNaN(Date.parse(r.createdAt))
    && typeof r.version === "string" && r.version.length > 0 && r.version.length <= 128
    && (r.pinned === undefined || r.pinned === true)
    && (r.ttlDays === undefined || (Number.isInteger(r.ttlDays) && (r.ttlDays as number) > 0 && (r.ttlDays as number) <= 3650))
    && (r.open === undefined || (typeof r.open === "string" && r.open.length === 43))
    && Number.isInteger(r.bytes) && (r.bytes as number) >= 0 && (r.bytes as number) <= V3_MAX_PAGE_BYTES
    && Number.isInteger(r.chunk) && (r.chunk as number) >= V3_MIN_CHUNK && (r.chunk as number) <= V3_MAX_CHUNK
    && typeof r.seal === "string" && r.seal.length === 22
    && !!meta && typeof meta === "object" && typeof meta.iv === "string" && typeof meta.ct === "string";
}

export function isV3Prefix(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && V3_MAGIC.every((b, i) => bytes[i] === b);
}

export function v3FrameCount(bytes: number, chunk: number): number {
  return bytes === 0 ? 1 : Math.ceil(bytes / chunk);
}

function v3FrameSize(header: { bytes: number; chunk: number }, index: number): number {
  const n = v3FrameCount(header.bytes, header.chunk);
  const plain = index < n - 1 ? header.chunk : header.bytes - (n - 1) * header.chunk;
  return plain + TAG_BYTES;
}

// Total object size for a header of `headerLength` bytes.
export function v3ObjectLength(headerLength: number, bytes: number, chunk: number): number {
  return 8 + headerLength + bytes + TAG_BYTES * v3FrameCount(bytes, chunk);
}

// Header JSON parsed out of the object's first bytes, with the offset where
// the frames start. Null when the bytes are not a v3 object, the declared
// length is over the cap, the header is not entirely inside `bytes`, or any
// field is out of range. Never throws.
export function parseV3Header(bytes: Uint8Array): { header: StoredPageV3; end: number } | null {
  if (!isV3Prefix(bytes) || bytes.length < 8) return null;
  const length = ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0;
  if (length === 0 || length > V3_MAX_HEADER_BYTES) return null;
  const end = 8 + length;
  if (bytes.length < end) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(8, end)));
  } catch {
    return null;
  }
  return isStoredPageV3(parsed) ? { header: parsed, end } : null;
}

export function storedMetaV3(id: string, h: StoredPageV3): PageMeta {
  return {
    id,
    createdAt: h.createdAt,
    version: h.version,
    ...(h.pinned ? { pinned: true } : {}),
    ...(h.ttlDays !== undefined ? { ttlDays: h.ttlDays } : {}),
    ...(h.open ? { public: true } : {}),
  };
}

export function publicKeyOfV3(h: StoredPageV3): Uint8Array | null {
  if (!h.open) return null;
  const key = fromBase64Url(h.open);
  return key && key.length === 32 ? key : null;
}

// Every header field, in a fixed order. Bound into the filename and every frame.
function pageAadV3(id: string, h: Omit<StoredPageV3, "meta">): string {
  return `htmldrop:page:v3|${id}|${h.createdAt}|${h.version}|${h.pinned ? 1 : 0}|ttl=${h.ttlDays ?? ""}`
    + `|open=${h.open ?? ""}|verifier=${h.verifier}|seal=${h.seal}|bytes=${h.bytes}|chunk=${h.chunk}`;
}

async function v3Subkeys(pageKey: Uint8Array, seal: string): Promise<{ content: Uint8Array; meta: Uint8Array }> {
  const salt = `htmldrop:page:v3|${seal}`;
  const [content, meta] = await Promise.all([hkdf(pageKey, salt, "content"), hkdf(pageKey, salt, "meta")]);
  return { content, meta };
}

function frameNonce(index: number): Uint8Array {
  const iv = new Uint8Array(12);
  iv[8] = (index >>> 24) & 0xff;
  iv[9] = (index >>> 16) & 0xff;
  iv[10] = (index >>> 8) & 0xff;
  iv[11] = index & 0xff;
  return iv;
}

function concatBytes(parts: Uint8Array[], total: number): Uint8Array {
  if (parts.length === 1 && parts[0].length === total) return parts[0];
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Splits a byte stream into fixed-size pieces on demand: `take(n)` hands out
// the next n buffered bytes once `size >= n`.
function byteQueue() {
  let parts: Uint8Array[] = [];
  let size = 0;
  return {
    get size() {
      return size;
    },
    push(chunk: Uint8Array) {
      if (chunk.length === 0) return;
      parts.push(chunk);
      size += chunk.length;
    },
    take(n: number): Uint8Array {
      const all = concatBytes(parts, size);
      parts = all.length > n ? [all.subarray(n)] : [];
      size = all.length - n;
      return all.subarray(0, n);
    },
  };
}

export interface V3Sealer {
  header: StoredPageV3;
  objectBytes: number;
  // Reads the plaintext from `source` on demand and yields the object: the
  // prefix, then one frame per pull, so a slow consumer never has more than a
  // frame or so in flight. The final frame is held until the source ends and
  // the length checks out; an over- or under-long body errors the stream
  // before the object can reach its declared size, which fails the R2 put.
  seal: (source: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>;
}

export async function sealPageV3(
  pageKey: PageKey,
  meta: PageMeta,
  filename: string,
  bytes: number,
): Promise<V3Sealer> {
  if (!Number.isInteger(bytes) || bytes < 0 || bytes > V3_MAX_PAGE_BYTES) throw new Error("bytes out of range");
  const seal = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const chunk = V3_CHUNK_BYTES;
  const fields: Omit<StoredPageV3, "meta"> = {
    v: 3,
    verifier: pageKey.verifier,
    createdAt: meta.createdAt,
    version: meta.version,
    ...(meta.pinned ? { pinned: true } : {}),
    ...(meta.ttlDays !== undefined ? { ttlDays: meta.ttlDays } : {}),
    ...(meta.public ? { open: toBase64Url(pageKey.key) } : {}),
    bytes,
    chunk,
    seal,
  };
  const aad = pageAadV3(meta.id, fields);
  const keys = await v3Subkeys(pageKey.key, seal);
  const header: StoredPageV3 = { ...fields, meta: await sealJson(keys.meta, `${aad}|meta`, { filename }) };
  const headerBytes = enc(JSON.stringify(header));
  if (headerBytes.length > V3_MAX_HEADER_BYTES) throw new Error("header too large");
  const prefix = new Uint8Array(8 + headerBytes.length);
  prefix.set(V3_MAGIC, 0);
  const L = headerBytes.length;
  prefix[4] = (L >>> 24) & 0xff;
  prefix[5] = (L >>> 16) & 0xff;
  prefix[6] = (L >>> 8) & 0xff;
  prefix[7] = L & 0xff;
  prefix.set(headerBytes, 8);

  const contentKey = await aesKey(keys.content, "encrypt");
  const n = v3FrameCount(bytes, chunk);

  const sealStream = (source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
    const reader = source.getReader();
    const queue = byteQueue();
    let index = 0;
    let seen = 0;
    let ended = false;
    const encryptFrame = async (plain: Uint8Array): Promise<Uint8Array> => {
      const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: frameNonce(index), additionalData: enc(`${aad}|${index}`) },
        contentKey,
        plain,
      );
      index++;
      return new Uint8Array(ct);
    };
    // Next frame, or null once all n are out. Reads only until it holds
    // strictly more than one frame, so the last frame (the one that completes
    // the object) is never cut before the source has ended.
    const nextFrame = async (): Promise<Uint8Array | null> => {
      while (!ended && queue.size <= chunk) {
        const { value, done } = await reader.read();
        if (done) {
          ended = true;
          break;
        }
        seen += value.length;
        if (seen > bytes) throw new Error(`page longer than the declared ${bytes} bytes`);
        queue.push(value);
      }
      if (!ended) return encryptFrame(queue.take(chunk));
      if (seen !== bytes) throw new Error(`page shorter than the declared ${bytes} bytes`);
      if (index >= n) return null;
      return encryptFrame(queue.take(Math.min(queue.size, chunk)));
    };
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(prefix);
      },
      async pull(controller) {
        try {
          const frame = await nextFrame();
          if (frame) controller.enqueue(frame);
          else controller.close();
        } catch (err) {
          controller.error(err);
          await reader.cancel(err).catch(() => {});
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }, { highWaterMark: 1 });
  };
  return { header, objectBytes: v3ObjectLength(headerBytes.length, bytes, chunk), seal: sealStream };
}

export interface V3Opened {
  filename: string;
  // Reads frames from `source` on demand and yields plaintext, one frame per
  // pull. Errors on any frame that fails to authenticate, on trailing bytes,
  // and on a source that ends before frame n-1.
  decrypt: (source: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>;
}

// Authenticates the header (through the sealed filename) with `key`. Null
// when the key is wrong or any header field was edited after sealing. The
// frames are only checked as they stream through `decrypt()`.
export async function openPageV3(key: Uint8Array, id: string, header: StoredPageV3): Promise<V3Opened | null> {
  if (!isStoredPageV3(header)) return null;
  const { meta: metaSealed, ...fields } = header;
  const aad = pageAadV3(id, fields);
  const keys = await v3Subkeys(key, header.seal);
  const parsed = await openJson(keys.meta, `${aad}|meta`, metaSealed);
  if (!parsed || typeof parsed !== "object") return null;
  const filename = (parsed as Record<string, unknown>).filename;
  if (typeof filename !== "string") return null;
  const n = v3FrameCount(header.bytes, header.chunk);
  const decrypt = (source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
    const reader = source.getReader();
    const queue = byteQueue();
    let index = 0;
    let ended = false;
    let contentKey: CryptoKey | null = null;
    const fill = async (need: number): Promise<void> => {
      while (!ended && queue.size < need) {
        const { value, done } = await reader.read();
        if (done) ended = true;
        else queue.push(value);
      }
    };
    const nextPlain = async (): Promise<Uint8Array | null> => {
      if (index === n) {
        await fill(1);
        if (queue.size > 0) throw new Error("trailing bytes after the last frame");
        return null;
      }
      const need = v3FrameSize(header, index);
      await fill(need);
      if (queue.size < need) throw new Error(`object ends after frame ${index} of ${n}`);
      contentKey ??= await aesKey(keys.content, "decrypt");
      const frame = queue.take(need);
      let pt: ArrayBuffer;
      try {
        pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: frameNonce(index), additionalData: enc(`${aad}|${index}`) },
          contentKey,
          frame,
        );
      } catch {
        throw new Error(`frame ${index} failed to authenticate`);
      }
      index++;
      return new Uint8Array(pt);
    };
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const plain = await nextPlain();
          if (plain) controller.enqueue(plain);
          else controller.close();
        } catch (err) {
          controller.error(err);
          await reader.cancel(err).catch(() => {});
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }, { highWaterMark: 1 });
  };
  return { filename, decrypt };
}

// `readable.pipeThrough(t)` in workerd leaves the internal pipe promise
// unhandled when the transform throws, which surfaces as an uncaught error
// even though the consumer sees the rejection. This keeps it handled; the
// error still reaches whoever reads `t.readable`.
export function pipeThrough<I, O>(
  readable: ReadableStream<I>,
  transform: { readable: ReadableStream<O>; writable: WritableStream<I> },
): ReadableStream<O> {
  readable.pipeTo(transform.writable).catch(() => {});
  return transform.readable;
}

// --- Whole-buffer helpers for scripts and tests (Node has no memory cap). ---

export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (bytes.length) controller.enqueue(bytes);
      controller.close();
    },
  });
}

export async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
  }
  return concatBytes(parts, total);
}

export async function sealPageV3Bytes(
  pageKey: PageKey,
  meta: PageMeta,
  filename: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const sealer = await sealPageV3(pageKey, meta, filename, plaintext.length);
  return collectStream(sealer.seal(bytesToStream(plaintext)));
}

// Null when the object is not v3, the key is wrong, or anything was tampered with.
export async function openPageV3Bytes(
  key: Uint8Array,
  id: string,
  object: Uint8Array,
): Promise<{ header: StoredPageV3; filename: string; html: Uint8Array } | null> {
  const parsed = parseV3Header(object);
  if (!parsed) return null;
  if (object.length !== v3ObjectLength(parsed.end - 8, parsed.header.bytes, parsed.header.chunk)) return null;
  const opened = await openPageV3(key, id, parsed.header);
  if (!opened) return null;
  try {
    const html = await collectStream(opened.decrypt(bytesToStream(object.subarray(parsed.end))));
    return { header: parsed.header, filename: opened.filename, html };
  } catch {
    return null;
  }
}

// v3 counterpart of resealPage: new metadata, same content, filename and
// version. Null when the password does not match or the object fails to open.
export async function resealPageV3(
  id: string,
  password: string,
  object: Uint8Array,
  patch: { createdAt?: string; pinned?: boolean; public?: boolean; ttlDays?: number },
): Promise<Uint8Array | null> {
  const pageKey = await derivePageKey(id, password);
  const parsed = parseV3Header(object);
  if (!parsed || !stringsEqual(pageKey.verifier, parsed.header.verifier)) return null;
  const opened = await openPageV3Bytes(pageKey.key, id, object);
  if (!opened) return null;
  const next: PageMeta = { ...storedMetaV3(id, parsed.header), ...patch };
  if (!next.pinned) delete next.pinned;
  if (!next.public) delete next.public;
  return sealPageV3Bytes(pageKey, next, opened.filename, opened.html);
}
