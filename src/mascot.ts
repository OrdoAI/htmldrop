import { MASCOT_JS, MASCOT_PATH } from "./mascot.gen";
import { withTransportSecurity } from "./security";

export { MASCOT_PATH };

// The animated mascot's script (built from mascot/ by scripts/build-mascot.mjs).
// Its path carries the bundle's hash, so a response can be cached for good.
export function handleMascot(request: Request, path: string): Response | null {
  if (path !== MASCOT_PATH) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: withTransportSecurity({}, request) });
  }
  return new Response(request.method === "HEAD" ? null : MASCOT_JS, {
    headers: withTransportSecurity({
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    }, request),
  });
}
