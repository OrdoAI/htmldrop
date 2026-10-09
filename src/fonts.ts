import geist from "./fonts/geist-1.7.2.woff2";
import geistMono from "./fonts/geist-mono-1.7.2.woff2";
import { withTransportSecurity } from "./security";

// The file names carry the font version, so a response can be cached for good.
export const FONT_PATHS = {
  sans: "/_fonts/geist-1.7.2.woff2",
  mono: "/_fonts/geist-mono-1.7.2.woff2",
} as const;

const FONTS: Record<string, ArrayBuffer> = {
  [FONT_PATHS.sans]: geist,
  [FONT_PATHS.mono]: geistMono,
};

export function handleFont(request: Request, path: string): Response | null {
  const font = FONTS[path];
  if (!font) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: withTransportSecurity({}, request) });
  }
  return new Response(request.method === "HEAD" ? null : font, {
    headers: withTransportSecurity({
      "Content-Type": "font/woff2",
      "Content-Length": String(font.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    }, request),
  });
}
