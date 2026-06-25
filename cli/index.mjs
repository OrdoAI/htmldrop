#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, extname, basename, join, normalize } from "path";
import { execSync } from "child_process";
import { buildMarkdownPage, injectToolbarIntoHtml } from "./markdown-page.mjs";
import { NodeHtmlMarkdown } from "node-html-markdown";

const ENDPOINT = process.env.HTMLDROP_URL || "https://baseurl.ai";
let compressorPromise;

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
  --update URL         Overwrite an existing preview, keeping the same URL.
                       Pass the full password-bearing link you got before.
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

function isRelative(src) {
  if (!src) return false;
  for (const p of ["data:", "http://", "https://", "//", "#", "javascript:"]) {
    if (src.startsWith(p)) return false;
  }
  return true;
}

async function compressImage(data, mime) {
  try {
    compressorPromise ||= import("./compress.mjs");
    const compressor = await compressorPromise;
    return await compressor.compressImage(data, mime);
  } catch {
    return { buffer: data, mime };
  }
}

async function replaceAsync(input, regex, replacer) {
  const parts = [];
  let lastIndex = 0;
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(input)) !== null) {
    parts.push(input.slice(lastIndex, match.index));
    parts.push(replacer(...match));
    lastIndex = regex.lastIndex;
  }
  parts.push(input.slice(lastIndex));
  return (await Promise.all(parts)).join("");
}

async function inlineAssets(html, baseDir) {
  let inlined = 0;
  const missing = [];

  async function inlineSrc(match, prefix, quote, src) {
    if (!isRelative(src)) return match;
    const absPath = normalize(join(baseDir, src));
    if (!existsSync(absPath)) { missing.push(src); return match; }
    const ext = extname(absPath).toLowerCase();
    const mime = MIME_MAP[ext] || "application/octet-stream";
    const result = await compressImage(readFileSync(absPath), mime);
    const data = result.buffer.toString("base64");
    inlined++;
    return `${prefix}${quote}data:${result.mime};base64,${data}${quote}`;
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

  html = await replaceAsync(html, /(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, inlineSrc);
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
    return buildMarkdownPage(rendered, text);
  } catch {
    die("markdown conversion failed. Install marked: npm i -g marked");
  }
}

// Parse args
let file = "";
let noInline = false;
let updateUrl = "";
let endpoint = ENDPOINT;
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "-h": case "--help": usage(); break;
    case "--no-inline": noInline = true; break;
    case "--update": updateUrl = args[++i]; break;
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
} else {
  // HTML upload: derive a (lossy) markdown source from the original HTML so the
  // in-page "Copy for LLM" button works on HTML too, then inject a floating
  // toolbar that won't disturb the user's own layout.
  const md = NodeHtmlMarkdown.translate(content);
  content = injectToolbarIntoHtml(content, md);
}

if (!noInline) {
  content = await inlineAssets(content, fileDir);
}

// --update: overwrite the page behind an existing password-bearing link. The
// link itself is the capability, so id + password are parsed from it locally.
let updateCreds = null;
if (updateUrl) {
  let parsed;
  try {
    parsed = new URL(updateUrl);
  } catch {
    die(`invalid --update URL: ${updateUrl}`);
  }
  const id = parsed.pathname.split("/").filter(Boolean).pop();
  const password = parsed.searchParams.get("p");
  if (!id || !password) {
    die("--update URL must look like https://baseurl.ai/<id>?p=<password>");
  }
  updateCreds = { id, password };
}

const payload = JSON.stringify(
  updateCreds ? { html: content, filename, ...updateCreds } : { html: content, filename },
);

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
  const note = updateCreds ? " · updated in place" : "";
  process.stderr.write(`  id: ${data.id} · expires: ${data.expiresAt.split("T")[0]}${note}\n`);
  try {
    execSync("pbcopy", { input: data.url });
    process.stderr.write("  (copied to clipboard)\n");
  } catch {}
}
