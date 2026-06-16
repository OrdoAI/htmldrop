import { hmacSign, hmacVerify, parseCookies } from "./utils";

export interface PageRecord {
  html: string;
  password: string;
  filename: string;
  createdAt: string;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
