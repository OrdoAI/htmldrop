import { THEME_CSS } from "./theme";

export function homePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>HTMLDrop</title>
<style>${THEME_CSS}
.top{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.5rem}
.brand{border:0;display:inline-flex;align-items:center;gap:.55rem;font-size:1.0625rem;font-weight:600;letter-spacing:-.01em}
.brand i{width:.5rem;height:.5rem;border-radius:1px;background:var(--ink);transform:rotate(45deg)}
.gh{border:0;color:var(--ink-3);display:flex;transition:color var(--t1) var(--ease)}
.gh:hover{color:var(--ink)}
.gh svg{width:1.375rem;height:1.375rem}
main{width:100%;max-width:44rem;margin:0 auto;padding:clamp(1.5rem,5vh,3.5rem) 1.5rem 4rem;display:flex;flex-direction:column;align-items:center}
.hero{font-size:clamp(2rem,1.3rem+2.8vw,3rem);line-height:1.1;letter-spacing:-.02em;font-weight:500;text-align:center}
.hero em{display:block;font-style:italic;font-weight:400;color:var(--ink-3)}
.promise{margin-top:.9rem;color:var(--ink-2);font-size:1.0625rem;line-height:1.55;text-align:center;font-style:italic;text-wrap:balance;max-width:28rem}

/* tabs: two words, an ink underline that slides */
.tabs{position:relative;display:flex;gap:1.75rem;margin:2rem 0 1.5rem}
.tab{background:none;border:0;padding:.35rem .1rem .55rem;font-size:1.0625rem;color:var(--ink-3);cursor:pointer;transition:color var(--t1) var(--ease)}
.tab:hover{color:var(--ink-2)}
.tab.active{color:var(--ink)}
.tabs .thumb{position:absolute;left:0;bottom:0;height:2px;width:0;background:var(--ink);border-radius:1px;pointer-events:none}
.tabs.ready .thumb{transition:transform var(--t2) var(--ease),width var(--t2) var(--ease)}

/* panels: stacked, cross-fade, no reflow */
.panels{display:grid;grid-template-columns:minmax(0,1fr);width:100%;align-items:start}
.panel{grid-area:1/1;width:100%;min-width:0;display:flex;flex-direction:column;align-items:center;opacity:0;visibility:hidden;transform:translateY(8px);pointer-events:none;transition:opacity var(--t2) var(--ease),transform var(--t2) var(--ease),visibility 0s linear var(--t2)}
.panel.active{opacity:1;visibility:visible;transform:none;pointer-events:auto;transition-delay:0s}

/* the sheet */
.drop-zone{width:100%;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;transition:border-color var(--t2) var(--ease),opacity var(--t2) var(--ease)}
.field{position:relative;padding:3rem 1.5rem 2.5rem;text-align:center;cursor:pointer;transition:background-color var(--t2) var(--ease)}
.field::before{content:"";position:absolute;inset:.5rem;border:1.5px dashed var(--accent);border-radius:calc(var(--r) - .5rem);opacity:0;transform:scale(.985);pointer-events:none;transition:opacity var(--t2) var(--ease),transform var(--t2) var(--ease)}
.doc{width:2.75rem;height:auto;margin-bottom:1rem;stroke:var(--ink-3);stroke-width:1.5;fill:var(--paper);stroke-linecap:round;stroke-linejoin:round;transition:transform var(--t2) var(--ease),stroke var(--t2) var(--ease)}
.dz-title{display:grid;font-size:1.5rem;font-weight:500;letter-spacing:-.01em;line-height:1.3}
.dz-title span{grid-area:1/1;transition:opacity var(--t2) var(--ease),transform var(--t2) var(--ease)}
.dz-title .t-over{opacity:0;transform:translateY(6px);color:var(--accent)}
.field p{color:var(--ink-3);font-size:.9375rem;margin-top:.5rem;font-style:italic}
body.dragging .field::before{opacity:.45;transform:none}
.drop-zone.over{border-color:var(--accent)}
.drop-zone.over>*{pointer-events:none}
.drop-zone.over .field{background-color:var(--accent-soft)}
.drop-zone.over .field::before{opacity:1;transform:none}
.drop-zone.over .doc{transform:translateY(-4px) rotate(-4deg);stroke:var(--accent)}
.drop-zone.over .dz-title .t-idle{opacity:0;transform:translateY(-6px)}
.drop-zone.over .dz-title .t-over{opacity:1;transform:none}
.drop-zone.error{border-color:var(--err)}
.drop-zone.error .field{background-color:var(--err-soft);animation:nudge var(--t3) var(--ease)}
.drop-zone.busy{pointer-events:none;opacity:.55}
@keyframes nudge{20%{transform:translateX(-4px)}45%{transform:translateX(4px)}70%{transform:translateX(-2px)}}
.pick-btns{display:flex;gap:.6rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap}
input[type=file]{display:none}

/* settings, written under the sheet like a form's footer */
.tray{padding:1rem 1.5rem 1rem;border-top:1px dashed var(--rule-2);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.75rem 1.75rem;cursor:default}
.grp{display:inline-flex;align-items:center;gap:.7rem}
.setting-hint{width:100%;text-align:center;font-style:italic;color:var(--ink-3);font-size:.9375rem;line-height:1.4;min-height:1.3em;transition:color var(--t2) var(--ease)}
.setting-hint.public{color:var(--pub)}
.setting-hint.swap{animation:rise var(--t2) var(--ease)}

/* status notes */
.progress,.error-msg,.md-error,.inline-info,.warn-info{display:none;width:100%;max-width:34rem;margin-top:.9rem;text-align:center;font-size:.9375rem;line-height:1.45;font-style:italic}
.progress.show,.error-msg.show,.md-error.show,.inline-info.show,.warn-info.show{display:block;animation:rise var(--t2) var(--ease)}
.progress{color:var(--ink-2)}
.progress::before{content:"";display:block;width:8rem;height:2px;margin:0 auto .65rem;border-radius:2px;background:linear-gradient(90deg,transparent,var(--accent),transparent) 0 0/50% 100% no-repeat,var(--rule);animation:sweep 1.1s var(--ease) infinite}
@keyframes sweep{from{background-position:-100% 0,0 0}to{background-position:200% 0,0 0}}
.error-msg{color:var(--err)}
.md-error,.warn-info{color:var(--warn)}
.inline-info{color:var(--ink-2)}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* multi-file picker */
.file-picker{display:none;width:100%;max-width:34rem;margin-top:1rem;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);padding:1.1rem;text-align:center;box-shadow:var(--shadow)}
.file-picker.show{display:block;animation:rise var(--t2) var(--ease)}
.picker-label{color:var(--ink-2);font-size:.9375rem;font-style:italic;margin-bottom:.7rem}
#fileSelect{width:100%;background:var(--paper-2);color:var(--ink);border:1px solid var(--rule);border-radius:var(--r-s);padding:.55rem .7rem;font-size:.8125rem;font-family:var(--mono);margin-bottom:.7rem}

/* result */
.result{display:none;width:100%;max-width:34rem;margin-top:1.25rem}
.result.show{display:flex;flex-direction:column;gap:.5rem;animation:rise var(--t3) var(--ease)}
.link-box{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.6rem;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r-s);padding:.5rem .5rem .5rem .9rem;box-shadow:var(--shadow)}
.link-box input{min-width:0;background:none;border:0;outline:none;color:var(--ink);font-size:.8125rem;font-family:var(--mono)}
.tag{display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;color:var(--accent)}
.result.public .tag{color:var(--pub)}
.result.public .edit-box .tag{color:var(--ink-2)}
.tag svg{width:.8rem;height:.8rem;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.tag .i-globe{display:none}
.result.public .tag .i-globe{display:inline}
.result.public .tag .i-lock{display:none}
.edit-box{display:none;border-style:dashed;box-shadow:none;background:var(--paper-2)}
.edit-box.show{display:grid}
.link-box .btn{min-height:2rem;padding:0 .7rem;font-size:.75rem}
.meta{color:var(--ink-3);font-size:.9375rem;font-style:italic;line-height:1.5;margin-top:.25rem;text-align:center;text-wrap:balance}

/* for agents: a note you fill in */
.note{width:100%;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);box-shadow:var(--shadow);padding:1.75rem 2rem 1.35rem;text-align:left}
.note .t{font-size:1.25rem;line-height:1.75;color:var(--ink)}
.note .blank{display:inline-block;min-width:8ch;border-bottom:1px solid var(--ink);padding:0 .3em;outline:none;text-align:center;color:var(--accent);font-family:var(--mono);font-size:.95rem;line-height:1.2;cursor:text}
.note .blank:focus{border-bottom-color:var(--accent)}
.note .blank:empty::before{content:attr(data-ph);color:var(--ink-4);font-family:var(--serif);font-style:italic;font-size:1rem}
.note .dim{color:var(--ink-3)}
.note .dim code{font-family:var(--mono);font-size:.9rem;color:var(--ink-3)}
.note .foot{margin-top:1.25rem;padding-top:1rem;border-top:1px dashed var(--rule-2);display:flex;align-items:center;justify-content:space-between;gap:.75rem 1.25rem;flex-wrap:wrap}
.note .foot .btn{margin-left:auto}
.note-sub{margin-top:.9rem;text-align:center;font-style:italic;color:var(--ink-3);font-size:.9375rem;text-wrap:balance}

/* footer: what happens to the file */
.site-foot{padding:1.5rem;display:flex;flex-wrap:wrap;justify-content:center;gap:.4rem 1.25rem;color:var(--ink-3);font-size:.9375rem;font-style:italic}
.site-foot span+span::before{content:"·";margin-right:1.25rem;color:var(--ink-4);font-style:normal}
.site-foot a{color:var(--ink-2)}

@media(max-width:520px){
  .top{padding:1rem}
  main{padding:1.25rem 1rem 3rem}
  .tabs{margin:1.5rem 0 1.1rem}
  .field{padding:2.25rem 1rem 2rem}
  .field::before{inset:.4rem}
  .dz-title{font-size:1.25rem}
  .tray{padding:.9rem 1rem;gap:.6rem 1.25rem}
  .link-box{grid-template-columns:1fr auto;padding:.5rem .5rem .5rem .8rem}
  .link-box .tag{grid-column:1/-1}
  .note{padding:1.35rem 1.2rem 1.1rem}
  .note .t{font-size:1.125rem}
  .site-foot{gap:.35rem 1rem;padding:1.25rem 1rem;font-size:.875rem}
  .site-foot span+span::before{margin-right:1rem}
}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="/"><i aria-hidden="true"></i>HTMLDrop</a>
  <a class="gh" href="https://github.com/OrdoAI/htmldrop" title="GitHub" aria-label="GitHub"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .3a12 12 0 00-3.79 23.4c.6.1.82-.26.82-.58v-2.17c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 016.02 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0012 .3"/></svg></a>
</header>

<main>
  <h1 class="hero">Drop a file. <em>Get a link that expires.</em></h1>
  <p class="promise">HTML or Markdown in, a private link out. Encrypted at rest, gone in 7 to 30 days.</p>

  <div class="tabs thumbed" id="tabs" role="tablist" aria-label="Audience">
    <button class="tab active" data-tab="humans" role="tab" aria-selected="true" aria-controls="panel-humans">For humans</button>
    <button class="tab" data-tab="agents" role="tab" aria-selected="false" aria-controls="panel-agents">For agents</button>
    <span class="thumb" aria-hidden="true"></span>
  </div>

  <div class="panels">
    <div class="panel active" id="panel-humans" role="tabpanel">
      <div class="drop-zone" id="dropZone">
        <div class="field" id="dropField">
          <svg class="doc" viewBox="0 0 48 56" aria-hidden="true"><path d="M8 4h22l10 10v36a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M30 4v10h10"/><path d="M24 22v16m-6-6 6 6 6-6"/></svg>
          <strong class="dz-title"><span class="t-idle">Drop a file or folder</span><span class="t-over" aria-hidden="true">Release to upload</span></strong>
          <p>.html or .md &middot; up to 24 MB &middot; local images inlined</p>
          <div class="pick-btns">
            <button type="button" class="btn" id="pickFile">Pick file</button>
            <button type="button" class="btn ghost" id="pickFolder">Pick folder</button>
          </div>
        </div>
        <div class="tray">
          <div class="grp"><span class="eyebrow">Access</span><button type="button" class="sw" id="swPublic" aria-pressed="false"><i aria-hidden="true"></i>Public</button></div>
          <div class="grp"><span class="eyebrow">Expires</span><span class="pick" id="pickDays" role="radiogroup" aria-label="Expires in"><button type="button" class="on" data-days="7" aria-pressed="true">7</button><span class="sep">&middot;</span><button type="button" data-days="14" aria-pressed="false">14</button><span class="sep">&middot;</span><button type="button" data-days="30" aria-pressed="false">30</button><span class="unit">days</span></span></div>
          <div class="setting-hint" id="settingHint" aria-live="polite">Only people with the password link can open it.</div>
        </div>
      </div>
      <input type="file" id="fileInput" multiple>
      <input type="file" id="folderInput" webkitdirectory multiple>
      <div class="file-picker" id="filePicker">
        <p class="picker-label">Several HTML/MD files found. Pick the one to publish:</p>
        <select id="fileSelect" aria-label="Choose the main file"></select>
        <button type="button" class="btn" id="filePickConfirm">Upload this file</button>
      </div>
      <div class="progress" id="progress" role="status" aria-live="polite">Processing&hellip;</div>
      <div class="error-msg" id="errorMsg" role="alert"></div>
      <div class="md-error" id="mdError">Markdown renderer failed to load. HTML uploads still work.</div>
      <div class="inline-info" id="inlineInfo"></div>
      <div class="warn-info" id="warnInfo"></div>

      <div class="result" id="result" aria-live="polite">
        <div class="link-box" id="shareBox">
          <span class="tag eyebrow">
            <svg class="i-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            <svg class="i-globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
            <span id="shareTag">Private link</span>
          </span>
          <input type="text" id="linkInput" readonly aria-label="Share link">
          <button type="button" class="btn ghost" id="copyBtn" title="Copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span class="lbl"></span></button>
        </div>
        <div class="link-box edit-box" id="editBox">
          <span class="tag eyebrow">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M15 8l3 3M18 5l3 3"/></svg>
            <span>Edit link &middot; keep private</span>
          </span>
          <input type="text" id="editInput" readonly aria-label="Edit link">
          <button type="button" class="btn ghost" id="editCopyBtn" title="Copy edit link"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span class="lbl"></span></button>
        </div>
        <p class="meta" id="meta"></p>
      </div>
    </div>

    <div class="panel" id="panel-agents" role="tabpanel">
      <div class="note">
        <p class="t">Use the HTMLDrop skill to publish <span class="blank" id="agFile" contenteditable="true" spellcheck="false" role="textbox" aria-label="File to publish" data-ph="which file"></span> and send me the link.<span id="agOpts"></span><br><span class="dim">If the skill is missing, install it first: <code>npx -y skills add OrdoAI/htmldrop --skill htmldrop -g -y</code></span></p>
        <div class="foot">
          <div class="grp"><span class="eyebrow">Access</span><button type="button" class="sw" id="agPublic" aria-pressed="false"><i aria-hidden="true"></i>Public</button></div>
          <div class="grp"><span class="eyebrow">Expires</span><span class="pick" id="agDays" role="radiogroup" aria-label="Expires in"><button type="button" class="on" data-days="7" aria-pressed="true">7</button><span class="sep">&middot;</span><button type="button" data-days="14" aria-pressed="false">14</button><span class="sep">&middot;</span><button type="button" data-days="30" aria-pressed="false">30</button><span class="unit">days</span></span></div>
          <button type="button" class="btn" id="agCopy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span class="lbl"></span> prompt</button>
        </div>
      </div>
      <p class="note-sub">Fill in the blank, pick what you need, copy, paste into Claude Code, Cursor or Codex. <a href="https://github.com/OrdoAI/htmldrop/blob/main/skills/htmldrop/SKILL.md">Skill reference</a></p>
    </div>
  </div>
</main>

<footer class="site-foot">
  <span>Encrypted at rest</span>
  <span>Deleted after 7&ndash;30 days</span>
  <span>Password travels in the link</span>
  <span><a href="https://github.com/OrdoAI/htmldrop">Source</a></span>
</footer>

<script id="app">
(function(){
  var MARKED_VERSION = '15.0.7';
  var MARKED_SRI = 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR';
  var markedReady = false, markedFailed = false;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked@' + MARKED_VERSION + '/marked.min.js';
  if (MARKED_SRI) s.integrity = MARKED_SRI;
  s.crossOrigin = 'anonymous';
  s.onload = function() { markedReady = true; if (typeof marked !== 'undefined' && marked.setOptions) marked.setOptions({ gfm: true, breaks: true }); };
  s.onerror = function() { markedFailed = true; document.getElementById('mdError').classList.add('show'); };
  document.head.appendChild(s);

  var MD_CSS = 'body{font-family:-apple-system,BlinkMacSystemFont,\\'Segoe UI\\',Roboto,sans-serif;max-width:48rem;margin:0 auto;padding:2rem;line-height:1.6;color:#24292e}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em;font-weight:600}h1{font-size:2em;border-bottom:1px solid #eee;padding-bottom:.3em}h2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.3em}code{background:#f6f8fa;padding:.2em .4em;border-radius:3px;font-size:85%}pre{background:#f6f8fa;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #dfe2e5;padding:0 1em;color:#6a737d;margin:1em 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dfe2e5;padding:.5em .75em}th{background:#f6f8fa}img{max-width:100%}a{color:#0366d6}ul,ol{padding-left:2em}hr{border:none;border-top:1px solid #eee;margin:1.5em 0}';
  function wrapMd(h){return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+MD_CSS+'</style></head><body>'+h+'</body></html>';}
  function convertMd(t){if(markedFailed||!markedReady||typeof marked==='undefined')return null;return wrapMd(typeof marked.parse==='function'?marked.parse(t):marked(t));}

  var reduceMotion=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function placeThumb(el){
    var thumb=el.querySelector('.thumb'),on=el.querySelector('.seg-btn.on, .tab.active');
    if(!thumb||!on||!on.offsetWidth)return;
    thumb.style.width=on.offsetWidth+'px';
    thumb.style.transform='translateX('+on.offsetLeft+'px)';
    if(!reduceMotion&&!el.classList.contains('ready'))requestAnimationFrame(function(){el.classList.add('ready');});
  }
  var thumbed=Array.prototype.slice.call(document.querySelectorAll('.thumbed'));
  function placeAll(){thumbed.forEach(placeThumb);}
  placeAll();
  window.addEventListener('resize',placeAll);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(placeAll);
  if('ResizeObserver' in window){var ro=new ResizeObserver(placeAll);thumbed.forEach(function(el){ro.observe(el);});}
  function flash(btn){btn.classList.add('copied');clearTimeout(btn._t);btn._t=setTimeout(function(){btn.classList.remove('copied');},1500);}

  document.querySelectorAll('.tab').forEach(function(tab){tab.addEventListener('click',function(){
    if(tab.classList.contains('active'))return;
    document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');t.setAttribute('aria-selected','false');});
    document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});
    tab.classList.add('active');tab.setAttribute('aria-selected','true');
    document.getElementById('panel-'+tab.dataset.tab).classList.add('active');
    placeThumb(document.getElementById('tabs'));
  });});
  document.querySelectorAll('[data-copy]').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();navigator.clipboard.writeText(btn.dataset.copy).then(function(){flash(btn);});});});

  // Page-level drag handling: a global "something is being dragged" affordance,
  // and no browser navigation when a file is dropped outside the card.
  function hasFiles(e){var t=e.dataTransfer&&e.dataTransfer.types;return !!t&&Array.prototype.indexOf.call(t,'Files')!==-1;}
  var dragDepth=0;
  document.addEventListener('dragenter',function(e){if(!hasFiles(e))return;dragDepth++;document.body.classList.add('dragging');});
  document.addEventListener('dragleave',function(e){if(!hasFiles(e))return;if(--dragDepth<=0){dragDepth=0;document.body.classList.remove('dragging');}});
  document.addEventListener('dragover',function(e){if(hasFiles(e))e.preventDefault();});
  document.addEventListener('drop',function(e){if(hasFiles(e))e.preventDefault();dragDepth=0;document.body.classList.remove('dragging');});

  function isRel(src){return src&&!src.startsWith('data:')&&!src.startsWith('http://')&&!src.startsWith('https://')&&!src.startsWith('//')&&!src.startsWith('#')&&!src.startsWith('javascript:');}
  function norm(p){var parts=p.split('/'),o=[];for(var i=0;i<parts.length;i++){if(parts[i]==='.'||parts[i]==='')continue;if(parts[i]==='..'&&o.length){o.pop();continue;}o.push(parts[i]);}return o.join('/');}
  function toDataUri(f){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(r.result);};r.onerror=function(){no(new Error('read failed'));};r.readAsDataURL(f);});}
  function mimeOf(f){
    var t=(f.type||'').toLowerCase();
    if(t)return t;
    var e=f.name.split('.').pop().toLowerCase();
    return{png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',gif:'image/gif',avif:'image/avif',ico:'image/x-icon',bmp:'image/bmp'}[e]||'application/octet-stream';
  }
  function loadImg(u){
    return new Promise(function(ok,no){
      var i=new Image();
      i.onload=function(){ok(i);};
      i.onerror=function(){no(new Error('image decode failed'));};
      i.src=u;
    });
  }
  function canvasBlob(c,t,q){
    return new Promise(function(ok){
      c.toBlob(function(b){ok(b);},t,q);
    });
  }
  async function imageDataUri(f){
    var original=await toDataUri(f),mime=mimeOf(f);
    if(['image/png','image/jpeg','image/webp'].indexOf(mime)===-1||f.size<4096)return original;
    var u=URL.createObjectURL(f);
    try{
      var i=await loadImg(u),c=document.createElement('canvas');
      c.width=i.naturalWidth||i.width;
      c.height=i.naturalHeight||i.height;
      c.getContext('2d').drawImage(i,0,0,c.width,c.height);
      var b=await canvasBlob(c,'image/webp',.82);
      if(b&&b.type==='image/webp'&&b.size>0&&b.size<f.size)return await toDataUri(b);
    }catch(e){}finally{
      URL.revokeObjectURL(u);
    }
    return original;
  }
  function findRels(html){var s=[],m,re=/(<img\\b[^>]*\\bsrc\\s*=\\s*)(["'])([^"']+)\\2/gi;while((m=re.exec(html))!==null)if(isRel(m[3]))s.push(m[3]);re=/(<link\\b[^>]*\\bhref\\s*=\\s*)(["'])([^"']+)\\2/gi;while((m=re.exec(html))!==null)if(isRel(m[3]))s.push(m[3]);return s;}

  async function inlineAssets(html,assets,main){
    var fm={},md='';
    if(main){var mp=main.fullPath||main.webkitRelativePath||main.name;var ls=mp.lastIndexOf('/');if(ls!==-1)md=mp.slice(0,ls+1);}
    for(var i=0;i<assets.length;i++){var f=assets[i];var rp=f.fullPath||f.webkitRelativePath||f.name;var n=norm(rp).toLowerCase();fm[n]=f;if(md&&rp.toLowerCase().startsWith(md.toLowerCase()))fm[norm(rp.slice(md.length)).toLowerCase()]=f;var pts=n.split('/');if(pts.length>1)fm[pts.slice(1).join('/')]=f;var bn=f.name.toLowerCase();if(!fm[bn])fm[bn]=f;}
    var inl=0,miss=[];
    async function rep(m,pre,q,src){if(!isRel(src))return m;var k=norm(src).toLowerCase();var f=fm[k]||fm[k.split('/').pop()];if(!f){miss.push(src);return m;}inl++;return pre+q+(await imageDataUri(f))+q;}
    async function ra(t,re,fn){var p=[],li=0,m;re.lastIndex=0;while((m=re.exec(t))!==null){p.push(t.slice(li,m.index));p.push(fn(m[0],m[1],m[2],m[3],m[4]));li=re.lastIndex;}p.push(t.slice(li));return(await Promise.all(p)).join('');}
    html=await ra(html,/(<img\\b[^>]*\\bsrc\\s*=\\s*)(["'])([^"']+)\\2/gi,rep);
    html=await ra(html,/(<link\\b[^>]*\\bhref\\s*=\\s*)(["'])([^"']+)\\2/gi,async function(m,pre,q,href){if(!isRel(href))return m;var k=norm(href).toLowerCase();var f=fm[k]||fm[k.split('/').pop()];if(!f){miss.push(href);return m;}inl++;return '<style>'+(await f.text())+'</style>';});
    html=await ra(html,/(<script\\b[^>]*\\bsrc\\s*=\\s*)(["'])([^"']+)\\2([^>]*>\\s*<\\/script>)/gi,async function(m,pre,q,src){if(!isRel(src))return m;var k=norm(src).toLowerCase();var f=fm[k]||fm[k.split('/').pop()];if(!f){miss.push(src);return m;}inl++;return '<scr'+'ipt>'+(await f.text())+'<\\/scr'+'ipt>';});
    return{html:html,inlined:inl,missing:miss};
  }

  async function collectDrop(dt){
    var files=[];var items=dt.items;if(!items||!items.length)return Array.from(dt.files);
    var entries=[];for(var i=0;i<items.length;i++){var e=items[i].webkitGetAsEntry&&items[i].webkitGetAsEntry();if(e)entries.push(e);}
    if(!entries.length)return Array.from(dt.files);
    async function readDir(d){return new Promise(function(ok){var r=d.createReader(),a=[];(function rd(){r.readEntries(function(b){if(!b.length)return ok(a);a=a.concat(Array.from(b));rd();});})();});}
    async function walk(e,p){if(e.isFile)return new Promise(function(ok){e.file(function(f){Object.defineProperty(f,'fullPath',{value:p+f.name,writable:true});files.push(f);ok();});});if(e.isDirectory){var ch=await readDir(e);for(var c=0;c<ch.length;c++)await walk(ch[c],p+e.name+'/');}}
    for(var j=0;j<entries.length;j++)await walk(entries[j],'');return files;
  }

  var MAX=24*1024*1024;
  var dz=document.getElementById('dropZone'),fi=document.getElementById('fileInput'),fo=document.getElementById('folderInput');
  var pf=document.getElementById('pickFile'),pfr=document.getElementById('pickFolder');
  var prog=document.getElementById('progress'),err=document.getElementById('errorMsg');
  var ilInfo=document.getElementById('inlineInfo'),wInfo=document.getElementById('warnInfo');
  var res=document.getElementById('result'),li=document.getElementById('linkInput'),cb=document.getElementById('copyBtn'),mt=document.getElementById('meta');
  var fp=document.getElementById('filePicker'),fsel=document.getElementById('fileSelect'),fpc=document.getElementById('filePickConfirm');
  var pending=null;

  pf.addEventListener('click',function(e){e.stopPropagation();fi.click();});
  pfr.addEventListener('click',function(e){e.stopPropagation();fo.click();});
  document.getElementById('dropField').addEventListener('click',function(e){if(!e.target.closest('button'))fi.click();});
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragleave',function(){dz.classList.remove('over');});
  dz.addEventListener('drop',async function(e){e.preventDefault();dz.classList.remove('over');var f=await collectDrop(e.dataTransfer);if(f.length)handleFiles(f);});
  fi.addEventListener('change',function(){if(fi.files.length)handleFiles(Array.from(fi.files));});
  fo.addEventListener('change',function(){if(fo.files.length)handleFiles(Array.from(fo.files));});
  cb.addEventListener('click',function(){li.select();navigator.clipboard.writeText(li.value).then(function(){flash(cb);});});
  fpc.addEventListener('click',function(){if(!pending)return;fp.classList.remove('show');processMain(pending.candidates[parseInt(fsel.value)],pending.all);pending=null;});

  function showErr(m){err.textContent=m;err.classList.add('show');dz.classList.add('error');setTimeout(function(){dz.classList.remove('error');},2000);}

  async function handleFiles(files){
    err.classList.remove('show');ilInfo.classList.remove('show');wInfo.classList.remove('show');res.classList.remove('show');fp.classList.remove('show');
    var cands=[],all=[];
    for(var i=0;i<files.length;i++){all.push(files[i]);var ext=files[i].name.split('.').pop().toLowerCase();if(ext==='html'||ext==='htm'||ext==='md'||ext==='markdown')cands.push(files[i]);}
    if(!cands.length){showErr('No .html or .md file found');return;}
    if(cands.length===1){processMain(cands[0],all);return;}
    pending={candidates:cands,all:all};fsel.innerHTML='';
    for(var j=0;j<cands.length;j++){var o=document.createElement('option');o.value=j;o.textContent=cands[j].fullPath||cands[j].webkitRelativePath||cands[j].name;fsel.appendChild(o);}
    fp.classList.add('show');
  }

  async function processMain(main,all){
    var assets=all.filter(function(f){return f!==main;});
    var ext=main.name.split('.').pop().toLowerCase();
    prog.textContent='Processing\\u2026';prog.classList.add('show');
    var text=await main.text();
    if(ext==='md'||ext==='markdown'){
      if(markedFailed){prog.classList.remove('show');showErr('Markdown library failed.');return;}
      if(!markedReady){prog.classList.remove('show');showErr('Markdown library loading, retry.');return;}
      var c=convertMd(text);if(!c){prog.classList.remove('show');showErr('Markdown conversion failed');return;}text=c;
    }
    var rels=findRels(text);
    if(rels.length>0&&assets.length===0){prog.classList.remove('show');wInfo.textContent='Found '+rels.length+' local asset(s). Use "Pick folder" to auto-inline them.';wInfo.classList.add('show');}
    if(assets.length>0){
      prog.textContent='Inlining assets\\u2026';
      try{var r=await inlineAssets(text,assets,main);text=r.html;if(r.inlined>0||r.missing.length>0){ilInfo.textContent=r.inlined+' inlined'+(r.missing.length?', '+r.missing.length+' not found':'');ilInfo.classList.add('show');}}
      catch(e){prog.classList.remove('show');showErr('Inlining failed: '+e.message);return;}
    }
    if(new Blob([text]).size>MAX){prog.classList.remove('show');showErr('Too large after inlining (max 24 MB)');return;}
    upload(text,main.name);
  }

  var opts={public:false,days:7},hint=document.getElementById('settingHint');
  function renderHint(){var t=opts.public?'Anyone with the URL can read it. You also get a separate edit link for updates.':'Only people with the password link can open it.';if(hint.textContent===t)return;hint.classList.remove('swap');void hint.offsetWidth;hint.textContent=t;hint.classList.toggle('public',opts.public);hint.classList.add('swap');}
  function switchInit(id,onChange){var sw=document.getElementById(id);sw.addEventListener('click',function(e){e.stopPropagation();var on=!sw.classList.contains('on');sw.classList.toggle('on',on);sw.classList.toggle('pub-on',on);sw.setAttribute('aria-pressed',String(on));onChange(on);});}
  function pickInit(id,onChange){var root=document.getElementById(id);root.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();root.querySelectorAll('button').forEach(function(x){x.classList.remove('on');x.setAttribute('aria-pressed','false');});b.classList.add('on');b.setAttribute('aria-pressed','true');onChange(Number(b.dataset.days)||7);});});}
  switchInit('swPublic',function(on){opts.public=on;renderHint();});
  pickInit('pickDays',function(d){opts.days=d;});

  // For agents: the note is the prompt; the controls edit its sentences.
  var INSTALL='npx -y skills add OrdoAI/htmldrop --skill htmldrop -g -y';
  var ag={file:'',pub:false,days:7};
  var agFile=document.getElementById('agFile'),agOpts=document.getElementById('agOpts'),agCopy=document.getElementById('agCopy');
  function agSentences(){return (ag.pub?' Make it public.':'')+(ag.days!==7?' Keep it for '+ag.days+' days.':'');}
  function agText(){return 'Use the HTMLDrop skill to publish '+(ag.file||'the file we are working on')+' and send me the link.'+agSentences()+' If the skill is missing, install it first: '+INSTALL;}
  agFile.addEventListener('input',function(){ag.file=agFile.textContent.replace(/\s+/g,' ').trim();if(!agFile.textContent.trim())agFile.textContent='';});
  agFile.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();agFile.blur();}});
  switchInit('agPublic',function(on){ag.pub=on;agOpts.textContent=agSentences();});
  pickInit('agDays',function(d){ag.days=d;agOpts.textContent=agSentences();});
  agCopy.addEventListener('click',function(){if(!navigator.clipboard)return;navigator.clipboard.writeText(agText()).then(function(){flash(agCopy);});});

  var ecb=document.getElementById('editCopyBtn');
  ecb.addEventListener('click',function(){var v=document.getElementById('editInput').value;if(v&&navigator.clipboard)navigator.clipboard.writeText(v).then(function(){flash(ecb);});});

  function upload(html,fn){
    prog.textContent='Uploading\\u2026';prog.classList.add('show');dz.classList.add('busy');
    var payload={html:html,filename:fn,expiresInDays:opts.days};if(opts.public)payload.public=true;
    fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t);});return r.json();})
    .then(function(d){
      var eb=document.getElementById('editBox'),ei=document.getElementById('editInput'),tag=document.getElementById('shareTag');
      var isPub=!!(d.public&&d.publicUrl);
      res.classList.toggle('public',isPub);
      tag.textContent=isPub?'Public link':'Private link';
      if(isPub){li.value=d.publicUrl;ei.value=d.url;eb.classList.add('show');}
      else{li.value=d.url;ei.value='';eb.classList.remove('show');}
      var exp=d.expiresAt?new Date(d.expiresAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'never';
      mt.textContent=(isPub?'Anyone with the link can read it. The edit link updates it.':'The password is in the link. Share it like a secret.')+' \\u00b7 Expires '+exp+' \\u00b7 '+d.id;
      res.classList.add('show');
    })
    .catch(function(e){showErr(e.message||'Upload failed');})
    .finally(function(){prog.classList.remove('show');dz.classList.remove('busy');});
  }
})();
</script>
</body>
</html>`;
}
