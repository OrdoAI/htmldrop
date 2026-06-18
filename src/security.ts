const HSTS_VALUE = "max-age=31536000; includeSubDomains";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" ||
    hostname === "::1" || hostname === "[::1]";
}

function isProductionHost(url: URL): boolean {
  return !isLocalHost(url.hostname);
}

export function redirectToHttps(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || !isProductionHost(url)) return null;

  url.protocol = "https:";
  const status = request.method === "GET" || request.method === "HEAD" ? 301 : 308;
  return new Response(null, {
    status,
    headers: {
      Location: url.toString(),
    },
  });
}

export function withTransportSecurity(
  headers: HeadersInit = {},
  request: Request,
): Headers {
  const result = new Headers(headers);
  const url = new URL(request.url);
  if (url.protocol === "https:" && isProductionHost(url)) {
    result.set("Strict-Transport-Security", HSTS_VALUE);
  }
  return result;
}

export function applyTransportSecurity(response: Response, request: Request): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withTransportSecurity(response.headers, request),
  });
}

export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  if (url.protocol === "http:" && isProductionHost(url)) {
    url.protocol = "https:";
  }
  return url.origin;
}
