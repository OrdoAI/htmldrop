// Failure paths of the streaming upload and the two-read serve: nothing half
// written, nothing served across two versions, nothing left hanging.
//
// Every aborted R2 put makes Miniflare's R2 simulator log two
// "uncaught exception ... Network connection lost" lines on stderr: its side
// of the internal transfer sees the FixedLengthStream abort as a dropped
// connection. Vitest does not count them; a fake put (see "R2 put failures")
// logs none.
import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { handleUpload, RAW_CONTENT_TYPE } from "../upload";
import { handleServe } from "../serve";
import { purgeExpired } from "../cleanup";
import { V3_CHUNK_BYTES, derivePageKey, sealPageV3, sealPageV3Bytes } from "../envelope";
import { openStored, rawUpload, storedHeader, storedObject } from "./v3-helpers";

interface Created { url: string; id: string; password: string; public: boolean }

const enc = (s: string) => new TextEncoder().encode(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fill(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = 0x41 + (i % 26);
  return out;
}

// A request body that delivers `parts` with a pause before each one after the
// first. Fed to handleUpload directly: through SELF.fetch, the client-side
// upload pump reports the server's body cancellation as an uncaught error.
function delayed(parts: Uint8Array[], pauseMs: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= parts.length) {
        controller.close();
        return;
      }
      if (i > 0) await sleep(pauseMs);
      controller.enqueue(parts[i++]);
    },
  });
}

function rawRequest(body: BodyInit, bucketUrl = "http://localhost/api/upload"): Request {
  return new Request(bucketUrl, {
    method: "POST",
    headers: { "Content-Type": RAW_CONTENT_TYPE },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
}

// Wraps the test bucket so one method can be replaced.
function bucketWith(overrides: Partial<Record<keyof R2Bucket, unknown>>): R2Bucket {
  return new Proxy(env.BUCKET, {
    get(target, prop, receiver) {
      if (prop in overrides) return overrides[prop as keyof R2Bucket];
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

async function cookieFor(page: Created): Promise<string> {
  const boot = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, { redirect: "manual" });
  return boot.headers.get("Set-Cookie")!.match(/^([^;]+)/)![1];
}

describe("late bytes after the final frame", () => {
  for (const size of [V3_CHUNK_BYTES, V3_CHUNK_BYTES + 7, 2 * V3_CHUNK_BYTES]) {
    it(`create with ${size} declared bytes and one late extra byte writes nothing`, async () => {
      const before = (await env.BUCKET.list({ prefix: "page:" })).objects.length;
      const meta = enc(`${JSON.stringify({ filename: "late.html", bytes: size })}\n`);
      const res = await handleUpload(rawRequest(delayed([meta, fill(size), enc("!")], 60)), env);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(`longer than the declared ${size}`);
      expect((await env.BUCKET.list({ prefix: "page:" })).objects.length).toBe(before);
    });
  }

  it("update with a late extra byte leaves the old object byte for byte, and its comments", async () => {
    const page = await (await rawUpload({ filename: "a.html" }, "<p>hello world</p>")).json<Created>();
    const before = await storedObject(page.id);
    const size = V3_CHUNK_BYTES;
    const meta = enc(`${JSON.stringify({ filename: "b.html", id: page.id, password: page.password, bytes: size })}\n`);
    const res = await handleUpload(rawRequest(delayed([meta, fill(size), enc("!")], 60)), env);
    expect(res.status).toBe(400);
    expect(await storedObject(page.id)).toEqual(before);
    expect((await openStored(page.id, page.password)).payload!.html).toBe("<p>hello world</p>");
  });

  it("a source that errors after the final frame writes nothing", async () => {
    const before = (await env.BUCKET.list({ prefix: "page:" })).objects.length;
    const size = V3_CHUNK_BYTES;
    const meta = enc(`${JSON.stringify({ filename: "err.html", bytes: size })}\n`);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent === 0) controller.enqueue(meta);
        else if (sent === 1) controller.enqueue(fill(size));
        else {
          await sleep(60);
          controller.error(new Error("client went away"));
          return;
        }
        sent++;
      },
    });
    const res = await handleUpload(rawRequest(body), { BUCKET: env.BUCKET, AUTH_SECRET: env.AUTH_SECRET });
    expect(res.status).toBe(400);
    expect((await env.BUCKET.list({ prefix: "page:" })).objects.length).toBe(before);
  });
});

describe("R2 put failures", () => {
  it("a put that rejects before consuming anything ends the upload with its error", async () => {
    const bucket = bucketWith({ put: () => Promise.reject(new Error("r2 down")) });
    const body = enc(`${JSON.stringify({ filename: "x.html", bytes: 8 })}\n<p>x</p>`);
    const res = await Promise.race([
      handleUpload(rawRequest(body), { BUCKET: bucket, AUTH_SECRET: env.AUTH_SECRET }),
      sleep(5000).then(() => null),
    ]);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    expect(await res!.text()).toContain("r2 down");
  });

  it("a put that rejects after reading part of the object ends the upload too", async () => {
    const bucket = bucketWith({
      put: async (_key: string, value: ReadableStream<Uint8Array>) => {
        const reader = value.getReader();
        await reader.read();
        await reader.read();
        reader.releaseLock();
        throw new Error("r2 gave up");
      },
    });
    const size = 3 * V3_CHUNK_BYTES;
    const body = new Uint8Array([...enc(`${JSON.stringify({ filename: "x.html", bytes: size })}\n`), ...fill(size)]);
    const res = await Promise.race([
      handleUpload(rawRequest(body), { BUCKET: bucket, AUTH_SECRET: env.AUTH_SECRET }),
      sleep(5000).then(() => null),
    ]);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    expect(await res!.text()).toContain("r2 gave up");
  });
});

describe("a page rewritten between the header and body reads", () => {
  // Runs `between()` the first time the body read (the only conditional,
  // ranged get) happens, then lets the real read proceed.
  function bucketInterrupting(between: () => Promise<void>): R2Bucket {
    let fired = false;
    return bucketWith({
      get: async (key: string, options?: R2GetOptions) => {
        if (!fired && options?.onlyIf && options.range) {
          fired = true;
          await between();
        }
        return env.BUCKET.get(key, options as never);
      },
    });
  }
  const envWith = (bucket: R2Bucket) => ({ BUCKET: bucket, AUTH_SECRET: env.AUTH_SECRET });

  it("an anonymous reader of a public page that turned private gets 401, not the new body", async () => {
    const page = await (await rawUpload({ filename: "p.html", public: true }, "<p>PUBLIC_A</p>")).json<Created>();
    const bucket = bucketInterrupting(async () => {
      const r = await rawUpload({ filename: "p.html", id: page.id, password: page.password, public: false }, "<p>PRIVATE_B_ONLY</p>");
      expect(r.status).toBe(200);
    });
    const res = await handleServe(new Request(`http://localhost/${page.id}`), envWith(bucket), page.id);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toContain("PRIVATE_B_ONLY");
    expect(text).not.toContain("PUBLIC_A");
  });

  it("an authenticated reader gets the new version with the new ETag and notice", async () => {
    const page = await (await rawUpload({ filename: "p.html" }, "<p>ONE</p>")).json<Created>();
    const cookie = await cookieFor(page);
    const bucket = bucketInterrupting(async () => {
      const r = await rawUpload({ filename: "p.html", id: page.id, password: page.password }, "<p>TWO, longer than one</p>");
      expect(r.status).toBe(200);
    });
    const res = await handleServe(new Request(`http://localhost/${page.id}`, { headers: { Cookie: cookie } }), envWith(bucket), page.id);
    expect(res.status).toBe(200);
    const version = (await storedHeader(page.id)).version;
    expect(res.headers.get("ETag")).toBe(`"${version}.w"`);
    const body = await res.text();
    expect(body).toContain("<p>TWO, longer than one</p>");
    expect(body).not.toContain("<p>ONE</p>");
    expect(body).toContain(`V=${JSON.stringify(version)}`);
  });

  it("gives up with 503 when the page keeps changing", async () => {
    const page = await (await rawUpload({ filename: "p.html" }, "<p>ONE</p>")).json<Created>();
    const cookie = await cookieFor(page);
    let n = 0;
    const bucket = bucketWith({
      get: async (key: string, options?: R2GetOptions) => {
        if (options?.onlyIf && options.range) {
          n++;
          await rawUpload({ filename: "p.html", id: page.id, password: page.password }, `<p>${n}</p>`);
        }
        return env.BUCKET.get(key, options as never);
      },
    });
    const res = await handleServe(new Request(`http://localhost/${page.id}`, { headers: { Cookie: cookie } }), envWith(bucket), page.id);
    expect(res.status).toBe(503);
    expect(n).toBe(3);
  });
});

describe("the sealer reads on demand", () => {
  it("pulls from the source only as frames are consumed", async () => {
    const pk = await derivePageKey("PULL0001", "passwordpassword");
    const total = 16 * V3_CHUNK_BYTES;
    const sealer = await sealPageV3(pk, { id: "PULL0001", createdAt: new Date().toISOString(), version: "v" }, "x.html", total);
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls >= 16) {
          controller.close();
          return;
        }
        pulls++;
        controller.enqueue(fill(V3_CHUNK_BYTES));
      },
    });
    const reader = sealer.seal(source).getReader();
    await reader.read(); // prefix
    await reader.read(); // frame 0
    await reader.read(); // frame 1
    await new Promise((r) => setTimeout(r, 50));
    // Two frames out, one frame pre-pulled, and the sealer holds one extra
    // chunk to know the frame it cuts is not the last: six chunks at most,
    // nowhere near the sixteen a whole-page loop would have pulled.
    expect(pulls).toBeLessThanOrEqual(6);
    await reader.cancel();
  });
});

describe("cleanup read failures", () => {
  it("treats a failing ranged read as unreadable instead of reading the object whole", async () => {
    const id = "CLNFAIL1";
    const pk = await derivePageKey(id, "passwordpassword");
    const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.BUCKET.put(`page:${id}`, await sealPageV3Bytes(pk, { id, createdAt, version: "v" }, "x.html", fill(4096)));
    await env.BUCKET.put(`comment:${id}:c1`, "{}");
    const calls: Array<R2GetOptions | undefined> = [];
    const bucket = bucketWith({
      get: async (key: string, options?: R2GetOptions) => {
        if (key === `page:${id}`) {
          calls.push(options);
          if (options?.range) throw new Error("range read failed");
        }
        return env.BUCKET.get(key, options as never);
      },
    });
    await purgeExpired(bucket);
    expect(calls.filter((o) => !o?.range).length).toBe(0);
    expect(await env.BUCKET.head(`page:${id}`)).not.toBeNull();
    expect(await env.BUCKET.head(`comment:${id}:c1`)).not.toBeNull();
    // and with the read working, the same expired page goes
    await purgeExpired(env.BUCKET);
    expect(await env.BUCKET.head(`page:${id}`)).toBeNull();
  });

  it("a legacy record rewritten as v3 between the prefix and full reads is not read whole", async () => {
    const id = "CLNSWAP1";
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Legacy JSON longer than the prefix read, with createdAt past the prefix
    // so cleanup has to fall back to a full read.
    await env.BUCKET.put(`page:${id}`, JSON.stringify({
      html: "<p>legacy</p>".repeat(3000), password: "passwordpassword", filename: "l.html", createdAt: old,
    }));
    const pk = await derivePageKey(id, "passwordpassword");
    const fresh = await sealPageV3Bytes(pk, { id, createdAt: new Date().toISOString(), version: "v" }, "x.html", fill(4096));
    const fullReads: string[] = [];
    const bucket = bucketWith({
      get: async (key: string, options?: R2GetOptions) => {
        if (key === `page:${id}` && !options?.range) {
          fullReads.push(options?.onlyIf ? "conditional" : "unconditional");
          await env.BUCKET.put(key, fresh); // the swap lands just before the full read
        }
        return env.BUCKET.get(key, options as never);
      },
    });
    const r = await purgeExpired(bucket);
    expect(fullReads).toEqual(["conditional"]);
    expect(r.purgedPages).toBe(0);
    expect(await storedObject(id)).toEqual(fresh);
  });
});
