import {
  type PageRecord,
  getAuthCookie,
  getPage,
  mintCookie,
  setAuthCookieHeader,
  validateCookie,
  verifyPassword,
} from "./auth";
import { passwordPage } from "./pages/password";
import { notFoundPage } from "./pages/notfound";
import { withTransportSecurity } from "./security";

interface Env {
  BUCKET: R2Bucket;
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

function responseBody(request: Request, body: BodyInit): BodyInit | null {
  return request.method === "HEAD" ? null : body;
}

export async function handleServe(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!env.AUTH_SECRET) {
    return new Response(responseBody(request, "Server misconfigured: missing AUTH_SECRET"), {
      status: 500,
      headers: withTransportSecurity({}, request),
    });
  }

  const url = new URL(request.url);
  const queryPassword = url.searchParams.get("p");

  if (queryPassword) {
    const record = await verifyPassword(env.BUCKET, id, queryPassword);
    if (!record) {
      return new Response(responseBody(request, passwordPage(id, false)), {
        status: 403,
        headers: withTransportSecurity(APP_HEADERS, request),
      });
    }
    const token = await mintCookie(env.AUTH_SECRET, id);
    return new Response(null, {
      status: 303,
      headers: withTransportSecurity({
        Location: `/${id}`,
        "Set-Cookie": setAuthCookieHeader(id, token),
        "Referrer-Policy": "no-referrer",
      }, request),
    });
  }

  const cookieValue = getAuthCookie(request, id);
  if (cookieValue) {
    const valid = await validateCookie(env.AUTH_SECRET, id, cookieValue);
    if (valid) {
      const record = await getPage(env.BUCKET, id);
      if (!record) {
        return new Response(responseBody(request, notFoundPage()), {
          status: 404,
          headers: withTransportSecurity(APP_HEADERS, request),
        });
      }
      return new Response(responseBody(request, record.html), {
        status: 200,
        headers: withTransportSecurity(PREVIEW_HEADERS, request),
      });
    }
  }

  return new Response(responseBody(request, passwordPage(id, false)), {
    status: 401,
    headers: withTransportSecurity(APP_HEADERS, request),
  });
}

export async function handleAuthForm(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: withTransportSecurity({}, request),
    });
  }

  if (!env.AUTH_SECRET) {
    return new Response("Server misconfigured: missing AUTH_SECRET", {
      status: 500,
      headers: withTransportSecurity({}, request),
    });
  }

  let password: string;
  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const pw = formData.get("password");
    if (typeof pw !== "string" || pw.length === 0) {
      return new Response(passwordPage(id, true), {
        status: 400,
        headers: withTransportSecurity(APP_HEADERS, request),
      });
    }
    password = pw;
  } else if (contentType.includes("application/json")) {
    const body = await request.json<{ password?: string }>();
    if (typeof body?.password !== "string" || body.password.length === 0) {
      return new Response(passwordPage(id, true), {
        status: 400,
        headers: withTransportSecurity(APP_HEADERS, request),
      });
    }
    password = body.password;
  } else {
    return new Response("Unsupported Content-Type", {
      status: 415,
      headers: withTransportSecurity({}, request),
    });
  }

  const record = await verifyPassword(env.BUCKET, id, password);
  if (!record) {
    return new Response(passwordPage(id, true), {
      status: 403,
      headers: withTransportSecurity(APP_HEADERS, request),
    });
  }

  const token = await mintCookie(env.AUTH_SECRET, id);
  return new Response(null, {
    status: 303,
    headers: withTransportSecurity({
      Location: `/${id}`,
      "Set-Cookie": setAuthCookieHeader(id, token),
      "Referrer-Policy": "no-referrer",
    }, request),
  });
}
