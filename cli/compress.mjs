import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import encodeWebp, { init as initWebpEncode } from "@jsquash/webp/encode.js";
import { simd } from "wasm-feature-detect";

const require = createRequire(import.meta.url);
const DEFAULT_QUALITY = 82;
const DEFAULT_MIN_BYTES = 4096;
const COMPRESSIBLE_MIMES = new Set(["image/png", "image/jpeg"]);

let encoderReady;

function normalizeMime(mime) {
  const lower = (mime || "").toLowerCase();
  return lower === "image/jpg" ? "image/jpeg" : lower;
}

function originalResult(buffer, mime) {
  return {
    buffer,
    mime: normalizeMime(mime) || "application/octet-stream",
    compressed: false,
  };
}

async function initEncoder() {
  if (!encoderReady) {
    encoderReady = (async () => {
      const packagePath = require.resolve("@jsquash/webp/package.json");
      const codecDir = join(dirname(packagePath), "codec", "enc");
      const wasmName = await simd() ? "webp_enc_simd.wasm" : "webp_enc.wasm";
      const wasmModule = await WebAssembly.compile(readFileSync(join(codecDir, wasmName)));
      await initWebpEncode(wasmModule);
    })();
  }
  return encoderReady;
}

function decodeImage(buffer, mime) {
  if (mime === "image/png") {
    const png = PNG.sync.read(buffer);
    return {
      data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
      width: png.width,
      height: png.height,
    };
  }

  const jpg = jpeg.decode(buffer, { useTArray: true });
  return {
    data: new Uint8ClampedArray(jpg.data.buffer, jpg.data.byteOffset, jpg.data.byteLength),
    width: jpg.width,
    height: jpg.height,
  };
}

export function canCompressMime(mime) {
  return COMPRESSIBLE_MIMES.has(normalizeMime(mime));
}

export async function compressImage(input, mime, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const sourceMime = normalizeMime(mime);
  const minBytes = options.minBytes ?? DEFAULT_MIN_BYTES;
  const quality = options.quality ?? DEFAULT_QUALITY;

  if (!canCompressMime(sourceMime) || buffer.length < minBytes) {
    return originalResult(buffer, sourceMime);
  }

  let imageData;
  try {
    imageData = decodeImage(buffer, sourceMime);
  } catch {
    return originalResult(buffer, sourceMime);
  }

  try {
    await initEncoder();
    const webp = Buffer.from(await encodeWebp(imageData, { quality }));
    if (webp.length > 0 && webp.length < buffer.length) {
      return {
        buffer: webp,
        mime: "image/webp",
        compressed: true,
        width: imageData.width,
        height: imageData.height,
      };
    }
  } catch {
    return originalResult(buffer, sourceMime);
  }

  return originalResult(buffer, sourceMime);
}
