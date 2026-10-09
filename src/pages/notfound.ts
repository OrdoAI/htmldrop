import { FAVICON_LINK, FONT_PRELOAD, MARK_SVG, THEME_CSS } from "./theme";

export function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Not found · HTMLDrop</title>
${FAVICON_LINK}
${FONT_PRELOAD}
<style>
${THEME_CSS}
body{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.75rem;padding:2rem 1.25rem}
.card{width:100%;max-width:24rem;padding:2rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow)}
.ic{display:grid;place-items:center;width:2.75rem;height:2.75rem;margin-bottom:1.25rem;border-radius:999px;background:var(--sunken);color:var(--ink-2)}
.ic svg{width:1.25rem;height:1.25rem;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
h1{font-size:1.375rem;font-weight:650;line-height:1.25;letter-spacing:-.03em}
p{margin-top:.5rem;font-size:.9375rem;color:var(--ink-2);text-wrap:pretty}
.act{margin-top:1.5rem}
.act .btn{width:100%;height:2.75rem}
.brand{display:inline-flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600;letter-spacing:-.015em;color:var(--ink-3);transition:color var(--t1) var(--ease)}
.brand:hover{color:var(--ink)}
.brand .mark{width:1.125rem;height:1.125rem}
</style>
</head>
<body>
<main class="card">
  <span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg></span>
  <h1>This link has expired</h1>
  <p>Or it never existed. Pages on HTMLDrop are deleted once nobody opens them for 7 to 30 days, or on a date the sharer picked. Whoever shared it can upload it again.</p>
  <div class="act"><a class="btn" href="/">Make a new link</a></div>
</main>
<a class="brand" href="/">${MARK_SVG}HTMLDrop</a>
</body>
</html>`;
}
