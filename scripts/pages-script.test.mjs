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
    if (fn === "homePage") {
      assert.ok(scripts.length >= 1, "home page has an inline script");
      const upload = scripts.find((s) => s.includes("/api/upload"));
      assert.ok(upload, "home page script uploads");
      assert.ok(upload.includes("application/x-htmldrop-upload"), "home page uses the streaming shape");
      assert.ok(upload.includes("+'\\n'"), "metadata line ends with an escaped newline in the shipped script");
    }
  });
}
