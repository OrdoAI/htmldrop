#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, extname, basename, join, normalize } from "path";
import { execSync } from "child_process";
import { parseArgs } from "node:util";
import { buildMarkdownPage, injectToolbarIntoHtml } from "./markdown-page.mjs";
import { NodeHtmlMarkdown } from "node-html-markdown";

const ENDPOINT = process.env.HTMLDROP_URL || "https://baseurl.ai";
let compressorPromise;

function die(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function usage() {
  console.log(`Usage: htmldrop [create] <file>
       htmldrop update <url> <file>

Upload an HTML or Markdown file and get a shareable link.
Relative images, CSS, and JS are automatically inlined as base64.

  htmldrop ./report.html                 create a new preview
  htmldrop create ~/Documents/notes.md   create, explicit
  htmldrop update <url> ./report.html    overwrite an existing preview

<url> is the full password-bearing link from a previous upload; the
overwritten preview keeps that same URL.

Options:
  --no-inline          Skip asset inlining, upload HTML as-is
  -V, --version        Print version and exit
  -h, --help           Show this help`);
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

// Parse args. Stdlib parseArgs gives POSIX/GNU behaviour for free: --opt=value,
// the `--` terminator, options anywhere among operands, and errors on unknown
// options. The upload endpoint is env-only (HTMLDROP_URL) for dev/test — by
// design it is not a user-facing flag.
let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      "no-inline": { type: "boolean", default: false },
      version: { type: "boolean", short: "V" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (err) {
  die(err.message);
}

if (parsed.values.help) usage();
if (parsed.values.version) {
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
  console.log(`htmldrop-cli ${version}`);
  process.exit(0);
}

const { values, positionals } = parsed;

// Subcommands: `create <file>` (default) and `update <url> <file>`. A bare
// `htmldrop <file>` is the create shorthand. `create`/`update` are reserved as
// the first operand; a file actually named that needs an explicit verb or path.
let mode = "create";
let operands = positionals;
if (positionals[0] === "create" || positionals[0] === "update") {
  mode = positionals[0];
  operands = positionals.slice(1);
}

let file;
let updateUrl = "";
if (mode === "update") {
  if (operands.length < 2) die("usage: htmldrop update <url> <file>");
  if (operands.length > 2) die(`unexpected argument: ${operands[2]}`);
  [updateUrl, file] = operands;
} else {
  if (operands.length === 0) die("no file specified. Run 'htmldrop --help' for usage.");
  if (operands.length > 1) die(`unexpected argument: ${operands[1]}`);
  file = operands[0];
}

const noInline = values["no-inline"];
const endpoint = ENDPOINT;

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

// update mode: overwrite the page behind an existing password-bearing link.
// The link itself is the capability, so id + password are parsed locally.
let updateCreds = null;
if (updateUrl) {
  let link;
  try {
    link = new URL(updateUrl);
  } catch {
    die(`invalid update URL: ${updateUrl}`);
  }
  const id = link.pathname.split("/").filter(Boolean).pop();
  const password = link.searchParams.get("p");
  if (!id || !password) {
    die("update URL must look like https://baseurl.ai/<id>?p=<password>");
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
