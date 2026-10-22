// Shared design tokens and primitives for every server-rendered page: a quiet
// warm-neutral surface, one blue accent (amber marks anything public), Geist
// for text and Geist Mono for links and code. The fonts are served by the
// Worker itself (src/fonts.ts); keep these paths in step with FONT_PATHS.
// Inlined into each page's <style>; keep it free of backticks and "${".
import { MASCOT_PATH } from "../mascot";

export const FONT_PRELOAD =
  '<link rel="preload" href="/_fonts/geist-1.7.2.woff2" as="font" type="font/woff2" crossorigin>';

// Served by src/favicon.ts. Browsers that read SVG icons take the SVG; the
// PNGs cover older Safari and the iOS home screen.
export const FAVICON_LINK =
  '<link rel="icon" href="/favicon.ico" sizes="32x32">' +
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">';

// The visitor's theme choice lives in localStorage under "theme" ("light" or
// "dark"; nothing means follow the system). THEME_BOOT sits in every page's
// <head> so the choice lands on <html data-theme> before the first paint.
export const THEME_BOOT =
  '<script>try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>';

// Dark-mode rules: under the system preference unless the visitor picked
// light, and always once they picked dark. `rule` gets the root selector to
// put in front of each of its selectors.
export function dark(rule: (root: string) => string): string {
  return `@media(prefers-color-scheme:dark){${rule(":root:not([data-theme=light])")}}${rule(":root[data-theme=dark]")}`;
}

export const THEME_CSS = `
@font-face{font-family:"Geist";src:url(/_fonts/geist-1.7.2.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:"Geist Mono";src:url(/_fonts/geist-mono-1.7.2.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
:root{
  --bg:#fafaf9;--surface:#ffffff;--sunken:#f4f4f2;--hover:#eeeeeb;
  --ink:#121211;--ink-2:#575752;--ink-3:#8b8b85;--ink-4:#bcbcb5;
  --line:#e8e8e4;--line-2:#d8d8d2;
  --accent:#2c53e8;--accent-soft:#eef1fe;--accent-line:#c8d2fb;
  --pub:#b9520b;--pub-soft:#fdf1e6;--pub-line:#f1cfaf;
  --ok:#1f8a55;--err:#c42b20;--err-soft:#fdeeec;--warn:#946000;
  --shadow-sm:0 1px 2px rgba(18,18,17,.05);
  --shadow:0 1px 2px rgba(18,18,17,.04),0 10px 30px -12px rgba(18,18,17,.12);
  --shadow-lg:0 2px 6px rgba(18,18,17,.05),0 24px 56px -16px rgba(18,18,17,.22);
  --sans:"Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --mono:"Geist Mono",ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --ease:cubic-bezier(.2,.7,.2,1);--t1:.15s;--t2:.25s;--t3:.4s;
  --r-lg:18px;--r:14px;--r-s:10px;
  color-scheme:light dark;
}
${dark((r) => `${r}{
  color-scheme:dark;
  --bg:#0c0c0b;--surface:#151514;--sunken:#1c1c1a;--hover:#242422;
  --ink:#f2f2ee;--ink-2:#abaaa3;--ink-3:#7a7a73;--ink-4:#4c4c47;
  --line:#262624;--line-2:#34342f;
  --accent:#7f97ff;--accent-soft:#191f3d;--accent-line:#2e3a78;
  --pub:#f0a45c;--pub-soft:#2b1d0f;--pub-line:#5b3c1c;
  --ok:#4cc38a;--err:#ff7b72;--err-soft:#3a1d1a;--warn:#e2b25c;
  --shadow-sm:0 1px 2px rgba(0,0,0,.4);
  --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px -12px rgba(0,0,0,.7);
  --shadow-lg:0 2px 6px rgba(0,0,0,.5),0 24px 56px -16px rgba(0,0,0,.85);
}`)}
:root[data-theme=light]{color-scheme:light}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{font-family:var(--sans);font-size:15px;line-height:1.55;color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
button,input,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
a{color:inherit;text-decoration:none}
::selection{background:var(--accent-soft)}
.mark{display:inline-block;width:1.375rem;height:1.375rem;flex:none}
/* the mascot draws past its box: an orbit, the comet's tail */
[data-mascot] svg{display:block;width:100%;height:100%;overflow:visible}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;height:2.5rem;padding:0 1.05rem;border-radius:var(--r-s);border:1px solid var(--ink);background:var(--ink);color:var(--bg);font-size:.875rem;font-weight:550;letter-spacing:-.005em;white-space:nowrap;cursor:pointer;transition:background-color var(--t1) var(--ease),border-color var(--t1) var(--ease),color var(--t1) var(--ease),transform var(--t1) var(--ease)}
.btn:hover{background:var(--ink-2);border-color:var(--ink-2)}
.btn:active{transform:scale(.98)}
.btn.secondary{background:var(--surface);color:var(--ink);border-color:var(--line-2);box-shadow:var(--shadow-sm)}
.btn.secondary:hover{background:var(--sunken);border-color:var(--line-2)}
.btn svg{width:1rem;height:1rem;flex:none;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.lbl::after{content:"Copy"}
.copied .lbl::after{content:"Copied"}
.btn .i-ok{display:none}
.btn.copied .i-ok{display:inline}
.btn.copied .i-copy{display:none}
/* the icon and label swap outright, so the new ones come in rather than appear:
   the check draws itself (its path has pathLength=1) and the label rises a little */
@keyframes swap-in{from{opacity:0;transform:translateY(.1875rem)}}
@keyframes draw{from{stroke-dashoffset:1}}
.copied .i-ok path{stroke-dasharray:1;animation:draw var(--t2) var(--ease)}
.copied .lbl,.uncopied .lbl,.uncopied .i-copy{animation:swap-in var(--t2) var(--ease)}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important}}
`;

// The brand mark: a drop with a face. The body is a square with three full
// corner radii and one nearly sharp corner (a drop falling up and right, or a
// page's corner); the two eyes are capsules cut out of it, leaning 22 degrees. The
// viewBox is cropped to the body so it fills the slot the old tile did.
// src/favicon.ts and the mascot (mascot/main.ts) draw the same shape.
export const MARK_BODY = "M17.74 3.8a2.46 2.46 0 0 1 2.46 2.46V12a8.2 8.2 0 1 1-8.2-8.2z";
export const MARK_EYES = "M10.39 10.35l1.02 2.5M14.39 9.95l1.02 2.5";
function markSvg(maskId: string): string {
  return `<svg viewBox="3.4 3.4 17.2 17.2" aria-hidden="true"><mask id="${maskId}"><rect width="24" height="24" fill="#fff"/>` +
    `<path d="${MARK_EYES}" stroke="#000" stroke-width="2.5" stroke-linecap="round"/></mask>` +
    `<path d="${MARK_BODY}" fill="currentColor" mask="url(#${maskId})"/></svg>`;
}

// A slot the animated mascot takes over: the static mark until its script runs,
// and for good when the visitor asked for reduced motion or has no script.
export function mascotSlot(name: "mark", className: string): string {
  return `<span class="${className}" data-mascot="${name}" aria-hidden="true">${markSvg(`${name}-eyes`)}</span>`;
}
export const MASCOT_SCRIPT = `<script src="${MASCOT_PATH}" defer></script>`;
