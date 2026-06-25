import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const cliPath = new URL("../index.mjs", import.meta.url);
const fixtures = new URL("./fixtures/", import.meta.url);

function fixturePath(name) {
  return new URL(name, fixtures);
}

function withServer(handler) {
  return new Promise((resolve, reject) => {
    const requests = [];
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        requests.push({ url: req.url, body });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ url: "http://preview.test/abc?p=secret", id: "abc", expiresAt: "2026-06-30T00:00:00.000Z" }));
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const port = server.address().port;
        const result = await handler(`http://127.0.0.1:${port}`, requests);
        server.close(() => resolve(result));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

function runCli(args, endpoint) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath.pathname, ...args], {
      cwd: root.pathname,
      env: { ...process.env, HTMLDROP_URL: endpoint },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

function makePage(dir, imageName = "sample-synthetic.png") {
  copyFileSync(fixturePath(imageName), join(dir, basename(imageName)));
  const pagePath = join(dir, "page.html");
  writeFileSync(pagePath, `<!doctype html><img src="${imageName}">`);
  return pagePath;
}

function extractDataUri(html) {
  const match = html.match(/src="(data:[^"]+)"/);
  assert.ok(match, "expected an inlined data URI");
  return match[1];
}

test("npm CLI compresses local PNG assets before Base64 inlining", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-e2e-"));
  try {
    const pagePath = makePage(dir);
    await withServer(async (endpoint, requests) => {
      const result = await runCli([pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].body);
      const dataUri = extractDataUri(payload.html);
      assert.ok(dataUri.startsWith("data:image/webp;base64,"));
      const base64 = dataUri.split(",", 2)[1];
      assert.ok(base64.length <= 800000, `expected <= 800000 chars, got ${base64.length}`);
      assert.ok(base64.length < Math.ceil(readFileSync(fixturePath("sample-synthetic.png")).length / 3) * 4);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--no-inline leaves local references untouched", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-no-inline-"));
  try {
    const pagePath = makePage(dir);
    await withServer(async (endpoint, requests) => {
      const result = await runCli(["--no-inline", pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].body);
      assert.ok(payload.html.includes('src="sample-synthetic.png"'));
      assert.ok(!payload.html.includes("data:image/"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--update parses id and password from the link and sends them in the payload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-update-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const result = await runCli(["--update", "http://preview.test/myid?p=mypass", pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].body);
      assert.equal(payload.id, "myid");
      assert.equal(payload.password, "mypass");
      assert.ok(result.stdout.includes("http://preview.test/abc?p=secret"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--update with a malformed or incomplete link fails locally without uploading", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-cli-update-bad-"));
  try {
    const pagePath = join(dir, "page.html");
    writeFileSync(pagePath, "<!doctype html><h1>hi</h1>");
    await withServer(async (endpoint, requests) => {
      const bad = await runCli(["--update", "not-a-valid-url", pagePath], endpoint);
      assert.notEqual(bad.code, 0);
      const noPassword = await runCli(["--update", "http://preview.test/myid", pagePath], endpoint);
      assert.notEqual(noPassword.code, 0);
      assert.equal(requests.length, 0, "no upload should be attempted for a bad --update URL");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
