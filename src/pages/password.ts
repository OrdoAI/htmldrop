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
<title>Password Required</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
.card{width:100%;max-width:360px;text-align:center}
h1{font-size:1.25rem;font-weight:600;color:#fff;margin-bottom:.25rem}
.hint{color:#888;font-size:.8125rem;margin-bottom:1.5rem}
form{display:flex;flex-direction:column;gap:.75rem}
input[type=password]{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:.625rem .75rem;color:#e0e0e0;font-size:.875rem;text-align:center}
input[type=password]:focus{outline:none;border-color:#3b82f6}
button{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:.625rem 1rem;cursor:pointer;font-size:.875rem;transition:background .15s}
button:hover{background:#2563eb}
.error{color:#ef4444;font-size:.8125rem;margin-bottom:.5rem}
</style>
</head>
<body>
<div class="card">
  <h1>Password Required</h1>
  <p class="hint">Enter password to view this page</p>
  ${showError ? '<p class="error">Incorrect password</p>' : ""}
  <form method="POST" action="/${escapedId}/auth">
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">View</button>
  </form>
</div>
</body>
</html>`;
}
