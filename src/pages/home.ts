export function homePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HTMLDrop</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#171717;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:clamp(3rem,15vh,10rem) 1.5rem 2rem}
h1{font-size:1.25rem;font-weight:600;color:#171717;text-align:center;letter-spacing:-.02em}
.sub{max-width:32rem;margin-top:.5rem;font-size:.9375rem;line-height:1.5;color:#888;text-align:center;text-wrap:balance}
.tabs{display:flex;align-items:center;margin:2rem 0 1.5rem}
.tab{background:none;border:none;padding:.4rem 0;font-size:1rem;color:#888;cursor:pointer;font-family:inherit;font-weight:500;transition:color .15s}
.tab:hover{color:#4d4d4d}
.tab.active{color:#171717;font-weight:650}
.tab-div{width:1px;height:1rem;background:#ddd;margin:0 1.35rem}
.panel{display:none;width:100%;max-width:40rem;flex-direction:column;align-items:center}
.panel.active{display:flex}
.drop-zone{width:100%;border:1px solid #ebebeb;border-radius:24px;padding:3.5rem 2rem 2.5rem;text-align:center;cursor:pointer;transition:all .2s;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.035)}
.drop-zone:hover{border-color:#ccc}
.drop-zone.over{border-style:dashed;border-color:#171717;background:#f7f7f7}
.drop-zone.error{border-color:#ee0000;background:#fef2f2}
.drop-zone strong{color:#171717;font-size:1.125rem;font-weight:600}
.drop-zone p{color:#888;font-size:.875rem;margin-top:.65rem;line-height:1.5;text-wrap:balance}
.pick-btns{display:flex;gap:.75rem;justify-content:center;margin-top:1.5rem}
.pick-btn{color:#171717;background:#fff;border:1px solid #ebebeb;border-radius:100px;padding:.5rem 1.25rem;font-size:.875rem;cursor:pointer;transition:all .15s;font-family:inherit;font-weight:500}
.pick-btn:hover{border-color:#888;background:#fafafa}
#pickFile{background:#171717;color:#fff;border-color:#171717}
#pickFile:hover{background:#333}
#filePickConfirm{background:#171717;color:#fff;border-color:#171717}
#filePickConfirm:hover{background:#333}
input[type=file]{display:none}
.result{width:100%;max-width:34rem;margin-top:1.5rem;display:none}
.result.show{display:flex;flex-direction:column;align-items:center}
.link-box{display:flex;gap:.5rem;align-items:center;background:#fff;border:1px solid #ebebeb;border-radius:100px;padding:.75rem 1.25rem;width:100%;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.link-box input{flex:1;background:none;border:none;color:#171717;font-size:.8125rem;font-family:ui-monospace,SFMono-Regular,'SF Mono',Consolas,monospace;outline:none;min-width:0}
.meta{color:#888;font-size:.75rem;margin-top:.65rem}
.progress{display:none;color:#888;font-size:.875rem;margin-top:1rem}
.progress.show{display:block}
.error-msg{color:#ee0000;font-size:.875rem;margin-top:1rem;display:none;text-align:center}
.error-msg.show{display:block}
.md-error,.inline-info,.warn-info{font-size:.875rem;margin-top:.75rem;display:none;text-align:center}
.md-error.show,.inline-info.show,.warn-info.show{display:block}
.md-error{color:#ab570a}
.inline-info{color:#4d4d4d}
.warn-info{color:#ab570a}
.file-picker{display:none;width:100%;margin-top:1rem;background:#fff;border:1px solid #ebebeb;border-radius:16px;padding:1.25rem;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.file-picker.show{display:block}
.picker-label{color:#888;font-size:.875rem;margin-bottom:.75rem}
#fileSelect{width:100%;background:#fafafa;color:#171717;border:1px solid #ebebeb;border-radius:8px;padding:.5rem .75rem;font-size:.8125rem;font-family:ui-monospace,SFMono-Regular,'SF Mono',Consolas,monospace;margin-bottom:.75rem}
.agent-section{width:100%;display:flex;justify-content:center}
.agent-cmd{max-width:calc(100vw - 3rem);background:#fff;border:1px solid #ebebeb;border-radius:100px;padding:0 1.5rem;min-height:3.5rem;display:inline-flex;align-items:center;gap:.875rem;font-family:ui-monospace,SFMono-Regular,'SF Mono',Consolas,monospace;font-size:.9375rem;color:#171717;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.04);overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.agent-cmd::-webkit-scrollbar{display:none}
.agent-cmd code{white-space:nowrap;line-height:1}
.agent-cmd .dim{color:#888;flex-shrink:0}
.copy-btn{background:none;border:none;cursor:pointer;color:#ccc;padding:.25rem;transition:color .15s;display:flex;flex-shrink:0}
.copy-btn:hover{color:#4d4d4d}
.copy-btn.copied{color:#0070f3}
.copy-icon{width:1rem;height:1rem;stroke:currentColor;stroke-width:2;fill:none}
.gh{position:fixed;top:1.25rem;right:1.25rem;color:#ccc;transition:color .15s}
.gh:hover{color:#4d4d4d}
.gh svg{width:1.5rem;height:1.5rem}
@media(max-width:480px){body{padding:3.5rem 1rem 2rem}h1{letter-spacing:-.04em}.sub{font-size:1.0625rem;line-height:1.55;max-width:20rem}.tabs{margin:2rem 0 1.25rem}.drop-zone{padding:2rem 1.25rem 1.5rem;border-radius:20px}.agent-cmd{min-height:3rem;padding:0 1rem;font-size:.8125rem;gap:.625rem}}
</style>
</head>
<body>

<a class="gh" href="https://github.com/OrdoAI/htmldrop" title="GitHub"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 00-3.79 23.4c.6.1.82-.26.82-.58v-2.17c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 016.02 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0012 .3"/></svg></a>

<h1>HTMLDrop</h1>
<p class="sub">Drop an HTML or Markdown file, get a private preview link with local images inlined.</p>

<div class="tabs">
  <button class="tab active" data-tab="humans">For humans</button>
  <div class="tab-div"></div>
  <button class="tab" data-tab="agents">For agents</button>
</div>

<div class="panel active" id="panel-humans">
  <div class="drop-zone" id="dropZone">
    <strong>Drop file or folder here</strong>
    <p>.html or .md &middot; max 24 MB &middot; images auto-inlined</p>
    <div class="pick-btns">
      <button class="pick-btn" id="pickFile">Pick file</button>
      <button class="pick-btn" id="pickFolder">Pick folder</button>
    </div>
  </div>
  <input type="file" id="fileInput" multiple>
  <input type="file" id="folderInput" webkitdirectory multiple>
  <div class="file-picker" id="filePicker">
    <p class="picker-label">Multiple HTML/MD files found &mdash; pick one:</p>
    <select id="fileSelect"></select>
    <button class="pick-btn" id="filePickConfirm">Upload this file</button>
  </div>
  <div class="progress" id="progress">Processing&hellip;</div>
  <div class="error-msg" id="errorMsg"></div>
  <div class="md-error" id="mdError">Markdown library failed to load.</div>
  <div class="inline-info" id="inlineInfo"></div>
  <div class="warn-info" id="warnInfo"></div>
</div>

<div class="panel" id="panel-agents">
  <div class="agent-section">
    <div class="agent-cmd">
      <span class="dim">$</span>
      <code>npx skills add OrdoAI/htmldrop --skill htmldrop</code>
      <button class="copy-btn" data-copy="npx skills add OrdoAI/htmldrop --skill htmldrop" title="Copy"><svg class="copy-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
    </div>
  </div>
</div>

<div class="result" id="result">
  <div class="link-box">
    <input type="text" id="linkInput" readonly>
    <button class="copy-btn" id="copyBtn" title="Copy"><svg class="copy-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
  </div>
  <p class="meta" id="meta"></p>
</div>

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

  document.querySelectorAll('.tab').forEach(function(tab){tab.addEventListener('click',function(){document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});tab.classList.add('active');document.getElementById('panel-'+tab.dataset.tab).classList.add('active');});});
  document.querySelectorAll('[data-copy]').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();navigator.clipboard.writeText(btn.dataset.copy).then(function(){btn.classList.add('copied');setTimeout(function(){btn.classList.remove('copied');},1500);});});});

  function isRel(src){return src&&!src.startsWith('data:')&&!src.startsWith('http://')&&!src.startsWith('https://')&&!src.startsWith('//')&&!src.startsWith('#')&&!src.startsWith('javascript:');}
  function norm(p){var parts=p.split('/'),o=[];for(var i=0;i<parts.length;i++){if(parts[i]==='.'||parts[i]==='')continue;if(parts[i]==='..'&&o.length){o.pop();continue;}o.push(parts[i]);}return o.join('/');}
  function toDataUri(f){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(r.result);};r.onerror=function(){no(new Error('read failed'));};r.readAsDataURL(f);});}
  function findRels(html){var s=[],m,re=/(<img\\b[^>]*\\bsrc\\s*=\\s*)(["'])([^"']+)\\2/gi;while((m=re.exec(html))!==null)if(isRel(m[3]))s.push(m[3]);re=/(<link\\b[^>]*\\bhref\\s*=\\s*)(["'])([^"']+)\\2/gi;while((m=re.exec(html))!==null)if(isRel(m[3]))s.push(m[3]);return s;}

  async function inlineAssets(html,assets,main){
    var fm={},md='';
    if(main){var mp=main.fullPath||main.webkitRelativePath||main.name;var ls=mp.lastIndexOf('/');if(ls!==-1)md=mp.slice(0,ls+1);}
    for(var i=0;i<assets.length;i++){var f=assets[i];var rp=f.fullPath||f.webkitRelativePath||f.name;var n=norm(rp).toLowerCase();fm[n]=f;if(md&&rp.toLowerCase().startsWith(md.toLowerCase()))fm[norm(rp.slice(md.length)).toLowerCase()]=f;var pts=n.split('/');if(pts.length>1)fm[pts.slice(1).join('/')]=f;var bn=f.name.toLowerCase();if(!fm[bn])fm[bn]=f;}
    var inl=0,miss=[];
    async function rep(m,pre,q,src){if(!isRel(src))return m;var k=norm(src).toLowerCase();var f=fm[k]||fm[k.split('/').pop()];if(!f){miss.push(src);return m;}inl++;return pre+q+(await toDataUri(f))+q;}
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
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragleave',function(){dz.classList.remove('over');});
  dz.addEventListener('drop',async function(e){e.preventDefault();dz.classList.remove('over');var f=await collectDrop(e.dataTransfer);if(f.length)handleFiles(f);});
  fi.addEventListener('change',function(){if(fi.files.length)handleFiles(Array.from(fi.files));});
  fo.addEventListener('change',function(){if(fo.files.length)handleFiles(Array.from(fo.files));});
  cb.addEventListener('click',function(){li.select();navigator.clipboard.writeText(li.value).then(function(){cb.classList.add('copied');setTimeout(function(){cb.classList.remove('copied');},1500);});});
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

  function upload(html,fn){
    prog.textContent='Uploading\\u2026';prog.classList.add('show');dz.style.pointerEvents='none';dz.style.opacity='0.5';
    fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:html,filename:fn})})
    .then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t);});return r.json();})
    .then(function(d){li.value=d.url;mt.textContent='Expires '+new Date(d.expiresAt).toLocaleDateString()+' \\u00b7 '+d.id;res.classList.add('show');})
    .catch(function(e){showErr(e.message||'Upload failed');})
    .finally(function(){prog.classList.remove('show');dz.style.pointerEvents='';dz.style.opacity='';});
  }
})();
</script>
</body>
</html>`;
}
