export function homePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HTMLDrop</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem}
h1{font-size:1.5rem;font-weight:600;margin-bottom:.5rem;color:#fff}
.subtitle{color:#888;margin-bottom:2rem;font-size:.875rem}
.drop-zone{width:100%;max-width:480px;border:2px dashed #333;border-radius:12px;padding:3rem 2rem;text-align:center;cursor:pointer;transition:all .2s}
.drop-zone.over{border-color:#3b82f6;background:rgba(59,130,246,.08)}
.drop-zone.error{border-color:#ef4444;background:rgba(239,68,68,.08)}
.drop-zone p{color:#888;font-size:.875rem;margin-top:.5rem}
.drop-zone .icon{font-size:2rem;margin-bottom:.5rem;display:block}
input[type=file]{display:none}
.result{width:100%;max-width:480px;margin-top:1.5rem;display:none}
.result.show{display:block}
.link-box{display:flex;gap:.5rem;align-items:center}
.link-box input{flex:1;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:.625rem .75rem;color:#e0e0e0;font-size:.8125rem;font-family:monospace}
.link-box button{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:.625rem 1rem;cursor:pointer;font-size:.8125rem;white-space:nowrap;transition:background .15s}
.link-box button:hover{background:#2563eb}
.link-box button.copied{background:#22c55e}
.meta{color:#666;font-size:.75rem;margin-top:.5rem}
.progress{display:none;margin-top:1rem;color:#888;font-size:.875rem}
.progress.show{display:block}
.error-msg{color:#ef4444;font-size:.875rem;margin-top:1rem;display:none}
.error-msg.show{display:block}
.md-error{background:#1c1007;border:1px solid #854d0e;border-radius:8px;padding:.75rem 1rem;margin-top:1rem;color:#fbbf24;font-size:.8125rem;display:none}
.md-error.show{display:block}
</style>
</head>
<body>
<h1>HTMLDrop</h1>
<p class="subtitle">Drop an HTML or Markdown file, get a shareable link</p>

<div class="drop-zone" id="dropZone">
  <span class="icon">&#128196;</span>
  <strong>Drop file here</strong>
  <p>.html or .md &middot; max 10 MB</p>
</div>
<input type="file" id="fileInput" accept=".html,.htm,.md,.markdown">

<div class="progress" id="progress">Uploading&hellip;</div>
<div class="error-msg" id="errorMsg"></div>
<div class="md-error" id="mdError">Markdown library failed to load. Only HTML uploads are available.</div>

<div class="result" id="result">
  <div class="link-box">
    <input type="text" id="linkInput" readonly>
    <button id="copyBtn">Copy</button>
  </div>
  <p class="meta" id="meta"></p>
</div>

<script id="marked-loader">
(function(){
  var MARKED_VERSION = '15.0.7';
  var MARKED_SRI = 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR';
  var markedReady = false;
  var markedFailed = false;

  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/marked@' + MARKED_VERSION + '/marked.min.js';
  if (MARKED_SRI) script.integrity = MARKED_SRI;
  script.crossOrigin = 'anonymous';

  script.onload = function() {
    markedReady = true;
    if (typeof marked !== 'undefined' && marked.setOptions) {
      marked.setOptions({ gfm: true, breaks: true });
    }
  };
  script.onerror = function() {
    markedFailed = true;
    document.getElementById('mdError').classList.add('show');
  };
  document.head.appendChild(script);

  var MD_CSS = \`
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:48rem;margin:0 auto;padding:2rem;line-height:1.6;color:#24292e}
    h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em;font-weight:600}
    h1{font-size:2em;border-bottom:1px solid #eee;padding-bottom:.3em}
    h2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.3em}
    code{background:#f6f8fa;padding:.2em .4em;border-radius:3px;font-size:85%}
    pre{background:#f6f8fa;padding:1em;border-radius:6px;overflow-x:auto}
    pre code{background:none;padding:0}
    blockquote{border-left:4px solid #dfe2e5;padding:0 1em;color:#6a737d;margin:1em 0}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #dfe2e5;padding:.5em .75em}
    th{background:#f6f8fa}
    img{max-width:100%}
    a{color:#0366d6}
    ul,ol{padding-left:2em}
    hr{border:none;border-top:1px solid #eee;margin:1.5em 0}
  \`;

  function wrapMarkdown(html) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + MD_CSS + '</style></head><body>' + html + '</body></html>';
  }

  function convertMarkdown(text) {
    if (markedFailed) return null;
    if (!markedReady || typeof marked === 'undefined') return null;
    var rendered = typeof marked.parse === 'function' ? marked.parse(text) : marked(text);
    return wrapMarkdown(rendered);
  }

  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var progress = document.getElementById('progress');
  var errorMsg = document.getElementById('errorMsg');
  var result = document.getElementById('result');
  var linkInput = document.getElementById('linkInput');
  var copyBtn = document.getElementById('copyBtn');
  var meta = document.getElementById('meta');

  dropZone.addEventListener('click', function() { fileInput.click(); });
  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('over'); });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function() {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  copyBtn.addEventListener('click', function() {
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(function() {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(function() { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
    });
  });

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('show');
    dropZone.classList.add('error');
    setTimeout(function() { dropZone.classList.remove('error'); }, 2000);
  }

  function handleFile(file) {
    errorMsg.classList.remove('show');
    result.classList.remove('show');

    var ext = file.name.split('.').pop().toLowerCase();
    var isMarkdown = ext === 'md' || ext === 'markdown';
    var isHtml = ext === 'html' || ext === 'htm';

    if (!isMarkdown && !isHtml) {
      showError('Only .html and .md files are supported');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError('File too large (max 10 MB)');
      return;
    }

    var reader = new FileReader();
    reader.onload = function() {
      var text = reader.result;

      if (isMarkdown) {
        if (markedFailed) {
          showError('Markdown library failed to load. Please upload HTML instead.');
          return;
        }
        if (!markedReady) {
          showError('Markdown library is still loading. Please try again in a moment.');
          return;
        }
        var converted = convertMarkdown(text);
        if (!converted) {
          showError('Markdown conversion failed');
          return;
        }
        upload(converted, file.name);
      } else {
        upload(text, file.name);
      }
    };
    reader.readAsText(file);
  }

  function upload(html, filename) {
    progress.classList.add('show');
    dropZone.style.pointerEvents = 'none';
    dropZone.style.opacity = '0.5';

    fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html, filename: filename })
    })
    .then(function(res) {
      if (!res.ok) return res.text().then(function(t) { throw new Error(t); });
      return res.json();
    })
    .then(function(data) {
      linkInput.value = data.url;
      meta.textContent = 'Expires: ' + new Date(data.expiresAt).toLocaleDateString() + ' · ID: ' + data.id;
      result.classList.add('show');
    })
    .catch(function(err) {
      showError(err.message || 'Upload failed');
    })
    .finally(function() {
      progress.classList.remove('show');
      dropZone.style.pointerEvents = '';
      dropZone.style.opacity = '';
    });
  }
})();
</script>
</body>
</html>`;
}
