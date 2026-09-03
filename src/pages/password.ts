import { THEME_CSS } from "./theme";

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
<title>Password Required</title>
<style>
${THEME_CSS}
body{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:2rem 1.25rem}
.sheet{width:100%;max-width:24rem;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);box-shadow:var(--shadow);padding:2rem 2rem 1.75rem;text-align:center}
h1{font-size:1.5rem;font-weight:500;letter-spacing:-.01em;line-height:1.2}
.hint{margin-top:.5rem;color:var(--ink-3);font-style:italic;font-size:.9375rem}
form{margin-top:1.5rem;padding-top:1.25rem;border-top:1px dashed var(--rule-2);display:flex;flex-direction:column;gap:.75rem}
input[type=password]{font-family:var(--mono);font-size:.9375rem;text-align:center;background:var(--paper-2);border:0;border-bottom:1px solid var(--ink);border-radius:0;padding:.6rem .5rem;color:var(--ink);outline:none;transition:border-color var(--t1) var(--ease)}
input[type=password]:focus{border-bottom-color:var(--accent);outline:none}
input[type=password]::placeholder{color:var(--ink-4);font-family:var(--serif);font-style:italic}
.error{color:var(--err);font-style:italic;font-size:.9375rem;margin-top:.75rem}
.foot{margin-top:1.25rem;font-size:.875rem;font-style:italic;color:var(--ink-3)}
</style>
</head>
<body>
<div class="sheet">
  <h1>Password Required</h1>
  <p class="hint">The password is in the link you were given.</p>
  ${showError ? '<p class="error">Incorrect password. Check the link you were given.</p>' : ""}
  <form method="POST" action="/${escapedId}/auth">
    <input type="password" name="password" placeholder="password" autofocus required>
    <button type="submit" class="btn">Open the page</button>
  </form>
  <p class="foot"><a href="/">HTMLDrop</a></p>
</div>
</body>
</html>`;
}
