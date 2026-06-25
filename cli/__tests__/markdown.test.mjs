import { buildMarkdownPage, injectToolbarIntoHtml } from "../markdown-page.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const ISLAND = /<script type="text\/plain" id="hdmd-src">([^<]*)<\/script>/;

test("markdown page has a 3-state Copy for LLM button + script and keeps rendered html", () => {
  const html = buildMarkdownPage("<h1>Hi</h1>", "# Hi");
  assert.match(html, /title="Copy for LLM"/, "copy button present");
  assert.match(html, /hdmd-ico-copy/, "idle icon");
  assert.match(html, /hdmd-ico-spin/, "busy spinner icon");
  assert.match(html, /hdmd-ico-check/, "done check icon");
  assert.match(html, /Copying\.\.\./, "busy label in script");
  assert.match(html, /Copied!/, "done label in script");
  assert.match(html, /navigator\.clipboard/, "copy script present");
  assert.match(html, /class="hdmd-bar"/, "bar flows inline on markdown page");
  assert.ok(html.includes("<h1>Hi</h1>"), "rendered html kept");
});

test("base64 source island round-trips non-ASCII and a literal </script>", () => {
  const raw = "# 标题\n\nHello </script> 世界 ✨\n\n```js\nconst x = 1;\n```\n";
  const html = buildMarkdownPage("<p>rendered</p>", raw);
  const m = html.match(ISLAND);
  assert.ok(m, "data island matched");
  assert.equal(Buffer.from(m[1], "base64").toString("utf-8"), raw);
});

test("injectToolbarIntoHtml injects a floating Copy bar before </body> and preserves the page", () => {
  const userHtml = `<!doctype html><html><head><title>T</title></head><body><h1>用户页面</h1><p>x</p></body></html>`;
  const out = injectToolbarIntoHtml(userHtml, "# 用户页面\n\nx");
  assert.ok(out.includes("<h1>用户页面</h1>"), "original content preserved");
  assert.ok(out.includes('class="hdmd-bar hdmd-float"'), "floating bar for html upload");
  assert.ok(out.includes('title="Copy for LLM"'), "copy button injected");
  assert.ok(out.indexOf("hdmd-bar") < out.indexOf("</body>"), "injected inside body");
  const m = out.match(ISLAND);
  assert.equal(Buffer.from(m[1], "base64").toString("utf-8"), "# 用户页面\n\nx");
});

test("injectToolbarIntoHtml appends when there is no </body>", () => {
  const out = injectToolbarIntoHtml("<h1>fragment</h1>", "# fragment");
  assert.ok(out.includes("<h1>fragment</h1>") && out.includes('title="Copy for LLM"'));
});

test("injected toolbar markup has no src/href that CLI inlineAssets would mangle", () => {
  const block = injectToolbarIntoHtml("<body></body>", "x").replace(/<\/?body>/g, "");
  assert.ok(!/<img\b[^>]*\bsrc\s*=/i.test(block), "no <img src=");
  assert.ok(!/<link\b[^>]*\bhref\s*=/i.test(block), "no <link href=");
  assert.ok(!/<script\b[^>]*\bsrc\s*=/i.test(block), "no <script src=");
});
