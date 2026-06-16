#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, extname, basename, join, normalize } from "path";
import { execSync } from "child_process";

const ENDPOINT = process.env.HTMLDROP_URL || "https://baseurl.ai";

function die(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function usage() {
  console.log(`Usage: htmldrop <file>

Upload an HTML or Markdown file and get a shareable link.
Relative images, CSS, and JS are automatically inlined as base64.

  htmldrop ./report.html
  htmldrop ~/Documents/notes.md
  htmldrop /absolute/path/to/page.html
  htmldrop file:///Users/me/report.html

Options:
  --no-inline          Skip asset inlining, upload HTML as-is
  -e, --endpoint URL   Override upload endpoint (default: https://baseurl.ai)
  -h, --help           Show this help

Environment:
  HTMLDROP_URL         Override upload endpoint`);
  process.exit(0);
}

const MIME_MAP = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".avif": "image/avif", ".ico": "image/x-icon", ".bmp": "image/bmp",
};

const MD_CSS = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:48rem;margin:0 auto;padding:2rem;line-height:1.6;color:#24292e}h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em;font-weight:600}h1{font-size:2em;border-bottom:1px solid #eee;padding-bottom:.3em}h2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.3em}code{background:#f6f8fa;padding:.2em .4em;border-radius:3px;font-size:85%}pre{background:#f6f8fa;padding:1em;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0}blockquote{border-left:4px solid #dfe2e5;padding:0 1em;color:#6a737d;margin:1em 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dfe2e5;padding:.5em .75em}th{background:#f6f8fa}img{max-width:100%}a{color:#0366d6}ul,ol{padding-left:2em}hr{border:none;border-top:1px solid #eee;margin:1.5em 0}`;

function isRelative(src) {
  if (!src) return false;
  for (const p of ["data:", "http://", "https://", "//", "#", "javascript:"]) {
    if (src.startsWith(p)) return false;
  }
  return true;
}

function inlineAssets(html, baseDir) {
  let inlined = 0;
  const missing = [];

  function inlineSrc(match, prefix, quote, src) {
    if (!isRelative(src)) return match;
    const absPath = normalize(join(baseDir, src));
    if (!existsSync(absPath)) { missing.push(src); return match; }
    const ext = extname(absPath).toLowerCase();
    const mime = MIME_MAP[ext] || "application/octet-stream";
    const data = readFileSync(absPath).toString("base64");
    inlined++;
    return `${prefix}${quote}data:${mime};base64,${data}${quote}`;
  }

  function inlineCss(match, prefix, quote, href) {
    if (!isRelative(href)) return match;
    const absPath = normalize(join(baseDir, href));
    if (!existsSync(absPath)) { missing.push(href); return match; }
    const css = readFileSync(absPath, "utf-8");
    inlined++;
    return `<style>${css}</style>`;
  }

  function inlineJs(match, prefix, quote, src, suffix) {
    if (!isRelative(src)) return match;
    const absPath = normalize(join(baseDir, src));
    if (!existsSync(absPath)) { missing.push(src); return match; }
    const js = readFileSync(absPath, "utf-8");
    inlined++;
    return `<script>${js}</script>`;
  }

  html = html.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, inlineSrc);
  html = html.replace(/(<link\b[^>]*\bhref\s*=\s*)(["'])([^"']+)\2/gi, inlineCss);
  html = html.replace(/(<script\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2([^>]*>\s*<\/script>)/gi, inlineJs);

  if (inlined > 0 || missing.length > 0) {
    const parts = [];
    if (inlined) parts.push(`${inlined} asset(s) inlined`);
    if (missing.length) parts.push(`${missing.length} not found: ${missing.slice(0, 5).join(", ")}`);
    process.stderr.write(`  ${parts.join(", ")}\n`);
  }
  return html;
}

function convertMarkdown(text) {
  try {
    const rendered = execSync("npx -y marked --gfm", { input: text, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${MD_CSS}</style></head><body>${rendered}</body></html>`;
  } catch {
    die("markdown conversion failed. Install marked: npm i -g marked");
  }
}

// Parse args
let file = "";
let noInline = false;
let endpoint = ENDPOINT;
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "-h": case "--help": usage(); break;
    case "--no-inline": noInline = true; break;
    case "-e": case "--endpoint": endpoint = args[++i]; break;
    default:
      if (file) die(`unexpected argument: ${args[i]}`);
      file = args[i];
  }
}

if (!file) die("no file specified. Run 'htmldrop --help' for usage.");

file = file.replace(/^file:\/\//, "");
if (file.startsWith("~")) file = file.replace("~", process.env.HOME);
file = resolve(file);

if (!existsSync(file)) die(`file not found: ${file}`);

const fileDir = dirname(file);
const ext = extname(file).toLowerCase();
const filename = basename(file);

let content = readFileSync(file, "utf-8");

if (ext === ".md" || ext === ".markdown") {
  content = convertMarkdown(content);
}

if (!noInline) {
  content = inlineAssets(content, fileDir);
}

const payload = JSON.stringify({ html: content, filename });

const res = await fetch(`${endpoint}/api/upload`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: payload,
});

if (!res.ok) {
  const text = await res.text();
  die(`upload failed (${res.status}): ${text}`);
}

const data = await res.json();
console.log(data.url);

if (process.stdout.isTTY) {
  process.stderr.write(`  id: ${data.id} · expires: ${data.expiresAt.split("T")[0]}\n`);
  try {
    execSync("pbcopy", { input: data.url });
    process.stderr.write("  (copied to clipboard)\n");
  } catch {}
}
