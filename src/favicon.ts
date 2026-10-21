import favicon32 from "./icons/favicon-32.png";
import appleTouchIcon from "./icons/apple-touch-icon-180.png";
import { MARK_BODY, MARK_EYES } from "./pages/theme";
import { withTransportSecurity } from "./security";

// The brand mark from src/pages/theme.ts as a standalone tab icon: the page
// CSS variables don't reach a favicon, so the colours are spelled out and
// flipped for dark browser chrome; the eyes are holes, so they take the tab's
// colour either way. The PNGs in src/icons/ can't flip: the 32px one (also
// what uploaded previews show) draws the eyes white and rings the body in
// white so it holds on light and dark tab bars, and the 180px one is the mark
// on a full-bleed light square that iOS rounds itself.
export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="3.4 3.4 17.2 17.2">' +
  "<style>.b{fill:#121211}@media(prefers-color-scheme:dark){.b{fill:#f2f2ee}}</style>" +
  `<mask id="e"><rect width="24" height="24" fill="#fff"/><path d="${MARK_EYES}" stroke="#000" stroke-width="2.5" stroke-linecap="round"/></mask>` +
  `<path class="b" d="${MARK_BODY}" mask="url(#e)"/></svg>`;

// /favicon.ico is a PNG: browsers ask for it on their own (uploaded previews
// without an icon of their own included) and sniff the format, not the name.
const ICONS: Record<string, { body: string | ArrayBuffer; type: string }> = {
  "/favicon.svg": { body: FAVICON_SVG, type: "image/svg+xml" },
  "/favicon.ico": { body: favicon32, type: "image/png" },
  "/apple-touch-icon.png": { body: appleTouchIcon, type: "image/png" },
};

export function handleFavicon(request: Request, path: string): Response | null {
  const icon = ICONS[path];
  if (!icon) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: withTransportSecurity({}, request) });
  }
  return new Response(request.method === "HEAD" ? null : icon.body, {
    headers: withTransportSecurity({
      "Content-Type": icon.type,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    }, request),
  });
}
