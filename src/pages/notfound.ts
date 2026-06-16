export function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not Found</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
.card{text-align:center}
h1{font-size:1.5rem;font-weight:600;color:#fff;margin-bottom:.5rem}
p{color:#888;font-size:.875rem}
a{color:#3b82f6;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <h1>Page Not Found</h1>
  <p>This page may have expired or never existed.</p>
  <p style="margin-top:1rem"><a href="/">Upload a new file</a></p>
</div>
</body>
</html>`;
}
