import {
  type PageRecord,
  getAuthCookie,
  mintCookie,
  setAuthCookieHeader,
  validateCookie,
  verifyPassword,
} from "./auth";
import { passwordPage } from "./pages/password";
import { notFoundPage } from "./pages/notfound";

interface Env {
  PAGES: KVNamespace;
  AUTH_SECRET: string;
}

const PREVIEW_HEADERS: HeadersInit = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "sandbox allow-scripts",
};

const APP_HEADERS: HeadersInit = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
};

export async function handleServe(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!env.AUTH_SECRET) {
    return new Response("Server misconfigured: missing AUTH_SECRET", { status: 500 });
  }

  const url = new URL(request.url);
  const queryPassword = url.searchParams.get("p");

  // Path A: bootstrap via ?p=
  if (queryPassword) {
    const record = await verifyPassword(env.PAGES, id, queryPassword);
    if (!record) {
      return new Response(passwordPage(id, false), {
        status: 403,
        headers: APP_HEADERS,
      });
    }
    const token = await mintCookie(env.AUTH_SECRET, id);
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/${id}`,
        "Set-Cookie": setAuthCookieHeader(id, token),
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  // Check auth cookie
  const cookieValue = getAuthCookie(request, id);
  if (cookieValue) {
    const valid = await validateCookie(env.AUTH_SECRET, id, cookieValue);
    if (valid) {
      const raw = await env.PAGES.get(`page:${id}`, "text");
      if (!raw) {
        return new Response(notFoundPage(), { status: 404, headers: APP_HEADERS });
      }
      const record: PageRecord = JSON.parse(raw);
      return new Response(record.html, { status: 200, headers: PREVIEW_HEADERS });
    }
  }

  // No auth — show password form (don't reveal whether ID exists)
  return new Response(passwordPage(id, false), {
    status: 401,
    headers: APP_HEADERS,
  });
}

export async function handleAuthForm(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!env.AUTH_SECRET) {
    return new Response("Server misconfigured: missing AUTH_SECRET", { status: 500 });
  }

  let password: string;
  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const pw = formData.get("password");
    if (typeof pw !== "string" || pw.length === 0) {
      return new Response(passwordPage(id, true), { status: 400, headers: APP_HEADERS });
    }
    password = pw;
  } else if (contentType.includes("application/json")) {
    const body = await request.json<{ password?: string }>();
    if (typeof body?.password !== "string" || body.password.length === 0) {
      return new Response(passwordPage(id, true), { status: 400, headers: APP_HEADERS });
    }
    password = body.password;
  } else {
    return new Response("Unsupported Content-Type", { status: 415 });
  }

  const record = await verifyPassword(env.PAGES, id, password);
  if (!record) {
    return new Response(passwordPage(id, true), { status: 403, headers: APP_HEADERS });
  }

  const token = await mintCookie(env.AUTH_SECRET, id);
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/${id}`,
      "Set-Cookie": setAuthCookieHeader(id, token),
      "Referrer-Policy": "no-referrer",
    },
  });
}
