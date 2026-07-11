import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";

const fixtures = new URL("../cli/__tests__/fixtures/", import.meta.url);
const chromePath = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function fixturePath(name) {
  return new URL(name, fixtures);
}

async function importHomePage(tmpRoot) {
  const source = readFileSync(new URL("../src/pages/home.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulePath = join(tmpRoot, "home.mjs");
  writeFileSync(modulePath, output);
  return import(`file://${modulePath}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function waitForDevTools(port, stderr) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      await getJson(port, "/json/version");
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Chrome DevTools not ready: ${stderr()}`);
}

function openCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          pending.set(++id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { ws.close(); },
    });
    ws.onerror = reject;
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const handlers = pending.get(message.id);
        pending.delete(message.id);
        message.error ? handlers.rej(new Error(JSON.stringify(message.error))) : handlers.res(message.result);
      }
    };
  });
}

function startAppServer(html, capturedUploads) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/api/upload") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
          capturedUploads.push(JSON.parse(body));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ url: "http://preview.test/abc?p=secret", id: "abc", expiresAt: "2026-06-30T00:00:00.000Z" }));
        });
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function startChrome(port, profileDir) {
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  return { child, stderr: () => stderr };
}

async function runBrowserFlow(assetNames, mainHtml) {
  const tmpRoot = mkdtempSync(join(tmpdir(), "htmldrop-browser-test-"));
  const capturedUploads = [];
  let appServer;
  let chrome;
  try {
    const { homePage } = await importHomePage(tmpRoot);
    appServer = await startAppServer(homePage(), capturedUploads);
    const appPort = appServer.address().port;

    const filesDir = join(tmpRoot, "files");
    writeFileSync(join(tmpRoot, "placeholder"), "");
    await import("node:fs").then(fs => fs.mkdirSync(filesDir, { recursive: true }));
    const pagePath = join(filesDir, "page.html");
    writeFileSync(pagePath, mainHtml);
    const filePaths = [pagePath];
    for (const name of assetNames) {
      const target = join(filesDir, basename(name));
      copyFileSync(fixturePath(name), target);
      filePaths.push(target);
    }

    const cdpPort = 11333 + Math.floor(Math.random() * 1000);
    chrome = startChrome(cdpPort, join(tmpRoot, "chrome-profile"));
    await waitForDevTools(cdpPort, chrome.stderr);
    const target = (await getJson(cdpPort, "/json/list")).find(item => item.type === "page");
    const cdp = await openCdp(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${appPort}/` });
    await sleep(1000);

    const documentNode = await cdp.send("DOM.getDocument");
    const input = await cdp.send("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: "#fileInput" });
    await cdp.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: filePaths });

    const started = Date.now();
    while (capturedUploads.length === 0 && Date.now() - started < 15000) {
      await sleep(100);
    }
    assert.equal(capturedUploads.length, 1, "expected browser upload payload");

    async function inspectDataUri(dataUri) {
      const result = await cdp.send("Runtime.evaluate", {
        awaitPromise: true,
        returnByValue: true,
        expression: `
          (async () => {
            const img = new Image();
            img.src = ${JSON.stringify(dataUri)};
            await img.decode();
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const pixel = ctx.getImageData(0, 0, 1, 1).data;
            return { width: img.naturalWidth, height: img.naturalHeight, alpha00: pixel[3] };
          })()
        `,
      });
      return result.result.value;
    }

    const html = capturedUploads[0].html;
    const inspections = {};
    for (const name of ["sample", "tiny", "svg", "alpha"]) {
      const match = html.match(new RegExp(`<img[^>]+src="(data:[^"]+)"[^>]*data-name="${name}"`));
      if (match && !match[1].startsWith("data:image/svg+xml")) {
        inspections[name] = await inspectDataUri(match[1]);
      }
    }
    const inlineInfo = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: "document.getElementById('inlineInfo').textContent",
    });

    cdp.close();
    return { html, inspections, inlineInfoText: inlineInfo.result.value };
  } finally {
    if (chrome) {
      chrome.child.kill("SIGTERM");
      await sleep(500);
    }
    if (appServer) {
      await new Promise(resolve => appServer.close(resolve));
    }
    rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function dataUriFor(html, name) {
  const re = new RegExp(`<img[^>]+src="(data:[^"]+)"[^>]*data-name="${name}"`);
  const match = html.match(re);
  assert.ok(match, `missing data URI for ${name}`);
  return match[1];
}

const originalPngBase64Length = Math.ceil(readFileSync(fixturePath("sample-synthetic.png")).length / 3) * 4;
const browserResult = await runBrowserFlow(
  ["sample-synthetic.png", "tiny.webp", "vector.svg", "transparent-large.png"],
  '<!doctype html><img src="sample-synthetic.png" data-name="sample"><img src="tiny.webp" data-name="tiny"><img src="vector.svg" data-name="svg"><img src="transparent-large.png" data-name="alpha">'
);

const sampleUri = dataUriFor(browserResult.html, "sample");
assert.ok(sampleUri.startsWith("data:image/webp;base64,"));
const sampleBase64 = sampleUri.split(",", 2)[1];
assert.ok(sampleBase64.length < originalPngBase64Length);
assert.ok(sampleBase64.length <= 800000, `expected <= 800000 chars, got ${sampleBase64.length}`);
const sampleInfo = browserResult.inspections.sample;
assert.equal(sampleInfo.width, 1200);
assert.equal(sampleInfo.height, 750);

const tinyUri = dataUriFor(browserResult.html, "tiny");
assert.ok(tinyUri.startsWith("data:image/webp;base64,"));
assert.equal(tinyUri.split(",", 2)[1], readFileSync(fixturePath("tiny.webp")).toString("base64"));

const svgUri = dataUriFor(browserResult.html, "svg");
assert.ok(svgUri.startsWith("data:image/svg+xml;base64,"));
assert.equal(svgUri.split(",", 2)[1], readFileSync(fixturePath("vector.svg")).toString("base64"));

const alphaUri = dataUriFor(browserResult.html, "alpha");
assert.ok(alphaUri.startsWith("data:image/webp;base64,"));
const alphaInfo = browserResult.inspections.alpha;
assert.equal(alphaInfo.alpha00, 0);

assert.equal(browserResult.inlineInfoText, "4 inlined");

console.log("browser compression checks passed");
