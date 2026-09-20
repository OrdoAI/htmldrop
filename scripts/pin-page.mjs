#!/usr/bin/env node
// Operator changes to one HTMLDrop page's metadata, given its edit link.
//
//   node scripts/pin-page.mjs "https://baseurl.ai/<id>?p=<password>" --pin        # never expire
//   ... --unpin                                                                   # back to the expiry window
//   ... --renew                                                                   # restart the expiry window
//   ... --public | --private                                                      # bare-URL readable or not
//   ... --expires <days>                                                          # window length, 1-30
//   flags combine; add --local to act on wrangler's local store (testing)
//
// Needs the full link. Pages are sealed under a key derived from the password
// and the metadata is bound into that ciphertext, so bucket access alone can
// neither read a private page nor change its expiry; the owner has to hand
// over the link. --pin and --unpin also restart the window (an unpinned page
// gets a full one instead of dying at the next read). `version` is left alone
// so open previews see no stale notice.
//
// Works on both storage formats: a v3 object (binary, chunked) is re-sealed
// whole, a v2 JSON record through the older path.
//
// Requires a logged-in wrangler and Node 22.18+ (imports src/envelope.ts under
// native type stripping).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLegacyPage, isStoredPage, isV3Prefix, parseV3Header, resealPage, resealPageV3 } from "../src/envelope.ts";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const target = args.includes("--local") ? "--local" : "--remote"; // --local: wrangler's local bucket, for testing
const bucketIdx = args.indexOf("--bucket");
const bucket = bucketIdx >= 0 ? args[bucketIdx + 1] : "htmldrop-pages";
const expiresIdx = args.indexOf("--expires");
const valueIdx = new Set([bucketIdx + 1, expiresIdx + 1].filter((i) => i > 0));
const link = args.find((a, i) => !a.startsWith("--") && !valueIdx.has(i));

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node scripts/pin-page.mjs "https://baseurl.ai/<id>?p=<password>" (--pin|--unpin|--renew|--public|--private|--expires <days>)... [--bucket <name>] [--local]');
  process.exit(2);
}

const patch = {};
if (has("--pin") && has("--unpin")) usage("--pin and --unpin are mutually exclusive");
if (has("--public") && has("--private")) usage("--public and --private are mutually exclusive");
if (has("--pin")) { patch.pinned = true; patch.createdAt = new Date().toISOString(); }
if (has("--unpin")) { patch.pinned = false; patch.createdAt = new Date().toISOString(); }
if (has("--renew")) patch.createdAt = new Date().toISOString();
if (has("--public")) patch.public = true;
if (has("--private")) patch.public = false;
if (expiresIdx >= 0) {
  const days = Number(args[expiresIdx + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 30) usage("--expires must be a whole number of days from 1 to 30");
  patch.ttlDays = days;
}
if (Object.keys(patch).length === 0) usage("nothing to do: pass at least one action flag");

let id = "";
let password = "";
try {
  const url = new URL(link ?? "");
  id = url.pathname.replace(/^\/+/, "");
  password = url.searchParams.get("p") ?? "";
} catch {
  usage("not a URL");
}
if (!/^[A-Za-z0-9]{1,16}$/.test(id)) usage("link has no page id");
if (!password) usage("link has no ?p= password");

const key = `${bucket}/page:${id}`;

function wrangler(...cmd) {
  return execFileSync("npx", ["wrangler", ...cmd], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Read to a file, never through a text pipe: a v3 object is binary.
const dir = mkdtempSync(join(tmpdir(), "htmldrop-pin-"));
const inFile = join(dir, "object.bin");
const outFile = join(dir, "next.bin");
let bytes;
try {
  wrangler("r2", "object", "get", key, target, "--file", inFile);
  bytes = new Uint8Array(readFileSync(inFile));
} catch {
  console.error(`page:${id}: missing or unreadable`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

const summary = (h) => ({ pinned: h.pinned === true, public: typeof h.open === "string", ttlDays: h.ttlDays ?? 7 });
let before;
let after;
let nextBytes;
let contentType;
let format;
try {
  if (isV3Prefix(bytes)) {
    const parsed = parseV3Header(bytes);
    if (!parsed) fail(`page:${id}: unrecognised v3 object`);
    before = summary(parsed.header);
    const next = await resealPageV3(id, password, bytes, patch);
    if (!next) fail(`page:${id}: password does not match this page (or the stored object is corrupt)`);
    after = { ...summary(parseV3Header(next).header), createdAt: parseV3Header(next).header.createdAt };
    nextBytes = next;
    contentType = "application/octet-stream";
    format = "v3";
  } else {
    let record;
    try {
      record = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      fail(`page:${id}: not JSON`);
    }
    if (!isStoredPage(record) && !isLegacyPage(record)) fail(`page:${id}: unrecognised record shape`);
    before = summary(record);
    const next = await resealPage(id, password, record, patch);
    if (!next) fail(`page:${id}: password does not match this page (or the stored record is corrupt)`);
    after = { ...summary(next), createdAt: next.createdAt };
    nextBytes = new TextEncoder().encode(JSON.stringify(next));
    contentType = "application/json";
    format = "v2";
  }
  writeFileSync(outFile, nextBytes);
  wrangler("r2", "object", "put", key, "--file", outFile, target, "--content-type", contentType);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const show = (k) => (before[k] === after[k] ? `${k}=${after[k]}` : `${k} ${before[k]} -> ${after[k]}`);
console.log(`page:${id}: ${show("pinned")}; ${show("public")}; ${show("ttlDays")}; createdAt ${after.createdAt}; sealed ${format}`);
