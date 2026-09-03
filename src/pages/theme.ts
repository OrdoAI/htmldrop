// Shared "notebook" design tokens and primitives for every server-rendered
// page: warm paper in light mode, night paper in dark mode, serif prose with
// sans UI, dashed rules, fill-in blanks, switches and circled choices.
// Inlined into each page's <style>; keep it free of backticks and "${".
export const THEME_CSS = `
:root{
  --bg:#f3efe3;--paper:#fffdf7;--paper-2:#f7f2e6;
  --ink:#2a2620;--ink-2:#5f584c;--ink-3:#8a8477;--ink-4:#b6ae9d;
  --rule:#e6dfcb;--rule-2:#cfc6ad;
  --accent:#2148c4;--accent-soft:#e9eefc;
  --pub:#9a4f0a;--pub-soft:#f9ecd8;
  --err:#b3261e;--err-soft:#f9e6e3;--warn:#8a5a10;
  --shadow:0 1px 2px rgba(60,45,20,.06),0 18px 40px -16px rgba(60,45,20,.18);
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Times New Roman',serif;
  --sans:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
  --ease:cubic-bezier(.22,.68,.2,1);--t1:.16s;--t2:.3s;--t3:.45s;
  --r:14px;--r-s:8px;
  color-scheme:light dark;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#171410;--paper:#1f1b15;--paper-2:#27221a;
  --ink:#ece5d3;--ink-2:#b6ad99;--ink-3:#847b69;--ink-4:#56503f;
  --rule:#332d23;--rule-2:#48412f;
  --accent:#9db3ff;--accent-soft:#232a44;
  --pub:#e6ad62;--pub-soft:#332616;
  --err:#ff8177;--err-soft:#3a1f1c;--warn:#dfae5c;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 18px 40px -16px rgba(0,0,0,.6);
}}
*{margin:0;padding:0;box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{font-family:var(--serif);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;line-height:1.5}
button,input,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--rule-2);transition:border-color var(--t1) var(--ease)}
a:hover{border-color:var(--ink)}
.eyebrow{font-family:var(--sans);font-size:.6875rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.btn{font-family:var(--sans);display:inline-flex;align-items:center;justify-content:center;gap:.45rem;min-height:2.375rem;padding:0 1.05rem;border-radius:var(--r-s);border:1px solid var(--ink);background:var(--ink);color:var(--paper);font-size:.8125rem;font-weight:550;cursor:pointer;white-space:nowrap;transition:background var(--t1) var(--ease),color var(--t1) var(--ease),border-color var(--t1) var(--ease),transform var(--t1) var(--ease)}
.btn:hover{background:var(--ink-2);border-color:var(--ink-2)}
.btn:active{transform:scale(.97)}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--rule-2)}
.btn.ghost:hover{background:var(--paper-2);border-color:var(--ink-3);color:var(--ink)}
.btn.copied,.btn.ghost.copied{background:var(--accent);border-color:var(--accent);color:#fff}
.btn svg{width:.9rem;height:.9rem;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.lbl::after{content:"Copy"}
.copied .lbl::after{content:"Copied"}
.sw{font-family:var(--sans);display:inline-flex;align-items:center;gap:.5rem;background:none;border:0;padding:0;cursor:pointer;font-size:.8125rem;font-weight:550;color:var(--ink-3);transition:color var(--t1) var(--ease)}
.sw i{width:2rem;height:1.15rem;border-radius:100px;background:var(--rule-2);position:relative;flex-shrink:0;transition:background var(--t2) var(--ease)}
.sw i::after{content:"";position:absolute;top:2px;left:2px;width:.85rem;height:.85rem;border-radius:50%;background:var(--paper);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform var(--t2) var(--ease)}
.sw:hover{color:var(--ink-2)}
.sw.on{color:var(--ink)}.sw.on i{background:var(--ink)}.sw.on i::after{transform:translateX(.85rem)}
.sw.on.pub-on{color:var(--pub)}.sw.on.pub-on i{background:var(--pub)}
.pick{font-family:var(--sans);display:inline-flex;align-items:baseline;gap:.1rem;font-size:.8125rem;font-weight:550;color:var(--ink-3)}
.pick button{background:none;border:0;padding:.1rem .3rem;color:var(--ink-3);cursor:pointer;border-bottom:1.5px solid transparent;transition:color var(--t1) var(--ease),border-color var(--t1) var(--ease)}
.pick button:hover{color:var(--ink-2)}
.pick button.on{color:var(--ink);border-bottom-color:var(--ink)}
.pick .sep{color:var(--ink-4);padding:0 .05rem}
.pick .unit{margin-left:.3rem;color:var(--ink-3)}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important}}
`;
