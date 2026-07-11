import {
  getAuthCookie,
  getPage,
  mintCommentToken,
  mintCookie,
  mintNoticeToken,
  recordVersion,
  setAuthCookieHeader,
  validateCookie,
  verifyNoticeToken,
  verifyPassword,
} from "./auth";
import { commentWidget } from "./widget";
import { passwordPage } from "./pages/password";
import { notFoundPage } from "./pages/notfound";
import { withTransportSecurity } from "./security";

interface Env {
  BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

const PREVIEW_HEADERS: HeadersInit = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "sandbox allow-scripts",
};

const VERSION_HEADERS: HeadersInit = {
  "Content-Type": "application/json; charset=utf-8",
  // The notice script runs in the `sandbox allow-scripts` preview (an opaque
  // origin), so its fetch is cross-origin and needs CORS to read the body.
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

// Injected into authenticated preview HTML. A self-contained script builds a
// dismissible notice in a closed Shadow DOM (so user CSS/ids never collide),
// then polls /:id/v?t=<token> for a newer version. The probe token is the only
// capability passed in — no auth cookie reaches this sandboxed (opaque-origin)
// script. The preview keeps a strict CSP; clicking Refresh calls location.reload
// (verified to work under `sandbox allow-scripts`), with a manual-refresh hint.
function updateNotice(id: string, version: string, token: string): string {
  const v = JSON.stringify(version);
  const i = JSON.stringify(id);
  const t = JSON.stringify(token);
  return `<script>
(function(){
var V=${v},ID=${i},T=${t},shown=false,timer,host=document.createElement("div");
host.style.cssText="all:initial;position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none";
var root=host.attachShadow({mode:"closed"});
root.innerHTML='<style>'+
'.bar{pointer-events:auto;position:absolute;left:50%;bottom:20px;transform:translateX(-50%) translateY(14px);display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:7px 8px 7px 16px;border-radius:100px;background:#fff;border:1px solid #ebebeb;box-shadow:0 2px 2px rgba(0,0,0,.04),0 8px 16px -4px rgba(0,0,0,.06);color:#171717;font:400 14px/1.4 Geist,Inter,system-ui,-apple-system,sans-serif;letter-spacing:-.28px;opacity:0;transition:opacity .3s ease,transform .3s ease}'+
'.bar.show{opacity:1;transform:translateX(-50%) translateY(0)}'+
'.bar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#f5a623}'+
'.r{flex:0 0 auto;border:0;cursor:pointer;border-radius:100px;padding:5px 13px;font:500 13px/1 Geist,Inter,system-ui,sans-serif;letter-spacing:-.28px;color:#fff;background:#171717}'+
'.r:hover{background:#383838}'+
'.x{flex:0 0 auto;border:0;background:transparent;color:#888;cursor:pointer;font:400 18px/1 system-ui;padding:2px 9px;border-radius:100px}'+
'.x:hover{background:#f5f5f5;color:#171717}'+
'@media(max-width:520px){.bar{left:12px;right:12px;transform:translateY(14px)}.bar.show{transform:translateY(0)}.bar span{white-space:normal}}'+
'</style>'+
'<div class="bar" title="Refresh to load the latest version (Cmd/Ctrl + R)">'+
'<span class="dot"></span><span>You are viewing an outdated version</span>'+
'<button class="r">Refresh</button>'+
'<button class="x" aria-label="Dismiss">&times;</button></div>';
var bar=root.querySelector(".bar");
root.querySelector(".r").addEventListener("click",function(){try{location.reload();}catch(e){}});
root.querySelector(".x").addEventListener("click",function(){shown=true;clearInterval(timer);host.remove();});
function present(){if(shown)return;shown=true;clearInterval(timer);(document.body||document.documentElement).appendChild(host);requestAnimationFrame(function(){bar.classList.add("show");});}
function check(){
if(shown)return;
fetch("/"+ID+"/v?t="+encodeURIComponent(T),{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(d){
if(d&&d.v&&d.v!==V)present();
}).catch(function(){});
}
document.addEventListener("visibilitychange",function(){if(!document.hidden)check();});
timer=setInterval(check,300000);
setTimeout(check,30000);
})();
</script>`;
}

// Insert the notice before the last </body> when present; append as a fallback.
// Treated as hostile-to-collisions: the snippet is otherwise self-contained.
function injectNotice(html: string, snippet: string): string {
  const re = /<\/body\s*>/gi;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) last = m.index;
  return last === -1 ? html + snippet : html.slice(0, last) + snippet + html.slice(last);
}

const APP_HEADERS: HeadersInit = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
};

function responseBody(request: Request, body: BodyInit): BodyInit | null {
  return request.method === "HEAD" ? null : body;
}

export async function handleServe(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!env.AUTH_SECRET) {
    return new Response(responseBody(request, "Server misconfigured: missing AUTH_SECRET"), {
      status: 500,
      headers: withTransportSecurity({}, request),
    });
  }

  const url = new URL(request.url);
  const queryPassword = url.searchParams.get("p");

  if (queryPassword) {
    const record = await verifyPassword(env.BUCKET, id, queryPassword);
    if (!record) {
      return new Response(responseBody(request, passwordPage(id, false)), {
        status: 403,
        headers: withTransportSecurity(APP_HEADERS, request),
      });
    }
    const token = await mintCookie(env.AUTH_SECRET, id);
    return new Response(null, {
      status: 303,
      headers: withTransportSecurity({
        Location: `/${id}`,
        "Set-Cookie": setAuthCookieHeader(id, token),
        "Referrer-Policy": "no-referrer",
      }, request),
    });
  }

  const cookieValue = getAuthCookie(request, id);
  if (cookieValue) {
    const valid = await validateCookie(env.AUTH_SECRET, id, cookieValue);
    if (valid) {
      const record = await getPage(env.BUCKET, id);
      if (!record) {
        return new Response(responseBody(request, notFoundPage()), {
          status: 404,
          headers: withTransportSecurity(APP_HEADERS, request),
        });
      }
      // `version` changes on every write, so it doubles as the cache validator.
      // `no-cache` forces revalidation, so a plain refresh never serves a stale
      // local copy.
      const version = recordVersion(record);
      const etag = `"${version}"`;
      const headers = withTransportSecurity({
        ...PREVIEW_HEADERS,
        "Cache-Control": "private, no-cache",
        ETag: etag,
      }, request);
      if (request.headers.get("If-None-Match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      const token = await mintNoticeToken(env.AUTH_SECRET, id, record.password);
      const commentToken = await mintCommentToken(env.AUTH_SECRET, id, record.password);
      const body = injectNotice(
        record.html,
        updateNotice(id, version, token) + commentWidget(id, commentToken),
      );
      return new Response(responseBody(request, body), {
        status: 200,
        headers,
      });
    }
  }

  return new Response(responseBody(request, passwordPage(id, false)), {
    status: 401,
    headers: withTransportSecurity(APP_HEADERS, request),
  });
}

// Version probe for the in-preview update notice. Gated by the opaque token
// minted into authenticated preview HTML — so only a viewer who already passed
// the password gate can probe, and a bare clean id stays non-informative.
// Missing record, missing token, invalid token, and expired record all return
// the same `{v:null}` so nothing is enumerable.
export async function handleVersion(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  let v: string | null = null;
  if (token && env.AUTH_SECRET) {
    const record = await getPage(env.BUCKET, id);
    if (record && await verifyNoticeToken(env.AUTH_SECRET, id, record.password, token)) {
      v = recordVersion(record);
    }
  }
  return new Response(JSON.stringify({ v }), {
    status: 200,
    headers: withTransportSecurity(VERSION_HEADERS, request),
  });
}

export async function handleAuthForm(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: withTransportSecurity({}, request),
    });
  }

  if (!env.AUTH_SECRET) {
    return new Response("Server misconfigured: missing AUTH_SECRET", {
      status: 500,
      headers: withTransportSecurity({}, request),
    });
  }

  let password: string;
  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const pw = formData.get("password");
    if (typeof pw !== "string" || pw.length === 0) {
      return new Response(passwordPage(id, true), {
        status: 400,
        headers: withTransportSecurity(APP_HEADERS, request),
      });
    }
    password = pw;
  } else if (contentType.includes("application/json")) {
    const body = await request.json<{ password?: string }>();
    if (typeof body?.password !== "string" || body.password.length === 0) {
      return new Response(passwordPage(id, true), {
        status: 400,
        headers: withTransportSecurity(APP_HEADERS, request),
      });
    }
    password = body.password;
  } else {
    return new Response("Unsupported Content-Type", {
      status: 415,
      headers: withTransportSecurity({}, request),
    });
  }

  const record = await verifyPassword(env.BUCKET, id, password);
  if (!record) {
    return new Response(passwordPage(id, true), {
      status: 403,
      headers: withTransportSecurity(APP_HEADERS, request),
    });
  }

  const token = await mintCookie(env.AUTH_SECRET, id);
  return new Response(null, {
    status: 303,
    headers: withTransportSecurity({
      Location: `/${id}`,
      "Set-Cookie": setAuthCookieHeader(id, token),
      "Referrer-Policy": "no-referrer",
    }, request),
  });
}
