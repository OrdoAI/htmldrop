import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import decodeWebp, { init as initWebpDecode } from "@jsquash/webp/decode.js";
import { PNG } from "pngjs";
import { compressImage } from "../compress.mjs";

const require = createRequire(import.meta.url);
const fixtures = new URL("./fixtures/", import.meta.url);
let decoderReady;

function fixture(name) {
  return readFileSync(new URL(name, fixtures));
}

async function initDecoder() {
  if (!decoderReady) {
    decoderReady = (async () => {
      const packagePath = require.resolve("@jsquash/webp/package.json");
      const wasmPath = join(dirname(packagePath), "codec", "dec", "webp_dec.wasm");
      const wasmModule = await WebAssembly.compile(readFileSync(wasmPath));
      await initWebpDecode(wasmModule);
    })();
  }
  return decoderReady;
}

async function decodeWebpBuffer(buffer) {
  await initDecoder();
  return decodeWebp(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function assertSameBuffer(actual, expected) {
  assert.equal(Buffer.compare(actual, expected), 0);
}

test("compresses the large PNG fixture to same-dimension WebP", async () => {
  const original = fixture("sample-synthetic.png");
  const result = await compressImage(original, "image/png");
  assert.equal(result.mime, "image/webp");
  assert.equal(result.compressed, true);
  assert.ok(result.buffer.length < original.length);
  assert.ok(result.buffer.length <= 600000, `expected <= 600000 bytes, got ${result.buffer.length}`);

  const decoded = await decodeWebpBuffer(result.buffer);
  assert.equal(decoded.width, 1200);
  assert.equal(decoded.height, 750);
});

test("compresses JPEG input when WebP is smaller", async () => {
  const original = fixture("sample.jpg");
  const result = await compressImage(original, "image/jpeg");
  assert.equal(result.mime, "image/webp");
  assert.equal(result.compressed, true);
  assert.ok(result.buffer.length < original.length);

  const decoded = await decodeWebpBuffer(result.buffer);
  assert.equal(decoded.width, 640);
  assert.equal(decoded.height, 400);
});

test("keeps small inputs unchanged", async () => {
  const original = fixture("transparent.png");
  const result = await compressImage(original, "image/png");
  assert.equal(result.mime, "image/png");
  assert.equal(result.compressed, false);
  assertSameBuffer(result.buffer, original);
});

test("keeps original when PNG decode fails", async () => {
  const original = fixture("invalid-one-pixel.png");
  assert.throws(() => PNG.sync.read(original), /unrecognised content at end of stream/);
  const result = await compressImage(original, "image/png", { minBytes: 0 });
  assert.equal(result.mime, "image/png");
  assert.equal(result.compressed, false);
  assertSameBuffer(result.buffer, original);
});

test("keeps original when encoded WebP is not smaller", async () => {
  const original = fixture("encoded-not-smaller.png");
  const decoded = PNG.sync.read(original);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);

  const result = await compressImage(original, "image/png", { minBytes: 0 });
  assert.equal(result.mime, "image/png");
  assert.equal(result.compressed, false);
  assertSameBuffer(result.buffer, original);
});

test("skips unsupported formats without invoking the encoder path", async () => {
  const svg = fixture("vector.svg");
  const cases = [
    ["image/svg+xml", svg],
    ["image/gif", Buffer.from("GIF89a")],
    ["image/avif", Buffer.from("avif")],
    ["image/x-icon", Buffer.from("ico")],
    ["image/bmp", Buffer.from("bmp")],
  ];

  for (const [mime, original] of cases) {
    const result = await compressImage(original, mime);
    assert.equal(result.mime, mime);
    assert.equal(result.compressed, false);
    assertSameBuffer(result.buffer, original);
  }
});

test("skips WebP input this round", async () => {
  const original = fixture("tiny.webp");
  const result = await compressImage(original, "image/webp");
  assert.equal(result.mime, "image/webp");
  assert.equal(result.compressed, false);
  assertSameBuffer(result.buffer, original);
});
