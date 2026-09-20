import { describe, it, expect } from "vitest";
import {
  type PageMeta,
  V3_CHUNK_BYTES,
  V3_MAX_HEADER_BYTES,
  bytesToStream,
  collectStream,
  derivePageKey,
  isStoredPageV3,
  openPageV3,
  openPageV3Bytes,
  parseV3Header,
  resealPageV3,
  sealPageV3,
  sealPageV3Bytes,
  v3FrameCount,
} from "../envelope";
import { chunked, encodeObject } from "./v3-helpers";

const ID = "abcDEF12";
const PW = "passwordpassword";
const META: PageMeta = { id: ID, createdAt: "2026-09-01T00:00:00.000Z", version: "v-1" };
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function pattern(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7 + (i >> 8)) & 0xff;
  return out;
}

async function sealed(plain: Uint8Array, meta = META, filename = "hi.html") {
  const pk = await derivePageKey(ID, PW);
  return { pk, object: await sealPageV3Bytes(pk, meta, filename, plain) };
}

describe("storage v3 round-trip", () => {
  it.each([
    ["empty", 0],
    ["one byte", 1],
    ["under one frame", 4096],
    ["exactly one frame", V3_CHUNK_BYTES],
    ["exactly two frames", 2 * V3_CHUNK_BYTES],
    ["two and a half frames", 2 * V3_CHUNK_BYTES + V3_CHUNK_BYTES / 2],
  ])("%s", async (_name, size) => {
    const plain = pattern(size);
    const { pk, object } = await sealed(plain);
    const parsed = parseV3Header(object)!;
    expect(parsed.header.bytes).toBe(size);
    expect(v3FrameCount(size, V3_CHUNK_BYTES)).toBe(Math.max(1, Math.ceil(size / V3_CHUNK_BYTES)));
    const opened = await openPageV3Bytes(pk.key, ID, object);
    expect(opened).not.toBeNull();
    expect(opened!.filename).toBe("hi.html");
    expect(opened!.html).toEqual(plain);
  });

  it("streams identically whatever the input chunking, including boundaries inside a frame", async () => {
    const plain = pattern(V3_CHUNK_BYTES + 12345);
    const pk = await derivePageKey(ID, PW);
    const sealer = await sealPageV3(pk, META, "x.html", plain.length);
    const object = await collectStream(sealer.seal(chunked(plain, 1000)));
    expect(object.length).toBe(sealer.objectBytes);
    const parsed = parseV3Header(object)!;
    const opened = (await openPageV3(pk.key, ID, parsed.header))!;
    const back = await collectStream(opened.decrypt(chunked(object.subarray(parsed.end), 777)));
    expect(back).toEqual(plain);
  });

  it("hides filename and content, and never stores the password or key", async () => {
    const { object } = await sealed(enc("<h1>secret body</h1>"), META, "secret-name.html");
    const text = new TextDecoder("latin1").decode(object);
    expect(text).not.toContain("secret body");
    expect(text).not.toContain("secret-name");
    expect(text).not.toContain(PW);
    const h = parseV3Header(object)!.header;
    expect(h.open).toBeUndefined();
    expect(JSON.stringify(h)).not.toContain("secret-name");
  });

  it("a public seal carries the key beside the ciphertext and still binds it", async () => {
    const { pk, object } = await sealed(enc("<p>pub</p>"), { ...META, public: true });
    const h = parseV3Header(object)!.header;
    expect(h.open).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await openPageV3Bytes(pk.key, ID, object)).not.toBeNull();
    const dropped = encodeObject({ ...h, open: undefined }, object.subarray(parseV3Header(object)!.end));
    expect(await openPageV3Bytes(pk.key, ID, dropped)).toBeNull();
  });

  it("the sealer refuses a body that is shorter or longer than declared", async () => {
    const pk = await derivePageKey(ID, PW);
    for (const [declared, actual] of [[10, 9], [10, 11], [V3_CHUNK_BYTES, V3_CHUNK_BYTES + 1]]) {
      const sealer = await sealPageV3(pk, META, "x.html", declared);
      await expect(collectStream(sealer.seal(bytesToStream(pattern(actual))))).rejects.toThrow(/declared/);
    }
  });
});

describe("storage v3 fails closed", () => {
  it("with the wrong key, before any frame is read", async () => {
    const { object } = await sealed(enc("<p>x</p>"));
    const other = await derivePageKey(ID, "otherpassword000");
    expect(await openPageV3(other.key, ID, parseV3Header(object)!.header)).toBeNull();
    expect(await openPageV3Bytes(other.key, ID, object)).toBeNull();
  });

  it("when any header field is edited after sealing", async () => {
    const { pk, object } = await sealed(enc("<p>x</p>"), { ...META, ttlDays: 7 });
    const { header, end } = parseV3Header(object)!;
    const frames = object.subarray(end);
    const edits: Array<Record<string, unknown>> = [
      { createdAt: "2027-01-01T00:00:00.000Z" },
      { version: "v-2" },
      { pinned: true },
      { ttlDays: 30 },
      { ttlDays: undefined },
      { verifier: "0".repeat(64) },
      { seal: "AAAAAAAAAAAAAAAAAAAAAA" },
      { bytes: header.bytes + 1 },
      { chunk: 2048 },
      { open: "A".repeat(43) },
    ];
    for (const patch of edits) {
      const h: Record<string, unknown> = { ...header, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete h[k];
      expect(await openPageV3(pk.key, ID, h as never), JSON.stringify(patch)).toBeNull();
      expect(await openPageV3Bytes(pk.key, ID, encodeObject(h, frames)), JSON.stringify(patch)).toBeNull();
    }
    expect(await openPageV3(pk.key, "otherid1", header)).toBeNull();
  });

  it("on a truncated, extended, reordered, or substituted frame", async () => {
    const plain = pattern(2 * V3_CHUNK_BYTES + 100);
    const { pk, object } = await sealed(plain);
    const { header, end } = parseV3Header(object)!;
    const frames = object.subarray(end);
    const frameLen = V3_CHUNK_BYTES + 16;
    const open = (f: Uint8Array) => openPageV3Bytes(pk.key, ID, encodeObject(header, f));

    expect(await open(frames.subarray(0, frames.length - 1))).toBeNull(); // last byte gone
    expect(await open(frames.subarray(0, 2 * frameLen))).toBeNull(); // last frame gone
    expect(await open(new Uint8Array([...frames, 0]))).toBeNull(); // trailing byte
    const swapped = new Uint8Array(frames);
    swapped.set(frames.subarray(frameLen, 2 * frameLen), 0);
    swapped.set(frames.subarray(0, frameLen), frameLen);
    expect(await open(swapped)).toBeNull();
    const flipped = new Uint8Array(frames);
    flipped[frameLen + 5] ^= 1;
    expect(await open(flipped)).toBeNull();

    // A frame from another seal of the same page and content
    const { object: other } = await sealed(plain);
    const otherFrames = other.subarray(parseV3Header(other)!.end);
    const mixed = new Uint8Array(frames);
    mixed.set(otherFrames.subarray(0, frameLen), 0);
    expect(await open(mixed)).toBeNull();

    // and the streaming reader reports which frame failed rather than hanging
    const opened = (await openPageV3(pk.key, ID, header))!;
    await expect(collectStream(opened.decrypt(bytesToStream(flipped)))).rejects.toThrow(/frame 1/);
    await expect(collectStream(opened.decrypt(bytesToStream(frames.subarray(0, 2 * frameLen))))).rejects.toThrow(/ends after frame 2 of 3/);
  });

  it("parseV3Header rejects a bad magic, an oversized or truncated header, and bad fields", async () => {
    const { object } = await sealed(enc("<p>x</p>"));
    const { header, end } = parseV3Header(object)!;
    expect(parseV3Header(enc("{\"v\":2}"))).toBeNull();
    expect(parseV3Header(object.subarray(0, end - 1))).toBeNull();
    const huge = new Uint8Array(object);
    huge[4] = 0x01; // L = 16 MiB + …
    expect(parseV3Header(huge)).toBeNull();
    const cap = new Uint8Array(8 + V3_MAX_HEADER_BYTES + 1);
    cap.set([0x48, 0x44, 0x50, 0x33]);
    cap[6] = 0x40; cap[7] = 0x01; // L = 16385
    expect(parseV3Header(cap)).toBeNull();
    for (const bad of [
      { v: 2 }, { verifier: "xyz" }, { createdAt: "yesterday" }, { version: "" }, { pinned: false },
      { ttlDays: 0 }, { ttlDays: 1.5 }, { bytes: -1 }, { bytes: 51 * 1024 * 1024 }, { chunk: 1 },
      { seal: "short" }, { meta: {} }, { open: "tooshort" },
    ]) {
      expect(isStoredPageV3({ ...header, ...bad }), JSON.stringify(bad)).toBe(false);
    }
    expect(isStoredPageV3(header)).toBe(true);
  });

  it("caps the header so a long filename cannot push it past the prefix read", async () => {
    const pk = await derivePageKey(ID, PW);
    const worst = "".repeat(1024); // 1 KiB of bytes that JSON escapes 6x
    const object = await sealPageV3Bytes(pk, META, worst, enc("<p>x</p>"));
    expect(parseV3Header(object)!.end - 8).toBeLessThanOrEqual(V3_MAX_HEADER_BYTES);
    expect((await openPageV3Bytes(pk.key, ID, object))!.filename).toBe(worst);
    await expect(sealPageV3(pk, META, "".repeat(4000), 1)).rejects.toThrow(/header too large/);
  });
});

describe("resealPageV3", () => {
  it("pins, renews, unpins, changes visibility and window, keeping content, filename and version", async () => {
    const plain = pattern(V3_CHUNK_BYTES + 5);
    const { pk, object } = await sealed(plain, META, "keep.html");
    const pinned = (await resealPageV3(ID, PW, object, { pinned: true, createdAt: "2026-09-10T00:00:00.000Z" }))!;
    let h = parseV3Header(pinned)!.header;
    expect(h.pinned).toBe(true);
    expect(h.createdAt).toBe("2026-09-10T00:00:00.000Z");
    expect(h.version).toBe("v-1");
    expect(h.seal).not.toBe(parseV3Header(object)!.header.seal);
    const back = (await openPageV3Bytes(pk.key, ID, pinned))!;
    expect(back.html).toEqual(plain);
    expect(back.filename).toBe("keep.html");

    const pub = (await resealPageV3(ID, PW, pinned, { pinned: false, public: true, ttlDays: 21 }))!;
    h = parseV3Header(pub)!.header;
    expect(h.pinned).toBeUndefined();
    expect(h.open).toBeTruthy();
    expect(h.ttlDays).toBe(21);
    expect((await openPageV3Bytes(pk.key, ID, pub))!.html).toEqual(plain);

    expect(await resealPageV3(ID, "wrongpassword000", pub, { public: false })).toBeNull();
    const broken = new Uint8Array(pub);
    broken[broken.length - 1] ^= 1;
    expect(await resealPageV3(ID, PW, broken, { public: false })).toBeNull();
    expect(await resealPageV3(ID, PW, enc('{"v":2}'), { public: false })).toBeNull();
    expect(dec(back.html.subarray(0, 0))).toBe("");
  });
});
