#!/usr/bin/env node
// Pin, unpin, or renew one HTMLDrop page in the production R2 bucket.
//
//   node scripts/pin-page.mjs "https://baseurl.ai/<id>?p=<password>"          # never expire
//   node scripts/pin-page.mjs "https://baseurl.ai/<id>?p=<password>" --unpin  # back to the 7-day TTL
//
// Needs the full link. Pages are sealed under a key derived from the password
// and the pin flag is bound into that ciphertext, so bucket access alone can
// neither read a page nor change its expiry; the owner has to hand over the
// link. Both directions reset createdAt to now (an unpinned page gets a full
// window instead of dying at the next read); `version` is left alone so open
// previews see no stale notice.
//
// Requires a logged-in wrangler and Node 22.18+ (imports src/envelope.ts under
// native type stripping).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLegacyPage, isStoredPage, resealPage } from "../src/envelope.ts";

const args = process.argv.slice(2);
const unpin = args.includes("--unpin");
const target = args.includes("--local") ? "--local" : "--remote"; // --local: wrangler's local bucket, for testing
const bucketIdx = args.indexOf("--bucket");
const bucket = bucketIdx >= 0 ? args[bucketIdx + 1] : "htmldrop-pages";
const link = args.find((a, i) => !a.startsWith("--") && (bucketIdx < 0 || i !== bucketIdx + 1));

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node scripts/pin-page.mjs "https://baseurl.ai/<id>?p=<password>" [--unpin] [--bucket <name>] [--local]');
  process.exit(2);
}

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

let record;
try {
  record = JSON.parse(wrangler("r2", "object", "get", key, target, "--pipe"));
} catch {
  console.error(`page:${id}: missing or not JSON`);
  process.exit(1);
}
if (!isStoredPage(record) && !isLegacyPage(record)) {
  console.error(`page:${id}: unrecognised record shape`);
  process.exit(1);
}

const before = record.pinned === true;
const next = await resealPage(id, password, record, {
  pinned: !unpin,
  createdAt: new Date().toISOString(),
});
if (!next) {
  console.error(`page:${id}: password does not match this page (or the stored record is corrupt)`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "htmldrop-pin-"));
const file = join(dir, "record.json");
try {
  writeFileSync(file, JSON.stringify(next));
  wrangler("r2", "object", "put", key, "--file", file, target, "--content-type", "application/json");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`page:${id}: pinned ${before} -> ${!unpin}; createdAt reset to ${next.createdAt}; sealed v2`);
