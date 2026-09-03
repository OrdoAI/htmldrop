export function homePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>HTMLDrop</title>
<style>
:root{
  --bg:#f5f4f0;--surface:#fff;--surface-2:#faf9f6;
  --ink:#18181b;--ink-2:#54545c;--ink-3:#8a8a93;
  --line:#e6e4de;--line-2:#cfcdc5;--dot:#d3d1c9;
  --track:#e9e7e1;--knob:#fff;
  --accent:#2f5be6;--accent-ink:#2148c4;--accent-soft:#edf1fd;
  --pub:#b6580a;--pub-soft:#fff4e6;
  --warn:#a3610f;--err:#d02730;--err-soft:#fdf0f0;
  --shadow:0 1px 2px rgba(20,18,10,.05),0 16px 40px -12px rgba(20,18,10,.12);
  --r:20px;--r-s:12px;
  --ease:cubic-bezier(.22,.68,.2,1);--t1:.16s;--t2:.3s;--t3:.45s;
  --mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
  color-scheme:light dark;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#111113;--surface:#19191c;--surface-2:#1f1f23;
  --ink:#ededea;--ink-2:#aeaeb4;--ink-3:#77777f;
  --line:#2a2a2f;--line-2:#3a3a41;--dot:#2e2e34;
  --track:#232327;--knob:#3a3a41;
  --accent:#7d9bff;--accent-ink:#a9bdff;--accent-soft:#1b2342;
  --pub:#f0a24a;--pub-soft:#2c2115;
  --warn:#e0a44a;--err:#ff6f6f;--err-soft:#3a1d1f;
  --shadow:inset 0 1px 0 rgba(255,255,255,.04),0 16px 40px -12px rgba(0,0,0,.6);
}}
*{margin:0;padding:0;box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}

/* header */
.top{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.5rem}
.brand{display:inline-flex;align-items:center;gap:.55rem;text-decoration:none;color:var(--ink);font-weight:650;letter-spacing:-.03em;font-size:.9375rem}
.brand i{width:.5rem;height:.5rem;border-radius:2px;background:var(--accent);transform:rotate(45deg)}
.gh{color:var(--ink-3);display:flex;transition:color var(--t1) var(--ease)}
.gh:hover{color:var(--ink)}
.gh svg{width:1.375rem;height:1.375rem}

/* hero */
main{width:100%;max-width:46rem;margin:0 auto;padding:clamp(1.5rem,5vh,3.5rem) 1.5rem 4rem;display:flex;flex-direction:column;align-items:center}
.hero{font-size:clamp(1.9rem,1.2rem+2.8vw,2.9rem);line-height:1.04;letter-spacing:-.035em;font-weight:600;text-align:center;text-wrap:balance;max-width:18ch}
.hero em{font-style:normal;color:var(--ink-3)}
.promise{margin-top:.9rem;color:var(--ink-2);font-size:1rem;line-height:1.5;text-align:center;text-wrap:balance;max-width:34rem}

/* shared sliding-thumb control (tabs + segmented) */
.thumbed{position:relative;display:inline-flex;padding:3px;border-radius:100px;background:var(--track);isolation:isolate}
.thumb{position:absolute;top:3px;left:0;height:calc(100% - 6px);width:0;border-radius:100px;background:var(--knob);box-shadow:0 1px 2px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04);z-index:0;pointer-events:none;will-change:transform}
.thumbed.ready .thumb{transition:transform var(--t2) var(--ease),width var(--t2) var(--ease)}
.thumbed>button{position:relative;z-index:1;border:0;background:transparent;border-radius:100px;cursor:pointer;white-space:nowrap;color:var(--ink-3);transition:color var(--t1) var(--ease),transform var(--t1) var(--ease)}
.thumbed>button:hover{color:var(--ink-2)}
.thumbed>button:active{transform:scale(.96)}
.switch{margin:2rem 0 1.5rem}
.tab{padding:.5rem 1.1rem;font-size:.875rem;font-weight:550}
.tab.active{color:var(--ink)}

/* panels: stacked, cross-fade, no reflow */
.panels{display:grid;grid-template-columns:minmax(0,1fr);width:100%;align-items:start}
.panel{grid-area:1/1;width:100%;min-width:0;display:flex;flex-direction:column;align-items:center;opacity:0;visibility:hidden;transform:translateY(8px);pointer-events:none;transition:opacity var(--t2) var(--ease),transform var(--t2) var(--ease),visibility 0s linear var(--t2)}
.panel.active{opacity:1;visibility:visible;transform:none;pointer-events:auto;transition-delay:0s}

/* drop card */
.drop-zone{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;transition:border-color var(--t2) var(--ease),opacity var(--t2) var(--ease)}
.field{margin:.5rem;padding:2.75rem 1.5rem 2.25rem;border:1.5px dashed var(--line-2);border-radius:calc(var(--r) - .5rem);text-align:center;cursor:pointer;background-color:transparent;background-image:radial-gradient(var(--dot) 1px,transparent 1.5px);background-size:16px 16px;background-position:center;transition:border-color var(--t2) var(--ease),background-color var(--t2) var(--ease)}
.doc{width:2.75rem;height:auto;margin-bottom:1rem;stroke:var(--ink-3);stroke-width:1.5;fill:var(--surface);stroke-linecap:round;stroke-linejoin:round;transition:transform var(--t2) var(--ease),stroke var(--t2) var(--ease)}
.dz-title{display:grid;font-size:1.25rem;font-weight:600;letter-spacing:-.02em;line-height:1.3}
.dz-title span{grid-area:1/1;transition:opacity var(--t2) var(--ease),transform var(--t2) var(--ease)}
.dz-title .t-over{opacity:0;transform:translateY(6px);color:var(--accent-ink)}
.field p{color:var(--ink-3);font-size:.9rem;margin-top:.5rem;line-height:1.45;text-wrap:balance}
body.dragging .drop-zone{border-color:var(--accent)}
body.dragging .field{border-color:var(--accent)}
.drop-zone.over{border-color:var(--accent)}
.drop-zone.over>*{pointer-events:none}
.drop-zone.over .field{--dot:var(--accent);border-color:var(--accent);background-color:var(--accent-soft)}
.drop-zone.over .doc{transform:translateY(-4px) rotate(-4deg);stroke:var(--accent)}
.drop-zone.over .dz-title .t-idle{opacity:0;transform:translateY(-6px)}
.drop-zone.over .dz-title .t-over{opacity:1;transform:none}
.drop-zone.error{border-color:var(--err)}
.drop-zone.error .field{border-color:var(--err);background-color:var(--err-soft);animation:nudge var(--t3) var(--ease)}
.drop-zone.busy{pointer-events:none;opacity:.55}
@keyframes nudge{20%{transform:translateX(-4px)}45%{transform:translateX(4px)}70%{transform:translateX(-2px)}}
.pick-btns{display:flex;gap:.625rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap}
.pick-btn{min-height:2.5rem;padding:0 1.2rem;border-radius:100px;border:1px solid var(--line-2);background:var(--surface);font-size:.875rem;font-weight:550;cursor:pointer;white-space:nowrap;transition:background var(--t1) var(--ease),border-color var(--t1) var(--ease),transform var(--t1) var(--ease)}
.pick-btn:hover{border-color:var(--ink-3);background:var(--surface-2)}
.pick-btn:active{transform:scale(.97)}
#pickFile,#filePickConfirm{background:var(--ink);color:var(--bg);border-color:var(--ink)}
#pickFile:hover,#filePickConfirm:hover{background:var(--ink-2);border-color:var(--ink-2)}
input[type=file]{display:none}

/* settings tray */
.tray{padding:1.1rem 1.25rem 1.15rem;border-top:1px solid var(--line);background:var(--surface-2);cursor:default}
.settings{display:grid;grid-template-columns:auto auto;justify-content:center;align-items:center;column-gap:.85rem;row-gap:.55rem}
.setting{display:contents}
.setting-label{justify-self:end;font-size:.6875rem;font-weight:600;color:var(--ink-3);letter-spacing:.08em;text-transform:uppercase}
.seg{justify-self:start}
.seg-btn{padding:.45rem .85rem;font-size:.8125rem;font-weight:550;line-height:1}
.seg-btn.on{color:var(--ink)}
.setting-hint{margin-top:.8rem;display:flex;align-items:center;justify-content:center;gap:.45rem;text-align:center;font-size:.8125rem;line-height:1.4;color:var(--ink-3);min-height:1.2em;transition:color var(--t2) var(--ease)}
.setting-hint::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:var(--accent);flex-shrink:0;transition:background var(--t2) var(--ease)}
.setting-hint.public{color:var(--pub)}
.setting-hint.public::before{background:var(--pub)}
.setting-hint.swap{animation:rise var(--t2) var(--ease)}

/* status notes */
.progress,.error-msg,.md-error,.inline-info,.warn-info{display:none;width:100%;max-width:34rem;margin-top:.9rem;text-align:center;font-size:.875rem;line-height:1.45}
.progress.show,.error-msg.show,.md-error.show,.inline-info.show,.warn-info.show{display:block;animation:rise var(--t2) var(--ease)}
.progress{color:var(--ink-2)}
.progress::before{content:"";display:block;width:8rem;height:2px;margin:0 auto .65rem;border-radius:2px;background:linear-gradient(90deg,transparent,var(--accent),transparent) 0 0/50% 100% no-repeat,var(--line);animation:sweep 1.1s var(--ease) infinite}
@keyframes sweep{from{background-position:-100% 0,0 0}to{background-position:200% 0,0 0}}
.error-msg{color:var(--err);background:var(--err-soft);border-radius:var(--r-s);padding:.6rem .9rem}
.md-error,.warn-info{color:var(--warn)}
.inline-info{color:var(--ink-2)}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* multi-file picker */
.file-picker{display:none;width:100%;max-width:34rem;margin-top:1rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-s);padding:1.1rem;text-align:center;box-shadow:var(--shadow)}
.file-picker.show{display:block;animation:rise var(--t2) var(--ease)}
.picker-label{color:var(--ink-2);font-size:.875rem;margin-bottom:.7rem}
#fileSelect{width:100%;background:var(--surface-2);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:.55rem .7rem;font-size:.8125rem;font-family:var(--mono);margin-bottom:.7rem}

/* result */
.result{display:none;width:100%;max-width:34rem;margin-top:1.25rem}
.result.show{display:flex;flex-direction:column;gap:.5rem;animation:rise var(--t3) var(--ease)}
.link-box{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.6rem;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--r-s);padding:.6rem .6rem .6rem .9rem;box-shadow:var(--shadow)}
.result.public .link-box{border-left-color:var(--pub)}
.result.public .edit-box{border-left-color:var(--ink-3)}
.link-box input{min-width:0;background:none;border:0;outline:none;color:var(--ink);font-size:.8125rem;font-family:var(--mono)}
.tag{display:inline-flex;align-items:center;gap:.35rem;font-size:.6875rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-ink);white-space:nowrap}
.result.public .tag{color:var(--pub)}
.result.public .edit-box .tag{color:var(--ink-2)}
.tag svg{width:.8rem;height:.8rem;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.tag .i-globe{display:none}
.result.public .tag .i-globe{display:inline}
.result.public .tag .i-lock{display:none}
.edit-box{display:none}
.edit-box.show{display:grid}
.meta{color:var(--ink-3);font-size:.75rem;line-height:1.5;margin-top:.25rem;text-align:center;text-wrap:balance}
.copy-btn{display:inline-flex;align-items:center;gap:.3rem;padding:.4rem .6rem;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);font-size:.75rem;font-weight:550;cursor:pointer;transition:color var(--t1) var(--ease),border-color var(--t1) var(--ease),background var(--t1) var(--ease)}
.copy-btn:hover{color:var(--ink);border-color:var(--line-2)}
.copy-btn.copied{color:var(--accent-ink);border-color:var(--accent);background:var(--accent-soft)}
.copy-btn .lbl::after{content:"Copy"}
.copy-btn.copied .lbl::after{content:"Copied"}
.copy-icon{width:.875rem;height:.875rem;stroke:currentColor;stroke-width:2;fill:none;flex-shrink:0}

/* agents: developer surface */
.dev{width:100%;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;list-style:none}
.step{padding:1.25rem 1.5rem;display:grid;grid-template-columns:1.5rem minmax(0,1fr);column-gap:.9rem;row-gap:.6rem}
.step+.step{border-top:1px solid var(--line)}
.step .n{width:1.5rem;height:1.5rem;border-radius:50%;background:var(--ink);color:var(--bg);font-size:.75rem;font-weight:600;display:grid;place-items:center}
.step h2{font-size:.9375rem;font-weight:600;letter-spacing:-.01em;align-self:center}
.step>*:not(.n):not(h2){grid-column:2}
.step p{color:var(--ink-2);font-size:.8125rem;line-height:1.5}
.step p code{font-family:var(--mono);font-size:.75rem;background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:.05em .3em}
.step p a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line-2);transition:border-color var(--t1) var(--ease)}
.step p a:hover{border-color:var(--ink)}
.cmds{display:flex;flex-direction:column;gap:.5rem;min-width:0}
.cmd{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:.7rem .8rem;font-family:var(--mono);font-size:.8125rem;color:var(--ink);cursor:pointer;transition:border-color var(--t1) var(--ease),background var(--t1) var(--ease),transform var(--t1) var(--ease)}
.cmd:hover{border-color:var(--line-2)}
.cmd:active{transform:scale(.995)}
.cmd.copied{border-color:var(--accent);background:var(--accent-soft)}
.cmd code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;scrollbar-width:none;font-family:inherit}
.cmd .k{color:var(--accent-ink)}
.cmd .copy-icon{color:var(--ink-3);transition:color var(--t1) var(--ease)}
.cmd:hover .copy-icon,.cmd.copied .copy-icon{color:var(--accent-ink)}
.dim{color:var(--ink-3);user-select:none}
.code{background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:.7rem .85rem;font-family:var(--mono);font-size:.8125rem;line-height:1.7;color:var(--ink);overflow-x:auto;white-space:pre}
.code .c{color:var(--ink-3)}

/* footer: what happens to the file */
.foot{padding:1.5rem;display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1.5rem;color:var(--ink-3);font-size:.75rem;line-height:1.5}
.foot span{display:inline-flex;align-items:center;gap:.4rem}
.foot span::before{content:"";width:.3rem;height:.3rem;border-radius:50%;background:var(--line-2)}
.foot a{color:inherit}

@media(max-width:520px){
  .top{padding:1rem}
  main{padding:1.25rem 1rem 3rem}
  .switch{margin:1.5rem 0 1.1rem}
  .field{margin:.4rem;padding:2rem 1rem 1.6rem}
  .dz-title{font-size:1.0625rem}
  .field p{font-size:.8125rem}
  .tray{padding:1rem}
  .settings{grid-template-columns:1fr;justify-items:center;row-gap:.75rem}
  .setting-label{justify-self:center;margin-bottom:-.35rem}
  .seg{justify-self:center}
  .seg-btn{padding:.45rem .7rem;font-size:.75rem}
  .link-box{grid-template-columns:1fr auto;padding:.6rem .6rem .6rem .8rem}
  .link-box .tag{grid-column:1/-1}
  .step{padding:1rem;grid-template-columns:1.375rem minmax(0,1fr);column-gap:.7rem}
  .cmd,.code{font-size:.75rem}
  .foot{gap:.35rem 1rem;padding:1.25rem 1rem}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important}
  .panel{transition:none}
  .progress::before{animation:none;background:var(--accent)}
  .drop-zone.over .doc{transform:none}
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
  <p class="promise">HTML or Markdown, local images inlined, encrypted at rest. Private by default, gone after 7 to 30 days.</p>

  <div class="switch thumbed" id="tabs" role="tablist" aria-label="Audience">
    <span class="thumb" aria-hidden="true"></span>
    <button class="tab active" data-tab="humans" role="tab" aria-selected="true" aria-controls="panel-humans">For humans</button>
    <button class="tab" data-tab="agents" role="tab" aria-selected="false" aria-controls="panel-agents">For agents</button>
  </div>

  <div class="panels">
    <div class="panel active" id="panel-humans" role="tabpanel">
      <div class="drop-zone" id="dropZone">
        <div class="field" id="dropField">
          <svg class="doc" viewBox="0 0 48 56" aria-hidden="true"><path d="M8 4h22l10 10v36a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M30 4v10h10"/><path d="M24 22v16m-6-6 6 6 6-6"/></svg>
          <strong class="dz-title"><span class="t-idle">Drop a file or folder</span><span class="t-over" aria-hidden="true">Release to upload</span></strong>
          <p>.html or .md &middot; up to 24 MB &middot; local images inlined</p>
          <div class="pick-btns">
            <button type="button" class="pick-btn" id="pickFile">Pick file</button>
            <button type="button" class="pick-btn" id="pickFolder">Pick folder</button>
          </div>
        </div>
        <div class="tray">
          <div class="settings">
            <div class="setting">
              <span class="setting-label">Access</span>
              <div class="seg thumbed" id="segAccess" role="radiogroup" aria-label="Access">
                <span class="thumb" aria-hidden="true"></span>
                <button type="button" class="seg-btn on" data-public="false" aria-pressed="true">Private</button>
                <button type="button" class="seg-btn" data-public="true" aria-pressed="false">Public</button>
              </div>
            </div>
            <div class="setting">
              <span class="setting-label">Expires</span>
              <div class="seg thumbed" id="segExpires" role="radiogroup" aria-label="Expires in">
                <span class="thumb" aria-hidden="true"></span>
                <button type="button" class="seg-btn on" data-days="7" aria-pressed="true">7 days</button>
                <button type="button" class="seg-btn" data-days="14" aria-pressed="false">14 days</button>
                <button type="button" class="seg-btn" data-days="30" aria-pressed="false">30 days</button>
              </div>
            </div>
          </div>
          <div class="setting-hint" id="settingHint" aria-live="polite">Only people with the password link can open it.</div>
        </div>
      </div>
      <input type="file" id="fileInput" multiple>
      <input type="file" id="folderInput" webkitdirectory multiple>
      <div class="file-picker" id="filePicker">
        <p class="picker-label">Several HTML/MD files found. Pick the one to publish:</p>
        <select id="fileSelect" aria-label="Choose the main file"></select>
        <button type="button" class="pick-btn" id="filePickConfirm">Upload this file</button>
      </div>
      <div class="progress" id="progress" role="status" aria-live="polite">Processing&hellip;</div>
      <div class="error-msg" id="errorMsg" role="alert"></div>
      <div class="md-error" id="mdError">Markdown renderer failed to load. HTML uploads still work.</div>
      <div class="inline-info" id="inlineInfo"></div>
      <div class="warn-info" id="warnInfo"></div>

      <div class="result" id="result" aria-live="polite">
        <div class="link-box" id="shareBox">
          <span class="tag">
            <svg class="i-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            <svg class="i-globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
            <span id="shareTag">Private link</span>
          </span>
          <input type="text" id="linkInput" readonly aria-label="Share link">
          <button type="button" class="copy-btn" id="copyBtn" title="Copy"><svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span class="lbl"></span></button>
        </div>
        <div class="link-box edit-box" id="editBox">
          <span class="tag">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M15 8l3 3M18 5l3 3"/></svg>
            <span>Edit link &middot; keep private</span>
          </span>
          <input type="text" id="editInput" readonly aria-label="Edit link">
          <button type="button" class="copy-btn" id="editCopyBtn" title="Copy edit link"><svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span class="lbl"></span></button>
        </div>
        <p class="meta" id="meta"></p>
      </div>
    </div>

    <div class="panel" id="panel-agents" role="tabpanel">
      <ol class="dev">
        <li class="step">
          <span class="n">1</span>
          <h2>Install the skill</h2>
          <button type="button" class="cmd" data-copy="npx skills add OrdoAI/htmldrop --skill htmldrop" title="Copy install command" aria-label="Copy install command: npx skills add OrdoAI/htmldrop --skill htmldrop">
            <span class="dim">$</span><code>npx skills add OrdoAI/htmldrop --skill htmldrop</code>
            <svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <p>Teaches your coding agent when and how to publish a preview. No account, no key. <a href="https://github.com/OrdoAI/htmldrop/blob/main/skills/htmldrop/SKILL.md">Skill reference</a></p>
        </li>
        <li class="step">
          <span class="n">2</span>
          <h2>Or call the CLI directly</h2>
          <div class="cmds">
            <button type="button" class="cmd" data-copy="npx -y htmldrop-cli ./report.html" aria-label="Copy: private upload"><span class="dim">$</span><code>npx -y htmldrop-cli ./report.html</code><svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            <button type="button" class="cmd" data-copy="npx -y htmldrop-cli --public --expires 30 ./notes.md" aria-label="Copy: public upload, 30 days"><span class="dim">$</span><code>npx -y htmldrop-cli <span class="k">--public --expires 30</span> ./notes.md</code><svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            <button type="button" class="cmd" data-copy="npx -y htmldrop-cli update &quot;https://baseurl.ai/&lt;id&gt;?p=&lt;password&gt;&quot; ./report.html" aria-label="Copy: update an existing preview"><span class="dim">$</span><code>npx -y htmldrop-cli <span class="k">update</span> &lt;url&gt; ./report.html</code><svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
          </div>
          <p>Relative images, CSS and JS are inlined before upload. <code>update</code> overwrites in place and keeps the URL.</p>
        </li>
        <li class="step">
          <span class="n">3</span>
          <h2>What comes back</h2>
          <pre class="code">https://baseurl.ai/k3Qx9mZa?p=&hellip;   <span class="c"># line 1: the link to hand out</span>
<span class="c">  id: k3Qx9mZa | expires: 2026-09-10</span></pre>
          <p>Public uploads print a second line: the edit link. Treat every link as a secret; the password rides in it.</p>
        </li>
      </ol>
    </div>
  </div>
</main>

<footer class="foot">
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
  function segInit(id,attr,onPick){var seg=document.getElementById(id);seg.addEventListener('click',function(e){var b=e.target.closest('.seg-btn');if(!b)return;e.stopPropagation();if(b.classList.contains('on'))return;seg.querySelectorAll('.seg-btn').forEach(function(x){x.classList.remove('on');x.setAttribute('aria-pressed','false');});b.classList.add('on');b.setAttribute('aria-pressed','true');placeThumb(seg);onPick(b.dataset[attr]);});}
  segInit('segAccess','public',function(v){opts.public=v==='true';renderHint();});
  segInit('segExpires','days',function(v){opts.days=Number(v)||7;});

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
