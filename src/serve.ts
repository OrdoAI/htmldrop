import {
  type PageRecord,
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
import { formatCommentsForCopy, locateQuote } from "./anchor";
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

// Injected into authenticated preview HTML below the update notice. A
// self-contained script builds the Feishu-style comment UI in a closed Shadow
// DOM (panel/selection button/collapsed entry, so user CSS never collides),
// while anchoring + highlighting operate on the main document via the CSS
// Custom Highlight API (no user-DOM mutation). It talks to the token-gated,
// CORS-enabled comment API exactly like the notice script. `locateQuote` and
// `formatCommentsForCopy` are injected verbatim via toString so the tested
// logic is the shipped logic; both are self-contained (the formatter takes
// `locate` as a parameter rather than referencing module scope, so neither
// breaks under identifier minification). All user-provided text is written with
// textContent, never innerHTML, so comments cannot inject markup.
function commentWidget(id: string, token: string): string {
  const i = JSON.stringify(id);
  const t = JSON.stringify(token);
  const LOCATE = locateQuote.toString();
  const FORMAT = formatCommentsForCopy.toString();
  return `<script>
(function(){
"use strict";
var ID=${i},T=${t};
// esbuild's keepNames wraps inner named functions with a __name() helper; the
// toString-injected functions below reference it, so provide a no-op in scope.
var __name=function(f){return f;};
var locateQuote=${LOCATE};
var formatCommentsForCopy=${FORMAT};
var W=344,me="",comments=[],expanded=false,activeCid=null,doneOpen=false,firstLoad=true;
var model=null,ranges={},pendingAnchor=null,hlAll=null,hlActive=null,hoverCid=null;
var supportsHL=!!(window.CSS&&window.CSS.highlights&&window.Highlight);

var IC_COMMENT='<svg viewBox="0 0 24 24"><path d="M7 11a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z"/><path d="M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-3.812a.5.5 0 0 0-.33.124l-2.541 2.224a2 2 0 0 1-2.634 0l-2.542-2.224a.5.5 0 0 0-.329-.124H4a2 2 0 0 1-2-2V5Zm2 0v11.5h3.812a2.5 2.5 0 0 1 1.646.619L12 19.343l2.542-2.224a2.5 2.5 0 0 1 1.646-.619H20V5H4Z"/></svg>';
var IC_COLLAPSE='<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l10 10M14 4L4 14"/></svg>';
var IC_UP='<svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>';
var IC_DOWN='<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
var IC_LINK='<svg viewBox="0 0 24 24"><path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.3M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.3"/></svg>';
var IC_CHECK='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.3 2.3 4.7-5"/></svg>';
var IC_REOPEN='<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.7-6M4 4v4h4"/></svg>';
var IC_CARET='<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
var IC_EDIT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
var IC_COPY='<svg viewBox="0 0 12 12"><path fill-rule="evenodd" d="M4 6.375c0-.345.28-.625.625-.625h2.75a.625.625 0 1 1 0 1.25h-2.75A.625.625 0 0 1 4 6.375Z"/><path fill-rule="evenodd" d="M8.437 1.5A2 2 0 0 0 6.5 0h-1a2 2 0 0 0-1.937 1.5H3a2 2 0 0 0-2 2V10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-.563ZM4.9 3.1h2.2V2a.6.6 0 0 0-.6-.6h-1a.6.6 0 0 0-.6.6v1.1ZM8 4.5H4a.5.5 0 0 1-.5-.5V2.9H3a.6.6 0 0 0-.6.6V10a.6.6 0 0 0 .6.6h6a.6.6 0 0 0 .6-.6V3.5a.6.6 0 0 0-.6-.6h-.5V4a.5.5 0 0 1-.5.5Z"/></svg>';
var IC_SPIN='<svg viewBox="0 0 16 16" stroke-width="2"><circle cx="8" cy="8" r="6" opacity=".25"/><path d="M14 8a6 6 0 0 0-6-6" stroke-linecap="round"/></svg>';
var IC_DONE='<svg viewBox="0 0 16 16" stroke-width="1.8"><circle cx="8" cy="8" r="6.5"/><path d="M5.3 8.2l1.9 1.9 3.5-4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

var CSS='.dock{position:fixed;top:50%;right:0;transform:translateY(-50%);display:flex;flex-direction:column;background:rgba(255,255,255,.95);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);border:1px solid #e3e8ee;border-right:0;border-radius:10px 0 0 10px;box-shadow:-2px 3px 14px rgba(31,35,41,.1);overflow:hidden;z-index:2147483600}.dock[hidden]{display:none}.dock .dcell{position:relative;border:0;background:transparent;width:44px;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;color:#646a73;padding:8px 0}.dock .dcell[hidden]{display:none}.dock .dcell+.dcell{border-top:1px solid #e9eaec}.dock .dcell:hover{background:#f2f3f5;color:#3370ff}.dock .dcell svg{width:18px;height:18px;fill:currentColor}.dock .cnt{font:500 12px/1 system-ui;color:#a8abb2}.dock .cnt[hidden]{display:none}'
+'.rail{position:fixed;top:0;right:0;bottom:0;width:344px;max-width:86vw;background:#fff;border-left:1px solid #e9eaec;box-shadow:-4px 0 24px rgba(31,35,41,.06);display:flex;flex-direction:column;z-index:2147483646;font:400 14px/1.6 -apple-system,"PingFang SC",system-ui,sans-serif;color:#1f2329}.rail[hidden]{display:none}.rh{display:flex;align-items:center;padding:13px 8px 13px 16px;border-bottom:1px solid #e9eaec;flex:0 0 auto}.nav{display:inline-flex;border:1px solid rgba(31,35,41,.12);border-radius:7px;overflow:hidden}.nav .navb{border:0;background:#fff;width:26px;height:26px;display:grid;place-items:center;color:#646a73;cursor:pointer;padding:0}.nav .navb+.navb{border-left:1px solid rgba(31,35,41,.12)}.nav .navb:hover:not(:disabled){background:#f2f3f5;color:#1f2329}.nav .navb:disabled{color:#c9cdd4;cursor:default}.nav .navb svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.rh .grow{flex:1}.copybtn{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(31,35,41,.12);background:#fff;border-radius:8px;box-sizing:border-box;height:28px;padding:0 9px;font:600 12px/1 -apple-system,system-ui,sans-serif;color:#3c4257;cursor:pointer;white-space:nowrap;margin-right:4px}.copybtn[hidden]{display:none}.copybtn:hover{background:#f7f8fa}.copybtn svg{width:13px;height:13px;fill:currentColor}.ib{border:1px solid rgba(31,35,41,.12);background:#fff;box-sizing:border-box;cursor:pointer;color:#646a73;width:28px;height:28px;border-radius:7px;display:grid;place-items:center;padding:0}.ib:hover{background:#f2f3f5;color:#1f2329}.ib svg{width:18px;height:18px;display:block}'
+'.ident{padding:8px 12px;border-bottom:1px solid #e9eaec;flex:0 0 auto}.identrow{display:flex;align-items:center;gap:8px}.identrow[hidden]{display:none}.identav{flex:0 0 auto;width:26px;height:26px;border-radius:50%;overflow:hidden}.identav svg{width:100%;height:100%;display:block}.name{flex:1;min-width:0;box-sizing:border-box;border:1px solid rgba(31,35,41,.12);border-radius:7px;padding:6px 9px;font:inherit;font-size:13px;background:#fafbfc}.name:focus{outline:0;border-color:#8f959e;background:#fff;box-shadow:0 0 0 3px rgba(31,35,41,.06)}.namedone{flex:0 0 auto;border:0;background:#eaf1ff;color:#3370ff;border-radius:7px;padding:7px 13px;font:600 12.5px/1;cursor:pointer}.namedone:hover{background:#dde9ff}.name.req{border-color:#f5a623;background:#fff8ec}.name.req::placeholder{color:#d98c00}.identset{display:flex;align-items:center;gap:8px;font-size:13px;color:#646a73}.identset[hidden]{display:none}.identset .who{font-weight:600;color:#1f2329;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identset .editbtn{border:0;background:transparent;cursor:pointer;color:#a8abb2;display:grid;place-items:center;width:22px;height:22px;border-radius:5px;padding:0;opacity:0;transition:opacity .12s}.identset:hover .editbtn{opacity:1}.identset .editbtn:hover{background:#f2f3f5;color:#3370ff}.identset .editbtn svg{width:14px;height:14px}.list{flex:1 1 auto;overflow-y:auto;padding:12px}'
+'.cc{position:relative;border:1px solid #ececf0;border-radius:10px;background:#fff;margin-bottom:10px;transition:background .12s,border-color .12s,box-shadow .12s}.cc:hover{background:#fafbfc;border-color:rgba(31,35,41,.16);box-shadow:0 4px 14px rgba(31,35,41,.06)}.cc.active{background:#fff;border-color:rgba(31,35,41,.16);box-shadow:0 4px 14px rgba(31,35,41,.06)}.cc .accent{display:none}.cc.active .accent{display:block;position:absolute;left:0;right:0;top:0;height:3px;background:#ffc60a;border-radius:10px 10px 0 0}.cc .pad{padding:11px 13px}.quote{display:flex;gap:7px;font-size:12px;color:#8f959e;margin-bottom:9px;line-height:1.5;padding-right:60px}.quote .vb{flex:0 0 auto;width:3px;background:#ffd24b;border-radius:2px}.quote .qt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quote.orphan .vb{background:#f7ba1e}.quote.orphan .qt{color:#a86b00}'
+'.acts{position:absolute;top:9px;right:10px;display:flex;align-items:center;gap:1px;background:#fff;border:1px solid rgba(31,35,41,.12);border-radius:7px;padding:2px;box-shadow:0 3px 12px rgba(31,35,41,.12);opacity:0;transition:.12s;pointer-events:none}.cc:hover .acts,.cc.active .acts{opacity:1;pointer-events:auto}.acts button{width:25px;height:25px;border:0;background:transparent;cursor:pointer;color:#646a73;border-radius:5px;display:grid;place-items:center;padding:0}.acts button:hover{background:#f2f3f5;color:#1f2329}.acts button:disabled{color:#c9cdd4;cursor:default}.acts button:disabled:hover{background:transparent;color:#c9cdd4}.acts .res:hover{color:#3370ff}.acts .lnk:hover{color:#3370ff}.acts .copy:hover{color:#3370ff}.acts button svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.acts .copy svg{stroke:none;fill:currentColor;width:14px;height:14px}.acts .del:hover{color:#e5484d}.acts .del.armed{background:#e5484d;color:#fff}.acts .del.armed:hover{background:#d13b40;color:#fff}.cc.confirming .acts{opacity:1;pointer-events:auto}'
+'.msg{display:flex;gap:8px;margin-bottom:9px}.msg:last-child{margin-bottom:0}.av{flex:0 0 auto;width:26px;height:26px;border-radius:50%;overflow:hidden}.av svg{width:100%;height:100%;display:block}.b{min-width:0;flex:1}.nm{display:flex;align-items:baseline;gap:6px}.nm .who{font:600 12.5px/1.3 system-ui}.nm .tm{color:#a8abb2;font-size:11px;margin-left:auto}.tx{font-size:13.5px;margin-top:2px;white-space:pre-wrap;word-break:break-word}'
+'.reply{margin-top:11px}.reply .rfaint{display:none;font-size:13px;color:#a8abb2;cursor:text;padding:3px 1px}.reply.collapsed .rfaint{display:block}.reply .rbox{display:flex;gap:6px;align-items:center}.reply.collapsed .rbox{display:none}.reply .rin{flex:1;min-width:0;box-sizing:border-box;border:1px solid rgba(31,35,41,.12);border-radius:8px;padding:7px 9px;font:inherit;font-size:13px;background:#fafbfc}.reply .rin:focus{outline:0;border-color:#8f959e;background:#fff}.reply .send{flex:0 0 auto;border:0;background:#eaf1ff;color:#3370ff;border-radius:7px;padding:7px 13px;font:600 12.5px/1;cursor:pointer}.reply .send:hover{background:#dde9ff}'
+'.composer{border-color:#ffc60a}.composer .cin{width:100%;box-sizing:border-box;min-height:62px;border:1px solid rgba(31,35,41,.12);border-radius:7px;padding:7px 9px;font:inherit;font-size:13.5px;resize:vertical}.composer .cin:focus{outline:0;border-color:#3370ff}.crow{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}.crow button{border:0;border-radius:7px;padding:6px 14px;font:500 13px/1;cursor:pointer}.crow .cancel{background:#f2f3f5;color:#1f2329}.crow .csend{background:#3370ff;color:#fff}'
+'.rfoot{flex:0 0 auto;display:flex;flex-direction:column;min-height:0;border-top:1px solid #e9eaec;background:#fff}.rfoot[hidden]{display:none}.rfoot .rbody{overflow-y:auto;max-height:55vh;padding:10px 12px 0}.rhd{display:flex;align-items:center;gap:6px;padding:10px 14px;font-size:12.5px;color:#646a73;cursor:pointer}.rhd:hover{background:#f7f8fa;color:#1f2329}.rhd svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.4;transform:rotate(-90deg);transition:transform .15s}.rhd.open svg{transform:rotate(90deg)}.cc.resolved{opacity:.6}.cc.resolved:hover{opacity:1}'
+'.sel{position:fixed;display:flex;align-items:center;gap:6px;background:#fff;color:#1f2329;border:1px solid rgba(31,35,41,.12);border-radius:8px;padding:7px 11px;font:500 13px/1 system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(31,35,41,.18);z-index:2147483647}.sel[hidden]{display:none}.sel svg{width:16px;height:16px;color:#3370ff;fill:currentColor}'
+'.ico{display:inline-flex;align-items:center}@keyframes hd-spin{to{transform:rotate(360deg)}}.ico.busy svg{animation:hd-spin .6s linear infinite}.ico.busy svg,.ico.done svg{fill:none;stroke:currentColor}';

var host=document.createElement("div");
host.setAttribute("data-htmldrop-comments","");
var root=host.attachShadow({mode:"closed"});
root.innerHTML='<style>'+CSS+'</style>'
+'<div id="hd-dock" class="dock"><button id="hd-dock-comment" class="dcell" title="展开评论" aria-label="展开评论">'+IC_COMMENT+'<span id="hd-count" class="cnt" hidden>0</span></button><button id="hd-dock-copy" class="dcell" title="复制全文和评论 · Copy for LLM" aria-label="Copy for LLM" hidden><span class="ico">'+IC_COPY+'</span></button></div>'
+'<aside id="hd-rail" class="rail" hidden><div class="rh"><button id="hd-collapse" class="ib" title="收起" aria-label="收起">'+IC_COLLAPSE+'</button><span class="grow"></span><button id="hd-copy" class="copybtn" title="复制全文 + 全部评论，给 LLM" hidden><span class="ico">'+IC_COPY+'</span><span class="lbl">Copy for LLM</span></button><span class="nav"><button id="hd-prev" class="navb" title="上一条评论" aria-label="上一条评论">'+IC_UP+'</button><button id="hd-next" class="navb" title="下一条评论" aria-label="下一条评论">'+IC_DOWN+'</button></span></div>'
+'<div class="ident"><div id="hd-identrow" class="identrow"><span id="hd-identav" class="identav"></span><input id="hd-name" class="name" placeholder="你的名字（必填，评论时显示）" maxlength="80"><button id="hd-namedone" class="namedone">确认</button></div><div id="hd-identset" class="identset" hidden><span id="hd-identav2" class="identav"></span>以 <span id="hd-identname" class="who"></span> 评论<button id="hd-identedit" class="editbtn" title="改名" aria-label="改名">'+IC_EDIT+'</button></div></div>'
+'<div id="hd-list" class="list"></div><div id="hd-rfoot" class="rfoot" hidden></div></aside>'
+'<button id="hd-sel" class="sel" hidden>'+IC_COMMENT+'评论</button>';
(document.body||document.documentElement).appendChild(host);
var dockRef=root.querySelector("#hd-dock"),dockCommentRef=root.querySelector("#hd-dock-comment"),dockCopyRef=root.querySelector("#hd-dock-copy"),dockCopyIcoRef=root.querySelector("#hd-dock-copy .ico"),countRef=root.querySelector("#hd-count"),railRef=root.querySelector("#hd-rail"),prevRef=root.querySelector("#hd-prev"),nextRef=root.querySelector("#hd-next"),copyRef=root.querySelector("#hd-copy"),copyIcoRef=root.querySelector("#hd-copy .ico"),copyLblRef=root.querySelector("#hd-copy .lbl"),collapseRef=root.querySelector("#hd-collapse"),nameRef=root.querySelector("#hd-name"),identRowRef=root.querySelector("#hd-identrow"),identAvRef=root.querySelector("#hd-identav"),identAv2Ref=root.querySelector("#hd-identav2"),namedoneRef=root.querySelector("#hd-namedone"),identSetRef=root.querySelector("#hd-identset"),identNameRef=root.querySelector("#hd-identname"),identEditRef=root.querySelector("#hd-identedit"),listRef=root.querySelector("#hd-list"),footRef=root.querySelector("#hd-rfoot"),selRef=root.querySelector("#hd-sel");

function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
function roots(){return comments.filter(function(c){return !c.parentId;});}
function repliesOf(cid){return comments.filter(function(c){return c.parentId===cid;});}
function notResolved(c){return !c.resolved;}
function isOrphan(c){return !c.anchor||!ranges[c.cid];}
// V2EX-style retro pixel avatar (two-tone minidenticons fork, MIT). Only
// hash-derived numbers reach the SVG string — the name itself is never
// interpolated — so innerHTML stays injection-safe.
function pixelAvatar(seed){seed=seed||"?";var hash=seed.split("").reduce(function(h,c){return (h ^ c.charCodeAt(0)) * -5;},5)>>>2;var hue=(hash%9)*40;var bg="hsl("+hue+" 52% 30%)",fg="hsl("+hue+" 78% 72%)",cells="",i;for(i=0;i<25;i++){if(hash&(1<<(i%15))){var x=i>14?7-((i/5)|0):((i/5)|0);cells+='<rect x="'+x+'" y="'+(i%5)+'" width="1" height="1"/>';}}return '<svg viewBox="-1.5 -1.5 8 8" xmlns="http://www.w3.org/2000/svg"><rect x="-1.5" y="-1.5" width="8" height="8" fill="'+bg+'"/><g fill="'+fg+'">'+cells+'</g></svg>';}
function refreshIdent(){identAvRef.innerHTML=pixelAvatar(me||"?");if(me){identNameRef.textContent=me;identAv2Ref.innerHTML=pixelAvatar(me);identRowRef.hidden=true;identSetRef.hidden=false;}else{identRowRef.hidden=false;identSetRef.hidden=true;}}
// localStorage/cookie throw SecurityError under sandbox allow-scripts (opaque
// origin), but the URL fragment is writable and survives a refresh — so persist
// the chosen name there. replaceState avoids back-button history entries.
function persistName(){if(!me)return;var frag="hdname="+encodeURIComponent(me);try{history.replaceState(null,"","#"+frag);}catch(e){try{location.hash=frag;}catch(e2){}}}
function restoreName(){try{var mm=/[#&]hdname=([^&]*)/.exec(location.hash||"");if(mm&&mm[1])me=decodeURIComponent(mm[1]);}catch(e){}}
function fmtTime(iso){try{var d=new Date(iso);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);}catch(e){return "";}}
// Name is required: returns true (committing me) only when a name exists,
// otherwise reveals + flags the name input and blocks the post.
function ensureName(){var v=(nameRef.value||"").trim();if(v){me=v;persistName();refreshIdent();return true;}identRowRef.hidden=false;identSetRef.hidden=true;nameRef.classList.add("req");nameRef.focus();return false;}

function setupHL(){if(!supportsHL)return;hlAll=new Highlight();hlActive=new Highlight();window.CSS.highlights.set("hd-c",hlAll);window.CSS.highlights.set("hd-ca",hlActive);var st=document.createElement("style");st.textContent="::highlight(hd-c){text-decoration:underline;text-decoration-color:#ffd24b;text-decoration-thickness:2px;text-underline-offset:2px}::highlight(hd-ca){background:#ffe9a6;text-decoration:none}";(document.head||document.documentElement).appendChild(st);}

function buildModel(){var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);var nodes=[],full="",n;while(n=walker.nextNode()){var p=n.parentNode;if(p){var tag=p.nodeName;if(tag==="SCRIPT"||tag==="STYLE"||tag==="NOSCRIPT")continue;if(p.closest&&p.closest(".hdmd-bar"))continue;}nodes.push({node:n,start:full.length});full+=n.nodeValue;}return {full:full,nodes:nodes};}
function nodeAt(m,pos){for(var i=0;i<m.nodes.length;i++){var nd=m.nodes[i],len=nd.node.nodeValue.length;if(pos<=nd.start+len)return {node:nd.node,offset:pos-nd.start};}var last=m.nodes[m.nodes.length-1];return last?{node:last.node,offset:last.node.nodeValue.length}:null;}
function rangeFor(m,start,end){var s=nodeAt(m,start),e=nodeAt(m,end);if(!s||!e)return null;try{var r=document.createRange();r.setStart(s.node,s.offset);r.setEnd(e.node,e.offset);return r;}catch(x){return null;}}
function offsetOf(m,container,off){if(container.nodeType===3){for(var i=0;i<m.nodes.length;i++)if(m.nodes[i].node===container)return m.nodes[i].start+off;return null;}var child=container.childNodes[off];if(child){for(var j=0;j<m.nodes.length;j++){var nn=m.nodes[j].node;if(nn===child||(child.contains&&child.contains(nn)))return m.nodes[j].start;}}var last=null;for(var k=0;k<m.nodes.length;k++){if(container.contains(m.nodes[k].node))last=m.nodes[k].start+m.nodes[k].node.nodeValue.length;}return last;}
function anchorFromSelection(m,range){var s=offsetOf(m,range.startContainer,range.startOffset),e=offsetOf(m,range.endContainer,range.endOffset);if(s==null||e==null||e<=s)return null;return {exact:m.full.substring(s,e),prefix:m.full.substring(Math.max(0,s-32),s),suffix:m.full.substring(e,e+32)};}

function relocate(){ranges={};if(hlAll)hlAll.clear();if(hlActive)hlActive.clear();model=buildModel();roots().forEach(function(c){if(!c.anchor)return;var loc=locateQuote(model.full,c.anchor);if(!loc)return;var r=rangeFor(model,loc.start,loc.end);if(r){ranges[c.cid]=r;if(hlAll&&!c.resolved)hlAll.add(r);}});applyHL();}
function applyHL(){if(!hlActive)return;hlActive.clear();if(activeCid&&ranges[activeCid])hlActive.add(ranges[activeCid]);if(hoverCid&&ranges[hoverCid]&&hoverCid!==activeCid)hlActive.add(ranges[hoverCid]);}
// Only non-resolved root comments are hit-testable in the body: resolved ones
// are hidden from the list, so they must not react to hover (no yellow) or
// click. Their ranges stay in the ranges map for the explicit 已解决-card jump.
function rangeAtPoint(x,y){for(var i=0;i<comments.length;i++){var c=comments[i];if(c.parentId||c.resolved)continue;var r=ranges[c.cid];if(!r)continue;var rects=r.getClientRects();for(var k=0;k<rects.length;k++){var rc=rects[k];if(x>=rc.left&&x<=rc.right&&y>=rc.top&&y<=rc.bottom)return c.cid;}}return null;}

function api(path){return "/"+ID+path+"?t="+encodeURIComponent(T);}
function load(){fetch(api("/comments"),{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(!d||!d.comments)return;comments=d.comments;relocate();var n=roots().filter(notResolved).length;if(firstLoad){firstLoad=false;if(n>0)setExpanded(true);}else if(expanded){render();}updateBadge();}).catch(function(){});}
function postComment(payload){return fetch(api("/comments"),{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(payload),cache:"no-store"}).then(function(r){return r.json();});}
function mutate(cid,action){return fetch("/"+ID+"/comments/"+cid+"?t="+encodeURIComponent(T),{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:action}),cache:"no-store"}).then(function(r){return r.json();});}

function updateBadge(){var n=roots().filter(notResolved).length;countRef.textContent=n;countRef.hidden=n<=0;updateNav();}
function updateNav(){var dis=roots().filter(notResolved).length<=1;prevRef.disabled=dis;nextRef.disabled=dis;}
function applyPad(){var narrow=window.innerWidth<640;document.documentElement.style.paddingRight=(expanded&&!narrow)?(W+"px"):"";}
function setExpanded(v){expanded=v;railRef.hidden=!v;dockRef.hidden=v;applyPad();if(v){render();}else{activeCid=null;hoverCid=null;applyHL();document.body.style.cursor="";}}
function setActive(cid){activeCid=cid;render();applyHL();var r=ranges[cid];if(r){var rect=r.getBoundingClientRect();window.scrollTo({top:window.scrollY+rect.top-160,behavior:"smooth"});}}

function msgEl(m){var d=el("div","msg");var av=el("span","av");av.innerHTML=pixelAvatar(m.author);var b=el("div","b");var nm=el("div","nm");nm.appendChild(el("span","who",m.author||"匿名"));nm.appendChild(el("span","tm",fmtTime(m.createdAt)));b.appendChild(nm);b.appendChild(el("div","tx",m.text));d.appendChild(av);d.appendChild(b);return d;}
function actsEl(c){var a=el("div","acts");var delBtn=c.resolved?'<button class="del" title="删除评论" aria-label="删除评论"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>':'';a.innerHTML='<button class="res" title="'+(c.resolved?"重新打开":"解决并隐藏")+'" aria-label="解决">'+(c.resolved?IC_REOPEN:IC_CHECK)+'</button>'+delBtn+'<button class="lnk" title="复制链接" aria-label="复制链接">'+IC_LINK+'</button><button class="copy" title="复制本条评论" aria-label="复制本条"><span class="ico">'+IC_COPY+'</span></button>';a.querySelector(".res").addEventListener("click",function(e){e.stopPropagation();toggleResolve(c);});a.querySelector(".lnk").addEventListener("click",function(e){e.stopPropagation();copyLink(c,e.currentTarget);});a.querySelector(".copy").addEventListener("click",function(e){e.stopPropagation();animateCopy(e.currentTarget.querySelector(".ico"),null,"",function(){return oneCommentText(c);});});if(c.resolved)a.querySelector(".del").addEventListener("click",function(e){e.stopPropagation();armDelete(c,e.currentTarget);});return a;}
function card(c){var x=el("div","cc"+(c.resolved?" resolved":"")+(c.cid===activeCid?" active":""));x.appendChild(el("div","accent"));x.appendChild(actsEl(c));var pad=el("div","pad");var q=el("div","quote"+(isOrphan(c)?" orphan":""));q.appendChild(el("span","vb"));q.appendChild(el("span","qt",isOrphan(c)?"锚点已失效（孤儿评论）":(c.anchor?c.anchor.exact:"")));pad.appendChild(q);pad.appendChild(msgEl(c));repliesOf(c.cid).forEach(function(r){pad.appendChild(msgEl(r));});var rep=el("div","reply collapsed");var faint=el("div","rfaint","回复…");var box=el("div","rbox");var rin=el("input","rin");rin.placeholder="回复";rin.maxLength=4000;var send=el("button","send","发送");box.appendChild(rin);box.appendChild(send);rep.appendChild(faint);rep.appendChild(box);faint.addEventListener("click",function(e){e.stopPropagation();rep.classList.remove("collapsed");rin.focus();});rin.addEventListener("blur",function(){if(!rin.value.trim())rep.classList.add("collapsed");});send.addEventListener("click",function(e){e.stopPropagation();var v=rin.value.trim();if(!v)return;if(!ensureName())return;send.disabled=true;postComment({text:v,author:me,parentId:c.cid}).then(function(){rin.value="";load();}).catch(function(){send.disabled=false;});});pad.appendChild(rep);x.appendChild(pad);x.addEventListener("click",function(e){if(e.target.closest("button")||e.target.closest("input")||e.target.closest("textarea"))return;setActive(c.cid);});return x;}
function composerEl(){var c=el("div","cc composer");var pad=el("div","pad");var q=el("div","quote");q.appendChild(el("span","vb"));q.appendChild(el("span","qt",pendingAnchor.exact));pad.appendChild(q);var ta=el("textarea","cin");ta.placeholder="写下评论…";ta.maxLength=4000;pad.appendChild(ta);var row=el("div","crow");var cancel=el("button","cancel","取消");var csend=el("button","csend","发送");cancel.addEventListener("click",function(){pendingAnchor=null;render();});csend.addEventListener("click",function(){var v=ta.value.trim();if(!v)return;if(!ensureName())return;csend.disabled=true;postComment({text:v,author:me,anchor:pendingAnchor}).then(function(){pendingAnchor=null;load();}).catch(function(){csend.disabled=false;});});row.appendChild(cancel);row.appendChild(csend);pad.appendChild(row);c.appendChild(pad);return c;}

function render(){while(listRef.firstChild)listRef.removeChild(listRef.firstChild);if(pendingAnchor)listRef.appendChild(composerEl());var rs=roots(),active=rs.filter(notResolved),done=rs.filter(function(c){return c.resolved;});active.forEach(function(c){listRef.appendChild(card(c));});while(footRef.firstChild)footRef.removeChild(footRef.firstChild);if(done.length){footRef.hidden=false;if(doneOpen){var body=el("div","rbody");done.forEach(function(c){body.appendChild(card(c));});footRef.appendChild(body);}var hd=el("div","rhd"+(doneOpen?" open":""));hd.innerHTML=IC_CARET+" 已解决 "+done.length;hd.addEventListener("click",function(){doneOpen=!doneOpen;render();});footRef.appendChild(hd);}else{footRef.hidden=true;}updateBadge();}

function navStep(dir){var a=roots().filter(notResolved);if(!a.length)return;var idx=-1,i;for(i=0;i<a.length;i++)if(a[i].cid===activeCid)idx=i;if(idx<0)idx=dir>0?-1:0;idx=(idx+dir+a.length)%a.length;setActive(a[idx].cid);}
function flash(btn){var o=btn.style.color;btn.style.color="#0fa968";setTimeout(function(){btn.style.color=o;},900);}
function copyLink(c,btn){try{navigator.clipboard.writeText(location.href.split("#")[0]+"#c="+c.cid);}catch(e){}flash(btn);}
function oneCommentText(c){var q=isOrphan(c)?"（已删除内容）":(c.anchor?c.anchor.exact:"");var lines=['"'+q+'"',(c.author||"匿名")+": "+c.text];repliesOf(c.cid).forEach(function(r){lines.push("- "+(r.author||"匿名")+": "+r.text);});return lines.join("\\n");}
// Decodes the CLI markdown island (#hdmd-src, UTF-8 base64) and appends the
// comment threads — the relocated "Copy for LLM" (full doc + all comments).
function buildCopyText(){var src=document.getElementById("hdmd-src");if(!src)return null;var md;try{md=new TextDecoder().decode(Uint8Array.from(atob(src.textContent),function(c){return c.charCodeAt(0);}));}catch(e){return null;}try{return formatCommentsForCopy(md,comments,locateQuote);}catch(e){return md;}}
// Copy-for-LLM with the CLI's 3-state feedback: clipboard -> spinner "Copying..."
// -> check "Copied!". labelEl is null for the icon-only dock cell.
function animateCopy(icoEl,labelEl,idleLabel,getText){if(icoEl.classList.contains("busy"))return;function reset(){icoEl.className="ico";icoEl.innerHTML=IC_COPY;if(labelEl)labelEl.textContent=idleLabel;}var t=getText();if(t==null)return;icoEl.className="ico busy";icoEl.innerHTML=IC_SPIN;if(labelEl)labelEl.textContent="Copying...";function finish(ok){setTimeout(function(){icoEl.className="ico"+(ok?" done":"");icoEl.innerHTML=ok?IC_DONE:IC_COPY;if(labelEl)labelEl.textContent=ok?"Copied!":"Copy failed";setTimeout(reset,1400);},350);}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){finish(true);},function(){finish(false);});}else{finish(false);}}
function toggleResolve(c){mutate(c.cid,c.resolved?"reopen":"resolve").then(function(){if(c.cid===activeCid&&!c.resolved)activeCid=null;load();}).catch(function(){});}
// Delete is irreversible and the sandbox blocks confirm() modals, so guard with
// a 2-click arm: first click turns the trash red, second (within 3s) deletes.
function armDelete(c,btn){var card=btn.closest(".cc");if(btn.getAttribute("data-armed")){deleteComment(c);return;}btn.setAttribute("data-armed","1");btn.classList.add("armed");btn.title="再点一次确认删除";if(card)card.classList.add("confirming");setTimeout(function(){if(!btn.isConnected)return;btn.removeAttribute("data-armed");btn.classList.remove("armed");btn.title="删除评论";if(card)card.classList.remove("confirming");},3000);}
function deleteComment(c){mutate(c.cid,"delete").then(function(){if(c.cid===activeCid)activeCid=null;load();}).catch(function(){});}

function onMouseUp(){setTimeout(function(){var s=window.getSelection();if(s&&!s.isCollapsed&&s.rangeCount){var r=s.getRangeAt(0);if(document.body.contains(r.commonAncestorContainer)){var rect=r.getBoundingClientRect();if(rect.width||rect.height){selRef.style.top=(rect.top-44)+"px";selRef.style.left=(rect.left+rect.width/2-34)+"px";selRef._range=r.cloneRange();selRef.hidden=false;return;}}}selRef.hidden=true;},0);}
function onSelClick(){var r=selRef._range;selRef.hidden=true;if(!r)return;var m=buildModel();var a=anchorFromSelection(m,r);if(!a||!a.exact)return;pendingAnchor=a;setExpanded(true);render();var ta=listRef.querySelector(".composer .cin");if(ta)ta.focus();}

setupHL();
// §2: take over Copy-for-LLM when the CLI markdown island is present — hide the
// CLI float button and surface our own copy controls (dock cell + header btn).
var hasCopy=!!document.getElementById("hdmd-src");
if(hasCopy){var bar=document.querySelector(".hdmd-bar");if(bar)bar.style.display="none";copyRef.hidden=false;dockCopyRef.hidden=false;}
nameRef.addEventListener("input",function(){me=(nameRef.value||"").trim();identAvRef.innerHTML=pixelAvatar(me||"?");nameRef.classList.remove("req");});
nameRef.addEventListener("blur",function(){me=(nameRef.value||"").trim();persistName();refreshIdent();});
identEditRef.addEventListener("click",function(){identRowRef.hidden=false;identSetRef.hidden=true;nameRef.value=me;identAvRef.innerHTML=pixelAvatar(me||"?");nameRef.focus();});
namedoneRef.addEventListener("mousedown",function(e){e.preventDefault();});
namedoneRef.addEventListener("click",function(){ensureName();});
dockCommentRef.addEventListener("click",function(){setExpanded(true);});
dockCopyRef.addEventListener("click",function(){animateCopy(dockCopyIcoRef,null,"",buildCopyText);});
copyRef.addEventListener("click",function(){animateCopy(copyIcoRef,copyLblRef,"Copy for LLM",buildCopyText);});
prevRef.addEventListener("click",function(){navStep(-1);});
nextRef.addEventListener("click",function(){navStep(1);});
collapseRef.addEventListener("click",function(){setExpanded(false);});
selRef.addEventListener("mousedown",function(e){e.preventDefault();});
selRef.addEventListener("click",onSelClick);
document.addEventListener("mouseup",onMouseUp);
document.addEventListener("mousemove",function(e){if(host.contains(e.target))return;var cid=rangeAtPoint(e.clientX,e.clientY);if(cid!==hoverCid){hoverCid=cid;applyHL();document.body.style.cursor=cid?"pointer":"";}});
document.addEventListener("click",function(e){if(host.contains(e.target))return;var cid=rangeAtPoint(e.clientX,e.clientY);if(!cid)return;if(expanded&&activeCid===cid){setExpanded(false);}else{if(!expanded)setExpanded(true);setActive(cid);}});
document.addEventListener("visibilitychange",function(){if(!document.hidden)load();});
window.addEventListener("resize",function(){if(expanded)applyPad();});
window.htmldropCopyComments=function(text){try{return formatCommentsForCopy(text,comments,locateQuote);}catch(e){return text;}};
restoreName();refreshIdent();
setInterval(load,30000);
load();
})();
</script>`;
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
