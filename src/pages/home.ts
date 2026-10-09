import { FONT_PRELOAD, MARK_SVG, THEME_CSS } from "./theme";

const I = {
  lock: '<svg class="i-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  globe: '<svg class="i-globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  check: '<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  copy: '<svg class="i-copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/></svg><svg class="i-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 6.5l2.5 2.5M18.5 4l2 2"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v12M7 12.5l5 5 5-5"/></svg>',
  term: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 4 4-4 4M12 16h7"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 10.5A7.5 7.5 0 0 0 6 6.6L4.5 8M4.5 4v4h4M4.5 13.5A7.5 7.5 0 0 0 18 17.4l1.5-1.4M19.5 20v-4h-4"/></svg>',
  gh: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .3a12 12 0 00-3.79 23.4c.6.1.82-.26.82-.58v-2.17c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 016.02 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0012 .3"/></svg>',
};

// A chip that opens a short menu: who can open the link.
function accessMenu(id: string): string {
  return `<div class="menu-wrap" id="${id}">
  <button type="button" class="chip" aria-haspopup="menu" aria-expanded="false">${I.lock}${I.globe}<span class="v">Private</span>${I.chev}</button>
  <div class="menu" role="menu">
    <button type="button" role="menuitemradio" aria-checked="true" data-pub="0"><span class="ic">${I.lock}</span><b>Private</b>${I.check}<small>Only people you send the link to. The password is part of it.</small></button>
    <button type="button" role="menuitemradio" aria-checked="false" data-pub="1"><span class="ic">${I.globe}</span><b>Public</b>${I.check}<small>Anyone with the URL. You keep a separate link for edits.</small></button>
  </div>
</div>`;
}

// A chip that opens the expiry choices and the renew switch; the script fills
// in the dates and the line under the switch. The switch keeps the menu open.
function daysMenu(id: string, label: string): string {
  const item = (d: number) =>
    `<button type="button" role="menuitemradio" aria-checked="${d === 14}" data-days="${d}"><b>${d} days</b><small></small>${I.check}</button>`;
  const icons = I.clock.replace("<svg ", '<svg class="i-clock" ') + I.refresh.replace("<svg ", '<svg class="i-renew" ');
  return `<div class="menu-wrap" id="${id}">
  <button type="button" class="chip renew" aria-haspopup="menu" aria-expanded="false">${icons}<span class="v">${label}</span>${I.chev}</button>
  <div class="menu days" role="menu">${item(7)}${item(14)}${item(30)}<div class="msep" role="separator"></div><button type="button" class="rn" role="menuitemcheckbox" aria-checked="true" data-renew data-keep><b>Renew when opened</b><span class="sw" aria-hidden="true"></span><small></small></button></div>
</div>`;
}

export function homePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>HTMLDrop: share a page with a link that expires</title>
${FONT_PRELOAD}
<style>${THEME_CSS}
:root{--dot:rgba(18,18,17,.14);--glow:rgba(44,83,232,.16);--win-shadow:0 0 0 1px rgba(18,18,17,.07),0 1px 2px rgba(18,18,17,.05),0 12px 24px -12px rgba(18,18,17,.12),0 40px 80px -32px rgba(18,18,17,.22),0 80px 140px -60px rgba(44,83,232,.28)}
@media(prefers-color-scheme:dark){:root{--dot:rgba(255,255,255,.075);--glow:rgba(127,151,255,.13);--win-shadow:0 0 0 1px rgba(255,255,255,.07),inset 0 1px 0 rgba(255,255,255,.05),0 12px 24px -12px rgba(0,0,0,.6),0 40px 90px -30px rgba(0,0,0,.85),0 80px 160px -60px rgba(127,151,255,.22)}}
body{overflow-x:clip}
.top{display:flex;align-items:center;justify-content:space-between;max-width:68rem;margin:0 auto;padding:1.375rem 1.5rem}
.brand{display:inline-flex;align-items:center;gap:.6rem;font-size:.9375rem;font-weight:650;letter-spacing:-.02em}
.nav{display:flex;align-items:center;gap:1.5rem;font-size:.875rem;color:var(--ink-2)}
.nav a{transition:color var(--t1) var(--ease)}
.nav a:hover{color:var(--ink)}
.nav .gh{display:flex}
.nav .gh svg{width:1.25rem;height:1.25rem}

/* hero: the last word of the promise fades out, the way the link will */
/* The hero, the gap and the window's page area all give way to a short
   viewport, so the whole window, buttons and bottom edge, fits the first
   screen of a laptop (1280x720, 1440x800) and keeps its full size when tall. */
.hero{max-width:52rem;margin:0 auto;padding:clamp(1.25rem,10vh - 3rem,5rem) 1.5rem 0;text-align:center}
.hero h1{font-size:clamp(2.625rem,min(1.4rem + 4.6vw,9vh),4.75rem);font-weight:680;line-height:1;letter-spacing:-.052em}
.hero h1 span{display:block;text-wrap:balance}
.fade{font-style:normal;background:linear-gradient(90deg,var(--ink) 0%,var(--ink) 16%,color-mix(in srgb,var(--ink) 9%,transparent) 97%);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em}
.lede{max-width:31rem;margin:clamp(1rem,3vh,1.5rem) auto 0;font-size:1.125rem;line-height:1.55;color:var(--ink-2);text-wrap:balance}

/* the stage: a browser window. Drop a file into it and it becomes a page. */
.stage{position:relative;max-width:54rem;margin:clamp(2rem,6vh - 1rem,3.25rem) auto 0;padding:0 1.5rem}
.stage::before{content:"";position:absolute;left:50%;top:-6rem;bottom:-5rem;width:100vw;transform:translateX(-50%);z-index:-1;pointer-events:none;
  background:radial-gradient(ellipse 38% 46% at 50% 42%,var(--glow),transparent 72%),radial-gradient(circle,var(--dot) 1px,transparent 1.3px) 0 0/22px 22px;
  -webkit-mask-image:radial-gradient(ellipse 58% 62% at 50% 45%,#000 35%,transparent 78%);mask-image:radial-gradient(ellipse 58% 62% at 50% 45%,#000 35%,transparent 78%)}
.win{position:relative;background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--win-shadow);transition:box-shadow var(--t2) var(--ease),transform var(--t2) var(--ease)}
.win.over{box-shadow:0 0 0 1.5px var(--accent),0 0 0 7px color-mix(in srgb,var(--accent) 16%,transparent),var(--win-shadow);transform:translateY(-2px)}
.win.error{box-shadow:0 0 0 1.5px var(--err),var(--win-shadow);animation:nudge var(--t3) var(--ease)}
.win.busy .view{opacity:.55}
.win.busy .chrome{pointer-events:none}
.chrome{position:relative}
.chrome::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,transparent,var(--accent) 40%,var(--accent) 60%,transparent) 0 0/40% 100% no-repeat;opacity:0;transition:opacity var(--t2) var(--ease)}
.win.busy .chrome::after{opacity:1;animation:load 1.1s var(--ease) infinite}
@keyframes load{from{background-position:-60% 0}to{background-position:160% 0}}
@keyframes nudge{20%{transform:translateX(-4px)}45%{transform:translateX(4px)}70%{transform:translateX(-2px)}}
.chrome{display:flex;align-items:center;gap:.875rem;height:3.25rem;padding:0 .75rem 0 1.125rem;border-bottom:1px solid var(--line);border-radius:var(--r-lg) var(--r-lg) 0 0;background:linear-gradient(var(--surface),var(--sunken))}
.dots{display:flex;gap:.45rem;flex:none}
.dots i{width:.75rem;height:.75rem;border-radius:50%;background:#ff5f57;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.14)}
.dots i:nth-child(2){background:#febc2e}
.dots i:nth-child(3){background:#28c840}
.addr{flex:1;min-width:0;display:flex;align-items:center;gap:.5rem;height:2.125rem;padding:0 .3rem 0 .8rem;background:var(--surface);border:1px solid var(--line);border-radius:999px;box-shadow:inset 0 1px 2px rgba(18,18,17,.04);font-family:var(--mono);font-size:.8125rem;color:var(--ink);transition:border-color var(--t2) var(--ease)}
.addr>svg{flex:none;width:.8125rem;height:.8125rem;stroke:var(--ink-3);stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.win.public .addr>.i-lock{display:none}
.win:not(.public) .addr>.i-globe{display:none}
.lk-url{flex:1;min-width:0;overflow:hidden;white-space:nowrap;letter-spacing:-.01em;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 1.75rem),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 1.75rem),transparent)}
.win.done .lk-url{-webkit-user-select:all;user-select:all}
.lk-url .host{color:var(--ink-3)}
.lk-url .pw{display:inline-block;max-width:14em;overflow:hidden;text-overflow:clip;white-space:nowrap;vertical-align:bottom;color:var(--accent);transition:max-width var(--t3) var(--ease),opacity var(--t2) var(--ease)}
.win.public .lk-url .pw{max-width:0;opacity:0}
.ghost{color:var(--ink-4)}
.caret{display:inline-block;width:1.5px;height:1em;margin-left:1px;vertical-align:-.15em;background:var(--accent);animation:blink 1.1s steps(1) infinite}
.win.done .ghost,.win.done .caret{display:none}
@keyframes blink{50%{opacity:0}}
.addr-copy{display:none;flex:none;place-items:center;width:1.625rem;height:1.625rem;border:0;border-radius:999px;background:none;color:var(--ink-3);cursor:pointer;transition:background-color var(--t1) var(--ease),color var(--t1) var(--ease)}
.addr-copy:hover{background:var(--sunken);color:var(--ink)}
.addr-copy svg{width:.875rem;height:.875rem;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.addr-copy .i-ok,.addr-copy.copied .i-copy{display:none}
.addr-copy.copied .i-ok{display:block}
.addr-copy.copied{color:var(--ok)}
.win.done .addr-copy{display:grid}
.tools{display:flex;gap:.375rem;flex:none}
.view{position:relative;height:clamp(19rem,100vh - 28rem,25rem);border-radius:0 0 var(--r-lg) var(--r-lg);overflow:hidden;transition:opacity var(--t2) var(--ease)}

/* empty page: a sheet waiting to drop in */
.field{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;text-align:center;cursor:pointer;transition:background-color var(--t2) var(--ease)}
.field::before{content:"";position:absolute;inset:.75rem;border:1.5px dashed var(--accent);border-radius:calc(var(--r-lg) - .5rem);opacity:0;pointer-events:none;transition:opacity var(--t2) var(--ease)}
body.dragging .field::before{opacity:.4}
.art{position:relative;width:7.5rem;height:6.75rem;margin-bottom:1.5rem}
.pg{position:absolute;left:50%;top:0;width:4.75rem;height:6rem;margin-left:-2.375rem;padding:.8rem .7rem;background:var(--surface);border:1px solid var(--line);border-radius:.6rem;box-shadow:0 1px 2px rgba(18,18,17,.06),0 10px 20px -10px rgba(18,18,17,.22);transition:transform var(--t3) cubic-bezier(.3,1.4,.5,1)}
.pg i{display:block;height:.3rem;margin-bottom:.4rem;border-radius:.2rem;background:var(--sunken)}
.pg i:first-child{width:60%;height:.45rem;margin-bottom:.6rem;background:var(--line-2)}
.pg i:nth-child(3){width:85%}
.pg i:nth-child(4){width:70%}
.pg i:last-child{width:45%}
.pg.back{transform:translate(-1.6rem,.45rem) rotate(-9deg);opacity:.75}
.pg.mid{transform:translate(1.5rem,.3rem) rotate(7deg);opacity:.9}
.pg.front{transform:translateY(.1rem)}
.drop-badge{position:absolute;left:50%;bottom:-.25rem;display:grid;place-items:center;width:2rem;height:2rem;margin-left:1.2rem;border-radius:999px;background:var(--ink);color:var(--bg);box-shadow:0 0 0 4px var(--surface);transition:transform var(--t3) cubic-bezier(.3,1.4,.5,1),background-color var(--t2) var(--ease)}
.drop-badge svg{width:1rem;height:1rem;stroke:currentColor;stroke-width:2.2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.field-title{display:grid;font-size:1.25rem;font-weight:620;letter-spacing:-.025em}
.field-title span{grid-area:1/1;transition:opacity var(--t2) var(--ease),transform var(--t2) var(--ease)}
.field-title .t-over{opacity:0;transform:translateY(5px);color:var(--accent)}
.field-sub{margin-top:.4rem;font-size:.9375rem;color:var(--ink-3);text-wrap:balance}
.pick-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;margin-top:1.625rem}
.win.over>*{pointer-events:none}
.win.over .field{background:var(--accent-soft)}
.win.over .field::before{opacity:1}
.win.over .pg.back{transform:translate(-2.4rem,-.1rem) rotate(-15deg)}
.win.over .pg.mid{transform:translate(2.3rem,-.2rem) rotate(13deg)}
.win.over .pg.front{transform:translateY(-.6rem) scale(1.04)}
.win.over .drop-badge{background:var(--accent);transform:translateY(.25rem) scale(1.08)}
.win.over .field-title .t-idle{opacity:0;transform:translateY(-5px)}
.win.over .field-title .t-over{opacity:1;transform:none}
.win.done .field{display:none}
input[type=file]{display:none}

/* the page itself, live in the window */
.thumb{position:absolute;inset:0;display:none;background:#fff;cursor:pointer}
.win.done .thumb{display:block;animation:reveal var(--t3) var(--ease)}
.thumb iframe{position:absolute;left:0;top:0;width:1280px;height:800px;border:0;transform-origin:0 0;pointer-events:none;background:#fff}
.thumb::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5rem;background:linear-gradient(transparent,rgba(255,255,255,.9));pointer-events:none}
.thumb-cap{position:absolute;left:50%;bottom:1.25rem;z-index:1;display:inline-flex;align-items:center;gap:.4rem;padding:.5rem .9rem;border-radius:999px;background:rgba(18,18,17,.88);color:#fff;font-size:.8125rem;font-weight:550;transform:translate(-50%,.4rem);opacity:0;transition:opacity var(--t2) var(--ease),transform var(--t2) var(--ease);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.thumb-cap svg{width:.8125rem;height:.8125rem;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.thumb:hover .thumb-cap,.thumb:focus-visible .thumb-cap{opacity:1;transform:translate(-50%,0)}
.thumb-load{position:absolute;inset:0;z-index:2;display:none;align-items:center;justify-content:center;gap:.6rem;background:var(--sunken);color:var(--ink-3);font-size:.875rem}
.thumb-load i{width:1rem;height:1rem;border:1.5px solid var(--line-2);border-top-color:var(--ink-2);border-radius:50%;animation:spin .7s linear infinite}
.thumb.loading .thumb-load{display:flex}
.thumb.plain{display:none}
.win.done .thumb.plain{display:grid;place-items:center;background:var(--sunken);color:var(--ink-3);font-size:.9375rem}
@keyframes reveal{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
.veil{position:absolute;inset:.75rem;z-index:2;display:none;align-items:center;justify-content:center;border:1.5px dashed var(--accent);border-radius:calc(var(--r-lg) - .5rem);background:color-mix(in srgb,var(--accent-soft) 94%,transparent);color:var(--accent);font-size:1.125rem;font-weight:620;letter-spacing:-.02em}
.win.done.over .veil{display:flex}

/* under the window, once there is a link */
.after{display:none;flex-direction:column;align-items:center;gap:1rem;margin-top:1.75rem;text-align:center}
.after.show{display:flex;animation:rise var(--t3) var(--ease)}
.acts{display:flex;flex-wrap:wrap;justify-content:center;gap:.625rem}
.acts .btn{height:2.875rem;padding:0 1.375rem;font-size:.9375rem;border-radius:12px}
#copyBtn{min-width:10rem}
#copyBtn .lbl::after{content:"Copy link"}
#copyBtn.copied .lbl::after{content:"Copied"}
#copyBtn.copied{background:var(--ok);border-color:var(--ok);color:#fff}
.meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.35rem .7rem;font-size:.875rem;color:var(--ink-3)}
.meta b{max-width:16rem;overflow:hidden;font-weight:600;color:var(--ink-2);text-overflow:ellipsis;white-space:nowrap}
.live{width:.5rem;height:.5rem;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 22%,transparent);animation:pulse 2.4s var(--ease) infinite}
@keyframes pulse{50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--ok) 0%,transparent)}}
.meta .sep{color:var(--ink-4)}
.again{display:inline-flex;align-items:center;gap:.3rem;border:0;background:none;color:var(--ink-2);font-weight:550;cursor:pointer;transition:color var(--t1) var(--ease)}
.again:hover{color:var(--ink)}
.again svg{width:.8125rem;height:.8125rem;stroke:currentColor;stroke-width:2.2;fill:none;stroke-linecap:round}
.status{display:inline-flex;align-items:center;gap:.4rem}
.status:empty{display:none}
.status.saving::before{content:"";width:.75rem;height:.75rem;border:1.5px solid var(--line-2);border-top-color:var(--ink-2);border-radius:50%;animation:spin .7s linear infinite}
.status.ok{color:var(--ok)}
@keyframes spin{to{transform:rotate(360deg)}}
.lk-edit{display:none;max-width:30rem;font-size:.8125rem;line-height:1.55;color:var(--ink-3);text-wrap:balance}
.after.public .lk-edit{display:block}
.lk-edit svg{width:.8125rem;height:.8125rem;margin-right:.4rem;vertical-align:-.12em;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.lk-edit span{margin-right:.4rem}
.lk-edit button{border:0;background:none;color:var(--ink);font-weight:600;cursor:pointer;text-decoration:underline;text-decoration-color:var(--line-2);text-underline-offset:3px}
.lk-edit button:hover{text-decoration-color:var(--ink)}
.lk-edit button::after{content:"Copy edit link"}
.lk-edit button.copied{color:var(--ok)}
.lk-edit button.copied::after{content:"Copied"}

/* chips and their menus */
.menu-wrap{position:relative}
.chip{display:inline-flex;align-items:center;gap:.4rem;height:2.125rem;padding:0 .6rem 0 .7rem;border:1px solid var(--line);border-radius:999px;background:var(--surface);font-size:.8125rem;font-weight:560;letter-spacing:-.005em;white-space:nowrap;cursor:pointer;transition:background-color var(--t1) var(--ease),border-color var(--t1) var(--ease),color var(--t1) var(--ease)}
.chip:hover,.chip[aria-expanded="true"]{background:var(--sunken);border-color:var(--line-2)}
.chip svg{width:.875rem;height:.875rem;flex:none;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round}
.chip .chev{width:.75rem;height:.75rem;margin-left:-.1rem;color:var(--ink-3)}
.chip .i-globe,.chip.pub .i-lock{display:none}
.chip.pub .i-globe{display:inline}
.chip.pub{color:var(--pub);background:var(--pub-soft);border-color:var(--pub-line)}
.chip.pub .chev{color:currentColor;opacity:.7}
.menu{position:absolute;top:calc(100% + .45rem);right:0;z-index:30;width:min(20rem,calc(100vw - 2.5rem));padding:.375rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-lg);text-align:left;opacity:0;visibility:hidden;transform:translateY(-4px) scale(.985);transform-origin:top right;transition:opacity var(--t1) var(--ease),transform var(--t1) var(--ease),visibility 0s linear var(--t1)}
.menu.open{opacity:1;visibility:visible;transform:none;transition-delay:0s}
.menu button{display:grid;grid-template-columns:1.125rem 1fr 1rem;align-items:center;gap:.125rem .7rem;width:100%;padding:.625rem .7rem;border:0;border-radius:var(--r-s);background:none;color:var(--ink);font-family:var(--sans);text-align:left;cursor:pointer}
.menu button:hover,.menu button:focus-visible{background:var(--sunken);outline:none}
.menu .ic{display:flex;color:var(--ink-2)}
.menu .ic svg{width:1rem;height:1rem;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round}
.menu b{font-size:.875rem;font-weight:600;letter-spacing:-.01em}
.menu small{grid-column:2;font-size:.8125rem;line-height:1.4;color:var(--ink-3)}
.menu .ck{grid-column:3;grid-row:1;width:1rem;height:1rem;stroke:var(--accent);stroke-width:2.2;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.menu [aria-checked="true"] .ck{opacity:1}
.menu.days{width:min(17rem,calc(100vw - 2.5rem))}
.menu.days button{grid-template-columns:1fr auto 1rem}
.menu.days small{grid-column:2;grid-row:1;justify-self:end;font-variant-numeric:tabular-nums}
.msep{height:1px;margin:.375rem .35rem;background:var(--line)}
.menu.days .rn{grid-template-columns:1fr auto;gap:.2rem .7rem}
.menu.days .rn small{grid-column:1;grid-row:2;justify-self:start;font-variant-numeric:normal}
.sw{grid-column:2;grid-row:1/span 2;position:relative;width:1.875rem;height:1.125rem;border-radius:999px;background:var(--line-2);transition:background-color var(--t1) var(--ease)}
.sw::after{content:"";position:absolute;top:.1875rem;left:.1875rem;width:.75rem;height:.75rem;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform var(--t1) var(--ease)}
.rn[aria-checked="true"] .sw{background:var(--accent)}
.rn[aria-checked="true"] .sw::after{transform:translateX(.75rem)}
.chip .i-renew,.chip.renew .i-clock{display:none}
.chip.renew .i-renew{display:inline}
.chip.renew{border-color:var(--accent-line)}
.chip.renew:hover,.chip.renew[aria-expanded="true"]{border-color:var(--accent)}

/* notes under the window */
.notes{display:flex;flex-direction:column;align-items:center;gap:.4rem;margin-top:1rem}
.progress,.error-msg,.md-error,.inline-info,.warn-info{display:none;align-items:center;gap:.55rem;font-size:.875rem;line-height:1.45;color:var(--ink-2);text-align:center}
.progress.show,.error-msg.show,.md-error.show,.inline-info.show,.warn-info.show{display:flex;animation:rise var(--t2) var(--ease)}
.progress::before{content:"";flex:none;width:.875rem;height:.875rem;border:1.5px solid var(--line-2);border-top-color:var(--ink);border-radius:50%;animation:spin .7s linear infinite}
.error-msg{color:var(--err)}
.md-error,.warn-info{color:var(--warn)}
.file-picker{display:none;flex-wrap:wrap;align-items:center;justify-content:center;gap:.625rem;max-width:32rem;margin:1rem auto 0;padding:1rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.file-picker.show{display:flex;animation:rise var(--t2) var(--ease)}
.picker-label{width:100%;font-size:.875rem;color:var(--ink-2);text-align:center}
#fileSelect{flex:1;min-width:12rem;height:2.5rem;padding:0 .75rem;background:var(--sunken);border:1px solid var(--line);border-radius:var(--r-s);font-family:var(--mono);font-size:.8125rem}

/* for agents: one line under the window opens the prompt in place. It takes
   its access and expiry from the window's chips, so there is one set. */
.sec{max-width:54rem;margin:0 auto;padding:0 1.5rem}
.ask{display:flex;flex-direction:column;align-items:center;margin-top:1.75rem;scroll-margin-top:2rem}
.ask-btn{display:inline-flex;align-items:center;gap:.5rem;height:2.375rem;padding:0 .8rem 0 .85rem;border:1px solid var(--line);border-radius:999px;background:var(--surface);box-shadow:var(--shadow-sm);color:var(--ink-2);font-size:.875rem;cursor:pointer;transition:border-color var(--t1) var(--ease),background-color var(--t1) var(--ease)}
.ask-btn:hover{border-color:var(--line-2);background:var(--sunken)}
.ask-btn b{font-weight:600;color:var(--ink);white-space:nowrap}
.ask-btn .q-short{display:none}
.ask-btn svg{width:.9rem;height:.9rem;flex:none;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.ask-btn .chev{color:var(--ink-3);transition:transform var(--t2) var(--ease)}
.ask.open .ask-btn .chev{transform:rotate(180deg)}
.ask-panel{display:grid;grid-template-rows:0fr;width:100%;transition:grid-template-rows var(--t3) var(--ease)}
.ask.open .ask-panel{grid-template-rows:1fr}
.ask-inner{min-height:0;overflow:hidden;margin:0 -1.5rem;padding:0 1.5rem;opacity:0;transition:opacity var(--t2) var(--ease)}
.ask.open .ask-inner{opacity:1}
.ask.settled .ask-inner{overflow:visible}
.ask .term{margin-top:1rem}
/* the terminal follows the theme, a sibling of the browser window above */
.term{color:var(--ink);background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--win-shadow)}
.term-bar{display:flex;align-items:center;gap:.875rem;height:2.75rem;padding:0 1rem;border-bottom:1px solid var(--line);border-radius:var(--r-lg) var(--r-lg) 0 0;background:linear-gradient(var(--surface),var(--sunken))}
.term-title{font-family:var(--mono);font-size:.75rem;color:var(--ink-3)}
.term-body{padding:1.25rem 1.375rem .5rem;font-family:var(--mono);font-size:.875rem;line-height:1.75}
.term-body .t::before{content:"\\203A";margin-right:.6rem;color:var(--accent);font-weight:600}
#agOpts{color:var(--pub)}
.term-note{font-size:.8125rem;color:var(--ink-3)}
.term-body .dim{margin-top:.75rem;padding-left:1.15rem;color:var(--ink-3);font-size:.8125rem}
.term-body .dim code{display:block;margin-top:.15rem;color:var(--ink-2)}
.nw{white-space:nowrap}
.term-foot{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;padding:.75rem .75rem .75rem 1.375rem}
.term-foot .btn{margin-left:auto;height:2.375rem}
.term-foot .btn.copied{background:var(--ok);border-color:var(--ok);color:#fff}
#agCopy .lbl::after{content:"Copy prompt"}
#agCopy.copied .lbl::after{content:"Copied"}

/* what happens to the file */
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-top:7rem}
.fact{padding:1.375rem 1.375rem 1.5rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-sm)}
.fact .ft{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:10px;background:var(--sunken);color:var(--ink)}
.fact .ft svg{width:1.0625rem;height:1.0625rem;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round}
.fact h3{margin-top:1rem;font-size:1rem;font-weight:620;letter-spacing:-.02em}
.fact p{margin-top:.35rem;font-size:.875rem;line-height:1.55;color:var(--ink-3);text-wrap:pretty}
.foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.75rem 1.5rem;max-width:54rem;margin:5rem auto 0;padding:1.75rem 1.5rem 3rem;border-top:1px solid var(--line);font-size:.8125rem;color:var(--ink-3)}
.foot nav{display:flex;gap:1.25rem}
.foot a{transition:color var(--t1) var(--ease)}
.foot a:hover{color:var(--ink)}

@media(max-width:760px){
  .facts{grid-template-columns:minmax(0,1fr);margin-top:4.5rem}
}
@media(max-width:560px){
  body{font-size:14.5px}
  .top{padding:1.125rem 1rem}
  .nav{gap:1.1rem}
  .hero{padding:2.25rem 1rem 0}
  .lede{font-size:1rem;margin-top:1.125rem}
  .stage{margin-top:2.25rem;padding:0 .875rem}
  .chrome{flex-wrap:wrap;height:auto;gap:.5rem;padding:.625rem}
  .dots{display:none}
  .addr{flex-basis:100%}
  .tools{position:relative;width:100%}
  .tools .menu-wrap{position:static}
  .tools .menu{left:0;right:auto;transform-origin:top left}
  .view{height:21rem}
  .art{transform:scale(.88);margin-bottom:1rem}
  .acts{width:100%}
  .acts .btn{flex:1}
  .sec{padding:0 1rem}
  .term-body{padding:1rem 1rem .25rem;font-size:.8125rem}
  .term-foot{padding:.875rem}
  .ask-btn .q-long{display:none}
  .ask-btn .q-short{display:inline}
  .term-foot .btn{width:100%;margin-left:0}
  .foot{padding:1.5rem 1rem 2.5rem;margin-top:3.5rem}
  .facts{gap:.625rem}
  .fact{display:grid;grid-template-columns:2.25rem minmax(0,1fr);column-gap:.875rem;padding:1rem}
  .fact .ft{grid-row:span 2}
  .fact h3{margin-top:.1rem}
  .fact p{grid-column:2}
}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="/">${MARK_SVG}HTMLDrop</a>
  <nav class="nav"><a class="gh" href="https://github.com/OrdoAI/htmldrop" title="Source on GitHub" aria-label="Source on GitHub">${I.gh}</a></nav>
</header>

<main>
  <section class="hero">
    <h1><span>Drop a file.</span><span>Get a link that <em class="fade">expires.</em></span></h1>
    <p class="lede">Private and encrypted. Gone after 14 days without a visit.</p>
  </section>

  <section class="stage" aria-label="Upload">
    <div class="win" id="dropZone">
      <div class="chrome">
        <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <div class="addr">
          ${I.lock}${I.globe}
          <p class="lk-url" id="lkUrl" aria-label="Link"><span class="host" id="lkHost">baseurl.ai/</span><span id="lkId"></span><span class="pw" id="lkPw" title="The password. It travels in the link."></span><span class="ghost">your-page</span><i class="caret" aria-hidden="true"></i></p>
          <button type="button" class="addr-copy" id="addrCopy" title="Copy link" aria-label="Copy link">${I.copy}</button>
        </div>
        <div class="tools" id="tray">
          ${accessMenu("accessMenu")}
          ${daysMenu("daysMenu", "14 days")}
        </div>
      </div>
      <div class="view">
        <div class="field" id="dropField">
          <div class="art" aria-hidden="true">
            <span class="pg back"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="pg mid"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="pg front"><i></i><i></i><i></i><i></i><i></i></span>
            <span class="drop-badge">${I.down}</span>
          </div>
          <p class="field-title"><span class="t-idle">Drop an HTML or Markdown file</span><span class="t-over" aria-hidden="true">Release to upload</span></p>
          <p class="field-sub">Or a whole folder, so its local images come along.</p>
          <div class="pick-btns">
            <button type="button" class="btn" id="pickFile">Choose file</button>
            <button type="button" class="btn secondary" id="pickFolder">Choose folder</button>
          </div>
        </div>
        <a class="thumb" id="thumb" href="#" target="_blank" rel="noopener" aria-label="Open the page"><span class="thumb-load"><i></i>Loading your page&hellip;</span><span class="thumb-cap">Open page${I.out}</span></a>
        <div class="thumb plain" id="thumbPlain">Too large to preview here. Open it to see it.</div>
        <div class="veil" aria-hidden="true">Release to make a new link</div>
      </div>
    </div>
    <input type="file" id="fileInput" multiple>
    <input type="file" id="folderInput" webkitdirectory multiple>

    <div class="after" id="result" aria-live="polite">
      <div class="acts">
        <button type="button" class="btn" id="copyBtn">${I.copy}<span class="lbl"></span></button>
        <a class="btn secondary" id="openBtn" href="#" target="_blank" rel="noopener">Open${I.out}</a>
      </div>
      <p class="meta"><i class="live" aria-hidden="true"></i><b id="resName"></b><span>is live</span><span class="status" id="settingStatus"></span><span class="sep">&middot;</span><button type="button" class="again" id="againBtn">${I.plus}New upload</button></p>
      <p class="lk-edit" id="editBox">${I.key}<span>Your edit link keeps the password, so only you can update this page.</span><button type="button" id="editCopyBtn"></button></p>
    </div>
    <div class="file-picker" id="filePicker">
      <p class="picker-label">This folder has several pages. Which one should the link open?</p>
      <select id="fileSelect" aria-label="Choose the main file"></select>
      <button type="button" class="btn" id="filePickConfirm">Upload this one</button>
    </div>
    <div class="notes">
      <div class="progress" id="progress" role="status" aria-live="polite">Processing&hellip;</div>
      <div class="error-msg" id="errorMsg" role="alert"></div>
      <div class="md-error" id="mdError">The Markdown renderer did not load. HTML uploads still work.</div>
      <div class="inline-info" id="inlineInfo"></div>
      <div class="warn-info" id="warnInfo"></div>
    </div>

    <div class="ask" id="agents">
      <button type="button" class="ask-btn" id="askBtn" aria-expanded="false" aria-controls="askPanel">${I.term}<span class="q-long">Using Claude Code, Cursor or Codex?</span><span class="q-short">Using an agent?</span><b>Copy a prompt</b>${I.chev}</button>
      <div class="ask-panel" id="askPanel" inert>
        <div class="ask-inner">
          <div class="term">
            <div class="term-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="term-title">your agent</span></div>
            <div class="term-body">
              <p class="t">Use the HTMLDrop skill to publish this and send me the link.<span id="agOpts"></span></p>
              <p class="dim">If the skill is missing, install it first:<code>npx -y skills add OrdoAI/htmldrop <span class="nw">--skill htmldrop</span> -g -y</code></p>
            </div>
            <div class="term-foot">
              <span class="term-note">Uses the access and expiry set above.</span>
              <button type="button" class="btn" id="agCopy">${I.copy}<span class="lbl"></span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>


  <section class="sec facts" aria-label="How it works">
    <div class="fact"><span class="ft">${I.lock}</span><h3>Private by default</h3><p>The password lives in the link, and the page is encrypted with it. Nothing readable sits on the server.</p></div>
    <div class="fact"><span class="ft">${I.clock}</span><h3>Gone when unused</h3><p>A page is deleted once nobody opens it for 7, 14 or 30 days, or on a fixed date if you prefer. You can change that while the link is live.</p></div>
    <div class="fact"><span class="ft">${I.refresh}</span><h3>Update in place</h3><p>Upload a new version to the same link. Anyone with it open is offered a refresh.</p></div>
  </section>
</main>

<footer class="foot">
  <span>HTMLDrop</span>
  <nav><a href="https://github.com/OrdoAI/htmldrop/blob/main/skills/htmldrop/SKILL.md">Skill reference</a><a href="https://github.com/OrdoAI/htmldrop">Source</a></nav>
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

  // Page-level drag handling: a global "something is being dragged" affordance,
  // and no browser navigation when a file is dropped outside the card. dragenter
  // must be cancelled too: when the element under the pointer changes, Chrome
  // fires only dragenter and decides from it whether the page takes the drop, so
  // a release right after crossing an element would open the file in a new tab.
  function hasFiles(e){var t=e.dataTransfer&&e.dataTransfer.types;return !!t&&Array.prototype.indexOf.call(t,'Files')!==-1;}
  var dragDepth=0;
  document.addEventListener('dragenter',function(e){if(!hasFiles(e))return;e.preventDefault();dragDepth++;document.body.classList.add('dragging');});
  document.addEventListener('dragleave',function(e){if(!hasFiles(e))return;if(--dragDepth<=0){dragDepth=0;document.body.classList.remove('dragging');}});
  document.addEventListener('dragover',function(e){if(hasFiles(e))e.preventDefault();});
  document.addEventListener('drop',function(e){if(hasFiles(e))e.preventDefault();dragDepth=0;document.body.classList.remove('dragging');});
  function flash(btn){btn.classList.add('copied');clearTimeout(btn._t);btn._t=setTimeout(function(){btn.classList.remove('copied');},1500);}

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
  var MAX=50*1024*1024;
  var dz=document.getElementById('dropZone'),fi=document.getElementById('fileInput'),fo=document.getElementById('folderInput');
  var pf=document.getElementById('pickFile'),pfr=document.getElementById('pickFolder');
  var prog=document.getElementById('progress'),err=document.getElementById('errorMsg');
  var ilInfo=document.getElementById('inlineInfo'),wInfo=document.getElementById('warnInfo');
  var res=document.getElementById('result'),cb=document.getElementById('copyBtn');
  var fp=document.getElementById('filePicker'),fsel=document.getElementById('fileSelect'),fpc=document.getElementById('filePickConfirm');
  var pending=null;
  document.getElementById('lkHost').textContent=location.host+'/';

  pf.addEventListener('click',function(e){e.stopPropagation();fi.click();});
  pfr.addEventListener('click',function(e){e.stopPropagation();fo.click();});
  document.getElementById('dropField').addEventListener('click',function(e){if(!e.target.closest('button'))fi.click();});
  dz.addEventListener('dragenter',function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over');});
  // Moving between the window's own children is not leaving it; dropping .over there
  // flips pointer-events on the children and the drag target with it.
  dz.addEventListener('dragleave',function(e){if(!dz.contains(e.relatedTarget))dz.classList.remove('over');});
  dz.addEventListener('drop',async function(e){e.preventDefault();dz.classList.remove('over');var f=await collectDrop(e.dataTransfer);if(f.length)handleFiles(f);});
  fi.addEventListener('change',function(){if(fi.files.length)handleFiles(Array.from(fi.files));fi.value='';});
  fo.addEventListener('change',function(){if(fo.files.length)handleFiles(Array.from(fo.files));fo.value='';});
  // A blocked clipboard falls back to selecting the link, ready for Cmd/Ctrl+C.
  function selectText(el){var rg=document.createRange();rg.selectNodeContents(el);var sel=getSelection();sel.removeAllRanges();sel.addRange(rg);}
  function copyText(text,btn,fallback){
    var fail=function(){if(fallback)selectText(fallback);else showErr('The browser blocked the clipboard. Copy it from here: '+text);};
    if(!navigator.clipboard)return fail();
    navigator.clipboard.writeText(text).then(function(){flash(btn);},fail);
  }
  cb.addEventListener('click',function(){if(link)copyText(link.share,cb,document.getElementById('lkUrl'));});
  var addrCopy=document.getElementById('addrCopy');
  addrCopy.addEventListener('click',function(){if(link)copyText(link.share,addrCopy,document.getElementById('lkUrl'));});
  fpc.addEventListener('click',function(){if(!pending)return;fp.classList.remove('show');processMain(pending.candidates[parseInt(fsel.value)],pending.all);pending=null;});

  function showErr(m){err.textContent=m;err.classList.add('show');dz.classList.add('error');setTimeout(function(){dz.classList.remove('error');},2000);}

  async function handleFiles(files){
    err.classList.remove('show');ilInfo.classList.remove('show');wInfo.classList.remove('show');fp.classList.remove('show');
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
    if(rels.length>0&&assets.length===0){prog.classList.remove('show');wInfo.textContent='Found '+rels.length+' local asset(s). Use "Choose folder" to auto-inline them.';wInfo.classList.add('show');}
    if(assets.length>0){
      prog.textContent='Inlining assets\\u2026';
      try{var r=await inlineAssets(text,assets,main);text=r.html;if(r.inlined>0||r.missing.length>0){ilInfo.textContent=r.inlined+' inlined'+(r.missing.length?', '+r.missing.length+' not found':'');ilInfo.classList.add('show');}}
      catch(e){prog.classList.remove('show');showErr('Inlining failed: '+e.message);return;}
    }
    if(new Blob([text]).size>MAX){prog.classList.remove('show');showErr('Too large after inlining (max 50 MB)');return;}
    upload(text,main.name);
  }
  // Menus: a chip that opens a short list of choices.
  var openMenu=null;
  function closeMenu(){if(!openMenu)return;openMenu.menu.classList.remove('open');openMenu.chip.setAttribute('aria-expanded','false');openMenu=null;}
  function initMenu(wrap,onPick){
    var chip=wrap.querySelector('.chip'),menu=wrap.querySelector('.menu');
    chip.addEventListener('click',function(e){
      e.stopPropagation();var mine=openMenu&&openMenu.menu===menu;closeMenu();if(mine)return;
      menu.classList.add('open');chip.setAttribute('aria-expanded','true');openMenu={chip:chip,menu:menu};
      // Keyboard users land on the current choice; a mouse click leaves focus alone.
      if(!e.detail)(menu.querySelector('[aria-checked="true"]')||menu.querySelector('button')).focus();
    });
    menu.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();if(!b.hasAttribute('data-keep')){closeMenu();if(!e.detail)chip.focus();}onPick(b);});});
    menu.addEventListener('keydown',function(e){
      var items=Array.prototype.slice.call(menu.querySelectorAll('button')),i=items.indexOf(document.activeElement);
      if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus();}
      else if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length].focus();}
    });
  }
  document.addEventListener('click',function(e){if(openMenu&&!openMenu.menu.contains(e.target))closeMenu();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&openMenu){var c=openMenu.chip;closeMenu();c.focus();}});

  var DAY=86400000;
  function fmtDate(t){var d=new Date(t),o={month:'short',day:'numeric'};if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';return d.toLocaleDateString(undefined,o);}
  function renderAccess(wrap,pub){
    var chip=wrap.querySelector('.chip');chip.classList.toggle('pub',pub);chip.querySelector('.v').textContent=pub?'Public':'Private';
    wrap.querySelectorAll('.menu button').forEach(function(b){b.setAttribute('aria-checked',String((b.dataset.pub==='1')===pub));});
  }
  function renderDays(wrap,days,renew,label,tip){
    var now=Date.now(),chip=wrap.querySelector('.chip'),rn=wrap.querySelector('.rn');
    wrap.querySelectorAll('.menu [data-days]').forEach(function(b){var d=Number(b.dataset.days);b.setAttribute('aria-checked',String(d===days));b.querySelector('small').textContent=fmtDate(now+d*DAY);});
    rn.setAttribute('aria-checked',String(renew));rn.querySelector('small').textContent=renew?'Each visit restarts the '+days+' days.':'Deleted on the date above.';
    chip.classList.toggle('renew',renew);chip.querySelector('.v').textContent=label;
    if(tip)chip.title=tip;else chip.removeAttribute('title');
  }

  // The chips shape the next link; once a link is in the window they edit it.
  var opts={public:false,days:14,renew:true},link=null,statusTimer=0,pwTimer=0;
  var accessWrap=document.getElementById('accessMenu'),daysWrap=document.getElementById('daysMenu'),statusEl=document.getElementById('settingStatus');
  function renderTray(){
    renderPrompt();
    renderAccess(accessWrap,opts.public);
    var label=opts.days+' days',tip='';
    if(link&&!link.expiresAt)label='Never expires';
    else if(link&&link.renew){label=opts.days+' days after last visit';tip='If nobody opens it, deleted on '+fmtDate(link.expiresAt)+'.'+(link.renewUntil?' Kept at most until '+fmtDate(link.renewUntil)+'.':'');}
    else if(link)label='Expires '+fmtDate(link.expiresAt);
    renderDays(daysWrap,opts.days,opts.renew,label,tip);
  }
  function status(text,kind){clearTimeout(statusTimer);statusEl.className='status'+(kind?' '+kind:'');statusEl.textContent=text||'';}
  initMenu(accessWrap,function(b){var pub=b.dataset.pub==='1',was=opts.public;if(pub===was)return;opts.public=pub;renderTray();if(link)saveSettings({public:pub},function(){opts.public=was;});});
  initMenu(daysWrap,function(b){
    if(b.hasAttribute('data-renew')){var on=opts.renew;opts.renew=!on;renderTray();if(link)saveSettings({renewOnView:!on},function(){opts.renew=on;});return;}
    var d=Number(b.dataset.days),was=opts.days;if(d===was)return;opts.days=d;renderTray();if(link)saveSettings({expiresInDays:d},function(){opts.days=was;});
  });
  renderTray();

  // The page itself, live in the window: the real preview, scripts and all,
  // which only this site may frame and which runs sandboxed. Scaled down from
  // a desktop width; a very large page gets a note instead of a second download.
  var thumb=document.getElementById('thumb'),thumbPlain=document.getElementById('thumbPlain'),PREVIEW_MAX=8*1024*1024;
  // A desktop-width render on a wide window, the page's own phone layout on a narrow one.
  function fitThumb(){
    var f=thumb.querySelector('iframe');if(!f||!thumb.clientWidth)return;
    var w=thumb.clientWidth<560?420:1280,k=thumb.clientWidth/w;
    f.style.width=w+'px';f.style.height=Math.ceil(thumb.clientHeight/k)+'px';f.style.transform='scale('+k+')';
  }
  if('ResizeObserver' in window)new ResizeObserver(fitThumb).observe(thumb);
  function showPreview(url,bytes){
    var old=thumb.querySelector('iframe');if(old)old.remove();
    var big=bytes>PREVIEW_MAX;
    thumb.style.display=big?'none':'';thumbPlain.style.display=big?'':'none';
    if(big)return;
    var f=document.createElement('iframe');
    f.setAttribute('tabindex','-1');f.setAttribute('aria-hidden','true');f.setAttribute('referrerpolicy','no-referrer');f.setAttribute('scrolling','no');
    thumb.classList.add('loading');f.addEventListener('load',function(){thumb.classList.remove('loading');});
    f.src=url;thumb.insertBefore(f,thumb.firstChild);fitThumb();
  }

  var reduceMotion=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches),typeTimer=0;
  // Writes the id and password into the address bar a few characters at a time.
  function typeLink(idEl,pwEl,id,pw){
    clearInterval(typeTimer);
    if(reduceMotion){idEl.textContent=id;pwEl.textContent=pw;return;}
    var full=id+pw,n=0;idEl.textContent='';pwEl.textContent='';
    typeTimer=setInterval(function(){
      n=Math.min(full.length,n+2);
      idEl.textContent=full.slice(0,Math.min(n,id.length));pwEl.textContent=n>id.length?full.slice(id.length,n):'';
      if(n>=full.length)clearInterval(typeTimer);
    },28);
  }
  function showLink(d,name,html){
    var isPub=!!(d.public&&d.publicUrl),u=new URL(d.url);
    link={id:d.id,url:d.url,share:isPub?d.publicUrl:d.url,password:d.password,expiresAt:d.expiresAt,renew:!!d.renewOnView,renewUntil:d.renewUntil||null};
    opts.public=isPub;if(typeof d.renewOnView==='boolean')opts.renew=d.renewOnView;
    if(name)document.getElementById('resName').textContent=name;
    if(html!==undefined)showPreview(d.url,html.length);
    document.getElementById('lkHost').textContent=u.host+'/';
    var fresh=html!==undefined;
    if(!fresh)document.getElementById('lkId').textContent=d.id;
    document.getElementById('openBtn').href=link.share;thumb.href=link.share;
    // The password collapses out of the shared link when it goes public, and
    // its text is then removed, so selecting the visible link never copies it.
    var pw=document.getElementById('lkPw');clearTimeout(pwTimer);
    if(isPub){
      var animate=dz.classList.contains('done')&&!dz.classList.contains('public');
      dz.classList.add('public');res.classList.add('public');
      if(animate)pwTimer=setTimeout(function(){pw.textContent='';},460);else pw.textContent='';
    }else if(fresh){
      dz.classList.remove('public');res.classList.remove('public');
    }else{
      pw.textContent='?p='+d.password;void pw.offsetWidth;dz.classList.remove('public');res.classList.remove('public');
    }
    if(fresh)typeLink(document.getElementById('lkId'),pw,d.id,isPub?'':'?p='+d.password);
    dz.classList.add('done');res.classList.add('show');
    // On a laptop screen Copy link and Open sit just under the fold; bring them up.
    if(fresh)res.scrollIntoView({behavior:'smooth',block:'nearest'});
    renderTray();
  }
  function saveSettings(change,revert){
    var body={id:link.id,password:link.password};for(var k in change)body[k]=change[k];
    err.classList.remove('show');status('Saving\\u2026','saving');
    fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t);});return r.json();})
    .then(function(d){showLink(d,'');status('Saved','ok');statusTimer=setTimeout(function(){status('');},2200);})
    .catch(function(e){revert();renderTray();status('');showErr(e.message||'Saving failed');});
  }
  document.getElementById('againBtn').addEventListener('click',function(){
    link=null;clearInterval(typeTimer);dz.classList.remove('done','public');res.classList.remove('show','public');
    document.getElementById('lkId').textContent='';document.getElementById('lkPw').textContent='';document.getElementById('lkHost').textContent=location.host+'/';
    var f=thumb.querySelector('iframe');if(f)f.remove();
    err.classList.remove('show');ilInfo.classList.remove('show');wInfo.classList.remove('show');status('');renderTray();
    dz.scrollIntoView({behavior:'smooth',block:'center'});
  });

  // For agents: the prompt the window's chips would produce, opened in place.
  var INSTALL='npx -y skills add OrdoAI/htmldrop --skill htmldrop -g -y';
  var agCopy=document.getElementById('agCopy');
  function agSentences(){return (opts.public?' Make it public.':'')+(opts.days!==14?' Keep it for '+opts.days+' days.':'')+(opts.renew?'':" Don't renew it on visits.");}
  function agText(){return 'Use the HTMLDrop skill to publish this and send me the link.'+agSentences()+' If the skill is missing, install it first: '+INSTALL;}
  function renderPrompt(){var el=document.getElementById('agOpts');if(el)el.textContent=agSentences();}
  agCopy.addEventListener('click',function(){copyText(agText(),agCopy,null);});
  var ask=document.getElementById('agents'),askBtn=document.getElementById('askBtn'),askPanel=document.getElementById('askPanel'),askTimer=0;
  function setAsk(open,focus){
    clearTimeout(askTimer);ask.classList.remove('settled');
    ask.classList.toggle('open',open);askBtn.setAttribute('aria-expanded',String(open));
    if(open){askPanel.removeAttribute('inert');askTimer=setTimeout(function(){ask.classList.add('settled');if(focus)agCopy.focus();},420);}
    else askPanel.setAttribute('inert','');
  }
  askBtn.addEventListener('click',function(){setAsk(!ask.classList.contains('open'),true);});
  // Old links to #agents land on the prompt, open.
  if(location.hash==='#agents')setAsk(true,false);

  var ecb=document.getElementById('editCopyBtn');
  ecb.addEventListener('click',function(){if(link)copyText(link.url,ecb,null);});

  function upload(html,fn){
    prog.textContent='Uploading\\u2026';prog.classList.add('show');dz.classList.add('busy');
    var page=new Blob([html]);
    var meta={filename:fn,bytes:page.size,expiresInDays:opts.days,renewOnView:opts.renew};if(opts.public)meta.public=true;
    fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/x-htmldrop-upload'},body:new Blob([JSON.stringify(meta)+'\\n',page])})
    .then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t);});return r.json();})
    .then(function(d){showLink(d,fn,html);status('');})
    .catch(function(e){showErr(e.message||'Upload failed');})
    .finally(function(){prog.classList.remove('show');dz.classList.remove('busy');});
  }
})();
</script>
</body>
</html>`;
}
