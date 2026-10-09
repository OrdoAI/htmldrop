import favicon32 from "./icons/favicon-32.png";
import appleTouchIcon from "./icons/apple-touch-icon-180.png";
import { withTransportSecurity } from "./security";

// The brand mark from src/pages/theme.ts as a standalone tab icon: the page
// CSS variables don't reach a favicon, so the colours are spelled out and
// flipped for dark browser chrome. The PNGs in src/icons/ are this mark
// rendered in its light colours: a 32px rounded tile, and a 180px full-bleed
// square that iOS rounds itself.
export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  "<style>rect{fill:#121211}path{stroke:#fafaf9}@media(prefers-color-scheme:dark){rect{fill:#f2f2ee}path{stroke:#0c0c0b}}</style>" +
  '<rect width="24" height="24" rx="7"/>' +
  '<path d="M12 6.25v7.5M8.75 10.75 12 14l3.25-3.25M7.25 17.25h9.5" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
