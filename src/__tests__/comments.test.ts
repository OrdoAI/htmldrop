import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { mintCommentToken, mintNoticeToken } from "../auth";

interface CreatedPage {
  url: string;
  id: string;
  password: string;
  expiresAt: string;
}

async function createPage(html = "<p>hello world</p>", filename = "t.html"): Promise<CreatedPage> {
  const res = await SELF.fetch("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, filename }),
  });
  return res.json<CreatedPage>();
}

function token(id: string, password: string): Promise<string> {
  return mintCommentToken(env.AUTH_SECRET, id, password);
}

function getComments(id: string, query: string): Promise<Response> {
  return SELF.fetch(`http://localhost/${id}/comments?${query}`);
}

function post(id: string, query: string, body: unknown): Promise<Response> {
  return SELF.fetch(`http://localhost/${id}/comments?${query}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
}

async function listFor(id: string, t: string) {
  const res = await getComments(id, `t=${t}`);
  const data = await res.json<{ comments: Array<Record<string, unknown>> }>();
  return data.comments;
}

describe("comment read access", () => {
  it("lists via the comment token with CORS and no-store", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const res = await getComments(page.id, `t=${t}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ comments: [] });
  });

  it("lists via the page password (owner export)", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    await post(page.id, `t=${t}`, { text: "hi", author: "A", anchor: null });
    const res = await getComments(page.id, `p=${page.password}`);
    expect(res.status).toBe(200);
    const data = await res.json<{ comments: unknown[] }>();
    expect(data.comments).toHaveLength(1);
  });

  it("does not enumerate: bad token, no token, missing page all return empty", async () => {
    const page = await createPage();
    expect(await (await getComments(page.id, "t=bogus")).json()).toEqual({ comments: [] });
    expect(await (await getComments(page.id, "")).json()).toEqual({ comments: [] });
    expect(await (await getComments("nope", "t=bogus")).json()).toEqual({ comments: [] });
    expect(await (await getComments(page.id, "p=wrongpassword00")).json()).toEqual({ comments: [] });
  });
});

describe("comment writes", () => {
  it("creates root comments and replies via text/plain JSON", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);

    const rootRes = await post(page.id, `t=${t}`, {
      text: "needs a number",
      author: "Reviewer",
      anchor: { exact: "world", prefix: "hello ", suffix: "" },
    });
    expect(rootRes.status).toBe(201);
    const root = (await rootRes.json<{ comment: { cid: string } }>()).comment;
    expect(root.cid).toBeTruthy();

    const replyRes = await post(page.id, `t=${t}`, { text: "added", author: "Dev", parentId: root.cid });
    expect(replyRes.status).toBe(201);

    const list = await listFor(page.id, t);
    expect(list).toHaveLength(2);
    const reply = list.find((c) => c.parentId === root.cid);
    expect(reply).toBeTruthy();
  });

  it("rejects a reply to a non-existent parent", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const res = await post(page.id, `t=${t}`, { text: "x", author: "A", parentId: "missing" });
    expect(res.status).toBe(404);
  });

  it("password does not authorize writes", async () => {
    const page = await createPage();
    const res = await post(page.id, `p=${page.password}`, { text: "x", author: "A", anchor: null });
    expect(res.status).toBe(403);
  });

  it("an invalid-token write creates no comment object", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const res = await post(page.id, "t=bogus", { text: "x", author: "A", anchor: null });
    expect(res.status).toBe(403);
    expect(await listFor(page.id, t)).toHaveLength(0);
  });

  it("enforces limits with deterministic 4xx", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    expect((await post(page.id, `t=${t}`, { text: "x".repeat(4001), author: "A", anchor: null })).status).toBe(413);
    expect((await post(page.id, `t=${t}`, { text: "ok", author: "x".repeat(81), anchor: null })).status).toBe(413);
    expect((await post(page.id, `t=${t}`, { text: "", author: "A", anchor: null })).status).toBe(400);
    expect((await post(page.id, `t=${t}`, {
      text: "ok",
      author: "A",
      anchor: { exact: "x".repeat(1001), prefix: "", suffix: "" },
    })).status).toBe(400);
  });

  it("rejects creation past the per-page cap with 409", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    await Promise.all(
      Array.from({ length: 500 }, (_, n) =>
        env.BUCKET.put(
          `comment:${page.id}:seed${n}`,
          JSON.stringify({ cid: `seed${n}`, author: "a", text: "t", createdAt: new Date().toISOString(), resolved: false }),
        ),
      ),
    );
    const res = await post(page.id, `t=${t}`, { text: "one too many", author: "A", anchor: null });
    expect(res.status).toBe(409);
  });
});

describe("resolve / reopen", () => {
  it("resolves and reopens a root thread", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = (await (await post(page.id, `t=${t}`, { text: "q", author: "A", anchor: null })).json<{ comment: { cid: string } }>()).comment;

    const resolved = await SELF.fetch(`http://localhost/${page.id}/comments/${root.cid}?t=${t}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "resolve" }),
    });
    expect((await resolved.json<{ comment: { resolved: boolean } }>()).comment.resolved).toBe(true);

    const reopened = await SELF.fetch(`http://localhost/${page.id}/comments/${root.cid}?t=${t}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "reopen" }),
    });
    expect((await reopened.json<{ comment: { resolved: boolean } }>()).comment.resolved).toBe(false);
  });

  it("cannot resolve a reply", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = (await (await post(page.id, `t=${t}`, { text: "q", author: "A", anchor: null })).json<{ comment: { cid: string } }>()).comment;
    const reply = (await (await post(page.id, `t=${t}`, { text: "r", author: "B", parentId: root.cid })).json<{ comment: { cid: string } }>()).comment;
    const res = await SELF.fetch(`http://localhost/${page.id}/comments/${reply.cid}?t=${t}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "resolve" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("delete", () => {
  function mutate(id: string, cid: string, query: string, action: string) {
    return SELF.fetch(`http://localhost/${id}/comments/${cid}?${query}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action }),
    });
  }

  it("deletes a root and cascades its replies", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = (await (await post(page.id, `t=${t}`, { text: "q", author: "A", anchor: null })).json<{ comment: { cid: string } }>()).comment;
    await post(page.id, `t=${t}`, { text: "r1", author: "B", parentId: root.cid });
    await post(page.id, `t=${t}`, { text: "r2", author: "C", parentId: root.cid });
    expect((await listFor(page.id, t)).length).toBe(3);

    const res = await mutate(page.id, root.cid, `t=${t}`, "delete");
    expect(res.status).toBe(200);
    expect((await res.json<{ deleted: string }>()).deleted).toBe(root.cid);
    expect(await listFor(page.id, t)).toEqual([]);
  });

  it("deletes a single reply, leaving the root and siblings", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = (await (await post(page.id, `t=${t}`, { text: "q", author: "A", anchor: null })).json<{ comment: { cid: string } }>()).comment;
    const reply = (await (await post(page.id, `t=${t}`, { text: "r1", author: "B", parentId: root.cid })).json<{ comment: { cid: string } }>()).comment;
    await post(page.id, `t=${t}`, { text: "r2", author: "C", parentId: root.cid });

    await mutate(page.id, reply.cid, `t=${t}`, "delete");
    const remaining = await listFor(page.id, t);
    expect(remaining.length).toBe(2);
    expect(remaining.some((c) => c.cid === reply.cid)).toBe(false);
  });

  it("requires the comment token: a bad token deletes nothing", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = (await (await post(page.id, `t=${t}`, { text: "q", author: "A", anchor: null })).json<{ comment: { cid: string } }>()).comment;

    const res = await mutate(page.id, root.cid, "t=bad", "delete");
    expect(res.status).toBe(403);
    expect((await listFor(page.id, t)).length).toBe(1);
  });
});

describe("token namespaces do not cross", () => {
  it("rejects a notice token on comment routes and a comment token on /v", async () => {
    const page = await createPage();
    const notice = await mintNoticeToken(env.AUTH_SECRET, page.id, page.password);
    const comment = await token(page.id, page.password);

    expect(await (await getComments(page.id, `t=${notice}`)).json()).toEqual({ comments: [] });
    expect((await post(page.id, `t=${notice}`, { text: "x", author: "A", anchor: null })).status).toBe(403);

    const probe = await SELF.fetch(`http://localhost/${page.id}/v?t=${comment}`);
    expect(await probe.json()).toEqual({ v: null });
  });
});

describe("cross-page isolation", () => {
  it("never exposes another page's comments", async () => {
    const a = await createPage("<p>a</p>");
    const b = await createPage("<p>b</p>");
    const ta = await token(a.id, a.password);
    const tb = await token(b.id, b.password);
    await post(a.id, `t=${ta}`, { text: "secret-a", author: "A", anchor: null });

    expect(await listFor(b.id, tb)).toHaveLength(0);
    // page A password must not read page B
    expect(await (await getComments(b.id, `p=${a.password}`)).json()).toEqual({ comments: [] });
  });
});

describe("upload-time anchor remap", () => {
  async function seedRootComment(page: CreatedPage, t: string) {
    const res = await post(page.id, `t=${t}`, {
      text: "review",
      author: "PM",
      anchor: { exact: "world", prefix: "hello ", suffix: "" },
    });
    return (await res.json<{ comment: { cid: string } }>()).comment;
  }

  function update(page: CreatedPage, body: Record<string, unknown>) {
    return SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>updated planet</p>", filename: "t.html", id: page.id, password: page.password, ...body }),
    });
  }

  it("patches a root comment anchor on update", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = await seedRootComment(page, t);

    const res = await update(page, {
      commentAnchors: [{ cid: root.cid, anchor: { exact: "planet", prefix: "updated ", suffix: "" } }],
    });
    expect(res.status).toBe(200);

    const obj = await env.BUCKET.get(`comment:${page.id}:${root.cid}`);
    const record = JSON.parse(await obj!.text());
    expect(record.anchor.exact).toBe("planet");
  });

  it("orphans a root via anchor:null and preserves resolved + replies", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = await seedRootComment(page, t);
    await post(page.id, `t=${t}`, { text: "answer", author: "Dev", parentId: root.cid });
    await SELF.fetch(`http://localhost/${page.id}/comments/${root.cid}?t=${t}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "resolve" }),
    });

    await update(page, { commentAnchors: [{ cid: root.cid, anchor: null }] });

    const rootObj = JSON.parse(await (await env.BUCKET.get(`comment:${page.id}:${root.cid}`))!.text());
    expect(rootObj.anchor).toBeNull();
    expect(rootObj.resolved).toBe(true);
    const list = await listFor(page.id, t);
    expect(list.some((c) => c.parentId === root.cid && c.text === "answer")).toBe(true);
  });

  it("skips unknown and reply cids without failing the upload", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = await seedRootComment(page, t);
    const reply = (await (await post(page.id, `t=${t}`, { text: "r", author: "B", parentId: root.cid })).json<{ comment: { cid: string } }>()).comment;

    const res = await update(page, {
      commentAnchors: [
        { cid: "does-not-exist", anchor: { exact: "x", prefix: "", suffix: "" } },
        { cid: reply.cid, anchor: { exact: "y", prefix: "", suffix: "" } },
      ],
    });
    expect(res.status).toBe(200);
    const replyObj = JSON.parse(await (await env.BUCKET.get(`comment:${page.id}:${reply.cid}`))!.text());
    expect(replyObj.parentId).toBe(root.cid);
    expect(replyObj.anchor).toBeUndefined();
  });

  it("rejects an invalid remap before any write", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = await seedRootComment(page, t);
    const before = JSON.parse(await (await env.BUCKET.get(`page:${page.id}`))!.text());

    const res = await update(page, {
      commentAnchors: [{ cid: root.cid, anchor: { exact: "x".repeat(1001), prefix: "", suffix: "" } }],
    });
    expect(res.status).toBe(400);

    const afterPage = JSON.parse(await (await env.BUCKET.get(`page:${page.id}`))!.text());
    expect(afterPage.version).toBe(before.version);
    const afterComment = JSON.parse(await (await env.BUCKET.get(`comment:${page.id}:${root.cid}`))!.text());
    expect(afterComment.anchor.exact).toBe("world");
  });

  it("leaves comments unchanged when commentAnchors is omitted", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = await seedRootComment(page, t);
    await update(page, {});
    const obj = JSON.parse(await (await env.BUCKET.get(`comment:${page.id}:${root.cid}`))!.text());
    expect(obj.anchor.exact).toBe("world");
  });

  it("a bad password changes neither page nor comments", async () => {
    const page = await createPage();
    const t = await token(page.id, page.password);
    const root = await seedRootComment(page, t);
    const before = JSON.parse(await (await env.BUCKET.get(`page:${page.id}`))!.text());

    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: "<p>x</p>",
        filename: "t.html",
        id: page.id,
        password: "wrongpassword00",
        commentAnchors: [{ cid: root.cid, anchor: null }],
      }),
    });
    expect(res.status).toBe(403);
    const afterPage = JSON.parse(await (await env.BUCKET.get(`page:${page.id}`))!.text());
    expect(afterPage.version).toBe(before.version);
    const afterComment = JSON.parse(await (await env.BUCKET.get(`comment:${page.id}:${root.cid}`))!.text());
    expect(afterComment.anchor.exact).toBe("world");
  });
});

describe("preview injection", () => {
  it("injects the comment widget but not the password or auth cookie value", async () => {
    const page = await createPage("<p>hello world</p>");
    const boot = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, { redirect: "manual" });
    const cookie = boot.headers.get("Set-Cookie")!.match(/^([^;]+)/)![1];
    const res = await SELF.fetch(`http://localhost/${page.id}`, { headers: { Cookie: cookie } });
    const html = await res.text();
    expect(html).toContain("data-htmldrop-comments");
    expect(html).toContain("htmldropCopyComments");
    expect(html).not.toContain(page.password);
    expect(html).not.toContain(cookie.split("=")[1]);
  });
});
