import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const cliPath = new URL("../index.mjs", import.meta.url);

const SAMPLE_COMMENTS = [
  { cid: "c1", anchor: { exact: "world", prefix: "hello ", suffix: "" }, author: "PM", text: "clarify", resolved: false },
];

function withServer(handler) {
  return new Promise((resolve, reject) => {
    const requests = [];
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        requests.push({ url: req.url, method: req.method, body });
        res.setHeader("Content-Type", "application/json");
        if (req.url.includes("/comments")) {
          res.end(JSON.stringify({ comments: SAMPLE_COMMENTS }));
        } else {
          res.end(JSON.stringify({ url: "http://preview.test/abc?p=secret", id: "abc", expiresAt: "2026-06-30T00:00:00.000Z" }));
        }
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const result = await handler(`http://127.0.0.1:${server.address().port}`, requests);
        server.close(() => resolve(result));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

function runCli(args, endpoint, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath.pathname, ...args], {
      cwd: cwd ?? tmpdir(),
      env: { ...process.env, HTMLDROP_URL: endpoint },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { stderr += c; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("comments <url> fetches via ?p= and prints JSON without uploading", async () => {
  await withServer(async (endpoint, requests) => {
    const result = await runCli(["comments", `${endpoint}/abc?p=secret`], endpoint);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].url, "/abc/comments?p=secret");
    const printed = JSON.parse(result.stdout);
    assert.equal(printed[0].cid, "c1");
    assert.ok(requests.every((r) => !r.url.includes("/api/upload")));
  });
});

test("comments with a URL missing ?p= fails locally before any request", async () => {
  await withServer(async (endpoint, requests) => {
    const result = await runCli(["comments", `${endpoint}/abc`], endpoint);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /password/);
    assert.equal(requests.length, 0);
  });
});

test("update --comment-anchors includes the remaps in the upload payload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-anchors-"));
  try {
    const page = join(dir, "page.html");
    writeFileSync(page, "<!doctype html><p>updated</p>");
    const anchors = join(dir, "anchors.json");
    const remaps = [{ cid: "c1", anchor: { exact: "updated", prefix: "", suffix: "" } }];
    writeFileSync(anchors, JSON.stringify(remaps));
    await withServer(async (endpoint, requests) => {
      const result = await runCli(
        ["update", `${endpoint}/abc?p=secret`, page, "--comment-anchors", anchors],
        endpoint,
      );
      assert.equal(result.code, 0, result.stderr);
      const upload = requests.find((r) => r.url === "/api/upload");
      assert.ok(upload, "expected an upload request");
      const payload = JSON.parse(upload.body);
      assert.deepEqual(payload.commentAnchors, remaps);
      assert.equal(payload.id, "abc");
      assert.equal(payload.password, "secret");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("update without --comment-anchors sends no commentAnchors field", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-anchors-"));
  try {
    const page = join(dir, "page.html");
    writeFileSync(page, "<!doctype html><p>x</p>");
    await withServer(async (endpoint, requests) => {
      const result = await runCli(["update", `${endpoint}/abc?p=secret`, page], endpoint);
      assert.equal(result.code, 0, result.stderr);
      const payload = JSON.parse(requests.find((r) => r.url === "/api/upload").body);
      assert.equal("commentAnchors" in payload, false);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid JSON in --comment-anchors fails locally before upload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-anchors-"));
  try {
    const page = join(dir, "page.html");
    writeFileSync(page, "<p>x</p>");
    const anchors = join(dir, "bad.json");
    writeFileSync(anchors, "{ not json");
    await withServer(async (endpoint, requests) => {
      const result = await runCli(
        ["update", `${endpoint}/abc?p=secret`, page, "--comment-anchors", anchors],
        endpoint,
      );
      assert.equal(result.code, 1);
      assert.match(result.stderr, /invalid JSON/);
      assert.equal(requests.length, 0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing --comment-anchors file fails locally", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-anchors-"));
  try {
    const page = join(dir, "page.html");
    writeFileSync(page, "<p>x</p>");
    await withServer(async (endpoint, requests) => {
      const result = await runCli(
        ["update", `${endpoint}/abc?p=secret`, page, "--comment-anchors", join(dir, "nope.json")],
        endpoint,
      );
      assert.equal(result.code, 1);
      assert.match(result.stderr, /not found/);
      assert.equal(requests.length, 0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--comment-anchors is rejected with create", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-anchors-"));
  try {
    const page = join(dir, "page.html");
    writeFileSync(page, "<p>x</p>");
    const anchors = join(dir, "a.json");
    writeFileSync(anchors, "[]");
    await withServer(async (endpoint, requests) => {
      const result = await runCli(["create", page, "--comment-anchors", anchors], endpoint);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /only valid with 'update'/);
      assert.equal(requests.length, 0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("help mentions comments and --comment-anchors", async () => {
  const result = await runCli(["--help"], "http://127.0.0.1:1");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /comments <url>/);
  assert.match(result.stdout, /--comment-anchors/);
});
