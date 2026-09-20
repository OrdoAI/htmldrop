import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { MAX_PAGE_BYTES } from "../upload";
import { PageChangedError, verifyPassword, readPageHtml } from "../auth";
import { derivePageKey, sealPage, sealPageV3Bytes } from "../envelope";
import { purgeExpired } from "../cleanup";
import { openStored, rawBody, rawUpload, storedHeader, storedObject } from "./v3-helpers";

interface Created { url: string; id: string; password: string; expiresAt: string | null; public: boolean; publicUrl?: string }

const enc = (s: string) => new TextEncoder().encode(s);

function filled(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const unit = enc("<p>0123456789abcdef</p>\n");
  for (let i = 0; i < n; i += unit.length) out.set(unit.subarray(0, Math.min(unit.length, n - i)), i);
  return out;
}

async function cookieFor(page: Created): Promise<string> {
  const boot = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, { redirect: "manual" });
  return boot.headers.get("Set-Cookie")!.match(/^([^;]+)/)![1];
}

async function serve(page: Created): Promise<string> {
  const res = await SELF.fetch(`http://localhost/${page.id}`, { headers: { Cookie: await cookieFor(page) } });
  expect(res.status).toBe(200);
  return res.text();
}

describe("POST /api/upload (streaming shape)", () => {
  it("creates a page from one metadata line plus raw bytes and serves it back", async () => {
    const res = await rawUpload({ filename: "raw.html" }, "<h1>Raw 中文</h1><p>ok</p>");
    expect(res.status).toBe(200);
    const page = await res.json<Created>();
    expect(page.id).toMatch(/^[0-9A-Za-z]{8}$/);
    expect(page.public).toBe(false);
    const { header, payload } = await openStored(page.id, page.password);
    expect(header.v).toBe(3);
    expect(header.bytes).toBe(enc("<h1>Raw 中文</h1><p>ok</p>").length);
    expect(payload).toEqual({ html: "<h1>Raw 中文</h1><p>ok</p>", filename: "raw.html" });
    const body = await serve(page);
    expect(body).toContain("<h1>Raw 中文</h1>");
    expect(body).toContain("data-htmldrop-comments");
  });

  it("honours public and expiresInDays from the metadata line", async () => {
    const res = await rawUpload({ filename: "p.html", public: true, expiresInDays: 14 }, "<p>pub</p>");
    const page = await res.json<Created>();
    expect(page.public).toBe(true);
    expect(page.publicUrl).toBe(`http://localhost/${page.id}`);
    expect((await storedHeader(page.id)).ttlDays).toBe(14);
    const anon = await SELF.fetch(`http://localhost/${page.id}`);
    expect(anon.status).toBe(200);
    expect(await anon.text()).toContain("<p>pub</p>");
  });

  it("accepts a body sent without Content-Length", async () => {
    const res = await rawUpload({ filename: "s.html" }, filled(300 * 1024), { stream: true });
    expect(res.status).toBe(200);
    const page = await res.json<Created>();
    expect((await openStored(page.id, page.password)).payload!.html.length).toBe(300 * 1024);
  });

  it("accepts a page of exactly 50 MiB and rejects one byte more before reading it", async () => {
    const ok = await rawUpload({ filename: "max.html" }, filled(MAX_PAGE_BYTES));
    expect(ok.status).toBe(200);
    const page = await ok.json<Created>();
    expect((await storedHeader(page.id)).bytes).toBe(MAX_PAGE_BYTES);
    const record = await verifyPassword(env.BUCKET, page.id, page.password);
    expect((await readPageHtml(record!)).length).toBe(MAX_PAGE_BYTES);

    const over = await rawUpload({ filename: "over.html" }, filled(MAX_PAGE_BYTES + 1));
    expect(over.status).toBe(413);
    expect(await over.text()).toContain("File too large");
  }, 120_000);

  it("a declared length that does not match the body writes nothing", async () => {
    const before = (await env.BUCKET.list({ prefix: "page:" })).objects.length;
    for (const bytes of [5, 100]) {
      const res = await SELF.fetch("http://localhost/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-htmldrop-upload" },
        body: `${JSON.stringify({ filename: "lie.html", bytes })}\n<p>ten bytes</p>`,
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toMatch(/declared 5 bytes|declared 100 bytes/);
    }
    expect((await env.BUCKET.list({ prefix: "page:" })).objects.length).toBe(before);
  });

  it("a failed update leaves the existing page untouched", async () => {
    const page = await (await rawUpload({ filename: "a.html" }, "<p>first</p>")).json<Created>();
    const before = await storedObject(page.id);
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/x-htmldrop-upload" },
      body: `${JSON.stringify({ filename: "b.html", id: page.id, password: page.password, bytes: 99 })}\n<p>second</p>`,
    });
    expect(res.status).toBe(400);
    expect(await storedObject(page.id)).toEqual(before);
    expect((await openStored(page.id, page.password)).payload!.html).toBe("<p>first</p>");
  });

  it("updates in place with a large commentAnchors list in the metadata line", async () => {
    const page = await (await rawUpload({ filename: "a.html" }, "<p>hello world</p>")).json<Created>();
    const commentAnchors = Array.from({ length: 500 }, (_, i) => ({
      cid: `c${i}`,
      anchor: { exact: "中".repeat(1000), prefix: "".repeat(256), suffix: "中".repeat(256) },
    }));
    const body = rawBody({ filename: "b.html", id: page.id, password: page.password, commentAnchors }, "<p>hello planet</p>");
    expect(body.length).toBeGreaterThan(2 * 1024 * 1024);
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/x-htmldrop-upload" },
      body,
    });
    expect(res.status).toBe(200);
    expect((await openStored(page.id, page.password)).payload).toEqual({ html: "<p>hello planet</p>", filename: "b.html" });
  });

  it("rejects malformed metadata without touching storage", async () => {
    const before = (await env.BUCKET.list({ prefix: "page:" })).objects.length;
    const post = (body: BodyInit) => SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/x-htmldrop-upload" },
      body,
    });
    expect((await post("no newline at all")).status).toBe(400);
    expect((await post("not json\n<p>x</p>")).status).toBe(400);
    expect((await post("[]\n<p>x</p>")).status).toBe(400);
    expect((await post(`${JSON.stringify({ filename: "x.html" })}\n<p>x</p>`)).status).toBe(400); // no bytes
    expect((await post(`${JSON.stringify({ filename: "x.html", bytes: 0 })}\n`)).status).toBe(400);
    expect((await post(`${JSON.stringify({ filename: "x.html", bytes: "8" })}\n<p>x</p>`)).status).toBe(400);
    expect((await post(`${JSON.stringify({ bytes: 8 })}\n<p>x</p>`)).status).toBe(400); // no filename
    expect((await post(`${JSON.stringify({ filename: "x".repeat(1025), bytes: 8 })}\n<p>x</p>`)).status).toBe(400);
    expect((await post(`${JSON.stringify({ filename: "中".repeat(342), bytes: 8 })}\n<p>x</p>`)).status).toBe(400); // 1026 bytes
    expect((await post(`${JSON.stringify({ filename: "中".repeat(341), bytes: 8 })}\n<p>x</p>`)).status).toBe(200); // 1023 bytes
    const tooLong = new Uint8Array(8 * 1024 * 1024 + 2).fill(0x20);
    expect((await post(tooLong)).status).toBe(413);
    expect((await rawUpload({ filename: "x.html" }, "<p>x</p>", { contentType: "text/html" })).status).toBe(415);
    expect((await env.BUCKET.list({ prefix: "page:" })).objects.length).toBe(before + 1);
  });

  it("the JSON shape still works, writes v3, and keeps its own limits", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>json 中</p>", filename: "j.html" }),
    });
    expect(res.status).toBe(200);
    const page = await res.json<Created>();
    const { header, payload } = await openStored(page.id, page.password);
    expect(header.v).toBe(3);
    expect(header.bytes).toBe(enc("<p>json 中</p>").length);
    expect(payload!.html).toBe("<p>json 中</p>");
    // A raw update of a JSON-created page and vice versa share the key.
    const upd = await rawUpload({ filename: "j2.html", id: page.id, password: page.password }, "<p>again</p>");
    expect(upd.status).toBe(200);
    expect((await openStored(page.id, page.password)).payload).toEqual({ html: "<p>again</p>", filename: "j2.html" });
  });
});

describe("serving v3 pages", () => {
  it("inserts the notice before </body> of a page larger than the held-back tail", async () => {
    const big = `<!doctype html><body>${"<p>0123456789abcdef</p>\n".repeat(60000)}</body></html>`;
    expect(big.length).toBeGreaterThan(1024 * 1024);
    const page = await (await rawUpload({ filename: "big.html" }, big)).json<Created>();
    const body = await serve(page);
    const at = body.lastIndexOf("</body>");
    expect(body.length).toBeGreaterThan(big.length);
    expect(body.slice(0, at)).toContain("data-htmldrop-comments");
    expect(body.slice(at)).toBe("</body></html>");
    expect(body.startsWith("<!doctype html><body><p>0123456789abcdef</p>")).toBe(true);
  });

  it("matches </BODY > case-insensitively and appends when the tag is missing or too far from the end", async () => {
    const odd = await (await rawUpload({ filename: "o.html" }, "<html><BoDy>x</BoDy\n >\n</html>")).json<Created>();
    const oddBody = await serve(odd);
    expect(oddBody.endsWith("</BoDy\n >\n</html>")).toBe(true);
    expect(oddBody.indexOf("<script>")).toBeLessThan(oddBody.indexOf("</BoDy"));

    const none = await (await rawUpload({ filename: "n.html" }, "<p>no body tag</p>")).json<Created>();
    const noneBody = await serve(none);
    expect(noneBody.startsWith("<p>no body tag</p><script>")).toBe(true);

    const far = `<body>x</body>${"<!-- tail -->".repeat(30000)}`;
    const farPage = await (await rawUpload({ filename: "f.html" }, far)).json<Created>();
    const farBody = await serve(farPage);
    expect(farBody.startsWith(far)).toBe(true);
  });

  it("a v2 record seeded directly still serves with its version as the ETag", async () => {
    const id = "V2SEEDED";
    const pk = await derivePageKey(id, "passwordpassword");
    const stored = await sealPage(pk, { id, createdAt: new Date().toISOString(), version: "v-old" }, {
      html: "<h1>v2</h1></body>", filename: "v2.html",
    });
    await env.BUCKET.put(`page:${id}`, JSON.stringify(stored));
    const page = { id, password: "passwordpassword" } as Created;
    const res = await SELF.fetch(`http://localhost/${id}`, { headers: { Cookie: await cookieFor(page) } });
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBe('"v-old.w"');
    const body = await res.text();
    expect(body).toContain("<h1>v2</h1>");
    expect(body.endsWith("</body>")).toBe(true);
    // and an update rewrites it as v3 under the same key
    const upd = await rawUpload({ filename: "v3.html", id, password: "passwordpassword" }, "<h1>v3</h1>");
    expect(upd.status).toBe(200);
    expect((await storedHeader(id)).v).toBe(3);
    expect(await serve(page)).toContain("<h1>v3</h1>");
  });

  it("a record whose page was replaced between the header and body reads refuses to mix versions", async () => {
    const page = await (await rawUpload({ filename: "r.html" }, "<p>one</p>")).json<Created>();
    const record = (await verifyPassword(env.BUCKET, page.id, page.password))!;
    const replaced = await rawUpload({ filename: "r.html", id: page.id, password: page.password }, "<p>two, longer</p>");
    expect(replaced.status).toBe(200);
    await expect(record.body()).rejects.toBeInstanceOf(PageChangedError);
    // a fresh lookup serves the new version
    expect(await serve(page)).toContain("<p>two, longer</p>");
  });

  it("HEAD answers from the header alone and a wrong cookie key fails closed", async () => {
    const page = await (await rawUpload({ filename: "h.html" }, filled(2 * 1024 * 1024))).json<Created>();
    const head = await SELF.fetch(`http://localhost/${page.id}`, { method: "HEAD", headers: { Cookie: await cookieFor(page) } });
    expect(head.status).toBe(200);
    expect(head.headers.get("ETag")).toBeTruthy();
    expect(await head.text()).toBe("");
    const other = await (await rawUpload({ filename: "o.html" }, "<p>o</p>")).json<Created>();
    const foreign = (await cookieFor(other)).split("=")[1];
    const res = await SELF.fetch(`http://localhost/${page.id}`, { headers: { Cookie: `_hd_${page.id}=${foreign}` } });
    expect(res.status).toBe(401);
  });
});

describe("cleanup with v3 objects", () => {
  const DAY = 24 * 60 * 60 * 1000;
  async function seed(id: string, ageDays: number, extra: { pinned?: boolean; ttlDays?: number } = {}) {
    const pk = await derivePageKey(id, "passwordpassword");
    const createdAt = new Date(Date.now() - ageDays * DAY).toISOString();
    await env.BUCKET.put(`page:${id}`, await sealPageV3Bytes(pk, { id, createdAt, version: "v", ...extra }, "x.html", filled(4096)));
  }

  it("sweeps expired v3 pages, keeps live, pinned and long-window ones, leaves a corrupt one alone", async () => {
    await seed("V3OLD001", 8);
    await seed("V3LIVE01", 6);
    await seed("V3PIN001", 400, { pinned: true });
    await seed("V3TTL001", 20, { ttlDays: 30 });
    await seed("V3TTL002", 20, { ttlDays: 10 });
    const bad = new Uint8Array(await storedObject("V3OLD001"));
    bad[4] = 0x7f; // absurd header length
    await env.BUCKET.put("page:V3BAD001", bad);
    await env.BUCKET.put("comment:V3BAD001:c1", "{}");
    const r = await purgeExpired(env.BUCKET);
    expect(r.purgedPages).toBe(2);
    expect(await env.BUCKET.head("page:V3OLD001")).toBeNull();
    expect(await env.BUCKET.head("page:V3TTL002")).toBeNull();
    for (const id of ["V3LIVE01", "V3PIN001", "V3TTL001", "V3BAD001"]) {
      expect(await env.BUCKET.head(`page:${id}`), id).not.toBeNull();
    }
    expect(await env.BUCKET.head("comment:V3BAD001:c1")).not.toBeNull();
    // and a read purges an expired one too, without opening it
    await seed("V3OLD002", 9);
    expect(await verifyPassword(env.BUCKET, "V3OLD002", "passwordpassword")).toBeNull();
    expect(await env.BUCKET.head("page:V3OLD002")).toBeNull();
  });
});
