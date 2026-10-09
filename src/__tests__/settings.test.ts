import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { handleSettings } from "../upload";
import { readPageHtml, verifyPassword } from "../auth";
import { resealPageV3 } from "../envelope";
import { openStored, rawUpload, storedHeader, storedObject } from "./v3-helpers";

const DAY = 24 * 60 * 60 * 1000;

interface Link { url: string; id: string; password: string; expiresAt: string | null; public: boolean; publicUrl?: string }

async function create(meta: Record<string, unknown> = {}, page = "<h1>Post</h1>"): Promise<Link> {
  const res = await rawUpload({ filename: "post.html", ...meta }, page);
  expect(res.status).toBe(200);
  return res.json<Link>();
}

function settings(body: unknown, init: { method?: string; contentType?: string } = {}) {
  return SELF.fetch("http://localhost/api/settings", {
    method: init.method ?? "POST",
    headers: { "Content-Type": init.contentType ?? "application/json" },
    ...(init.method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

describe("POST /api/settings", () => {
  it("makes a private page public and back, keeping content, filename and version", async () => {
    const page = await create();
    const before = await storedHeader(page.id);
    expect((await SELF.fetch(`http://localhost/${page.id}`)).status).toBe(401);

    const res = await settings({ id: page.id, password: page.password, public: true });
    expect(res.status).toBe(200);
    const pub = await res.json<Link>();
    expect(pub.public).toBe(true);
    expect(pub.publicUrl).toBe(`http://localhost/${page.id}`);
    expect(pub.url).toBe(page.url);
    expect(pub.expiresAt).toBe(page.expiresAt);
    const bare = await SELF.fetch(`http://localhost/${page.id}`);
    expect(bare.status).toBe(200);
    expect(await bare.text()).toContain("<h1>Post</h1>");
    const h = await storedHeader(page.id);
    expect(h.open).toBeTruthy();
    expect(h.version).toBe(before.version);
    expect(h.createdAt).toBe(before.createdAt);

    const back = await settings({ id: page.id, password: page.password, public: false });
    expect(back.status).toBe(200);
    expect((await back.json<Link>()).publicUrl).toBeUndefined();
    expect((await SELF.fetch(`http://localhost/${page.id}`)).status).toBe(401);
    const { header, payload } = await openStored(page.id, page.password);
    expect(header.open).toBeUndefined();
    expect(payload).toEqual({ html: "<h1>Post</h1>", filename: "post.html" });
  });

  it("a new expiresInDays counts from now; public alone keeps the expiry", async () => {
    const page = await create({ expiresInDays: 7 });
    // Age the page by five days, the way the scripts reseal it.
    const aged = (await resealPageV3(page.id, page.password, await storedObject(page.id), {
      createdAt: new Date(Date.now() - 5 * DAY).toISOString(),
    }))!;
    await env.BUCKET.put(`page:${page.id}`, aged);
    const agedAt = (await storedHeader(page.id)).createdAt;

    const t0 = Date.now();
    const res = await settings({ id: page.id, password: page.password, expiresInDays: 14 });
    expect(res.status).toBe(200);
    const data = await res.json<Link>();
    const left = new Date(data.expiresAt!).getTime() - t0;
    expect(left).toBeGreaterThan(14 * DAY - 60_000);
    expect(left).toBeLessThan(14 * DAY + 60_000);
    const h = await storedHeader(page.id);
    expect(h.ttlDays).toBe(14);
    expect(h.createdAt).not.toBe(agedAt);

    const pub = await (await settings({ id: page.id, password: page.password, public: true })).json<Link>();
    expect(pub.expiresAt).toBe(data.expiresAt);
    expect((await storedHeader(page.id)).ttlDays).toBe(14);
  });

  it("an unchanged visibility does not rewrite the page", async () => {
    const page = await create();
    const etag = (await env.BUCKET.head(`page:${page.id}`))!.etag;
    const res = await settings({ id: page.id, password: page.password, public: false });
    expect(res.status).toBe(200);
    expect((await env.BUCKET.head(`page:${page.id}`))!.etag).toBe(etag);
  });

  it("keeps a pinned page pinned", async () => {
    const page = await create();
    const pinned = (await resealPageV3(page.id, page.password, await storedObject(page.id), { pinned: true }))!;
    await env.BUCKET.put(`page:${page.id}`, pinned);
    const res = await settings({ id: page.id, password: page.password, public: true, expiresInDays: 3 });
    expect(res.status).toBe(200);
    expect((await res.json<Link>()).expiresAt).toBeNull();
    expect((await storedHeader(page.id)).pinned).toBe(true);
  });

  it("streams a multi-frame page through the re-seal intact", async () => {
    const big = "<p>" + "abcdefghij".repeat(300_000) + "</p>"; // ~3 MB, several 1 MiB frames
    const page = await create({}, big);
    const res = await settings({ id: page.id, password: page.password, public: true, expiresInDays: 30 });
    expect(res.status).toBe(200);
    const record = await verifyPassword(env.BUCKET, page.id, page.password);
    expect(await readPageHtml(record!)).toBe(big);
  });

  it("a wrong password is rejected and changes nothing", async () => {
    const page = await create();
    const etag = (await env.BUCKET.head(`page:${page.id}`))!.etag;
    const res = await settings({ id: page.id, password: "wrongpassword000", public: true });
    expect(res.status).toBe(403);
    expect((await env.BUCKET.head(`page:${page.id}`))!.etag).toBe(etag);
    expect((await settings({ id: "nosuchid", password: page.password, public: true })).status).toBe(403);
  });

  it("rejects malformed requests", async () => {
    const page = await create();
    const cred = { id: page.id, password: page.password };
    expect((await settings(cred)).status).toBe(400);
    expect((await settings({ ...cred, public: "yes" })).status).toBe(400);
    expect((await settings({ ...cred, expiresInDays: 0 })).status).toBe(400);
    expect((await settings({ ...cred, expiresInDays: 31 })).status).toBe(400);
    expect((await settings({ ...cred, expiresInDays: 2.5 })).status).toBe(400);
    expect((await settings({ password: page.password, public: true })).status).toBe(400);
    expect((await settings("{not json")).status).toBe(400);
    expect((await settings({ ...cred, pad: "x".repeat(5000), public: true })).status).toBe(413);
    expect((await settings(cred, { contentType: "text/plain" })).status).toBe(415);
    expect((await settings(null, { method: "GET" })).status).toBe(405);
  });

  it("does not overwrite a page replaced while the settings were being saved", async () => {
    const page = await create();
    const replaced = new TextEncoder().encode("replaced by a concurrent upload");
    // A bucket whose first put is preceded by another writer's put.
    let raced = false;
    const bucket = new Proxy(env.BUCKET, {
      get(target, prop) {
        if (prop === "put") {
          return async (key: string, value: unknown, opts?: R2PutOptions) => {
            if (!raced) {
              raced = true;
              await target.put(key, replaced);
            }
            return target.put(key, value as ReadableStream, opts);
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const req = new Request("http://localhost/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: page.id, password: page.password, public: true }),
    });
    const res = await handleSettings(req, { ...env, BUCKET: bucket });
    expect(res.status).toBe(409);
    expect(new Uint8Array(await (await env.BUCKET.get(`page:${page.id}`))!.arrayBuffer())).toEqual(replaced);
  });
});
