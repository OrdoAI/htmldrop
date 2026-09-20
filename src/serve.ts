import {
  PageChangedError,
  type PageRecord,
  getAuthCookie,
  getPageMeta,
  mintCommentToken,
  mintCookie,
  mintNoticeToken,
  openPublic,
  openWithKey,
  recordVersion,
  setAuthCookieHeader,
  validateCookie,
  verifyNoticeToken,
  verifyPassword,
} from "./auth";
import { commentWidget } from "./widget";
import { pipeThrough } from "./envelope";
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
// Streams the page through, holding back only the last `hold` bytes, so the
// search costs the same for a 50 MiB page as for a 5 KiB one. A page whose
// last </body> sits more than `hold` bytes before its end gets the snippet
// appended instead, which browsers render the same way.
const HOLD_BYTES = 256 * 1024;

function lastBodyClose(b: Uint8Array): number {
  let last = -1;
  for (let i = 0; i + 6 < b.length; i++) {
    if (b[i] !== 0x3c || b[i + 1] !== 0x2f) continue; // "</"
    if ((b[i + 2] | 0x20) !== 0x62 || (b[i + 3] | 0x20) !== 0x6f
      || (b[i + 4] | 0x20) !== 0x64 || (b[i + 5] | 0x20) !== 0x79) continue; // "body"
    let j = i + 6;
    while (j < b.length && (b[j] === 0x20 || b[j] === 0x09 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x0c)) j++;
    if (j < b.length && b[j] === 0x3e) last = i;
  }
  return last;
}

export function injectAtBodyEnd(snippet: Uint8Array, hold = HOLD_BYTES): TransformStream<Uint8Array, Uint8Array> {
  let tail = new Uint8Array(0);
  return new TransformStream({
    transform(chunk, controller) {
      const joined = new Uint8Array(tail.length + chunk.length);
      joined.set(tail, 0);
      joined.set(chunk, tail.length);
      if (joined.length > hold) {
        controller.enqueue(joined.subarray(0, joined.length - hold));
        tail = joined.slice(joined.length - hold);
      } else {
        tail = joined;
      }
    },
    flush(controller) {
      const at = lastBodyClose(tail);
      if (at < 0) {
        if (tail.length) controller.enqueue(tail);
        controller.enqueue(snippet);
      } else {
        controller.enqueue(tail.subarray(0, at));
        controller.enqueue(snippet);
        controller.enqueue(tail.subarray(at));
      }
    },
  });
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

// A page rewritten between the header read and the body read makes body()
// throw; the whole lookup, authorization included, runs again on the new
// object. Three tries covers any realistic burst of updates.
export async function handleServe(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await serveOnce(request, env, id);
    } catch (err) {
      if (!(err instanceof PageChangedError)) throw err;
    }
  }
  return new Response(responseBody(request, "Page is being updated, retry"), {
    status: 503,
    headers: withTransportSecurity({ "Retry-After": "1" }, request),
  });
}

async function serveOnce(
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
    const token = await mintCookie(env.AUTH_SECRET, id, record.key);
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
    const key = await validateCookie(env.AUTH_SECRET, id, cookieValue);
    if (key) {
      // The key from the cookie is the credential; a wrong or stale one, or a
      // record whose metadata was edited behind the Worker, fails to open.
      const record = await openWithKey(env.BUCKET, id, key);
      if (!record) {
        return new Response(responseBody(request, notFoundPage()), {
          status: 404,
          headers: withTransportSecurity(APP_HEADERS, request),
        });
      }
      return previewResponse(request, env, id, record, true);
    }
  }

  // Public page: anyone with the bare URL reads it. No cookie is set and no
  // comment widget is injected, since its token would let any visitor write;
  // whoever opens the edit link (`?p=`) still gets the widget.
  const open = await openPublic(env.BUCKET, id);
  if (open) {
    return previewResponse(request, env, id, open, false);
  }

  return new Response(responseBody(request, passwordPage(id, false)), {
    status: 401,
    headers: withTransportSecurity(APP_HEADERS, request),
  });
}

async function previewResponse(
  request: Request,
  env: Env,
  id: string,
  record: PageRecord,
  withWidget: boolean,
): Promise<Response> {
  // `version` changes on every write, so it doubles as the cache validator.
  // `no-cache` forces revalidation, so a plain refresh never serves a stale
  // local copy. The widget variant gets its own validator so a browser that
  // read the page anonymously and then authenticated never gets a 304 for
  // the widget-less body.
  const version = recordVersion(record);
  const etag = withWidget ? `"${version}.w"` : `"${version}"`;
  const headers = withTransportSecurity({
    ...PREVIEW_HEADERS,
    "Cache-Control": "private, no-cache",
    ETag: etag,
  }, request);
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  const token = await mintNoticeToken(env.AUTH_SECRET, id, record.verifier);
  let inject = updateNotice(id, version, token);
  if (withWidget) {
    inject += commentWidget(id, await mintCommentToken(env.AUTH_SECRET, id, record.key));
  }
  // HEAD never opens the page; only a GET streams it.
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  const { stream } = await record.body();
  return new Response(pipeThrough(stream, injectAtBodyEnd(new TextEncoder().encode(inject))), {
    status: 200,
    headers,
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
    const meta = await getPageMeta(env.BUCKET, id);
    if (meta && await verifyNoticeToken(env.AUTH_SECRET, id, meta.verifier, token)) {
      v = meta.version;
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

  const token = await mintCookie(env.AUTH_SECRET, id, record.key);
  return new Response(null, {
    status: 303,
    headers: withTransportSecurity({
      Location: `/${id}`,
      "Set-Cookie": setAuthCookieHeader(id, token),
      "Referrer-Policy": "no-referrer",
    }, request),
  });
}
