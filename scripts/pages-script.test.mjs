#!/usr/bin/env node
// The server-rendered pages carry inline scripts inside TypeScript template
// literals, which tsc never parses as JavaScript. This bundles src/pages/*,
// renders each page, and compiles every inline script, so an escape that
// survives one layer but not the other (a `\n` that becomes a real newline
// inside a JS string) fails here instead of in the browser.
//
//   npm run test:pages

import { build } from "esbuild";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import { readFileSync } from "node:fs";
import { GEN_PATH, mascotModule } from "./build-mascot.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const require = createRequire(import.meta.url);

async function load(entry) {
  const result = await build({
    entryPoints: [require.resolve(`../${entry}`)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

const pages = [
  ["src/pages/home.ts", "homePage", []],
  ["src/pages/password.ts", "passwordPage", ["abc12345", false]],
  ["src/pages/notfound.ts", "notFoundPage", []],
];

for (const [entry, fn, args] of pages) {
  test(`${entry}: every inline script compiles`, async () => {
    const mod = await load(entry);
    const html = mod[fn](...args);
    const scripts = inlineScripts(html);
    for (const [i, code] of scripts.entries()) {
      assert.doesNotThrow(() => new Script(code, { filename: `${entry}#script${i}` }), `${entry} inline script ${i}`);
    }
    assert.ok(scripts.some((s) => s.includes('localStorage.getItem("theme")')), "a saved theme is applied from <head>");
    assert.ok(html.indexOf('localStorage.getItem("theme")') < html.indexOf("<body"), "the theme boot script runs before the body");
    assert.ok(html.includes(":root[data-theme=dark]{"), "a picked dark theme overrides the system");
    assert.ok(html.includes("@media(prefers-color-scheme:dark){:root:not([data-theme=light]){"), "a picked light theme overrides the system");
    if (fn === "homePage") {
      assert.ok(html.includes('id="theme" role="radiogroup"'), "home page has the theme switch");
      assert.ok(scripts.length >= 1, "home page has an inline script");
      const upload = scripts.find((s) => s.includes("/api/upload"));
      assert.ok(upload, "home page script uploads");
      assert.ok(upload.includes("application/x-htmldrop-upload"), "home page uses the streaming shape");
      assert.ok(upload.includes("+'\\n'"), "metadata line ends with an escaped newline in the shipped script");
    }
  });
}

test("src/pages/home.ts: a failed request shows the Worker's text, or its status for anything else", async () => {
  const mod = await load("src/pages/home.ts");
  const src = inlineScripts(mod.homePage()).join("\n").match(/function failed\(r,what\)\{.*\}/)?.[0];
  assert.ok(src, "home page script defines failed()");
  const failed = new Script(`(${src})`).runInThisContext();
  const message = (res) => failed(res, "Upload").then(() => assert.fail("failed() resolved"), (e) => e.message);

  assert.equal(await message(new Response("Invalid metadata", { status: 400 })), "Invalid metadata");
  const edgePage = "<!DOCTYPE html><html><body><h1>Error 524</h1></body></html>";
  assert.equal(await message(new Response(edgePage, { status: 524, headers: { "Content-Type": "text/html" } })), "Upload failed (HTTP 524)");
  assert.equal(await message(new Response("x".repeat(301), { status: 500 })), "Upload failed (HTTP 500)");
  assert.equal(await message(new Response(null, { status: 502 })), "Upload failed (HTTP 502)");
});

test("src/mascot.gen.ts matches mascot/ (run npm run build:mascot)", async () => {
  assert.equal(readFileSync(GEN_PATH, "utf8"), await mascotModule());
});
