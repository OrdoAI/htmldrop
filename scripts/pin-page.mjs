#!/usr/bin/env node
// Pin or unpin one HTMLDrop page in the production R2 bucket.
//
//   node scripts/pin-page.mjs <id>            # never expire
//   node scripts/pin-page.mjs <id> --unpin    # back to the 7-day TTL
//
// Operator-only: the upload API cannot set `pinned`. Both directions also reset
// `createdAt` to now, so an unpinned page gets a full 7 days instead of dying
// at the next read, and a pinned page still survives a Worker that predates the
// flag. `version` is left alone so open previews do not see a stale notice.
// Requires a logged-in wrangler with access to the bucket.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const unpin = args.includes("--unpin");
const bucketIdx = args.indexOf("--bucket");
const bucket = bucketIdx >= 0 ? args[bucketIdx + 1] : "htmldrop-pages";
const id = args.find((a, i) => !a.startsWith("--") && (bucketIdx < 0 || i !== bucketIdx + 1));

if (!id || !/^[A-Za-z0-9]{1,16}$/.test(id)) {
  console.error("usage: node scripts/pin-page.mjs <id> [--unpin] [--bucket <name>]");
  process.exit(2);
}

const key = `${bucket}/page:${id}`;

function wrangler(...cmd) {
  return execFileSync("npx", ["wrangler", ...cmd], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

const raw = wrangler("r2", "object", "get", key, "--remote", "--pipe");
let record;
try {
  record = JSON.parse(raw);
} catch {
  console.error(`page:${id}: stored object is not JSON`);
  process.exit(1);
}
for (const field of ["html", "password", "filename", "createdAt"]) {
  if (typeof record[field] !== "string") {
    console.error(`page:${id}: record is missing string field '${field}'`);
    process.exit(1);
  }
}

const before = record.pinned === true;
if (unpin) delete record.pinned;
else record.pinned = true;
record.createdAt = new Date().toISOString();

const dir = mkdtempSync(join(tmpdir(), "htmldrop-pin-"));
const file = join(dir, "record.json");
try {
  writeFileSync(file, JSON.stringify(record));
  wrangler("r2", "object", "put", key, "--file", file, "--remote", "--content-type", "application/json");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(
  `page:${id} (${record.filename}): pinned ${before} -> ${!unpin}; createdAt reset to ${record.createdAt}`,
);
