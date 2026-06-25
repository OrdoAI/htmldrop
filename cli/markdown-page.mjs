// Self-contained "Copy for LLM" toolbar, injectable into either our markdown
// render page (buildMarkdownPage) or an arbitrary uploaded HTML page
// (injectToolbarIntoHtml).
//
// Everything is namespaced with a `hdmd-` prefix so it can be dropped into a
// user's HTML without clashing with their CSS/ids.
//
// The raw markdown is embedded as a base64 data island so the button reaches the
// *source*. base64 has no `<`, `>`, or `src=`, so it can't break out of the
// <script> tag, needs no HTML escaping, and is invisible to the CLI's
// inlineAssets regexes (which only match `<img src=` / `<link href=` /
// `<script src=`).
//
// The preview is served under CSP `sandbox allow-scripts`. Verified in a real
// Chrome: that top-level sandboxed document keeps a real origin (not opaque),
// and navigator.clipboard.writeText() reaches the system clipboard, so
// one-click copy works (execCommand kept only as a fallback). Button states:
// idle (clipboard) -> busy (spinner "Copying...") -> done (check "Copied!").

export const MD_CSS = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:48rem;margin:0 auto;padding:2rem;line-height:1.6;color:#24292e}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em;font-weight:600}h1{font-size:2em;border-bottom:1px solid #eee;padding-bottom:.3em}h2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.3em}code{background:#f6f8fa;padding:.2em .4em;border-radius:3px;font-size:85%}pre{background:#f6f8fa;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #dfe2e5;padding:0 1em;color:#6a737d;margin:1em 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dfe2e5;padding:.5em .75em}th{background:#f6f8fa}img{max-width:100%}a{color:#0366d6}ul,ol{padding-left:2em}hr{border:none;border-top:1px solid #eee;margin:1.5em 0}`;

// idle: Stripe's clipboard glyph (12x12, filled). busy/done: slate line icons
// matching the look the user picked (spinner + check-in-circle).
const ICON_COPY = `<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 6.375c0-.345.28-.625.625-.625h2.75a.625.625 0 1 1 0 1.25h-2.75A.625.625 0 0 1 4 6.375Zm0 2.25C4 8.28 4.28 8 4.625 8h2.75a.625.625 0 1 1 0 1.25h-2.75A.625.625 0 0 1 4 8.625Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M8.437 1.5A2 2 0 0 0 6.5 0h-1a2 2 0 0 0-1.937 1.5H3a2 2 0 0 0-2 2V10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-.563ZM4.9 3.1h2.2V2a.6.6 0 0 0-.6-.6h-1a.6.6 0 0 0-.6.6v1.1ZM8 4.5H4a.5.5 0 0 1-.5-.5V2.9H3a.6.6 0 0 0-.6.6V10a.6.6 0 0 0 .6.6h6a.6.6 0 0 0 .6-.6V3.5a.6.6 0 0 0-.6-.6h-.5V4a.5.5 0 0 1-.5.5Z"></path></svg>`;
const ICON_SPIN = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8" cy="8" r="6" opacity=".25"></circle><path d="M14 8a6 6 0 0 0-6-6" stroke-linecap="round"></path></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="8" r="6.5"></circle><path d="M5.3 8.2l1.9 1.9 3.5-4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

// Scoped toolbar styles. No blue: idle/hover/busy/done all stay slate.
// `hdmd-float` pins the bar to the top-right for HTML uploads (so it never
// disrupts the user's own layout); without it the bar flows inline at the top
// of our markdown page and scrolls away.
const TOOLBAR_CSS = `.hdmd-bar{display:flex;justify-content:flex-end;align-items:center;margin-bottom:1.5rem;color:#3c4257}.hdmd-bar.hdmd-float{position:fixed;top:12px;right:16px;margin:0;z-index:2147483600;background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);padding:.4rem .6rem;border:1px solid #e3e8ee;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08)}.hdmd-btn{display:inline-flex;align-items:center;gap:.375rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:.875rem;font-weight:600;color:#3c4257;background:none;border:none;padding:.25rem;cursor:pointer;transition:color .15s}.hdmd-btn:hover{color:#1a1f36}.hdmd-btn.hdmd-busy,.hdmd-btn.hdmd-done{color:#5b6573;cursor:default}.hdmd-ico{display:none;align-items:center}.hdmd-ico svg{width:15px;height:15px;display:block}.hdmd-btn .hdmd-ico-copy{display:inline-flex}.hdmd-btn.hdmd-busy .hdmd-ico-copy,.hdmd-btn.hdmd-done .hdmd-ico-copy{display:none}.hdmd-btn.hdmd-busy .hdmd-ico-spin{display:inline-flex}.hdmd-btn.hdmd-done .hdmd-ico-check{display:inline-flex}.hdmd-btn.hdmd-busy .hdmd-ico-spin svg{animation:hdmd-spin .6s linear infinite}@keyframes hdmd-spin{to{transform:rotate(360deg)}}`;

function toolbarBlock(b64, float) {
  return `<div class="hdmd-bar${float ? " hdmd-float" : ""}"><button type="button" class="hdmd-btn hdmd-copy" data-hdmd="copy" title="Copy for LLM"><span class="hdmd-ico hdmd-ico-copy">${ICON_COPY}</span><span class="hdmd-ico hdmd-ico-spin">${ICON_SPIN}</span><span class="hdmd-ico hdmd-ico-check">${ICON_CHECK}</span><span class="hdmd-lbl">Copy for LLM</span></button></div><script type="text/plain" id="hdmd-src">${b64}</script>`;
}

const TOOLBAR_JS = `(function(){
  var src=document.getElementById('hdmd-src'),btn=document.querySelector('[data-hdmd="copy"]');
  if(!src||!btn)return;
  var md=new TextDecoder().decode(Uint8Array.from(atob(src.textContent),function(c){return c.charCodeAt(0)}));
  var lbl=btn.querySelector('.hdmd-lbl');
  function set(cls,text){btn.classList.remove('hdmd-busy','hdmd-done');if(cls)btn.classList.add(cls);if(lbl)lbl.textContent=text;}
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=md;ta.style.position='fixed';ta.style.top='0';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    var ok=false;try{ok=document.execCommand('copy');}catch(e){}
    ta.remove();return ok;
  }
  var busy=false;
  btn.addEventListener('click',function(){
    if(busy)return;busy=true;
    set('hdmd-busy','Copying...');
    var finish=function(ok){
      setTimeout(function(){
        set(ok?'hdmd-done':null,ok?'Copied!':'Copy failed');
        setTimeout(function(){set(null,'Copy for LLM');busy=false;},1400);
      },350);
    };
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(md).then(function(){finish(true);},function(){finish(fallback());});
    }else{finish(fallback());}
  });
})();`;

// Markdown upload: render is our own template, bar flows inline (scrolls away).
export function buildMarkdownPage(rendered, rawText) {
  const b64 = Buffer.from(rawText, "utf-8").toString("base64");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MD_CSS}${TOOLBAR_CSS}</style></head><body>${toolbarBlock(b64, false)}${rendered}<script>${TOOLBAR_JS}</script></body></html>`;
}

// HTML upload: inject a floating bar into the user's own page without disturbing
// its layout. rawText is the (lossy) markdown derived from the HTML by the CLI.
export function injectToolbarIntoHtml(html, rawText) {
  const b64 = Buffer.from(rawText, "utf-8").toString("base64");
  const block = `<style>${TOOLBAR_CSS}</style>${toolbarBlock(b64, true)}<script>${TOOLBAR_JS}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}</body>`);
  return html + block;
}
