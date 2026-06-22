import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const shellPath = new URL("../htmldrop", import.meta.url);
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

function runShell(args, endpoint, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [shellPath.pathname, ...args], {
      env: { ...process.env, HTMLDROP_URL: endpoint, ...extraEnv },
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

function makePage(dir, imageName) {
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

test("shell CLI uses cwebp when available", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-shell-cwebp-"));
  try {
    const pagePath = makePage(dir, "sample-synthetic.png");
    await withServer(async (endpoint, requests) => {
      const result = await runShell([pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      const payload = JSON.parse(requests[0].body);
      const dataUri = extractDataUri(payload.html);
      assert.ok(dataUri.startsWith("data:image/webp;base64,"));
      const base64 = dataUri.split(",", 2)[1];
      assert.ok(base64.length < Math.ceil(readFileSync(fixturePath("sample-synthetic.png")).length / 3) * 4);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shell CLI falls back cleanly when cwebp is absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-shell-no-cwebp-"));
  try {
    const pagePath = makePage(dir, "sample-synthetic.png");
    await withServer(async (endpoint, requests) => {
      const result = await runShell([pagePath], endpoint, { PATH: "/usr/bin:/bin" });
      assert.equal(result.code, 0, result.stderr);
      const payload = JSON.parse(requests[0].body);
      const dataUri = extractDataUri(payload.html);
      assert.ok(dataUri.startsWith("data:image/png;base64,"));
      const base64 = dataUri.split(",", 2)[1];
      assert.equal(base64, readFileSync(fixturePath("sample-synthetic.png")).toString("base64"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shell CLI keeps SVG unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "htmldrop-shell-svg-"));
  try {
    const pagePath = makePage(dir, "vector.svg");
    await withServer(async (endpoint, requests) => {
      const result = await runShell([pagePath], endpoint);
      assert.equal(result.code, 0, result.stderr);
      const payload = JSON.parse(requests[0].body);
      const dataUri = extractDataUri(payload.html);
      assert.ok(dataUri.startsWith("data:image/svg+xml;base64,"));
      const base64 = dataUri.split(",", 2)[1];
      assert.equal(base64, readFileSync(fixturePath("vector.svg")).toString("base64"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
