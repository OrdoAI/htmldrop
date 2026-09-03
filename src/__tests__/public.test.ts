import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { derivePageKey, openPage, resealPage, sealPage, type StoredPage } from "../envelope";
import { purgeExpired } from "../cleanup";

const DAY = 24 * 60 * 60 * 1000;

interface Created { url: string; id: string; password: string; expiresAt: string | null; public: boolean; publicUrl?: string }

async function upload(body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: "<h1>Post</h1>", filename: "post.html", ...body }),
  });
}

async function create(body: Record<string, unknown> = {}): Promise<Created> {
  const res = await upload(body);
  expect(res.status).toBe(200);
  return res.json<Created>();
}

async function stored(id: string): Promise<StoredPage> {
  return JSON.parse(await (await env.BUCKET.get(`page:${id}`))!.text());
}

async function cookieFor(page: Created): Promise<string> {
  const boot = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, { redirect: "manual" });
  return boot.headers.get("Set-Cookie")!.match(/^([^;]+)/)![1];
}

describe("public pages", () => {
  it("default upload is private: bare URL asks for the password", async () => {
    const page = await create();
    expect(page.public).toBe(false);
    expect(page.publicUrl).toBeUndefined();
    expect((await stored(page.id)).open).toBeUndefined();
    const res = await SELF.fetch(`http://localhost/${page.id}`);
    expect(res.status).toBe(401);
  });

  it("public upload serves at the bare URL without cookie or comment widget", async () => {
    const page = await create({ public: true });
    expect(page.public).toBe(true);
    expect(page.publicUrl).toBe(`http://localhost/${page.id}`);
    expect(page.url).toContain(`?p=${page.password}`);
    const s = await stored(page.id);
    expect(s.open).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(s)).not.toContain("<h1>Post</h1>");

    const res = await SELF.fetch(`http://localhost/${page.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    const body = await res.text();
    expect(body).toContain("<h1>Post</h1>");
    expect(body).not.toContain("data-htmldrop-comments");
    expect(body).toContain(`ID=${JSON.stringify(page.id)}`); // update notice still injected
    expect(body).not.toContain(page.password);

    const head = await SELF.fetch(`http://localhost/${page.id}`, { method: "HEAD" });
    expect(head.status).toBe(200);
  });

  it("the edit link still authenticates and gets the comment widget", async () => {
    const page = await create({ public: true });
    const cookie = await cookieFor(page);
    const res = await SELF.fetch(`http://localhost/${page.id}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("data-htmldrop-comments");
  });

  it("anonymous and authenticated views have distinct validators", async () => {
    const page = await create({ public: true });
    const anon = await SELF.fetch(`http://localhost/${page.id}`);
    const etag = anon.headers.get("ETag")!;
    const again = await SELF.fetch(`http://localhost/${page.id}`, { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    const cookie = await cookieFor(page);
    const authed = await SELF.fetch(`http://localhost/${page.id}`, { headers: { Cookie: cookie, "If-None-Match": etag } });
    expect(authed.status).toBe(200);
    expect(authed.headers.get("ETag")).not.toBe(etag);
  });

  it("update toggles visibility and keeps it when unspecified", async () => {
    const page = await create({ public: true });
    const kept = await (await upload({ id: page.id, password: page.password })).json<Created>();
    expect(kept.public).toBe(true);
    expect((await SELF.fetch(`http://localhost/${page.id}`)).status).toBe(200);

    const closed = await (await upload({ id: page.id, password: page.password, public: false })).json<Created>();
    expect(closed.public).toBe(false);
    expect(closed.publicUrl).toBeUndefined();
    expect((await stored(page.id)).open).toBeUndefined();
    expect((await SELF.fetch(`http://localhost/${page.id}`)).status).toBe(401);

    const opened = await (await upload({ id: page.id, password: page.password, public: true })).json<Created>();
    expect(opened.publicUrl).toBe(`http://localhost/${page.id}`);
    expect((await SELF.fetch(`http://localhost/${page.id}`)).status).toBe(200);
  });

  it("rejects a non-boolean public flag", async () => {
    expect((await upload({ public: "yes" })).status).toBe(400);
    expect((await upload({ public: 1 })).status).toBe(400);
  });

  it("a stored open key that does not decrypt the page is not served", async () => {
    const page = await create();
    const s = await stored(page.id);
    const { key } = await derivePageKey(page.id, "wrongpassword000");
    const b64 = btoa(String.fromCharCode(...key)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await env.BUCKET.put(`page:${page.id}`, JSON.stringify({ ...s, open: b64 }));
    expect((await SELF.fetch(`http://localhost/${page.id}`)).status).toBe(401);
  });

  it("a missing id still answers 401, same as a private page", async () => {
    expect((await SELF.fetch("http://localhost/nopeNope")).status).toBe(401);
  });
});

describe("expiresInDays", () => {
  it("defaults to 7 days and accepts 1 to 30", async () => {
    const d = await create();
    expect(new Date(d.expiresAt!).getTime() - Date.now()).toBeGreaterThan(6.9 * DAY);
    expect((await stored(d.id)).ttlDays).toBeUndefined();

    const long = await create({ expiresInDays: 30 });
    expect(new Date(long.expiresAt!).getTime() - Date.now()).toBeGreaterThan(29.9 * DAY);
    expect((await stored(long.id)).ttlDays).toBe(30);

    for (const bad of [0, 31, -1, 7.5, "14", null]) {
      expect((await upload({ expiresInDays: bad })).status).toBe(400);
    }
  });

  it("a 10-day-old page with a 14-day window still serves; with the default it is gone", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * DAY).toISOString();
    const pk = await derivePageKey("TTL00014", "passwordpassword");
    await env.BUCKET.put("page:TTL00014", JSON.stringify(await sealPage(pk, {
      id: "TTL00014", createdAt: tenDaysAgo, version: "v", ttlDays: 14,
    }, { html: "<p>14</p>", filename: "a.html" })));
    const pk7 = await derivePageKey("TTL00007", "passwordpassword");
    await env.BUCKET.put("page:TTL00007", JSON.stringify(await sealPage(pk7, {
      id: "TTL00007", createdAt: tenDaysAgo, version: "v",
    }, { html: "<p>7</p>", filename: "b.html" })));

    expect((await SELF.fetch("http://localhost/TTL00014?p=passwordpassword", { redirect: "manual" })).status).toBe(303);
    expect((await SELF.fetch("http://localhost/TTL00007?p=passwordpassword", { redirect: "manual" })).status).toBe(403);
    expect(await env.BUCKET.get("page:TTL00007")).toBeNull();
  });

  it("update keeps the window unless given a new one, and restarts it", async () => {
    const page = await create({ expiresInDays: 14 });
    const kept = await (await upload({ id: page.id, password: page.password })).json<Created>();
    expect(new Date(kept.expiresAt!).getTime() - Date.now()).toBeGreaterThan(13.9 * DAY);
    expect((await stored(page.id)).ttlDays).toBe(14);
    const changed = await (await upload({ id: page.id, password: page.password, expiresInDays: 30 })).json<Created>();
    expect(new Date(changed.expiresAt!).getTime() - Date.now()).toBeGreaterThan(29.9 * DAY);
    expect((await stored(page.id)).ttlDays).toBe(30);
  });

  it("the cron sweep honours the per-page window", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * DAY).toISOString();
    const pk = await derivePageKey("TTLCRON1", "passwordpassword");
    await env.BUCKET.put("page:TTLCRON1", JSON.stringify(await sealPage(pk, {
      id: "TTLCRON1", createdAt: tenDaysAgo, version: "v", ttlDays: 30,
    }, { html: "<p>x</p>".repeat(300), filename: "a.html" })));
    await purgeExpired(env.BUCKET);
    expect(await env.BUCKET.get("page:TTLCRON1")).not.toBeNull();
    await purgeExpired(env.BUCKET, Date.now() + 25 * DAY);
    expect(await env.BUCKET.get("page:TTLCRON1")).toBeNull();
  });

  it("the window is bound into the ciphertext", async () => {
    const page = await create({ expiresInDays: 7 });
    const s = await stored(page.id);
    const { key } = await derivePageKey(page.id, page.password);
    expect(await openPage(key, page.id, { ...s, ttlDays: 30 })).toBeNull();
    expect(await openPage(key, page.id, s)).not.toBeNull();
  });
});

describe("resealPage visibility and window", () => {
  it("toggles public and sets the window with the password", async () => {
    const page = await create();
    const s = await stored(page.id);
    const pub = await resealPage(page.id, page.password, s, { public: true, ttlDays: 21 });
    expect(pub!.open).toBeTruthy();
    expect(pub!.ttlDays).toBe(21);
    expect(pub!.version).toBe(s.version);
    await env.BUCKET.put(`page:${page.id}`, JSON.stringify(pub));
    expect((await SELF.fetch(`http://localhost/${page.id}`)).status).toBe(200);
    const priv = await resealPage(page.id, page.password, pub!, { public: false });
    expect(priv!.open).toBeUndefined();
    expect(priv!.ttlDays).toBe(21);
    expect(await resealPage(page.id, "wrongpassword000", pub!, { public: false })).toBeNull();
  });
});
