import { handleUpload } from "./upload";
import { handleServe, handleAuthForm, handleVersion } from "./serve";
import { handleComments, handleCommentMutate } from "./comments";
import { homePage } from "./pages/home";
import { notFoundPage } from "./pages/notfound";
import {
  applyTransportSecurity,
  redirectToHttps,
  withTransportSecurity,
} from "./security";

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
    const httpsRedirect = redirectToHttps(request);
    if (httpsRedirect) return httpsRedirect;

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" && request.method === "GET") {
      return new Response(homePage(), {
        headers: withTransportSecurity(APP_HEADERS, request),
      });
    }

    if (path === "/cli/install" && request.method === "GET") {
      const response = Response.redirect(
        "https://raw.githubusercontent.com/OrdoAI/htmldrop/main/cli/install.sh",
        302,
      );
      return applyTransportSecurity(response, request);
    }

    if (path === "/api/upload") {
      return handleUpload(request, env);
    }

    // POST /:id/auth
    const authMatch = path.match(/^\/([A-Za-z0-9]{1,16})\/auth$/);
    if (authMatch) {
      return handleAuthForm(request, env, authMatch[1]);
    }

    // GET /:id/v — version probe for the in-preview update notice
    const versionMatch = path.match(/^\/([A-Za-z0-9]{1,16})\/v$/);
    if (versionMatch && request.method === "GET") {
      return handleVersion(request, env, versionMatch[1]);
    }

    // /:id/comments — list (GET) or create (POST) comments for a preview
    const commentsMatch = path.match(/^\/([A-Za-z0-9]{1,16})\/comments$/);
    if (commentsMatch) {
      return handleComments(request, env, commentsMatch[1]);
    }

    // /:id/comments/:cid — resolve/reopen a root comment thread (POST)
    const mutateMatch = path.match(/^\/([A-Za-z0-9]{1,16})\/comments\/([A-Za-z0-9-]{1,64})$/);
    if (mutateMatch) {
      return handleCommentMutate(request, env, mutateMatch[1], mutateMatch[2]);
    }

    // GET/HEAD /:id
    const pageMatch = path.match(/^\/([A-Za-z0-9]{1,16})$/);
    if (pageMatch && (request.method === "GET" || request.method === "HEAD")) {
      return handleServe(request, env, pageMatch[1]);
    }

    return new Response(notFoundPage(), {
      status: 404,
      headers: withTransportSecurity(APP_HEADERS, request),
    });
  },
};
