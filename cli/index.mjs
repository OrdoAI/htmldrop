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
       htmldrop comments <url>

Upload an HTML or Markdown file and get a shareable link.
Relative images, CSS, and JS are automatically inlined as base64.

  htmldrop ./report.html                 create a new preview
  htmldrop create ~/Documents/notes.md   create, explicit
  htmldrop update <url> ./report.html    overwrite an existing preview
  htmldrop comments <url>                fetch the preview's comments as JSON

<url> is the full password-bearing link from a previous upload; the
overwritten preview keeps that same URL.

Options:
  --no-inline               Skip asset inlining, upload HTML as-is
  --comment-anchors <file>  (update) JSON array of {cid, anchor} remaps applied
                            to existing comments after the document changes
  -V, --version             Print version and exit
  -h, --help                Show this help`);
  process.exit(0);
}

// Parse the full password-bearing preview link into id + password. Used by both
// `update` and `comments`. Dies locally (no network) on a malformed link.
function parsePreviewUrl(raw) {
  let link;
  try {
    link = new URL(raw);
  } catch {
    die(`invalid URL: ${raw}`);
  }
  const id = link.pathname.split("/").filter(Boolean).pop();
  const password = link.searchParams.get("p");
  if (!id || !password) {
    die("URL must look like https://baseurl.ai/<id>?p=<password>");
  }
  return { id, password };
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

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// Walk up from `start` to find a project-level `skills-lock.json`.
function findProjectLock(start) {
  let dir = resolve(start);
  for (;;) {
    const p = join(dir, "skills-lock.json");
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Pick the comparable hash from a lock's htmldrop entry: project installs record
// `computedHash` (skills' own sha256), global installs record `skillFolderHash`
// (the git tree sha of skills/htmldrop). The two never coexist in one entry.
function pickHash(entry) {
  if (entry && typeof entry.computedHash === "string") return ["computedHash", entry.computedHash];
  if (entry && typeof entry.skillFolderHash === "string") return ["skillFolderHash", entry.skillFolderHash];
  return [null, null];
}

// The published CLI bakes the reference hashes `npx skills` records for the
// current skill (skillFolderHash + computedHash). At runtime we read the
// authoritative installed skill's lock and compare its hash to the matching
// baked value. A *project* install (skills-lock.json) overrides a *global* one
// (.skill-lock.json). The CLI is always run latest via npx, so a recorded hash
// that differs from the baked one means that install is behind. Missing baked
// value, no lock, an unmatched field, or divergent global locks -> skip, so the
// check never blocks a working upload. (env vars are dev/test seams.)
function checkSkillFreshness() {
  const file = readJsonSafe(new URL("./skill-tree.json", import.meta.url)) || {};
  const baked = {
    skillFolderHash: process.env.HTMLDROP_EXPECTED_TREE || file.skillFolderHash,
    computedHash: process.env.HTMLDROP_EXPECTED_COMPUTED || file.computedHash,
  };

  let field = null;
  let value = null;

  if (process.env.HTMLDROP_SKILL_LOCK) {
    [field, value] = pickHash(readJsonSafe(process.env.HTMLDROP_SKILL_LOCK)?.skills?.htmldrop);
  } else {
    // Project install wins over global: once a project htmldrop entry exists it
    // is authoritative -- compare its computedHash if usable, otherwise skip.
    // Never fall back to global locks after seeing a project htmldrop entry.
    const projectLock = findProjectLock(process.cwd());
    const projectEntry = projectLock ? readJsonSafe(projectLock)?.skills?.htmldrop : null;
    if (projectEntry) {
      if (typeof projectEntry.computedHash === "string") {
        field = "computedHash";
        value = projectEntry.computedHash;
      }
      // present but not comparable -> field/value stay null -> skip below
    } else {
      const home = process.env.HOME || process.env.USERPROFILE || "";
      const globals = [
        join(home, ".agents/.skill-lock.json"),
        join(home, ".claude/skills/.skill-lock.json"),
      ]
        .map((p) => readJsonSafe(p)?.skills?.htmldrop?.skillFolderHash)
        .filter((s) => typeof s === "string");
      // No global hash, or divergent globals (ambiguous which is active) -> skip.
      if (globals.length === 0 || new Set(globals).size > 1) return;
      field = "skillFolderHash";
      value = globals[0];
    }
  }

  if (!field || typeof value !== "string") return;
  const ref = baked[field];
  if (typeof ref !== "string") return; // nothing baked to compare against -> skip
  if (value === ref) return; // up to date

  die(
    `your htmldrop skill is outdated.\n` +
    `       update it:  npx skills update htmldrop\n` +
    `       then retry with the current 'create' or 'update' command.`,
  );
}

// Parse args. Stdlib parseArgs gives POSIX/GNU behaviour for free: --opt=value,
// the `--` terminator, options anywhere among operands, and errors on unknown
// options. The upload endpoint is env-only (HTMLDROP_URL) for dev/test -- by
// design it is not a user-facing flag.
let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      "no-inline": { type: "boolean", default: false },
      "comment-anchors": { type: "string" },
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

// A stale installed skill (older than this always-latest CLI) is told to update
// before we do any work.
checkSkillFreshness();

const { values, positionals } = parsed;

// Subcommands: `create <file>` (default) and `update <url> <file>`. A bare
// `htmldrop <file>` is the create shorthand. `create`/`update` are reserved as
// the first operand; a file actually named that needs an explicit verb or path.
let mode = "create";
let operands = positionals;
if (positionals[0] === "create" || positionals[0] === "update" || positionals[0] === "comments") {
  mode = positionals[0];
  operands = positionals.slice(1);
}

if (values["comment-anchors"] && mode !== "update") {
  die("--comment-anchors is only valid with 'update'");
}

// comments: read-only export of a preview's comments (id + password parsed from
// the link), printed as JSON. Used before a re-upload to compute anchor remaps.
if (mode === "comments") {
  if (operands.length < 1) die("usage: htmldrop comments <url>");
  if (operands.length > 1) die(`unexpected argument: ${operands[1]}`);
  const { id, password } = parsePreviewUrl(operands[0]);
  const res = await fetch(`${ENDPOINT}/${id}/comments?p=${encodeURIComponent(password)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) die(`fetch comments failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  process.stdout.write(`${JSON.stringify(data.comments ?? [], null, 2)}\n`);
  process.exit(0);
}

// Optional anchor remaps for the update path. Validated locally (file exists,
// valid JSON array) before any network so an agent mistake fails fast.
let commentAnchors = null;
if (mode === "update" && values["comment-anchors"]) {
  let anchorsPath = values["comment-anchors"];
  if (anchorsPath.startsWith("~")) anchorsPath = anchorsPath.replace("~", process.env.HOME);
  anchorsPath = resolve(anchorsPath);
  if (!existsSync(anchorsPath)) die(`comment-anchors file not found: ${anchorsPath}`);
  try {
    commentAnchors = JSON.parse(readFileSync(anchorsPath, "utf-8"));
  } catch {
    die("invalid JSON in --comment-anchors file");
  }
  if (!Array.isArray(commentAnchors)) {
    die("--comment-anchors must be a JSON array of {cid, anchor}");
  }
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
  updateCreds = parsePreviewUrl(updateUrl);
}

const body = updateCreds
  ? { html: content, filename, ...updateCreds }
  : { html: content, filename };
if (commentAnchors) body.commentAnchors = commentAnchors;
const payload = JSON.stringify(body);

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
  const note = updateCreds ? " | updated in place" : "";
  process.stderr.write(`  id: ${data.id} | expires: ${data.expiresAt.split("T")[0]}${note}\n`);
  try {
    execSync("pbcopy", { input: data.url });
    process.stderr.write("  (copied to clipboard)\n");
  } catch {}
}
