#!/usr/bin/env node
// One-shot migration: seal every legacy plaintext page and comment in the
// bucket. Run it once, after the Worker that reads storage v2 is deployed; run
// earlier, the old Worker could not read anything this touched.
//
//   node scripts/migrate-encrypt.mjs            # dry run: classify and report, no writes
//   node scripts/migrate-encrypt.mjs --apply    # seal, purge expired pages and orphaned comments
//
// Per object:
//   page, legacy, live         -> sealed v2 under the key derived from its stored password
//   page, legacy, expired      -> deleted with its comments (what the Worker does on read)
//   page, already v2           -> untouched
//   comment, legacy, page migrated here -> sealed under that page's key
//   comment, legacy, page already v2    -> left alone; the Worker seals it on the page's next update
//   comment, page missing      -> deleted (orphan)
// Every object that gets written or deleted is first copied to --backup <dir>
// (default: ./migrate-backup). Delete that directory once the site checks out;
// it holds the plaintext this migration exists to remove.
//
// Listing uses the Cloudflare API with wrangler's OAuth token (wrangler has no
// `r2 object list`); reads and writes go through `wrangler r2 object`.
// Requires a logged-in wrangler and Node 22.18+ (type stripping).

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  derivePageKey,
  isLegacyPage,
  isStoredComment,
  isStoredPage,
  migrateLegacyPage,
  sealComment,
} from "../src/envelope.ts";

const execFileP = promisify(execFile);
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const bucket = opt("--bucket", "htmldrop-pages");
const backupDir = opt("--backup", "./migrate-backup");

function apiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const toml = readFileSync(join(homedir(), ".wrangler", "config", "default.toml"), "utf8");
  const m = toml.match(/^oauth_token\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("no oauth_token in ~/.wrangler/config/default.toml; set CLOUDFLARE_API_TOKEN");
  return m[1];
}

async function accountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const { stdout } = await execFileP("npx", ["wrangler", "whoami"], { encoding: "utf8" });
  const m = stdout.match(/[0-9a-f]{32}/);
  if (!m) throw new Error("could not read the account id from `wrangler whoami`; set CLOUDFLARE_ACCOUNT_ID");
  return m[0];
}

async function listKeys(acct, token) {
  const keys = [];
  let cursor = "";
  for (;;) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${bucket}/objects`);
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!body.success) throw new Error(`list failed: ${JSON.stringify(body.errors)}`);
    for (const o of body.result) keys.push(o.key);
    if (!body.result_info?.is_truncated || !body.result_info.cursor) break;
    cursor = body.result_info.cursor;
  }
  return keys;
}

// Retries transient network failures; ~900 sequential API calls will hit a few.
async function wrangler(...cmd) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { stdout } = await execFileP("npx", ["wrangler", ...cmd], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      lastErr = err;
      const text = `${err.stderr ?? ""}${err.message ?? ""}`;
      const transient = /fetch failed|connectivity|ECONNRESET|ETIMEDOUT|EAI_AGAIN|50[0-9]|429|401/.test(text); // 401: wrangler refreshes an expired OAuth token on the next call
      if (!transient || attempt === 4) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

const getObject = (key) => wrangler("r2", "object", "get", `${bucket}/${key}`, "--remote", "--pipe");
const deleteObject = (key) => wrangler("r2", "object", "delete", `${bucket}/${key}`, "--remote");
async function putObject(key, value) {
  const file = join(backupDir, "_staging", key.replace(/[^A-Za-z0-9._-]/g, "_") + ".json");
  mkdirSync(join(backupDir, "_staging"), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
  await wrangler("r2", "object", "put", `${bucket}/${key}`, "--file", file, "--remote", "--content-type", "application/json");
}

function backup(key, text) {
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(join(backupDir, key.replace(/[^A-Za-z0-9._-]/g, "_") + ".json"), text);
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const token = apiToken();
const acct = await accountId();
const keys = await listKeys(acct, token);
const pageKeys = keys.filter((k) => k.startsWith("page:"));
const commentKeys = keys.filter((k) => k.startsWith("comment:"));
console.log(`${keys.length} objects: ${pageKeys.length} pages, ${commentKeys.length} comments (${apply ? "APPLY" : "dry run"})`);

// Pass 1: pages. Keep the derived key of every page migrated here so its
// comments can be sealed in pass 2.
const pageState = new Map(); // id -> { status, key? }
let done = 0;
await pool(pageKeys, async (key) => {
  const id = key.slice("page:".length);
  let text;
  try {
    text = await getObject(key);
  } catch (err) {
    console.log(`  unreadable ${key}: ${String(err.stderr ?? err.message).split("\n").find((l) => l.includes("ERROR")) ?? "get failed"}`);
    pageState.set(id, { status: "unreadable" });
    done++;
    return;
  }
  const record = parse(text);
  let status;
  if (isStoredPage(record)) {
    status = "sealed-already";
  } else if (!isLegacyPage(record)) {
    status = "unrecognised";
  } else if (!record.pinned && Date.now() - new Date(record.createdAt).getTime() > TTL_MS) {
    status = "expired";
    if (apply) {
      backup(key, text);
      await deleteObject(key);
    }
  } else {
    status = "migrated";
    const { key: pageKey } = await derivePageKey(id, record.password);
    pageState.set(id, { status, key: pageKey });
    if (apply) {
      backup(key, text);
      await putObject(key, await migrateLegacyPage(id, record));
    }
  }
  if (!pageState.has(id)) pageState.set(id, { status });
  done++;
  if (done % 50 === 0) console.log(`  pages ${done}/${pageKeys.length}`);
});

// Pass 2: comments.
const commentState = [];
await pool(commentKeys, async (key) => {
  const [, id, cid] = key.match(/^comment:([^:]+):(.+)$/) ?? [];
  const page = pageState.get(id);
  let status;
  if (page?.status === "unreadable") {
    status = "skipped-page-unreadable";
  } else if (!page || page.status === "expired" || page.status === "unrecognised") {
    status = "orphan-deleted";
    if (apply) {
      backup(key, await getObject(key));
      await deleteObject(key);
    }
  } else {
    const text = await getObject(key);
    const record = parse(text);
    if (isStoredComment(record)) {
      status = "sealed-already";
    } else if (page.status === "sealed-already") {
      status = "deferred-to-worker"; // no password on hand; sealed on the page's next update
    } else if (record && typeof record.cid === "string") {
      status = "migrated";
      if (apply) {
        backup(key, text);
        await putObject(key, await sealComment(page.key, id, cid, record));
      }
    } else {
      status = "unrecognised";
    }
  }
  commentState.push({ key, status });
});

function tally(states) {
  const t = {};
  for (const s of states) t[s] = (t[s] ?? 0) + 1;
  return t;
}
console.log("pages:", tally([...pageState.values()].map((p) => p.status)));
console.log("comments:", tally(commentState.map((c) => c.status)));
for (const [id, p] of pageState) if (p.status === "unrecognised" || p.status === "unreadable") console.log(`  ${p.status} page: ${id}`);
for (const c of commentState) if (c.status !== "sealed-already" && c.status !== "migrated") console.log(`  ${c.status}: ${c.key}`);
if (apply) console.log(`originals copied to ${backupDir}; delete it once verified.`);
else console.log("dry run: nothing written. Re-run with --apply.");
