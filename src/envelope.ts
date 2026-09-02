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
  return `htmldrop:page:v2|${meta.id}|${meta.createdAt}|${meta.version}|${meta.pinned ? 1 : 0}`;
}

export function storedMeta(id: string, stored: StoredPage): PageMeta {
  return {
    id,
    createdAt: stored.createdAt,
    version: stored.version,
    ...(stored.pinned ? { pinned: true } : {}),
  };
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
    && typeof r.ct === "string";
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

// Re-seal with new metadata (pin, unpin, renew). Content and `version` are
// kept. Null when the password does not match or the ciphertext fails to
// authenticate.
export async function resealPage(
  id: string,
  password: string,
  stored: StoredPage | LegacyPage,
  patch: { createdAt?: string; pinned?: boolean },
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
  return sealPage(pageKey, next, payload);
}
