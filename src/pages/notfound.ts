import { THEME_CSS } from "./theme";

export function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Not Found</title>
<style>
${THEME_CSS}
body{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:2rem 1.25rem}
.sheet{width:100%;max-width:24rem;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);box-shadow:var(--shadow);padding:2rem 2rem 1.75rem;text-align:center}
h1{font-size:1.5rem;font-weight:500;letter-spacing:-.01em;line-height:1.2}
p{margin-top:.5rem;color:var(--ink-3);font-style:italic;font-size:.9375rem}
.act{margin-top:1.5rem;padding-top:1.25rem;border-top:1px dashed var(--rule-2)}
</style>
</head>
<body>
<div class="sheet">
  <h1>Page Not Found</h1>
  <p>This page may have expired or never existed.</p>
  <div class="act"><a class="btn" href="/">Upload a new file</a></div>
</div>
</body>
</html>`;
}
