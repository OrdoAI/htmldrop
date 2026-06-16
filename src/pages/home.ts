export function homePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HTMLDrop</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:4rem 2rem}
.hero{text-align:center;max-width:600px;margin-bottom:2.5rem}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:700;color:#fff;line-height:1.15;margin-bottom:1rem;letter-spacing:-.02em}
.hero p{color:#888;font-size:1.05rem;line-height:1.6}
.tabs{display:flex;align-items:center;gap:0;margin-bottom:2rem;border:1px solid #333;border-radius:10px;overflow:hidden}
.tab{padding:.6rem 1.5rem;font-size:.875rem;color:#888;cursor:pointer;transition:all .15s;background:transparent;border:none;font-family:inherit}
.tab:hover{color:#ccc}
.tab.active{background:#1a1a1a;color:#fff}
.tab-divider{width:1px;height:1.2rem;background:#333}
.panel{width:100%;max-width:480px;display:none}
.panel.active{display:block}
.drop-zone{border:2px dashed #333;border-radius:12px;padding:3rem 2rem;text-align:center;cursor:pointer;transition:all .2s}
.drop-zone.over{border-color:#3b82f6;background:rgba(59,130,246,.08)}
.drop-zone.error{border-color:#ef4444;background:rgba(239,68,68,.08)}
.drop-zone .icon{font-size:2rem;margin-bottom:.5rem;display:block}
.drop-zone strong{color:#ccc}
.drop-zone p{color:#666;font-size:.8125rem;margin-top:.5rem}
input[type=file]{display:none}
.pick-btns{display:flex;gap:.5rem;justify-content:center;margin-top:1rem}
.pick-btn{background:#1a1a1a;color:#aaa;border:1px solid #333;border-radius:6px;padding:.4rem .9rem;font-size:.75rem;cursor:pointer;transition:all .15s;font-family:inherit}
.pick-btn:hover{background:#252525;color:#fff;border-color:#555}
.result{width:100%;max-width:480px;margin-top:1.5rem;display:none}
.result.show{display:block}
.link-box{display:flex;gap:.5rem;align-items:center}
.link-box input{flex:1;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:.625rem .75rem;color:#e0e0e0;font-size:.8125rem;font-family:'SF Mono',SFMono-Regular,Consolas,monospace}
.link-box button,.copy-btn{background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:8px;padding:.625rem 1rem;cursor:pointer;font-size:.8125rem;white-space:nowrap;transition:all .15s;font-family:'SF Mono',SFMono-Regular,Consolas,monospace;display:inline-flex;align-items:center;gap:.4rem}
.link-box button:hover,.copy-btn:hover{background:#252525;border-color:#555}
.link-box button.copied,.copy-btn.copied{background:#0f3d1a;border-color:#22c55e;color:#22c55e}
.meta{color:#666;font-size:.75rem;margin-top:.5rem}
.progress{display:none;margin-top:1rem;color:#888;font-size:.875rem}
.progress.show{display:block}
.error-msg{color:#ef4444;font-size:.875rem;margin-top:1rem;display:none}
.error-msg.show{display:block}
.md-error{background:#1c1007;border:1px solid #854d0e;border-radius:8px;padding:.75rem 1rem;margin-top:1rem;color:#fbbf24;font-size:.8125rem;display:none}
.md-error.show{display:block}
.inline-info{color:#3b82f6;font-size:.8125rem;margin-top:.75rem;display:none}
.inline-info.show{display:block}
.warn-info{color:#fbbf24;font-size:.8125rem;margin-top:.75rem;display:none;background:#1c1007;border:1px solid #854d0e;border-radius:8px;padding:.75rem 1rem}
.warn-info.show{display:block}
.cli-section{width:100%;max-width:480px}
.cli-block{background:#111;border:1px solid #282828;border-radius:10px;overflow:hidden;margin-bottom:1rem}
.cli-header{display:flex;justify-content:space-between;align-items:center;padding:.5rem .75rem;background:#161616;border-bottom:1px solid #282828}
.cli-header span{color:#666;font-size:.75rem}
.cli-code{padding:1rem;font-family:'SF Mono',SFMono-Regular,Consolas,monospace;font-size:.8125rem;color:#e0e0e0;line-height:1.7;overflow-x:auto;white-space:pre}
.cli-code .dim{color:#555}
.cli-code .green{color:#22c55e}
.cli-prompt{display:flex;align-items:center;justify-content:center;margin-top:1.5rem;gap:.75rem}
.cli-prompt .copy-btn{padding:.75rem 1.5rem;font-size:.875rem}
.cli-icon{width:1rem;height:1rem;stroke:currentColor;stroke-width:2;fill:none}
.footer{margin-top:2.5rem;color:#555;font-size:.8125rem}
.footer a{color:#888;text-decoration:none}
.footer a:hover{text-decoration:underline;color:#aaa}
</style>
</head>
<body>

<div class="hero">
  <h1>HTMLDrop</h1>
  <p>Share HTML &amp; Markdown previews with a link.<br>Auto-inlines images. Password-protected. Expires in 7 days.</p>
</div>

<div class="tabs">
  <button class="tab active" data-tab="humans">For humans</button>
  <div class="tab-divider"></div>
  <button class="tab" data-tab="agents">For agents</button>
</div>

<div class="panel active" id="panel-humans">
  <div class="drop-zone" id="dropZone">
    <span class="icon">&#128196;</span>
    <strong>Drop file or folder here</strong>
    <p>.html or .md &middot; max 24 MB &middot; images auto-inlined</p>
    <div class="pick-btns">
      <button class="pick-btn" id="pickFile">Pick file</button>
      <button class="pick-btn" id="pickFolder">Pick folder</button>
    </div>
  </div>
  <input type="file" id="fileInput" multiple>
  <input type="file" id="folderInput" webkitdirectory multiple>
  <div class="progress" id="progress">Processing&hellip;</div>
  <div class="error-msg" id="errorMsg"></div>
  <div class="md-error" id="mdError">Markdown library failed to load. Only HTML uploads are available.</div>
  <div class="inline-info" id="inlineInfo"></div>
  <div class="warn-info" id="warnInfo"></div>
</div>

<div class="panel" id="panel-agents">
  <div class="cli-section">
    <div class="cli-block">
      <div class="cli-header"><span>Install</span><button class="copy-btn" data-copy="curl -fsSL https://baseurl.ai/cli/install | bash">Copy<svg class="cli-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div>
      <div class="cli-code"><span class="dim">$</span> curl -fsSL https://baseurl.ai/cli/install | bash</div>
    </div>
    <div class="cli-block">
      <div class="cli-header"><span>Usage</span><button class="copy-btn" data-copy="htmldrop ./report.html">Copy<svg class="cli-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div>
      <div class="cli-code"><span class="dim">$</span> htmldrop ./report.html
<span class="green">https://baseurl.ai/a3xK9mPq?p=xxxxxxxxxxxxxxxx</span>
  <span class="dim">id: a3xK9mPq &middot; expires: 2026-06-23</span>
  <span class="dim">(copied to clipboard)</span>

<span class="dim"># also works with</span>
<span class="dim">$</span> htmldrop ~/Documents/notes.md
<span class="dim">$</span> htmldrop /absolute/path/to/page.html
<span class="dim">$</span> htmldrop file:///Users/me/report.html</div>
    </div>
    <div class="cli-prompt">
      <button class="copy-btn" id="promptBtn" data-copy="Upload this file to HTMLDrop:\nhtmldrop {{filepath}}">Copy starter prompt<svg class="cli-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
    </div>
  </div>
</div>

<div class="result" id="result">
  <div class="link-box">
    <input type="text" id="linkInput" readonly>
    <button id="copyBtn">Copy<svg class="cli-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
  </div>
  <p class="meta" id="meta"></p>
</div>

<p class="footer"><a href="https://github.com/OrdoAI/htmldrop">GitHub</a></p>

<script id="marked-loader">
(function(){
  var MARKED_VERSION = '15.0.7';
  var MARKED_SRI = 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR';
  var markedReady = false;
  var markedFailed = false;

  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked@' + MARKED_VERSION + '/marked.min.js';
  if (MARKED_SRI) s.integrity = MARKED_SRI;
  s.crossOrigin = 'anonymous';
  s.onload = function() {
    markedReady = true;
    if (typeof marked !== 'undefined' && marked.setOptions) marked.setOptions({ gfm: true, breaks: true });
  };
  s.onerror = function() {
    markedFailed = true;
    document.getElementById('mdError').classList.add('show');
  };
  document.head.appendChild(s);

  var MD_CSS = 'body{font-family:-apple-system,BlinkMacSystemFont,\\'Segoe UI\\',Roboto,sans-serif;max-width:48rem;margin:0 auto;padding:2rem;line-height:1.6;color:#24292e}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em;font-weight:600}h1{font-size:2em;border-bottom:1px solid #eee;padding-bottom:.3em}h2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.3em}code{background:#f6f8fa;padding:.2em .4em;border-radius:3px;font-size:85%}pre{background:#f6f8fa;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #dfe2e5;padding:0 1em;color:#6a737d;margin:1em 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dfe2e5;padding:.5em .75em}th{background:#f6f8fa}img{max-width:100%}a{color:#0366d6}ul,ol{padding-left:2em}hr{border:none;border-top:1px solid #eee;margin:1.5em 0}';

  function wrapMarkdown(html) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + MD_CSS + '</style></head><body>' + html + '</body></html>';
  }
  function convertMarkdown(text) {
    if (markedFailed || !markedReady || typeof marked === 'undefined') return null;
    var rendered = typeof marked.parse === 'function' ? marked.parse(text) : marked(text);
    return wrapMarkdown(rendered);
  }

  // --- Tabs ---
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // --- Copy buttons ---
  document.querySelectorAll('.copy-btn[data-copy]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var text = btn.dataset.copy.replace(/\\\\n/g, '\\n');
      navigator.clipboard.writeText(text).then(function() {
        var orig = btn.innerHTML;
        btn.innerHTML = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
      });
    });
  });

  // --- Asset inlining helpers ---
  function isRelativeSrc(src) {
    if (!src) return false;
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//') || src.startsWith('#') || src.startsWith('javascript:')) return false;
    return true;
  }
  function normalizePath(src) {
    var parts = src.split('/'), out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '.' || parts[i] === '') continue;
      if (parts[i] === '..' && out.length) { out.pop(); continue; }
      out.push(parts[i]);
    }
    return out.join('/');
  }
  function fileToDataUri(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(new Error('Failed to read ' + file.name)); };
      reader.readAsDataURL(file);
    });
  }
  function findRelativeSrcs(html) {
    var srcs = [], m;
    var imgRe = /(<img\\b[^>]*\\bsrc\\s*=\\s*)(["'])([^"']+)\\2/gi;
    while ((m = imgRe.exec(html)) !== null) { if (isRelativeSrc(m[3])) srcs.push(m[3]); }
    var linkRe = /(<link\\b[^>]*\\bhref\\s*=\\s*)(["'])([^"']+)\\2/gi;
    while ((m = linkRe.exec(html)) !== null) { if (isRelativeSrc(m[3])) srcs.push(m[3]); }
    return srcs;
  }

  async function inlineAssets(html, assetFiles, mainFile) {
    var fileMap = {}, mainDir = '';
    if (mainFile) {
      var mp = mainFile.fullPath || mainFile.webkitRelativePath || mainFile.name;
      var ls = mp.lastIndexOf('/');
      if (ls !== -1) mainDir = mp.slice(0, ls + 1);
    }
    for (var i = 0; i < assetFiles.length; i++) {
      var f = assetFiles[i];
      var relPath = f.fullPath || f.webkitRelativePath || f.name;
      var normalized = normalizePath(relPath).toLowerCase();
      fileMap[normalized] = f;
      if (mainDir && relPath.toLowerCase().startsWith(mainDir.toLowerCase())) {
        fileMap[normalizePath(relPath.slice(mainDir.length)).toLowerCase()] = f;
      }
      var parts = normalized.split('/');
      if (parts.length > 1) fileMap[parts.slice(1).join('/').toLowerCase()] = f;
      var bn = f.name.toLowerCase();
      if (!fileMap[bn]) fileMap[bn] = f;
    }

    var inlined = 0, missing = [];
    async function replaceSrc(match, prefix, quote, src) {
      if (!isRelativeSrc(src)) return match;
      var key = normalizePath(src).toLowerCase();
      var file = fileMap[key] || fileMap[key.split('/').pop()];
      if (!file) { missing.push(src); return match; }
      inlined++;
      return prefix + quote + (await fileToDataUri(file)) + quote;
    }
    async function replaceAll(text, regex, handler) {
      var parts = [], lastIndex = 0, m;
      regex.lastIndex = 0;
      while ((m = regex.exec(text)) !== null) {
        parts.push(text.slice(lastIndex, m.index));
        parts.push(handler(m[0], m[1], m[2], m[3], m[4]));
        lastIndex = regex.lastIndex;
      }
      parts.push(text.slice(lastIndex));
      return (await Promise.all(parts)).join('');
    }
    html = await replaceAll(html, /(<img\\b[^>]*\\bsrc\\s*=\\s*)(["'])([^"']+)\\2/gi, replaceSrc);
    html = await replaceAll(html, /(<link\\b[^>]*\\bhref\\s*=\\s*)(["'])([^"']+)\\2/gi, async function(m, prefix, quote, href) {
      if (!isRelativeSrc(href)) return m;
      var key = normalizePath(href).toLowerCase();
      var file = fileMap[key] || fileMap[key.split('/').pop()];
      if (!file) { missing.push(href); return m; }
      inlined++;
      return '<style>' + (await file.text()) + '</style>';
    });
    html = await replaceAll(html, /(<script\\b[^>]*\\bsrc\\s*=\\s*)(["'])([^"']+)\\2([^>]*>\\s*<\\/script>)/gi, async function(m, prefix, quote, src) {
      if (!isRelativeSrc(src)) return m;
      var key = normalizePath(src).toLowerCase();
      var file = fileMap[key] || fileMap[key.split('/').pop()];
      if (!file) { missing.push(src); return m; }
      inlined++;
      return '<scr' + 'ipt>' + (await file.text()) + '<\\/scr' + 'ipt>';
    });
    return { html: html, inlined: inlined, missing: missing };
  }

  async function collectDropEntries(dataTransfer) {
    var files = [];
    var items = dataTransfer.items;
    if (!items || !items.length) return Array.from(dataTransfer.files);
    var entries = [];
    for (var i = 0; i < items.length; i++) {
      var entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    if (!entries.length) return Array.from(dataTransfer.files);
    async function readDir(d) {
      return new Promise(function(resolve) {
        var reader = d.createReader(), all = [];
        (function read() { reader.readEntries(function(batch) { if (!batch.length) return resolve(all); all = all.concat(Array.from(batch)); read(); }); })();
      });
    }
    async function walk(entry, path) {
      if (entry.isFile) return new Promise(function(resolve) {
        entry.file(function(f) { Object.defineProperty(f, 'fullPath', { value: path + f.name, writable: true }); files.push(f); resolve(); });
      });
      if (entry.isDirectory) { var children = await readDir(entry); for (var c = 0; c < children.length; c++) await walk(children[c], path + entry.name + '/'); }
    }
    for (var e = 0; e < entries.length; e++) await walk(entries[e], '');
    return files;
  }

  // --- Upload UI ---
  var MAX_SIZE = 24 * 1024 * 1024;
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var folderInput = document.getElementById('folderInput');
  var pickFile = document.getElementById('pickFile');
  var pickFolder = document.getElementById('pickFolder');
  var progress = document.getElementById('progress');
  var errorMsg = document.getElementById('errorMsg');
  var inlineInfo = document.getElementById('inlineInfo');
  var warnInfo = document.getElementById('warnInfo');
  var result = document.getElementById('result');
  var linkInput = document.getElementById('linkInput');
  var copyBtn = document.getElementById('copyBtn');
  var meta = document.getElementById('meta');

  pickFile.addEventListener('click', function(e) { e.stopPropagation(); fileInput.click(); });
  pickFolder.addEventListener('click', function(e) { e.stopPropagation(); folderInput.click(); });
  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('over'); });
  dropZone.addEventListener('drop', async function(e) {
    e.preventDefault(); dropZone.classList.remove('over');
    var files = await collectDropEntries(e.dataTransfer);
    if (files.length) handleFiles(files);
  });
  fileInput.addEventListener('change', function() { if (fileInput.files.length) handleFiles(Array.from(fileInput.files)); });
  folderInput.addEventListener('change', function() { if (folderInput.files.length) handleFiles(Array.from(folderInput.files)); });

  copyBtn.addEventListener('click', function() {
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(function() {
      var orig = copyBtn.innerHTML;
      copyBtn.innerHTML = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(function() { copyBtn.innerHTML = orig; copyBtn.classList.remove('copied'); }, 2000);
    });
  });

  function showError(msg) {
    errorMsg.textContent = msg; errorMsg.classList.add('show');
    dropZone.classList.add('error');
    setTimeout(function() { dropZone.classList.remove('error'); }, 2000);
  }

  async function handleFiles(files) {
    errorMsg.classList.remove('show'); inlineInfo.classList.remove('show'); warnInfo.classList.remove('show'); result.classList.remove('show');
    var htmlFiles = [], mdFiles = [], allFiles = [];
    for (var i = 0; i < files.length; i++) {
      allFiles.push(files[i]);
      var ext = files[i].name.split('.').pop().toLowerCase();
      if (ext === 'html' || ext === 'htm') htmlFiles.push(files[i]);
      else if (ext === 'md' || ext === 'markdown') mdFiles.push(files[i]);
    }
    var htmlFile = htmlFiles.find(function(f) { return f.name.toLowerCase() === 'index.html' || f.name.toLowerCase() === 'index.htm'; }) || htmlFiles[0] || null;
    var mdFile = mdFiles.find(function(f) { return f.name.toLowerCase() === 'readme.md'; }) || mdFiles[0] || null;
    var mainFile = htmlFile || mdFile;
    if (!mainFile) { showError('No .html or .md file found'); return; }
    var assetFiles = allFiles.filter(function(f) { return f !== mainFile; });
    var ext = mainFile.name.split('.').pop().toLowerCase();
    var isMarkdown = ext === 'md' || ext === 'markdown';
    progress.textContent = 'Processing\\u2026'; progress.classList.add('show');
    var text = await mainFile.text();
    if (isMarkdown) {
      if (markedFailed) { progress.classList.remove('show'); showError('Markdown library failed to load.'); return; }
      if (!markedReady) { progress.classList.remove('show'); showError('Markdown library still loading, try again.'); return; }
      var converted = convertMarkdown(text);
      if (!converted) { progress.classList.remove('show'); showError('Markdown conversion failed'); return; }
      text = converted;
    }
    var relativeSrcs = findRelativeSrcs(text);
    if (relativeSrcs.length > 0 && assetFiles.length === 0) {
      progress.classList.remove('show');
      warnInfo.textContent = 'Found ' + relativeSrcs.length + ' local asset(s): ' + relativeSrcs.slice(0, 5).join(', ') + (relativeSrcs.length > 5 ? '\\u2026' : '') + '. Drop the folder or select all files together to auto-inline.';
      warnInfo.classList.add('show');
    }
    if (assetFiles.length > 0) {
      progress.textContent = 'Inlining assets\\u2026';
      try {
        var r = await inlineAssets(text, assetFiles, mainFile);
        text = r.html;
        if (r.inlined > 0 || r.missing.length > 0) {
          inlineInfo.textContent = r.inlined + ' inlined' + (r.missing.length ? ', ' + r.missing.length + ' not found: ' + r.missing.join(', ') : '');
          inlineInfo.classList.add('show');
        }
      } catch (err) { progress.classList.remove('show'); showError('Inlining failed: ' + err.message); return; }
    }
    if (new Blob([text]).size > MAX_SIZE) { progress.classList.remove('show'); showError('Too large after inlining (max 24 MB)'); return; }
    upload(text, mainFile.name);
  }

  function upload(html, filename) {
    progress.textContent = 'Uploading\\u2026'; progress.classList.add('show');
    dropZone.style.pointerEvents = 'none'; dropZone.style.opacity = '0.5';
    fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: html, filename: filename }) })
    .then(function(res) { if (!res.ok) return res.text().then(function(t) { throw new Error(t); }); return res.json(); })
    .then(function(data) {
      linkInput.value = data.url;
      meta.textContent = 'Expires: ' + new Date(data.expiresAt).toLocaleDateString() + ' \\u00b7 ID: ' + data.id;
      result.classList.add('show');
    })
    .catch(function(err) { showError(err.message || 'Upload failed'); })
    .finally(function() { progress.classList.remove('show'); dropZone.style.pointerEvents = ''; dropZone.style.opacity = ''; });
  }
})();
</script>
</body>
</html>`;
}
