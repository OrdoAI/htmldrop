import { hmacSign, hmacVerify, parseCookies } from "./utils";

export interface PageRecord {
  html: string;
  password: string;
  filename: string;
  createdAt: string;
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

export async function verifyPassword(
  kv: KVNamespace,
  id: string,
  password: string,
): Promise<PageRecord | null> {
  const raw = await kv.get(`page:${id}`, "text");
  if (!raw) return null;
  const record: PageRecord = JSON.parse(raw);
  if (record.password.length !== password.length) return null;
  let mismatch = 0;
  for (let i = 0; i < record.password.length; i++) {
    mismatch |= record.password.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return mismatch === 0 ? record : null;
}
