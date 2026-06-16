import { handleUpload } from "./upload";
import { handleServe, handleAuthForm } from "./serve";
import { homePage } from "./pages/home";
import { notFoundPage } from "./pages/notfound";

interface Env {
  BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

const APP_HEADERS: HeadersInit = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" && request.method === "GET") {
      return new Response(homePage(), { headers: APP_HEADERS });
    }

    if (path === "/cli/install" && request.method === "GET") {
      return Response.redirect("https://raw.githubusercontent.com/OrdoAI/htmldrop/main/cli/install.sh", 302);
    }

    if (path === "/api/upload") {
      return handleUpload(request, env);
    }

    // POST /:id/auth
    const authMatch = path.match(/^\/([A-Za-z0-9]{1,16})\/auth$/);
    if (authMatch) {
      return handleAuthForm(request, env, authMatch[1]);
    }

    // GET /:id
    const pageMatch = path.match(/^\/([A-Za-z0-9]{1,16})$/);
    if (pageMatch && request.method === "GET") {
      return handleServe(request, env, pageMatch[1]);
    }

    return new Response(notFoundPage(), { status: 404, headers: APP_HEADERS });
  },
};
