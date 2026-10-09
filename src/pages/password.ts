import { FAVICON_LINK, FONT_PRELOAD, MARK_SVG, THEME_BOOT, THEME_CSS } from "./theme";

// Shown when a private page is opened without its password: normally because
// the link lost its `?p=` part on the way.
export function passwordPage(id: string, showError: boolean): string {
  const escapedId = id.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${THEME_BOOT}
<title>Password required · HTMLDrop</title>
${FAVICON_LINK}
${FONT_PRELOAD}
<style>
${THEME_CSS}
body{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.75rem;padding:2rem 1.25rem}
.card{width:100%;max-width:24rem;padding:2rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow)}
.ic{display:grid;place-items:center;width:2.75rem;height:2.75rem;margin-bottom:1.25rem;border-radius:999px;background:var(--sunken);color:var(--ink-2)}
.ic svg{width:1.25rem;height:1.25rem;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
h1{font-size:1.375rem;font-weight:650;line-height:1.25;letter-spacing:-.03em}
.hint{margin-top:.5rem;font-size:.9375rem;color:var(--ink-2);text-wrap:pretty}
.hint code{padding:.1em .35em;background:var(--sunken);border:1px solid var(--line);border-radius:6px;font-family:var(--mono);font-size:.8125rem}
form{display:flex;flex-direction:column;gap:.625rem;margin-top:1.5rem}
input[type=password]{height:2.75rem;padding:0 .875rem;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r-s);font-family:var(--mono);font-size:.9375rem;outline:none;transition:border-color var(--t1) var(--ease),box-shadow var(--t1) var(--ease)}
input[type=password]:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
input[type=password]::placeholder{font-family:var(--sans);color:var(--ink-4)}
.btn{height:2.75rem}
.error{display:flex;align-items:center;gap:.5rem;margin-top:1rem;font-size:.875rem;color:var(--err)}
.error::before{content:"";flex:none;width:.4rem;height:.4rem;border-radius:50%;background:currentColor}
.brand{display:inline-flex;align-items:center;gap:.5rem;font-size:.875rem;font-weight:600;letter-spacing:-.015em;color:var(--ink-3);transition:color var(--t1) var(--ease)}
.brand:hover{color:var(--ink)}
.brand .mark{width:1.125rem;height:1.125rem}
</style>
</head>
<body>
<main class="card">
  <span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg></span>
  <h1>This page is private</h1>
  <p class="hint">Its password is the part of the link after <code>?p=</code>. Open the full link, or paste the password here.</p>
  ${showError ? '<p class="error">That password does not open this page.</p>' : ""}
  <form method="POST" action="/${escapedId}/auth">
    <input type="password" name="password" placeholder="Password" aria-label="Password" autocomplete="off" autofocus required>
    <button type="submit" class="btn">Open page</button>
  </form>
</main>
<a class="brand" href="/">${MARK_SVG}HTMLDrop</a>
</body>
</html>`;
}
