import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { handleUpload } from "../upload";

describe("POST /api/upload", () => {
  it("accepts valid HTML and returns expected shape", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<h1>Hello</h1>", filename: "test.html" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json<{ url: string; id: string; password: string; expiresAt: string }>();
    expect(data.id).toMatch(/^[0-9A-Za-z]{8}$/);
    expect(data.password).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(data.url).toContain(data.id);
    expect(data.url).toContain(`?p=${data.password}`);
    expect(data.expiresAt).toBeTruthy();
  });

  it("stores correct data in KV", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>stored</p>", filename: "doc.html" }),
    });
    const data = await res.json<{ id: string; password: string }>();
    const raw = await env.PAGES.get(`page:${data.id}`, "text");
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw!);
    expect(record.html).toBe("<p>stored</p>");
    expect(record.password).toBe(data.password);
    expect(record.filename).toBe("doc.html");
    expect(record.createdAt).toBeTruthy();
  });

  it("rejects when html field exceeds 24 MiB", async () => {
    const bigHtml = "x".repeat(24 * 1024 * 1024 + 1);
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: bigHtml, filename: "big.html" }),
    });
    expect(res.status).toBe(413);
  });

  it("rejects when total request body exceeds body limit (small html, large metadata)", async () => {
    const bigFilename = "a".repeat(25 * 1024 * 1024);
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>small</p>", filename: bigFilename }),
    });
    expect(res.status).toBe(413);
  });

  it("accepts html at exactly 24 MiB", async () => {
    const exactHtml = "x".repeat(24 * 1024 * 1024);
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: exactHtml, filename: "exact.html" }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects missing html field", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "test.html" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-string html", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: 123, filename: "test.html" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing filename", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>test</p>" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects wrong method", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "GET",
    });
    expect(res.status).toBe(405);
  });

  it("rejects wrong content type", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });
    expect(res.status).toBe(415);
  });

  it("client cannot override password or id", async () => {
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: "<p>test</p>",
        filename: "test.html",
        password: "my-chosen-password",
        id: "myid1234",
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json<{ id: string; password: string }>();
    expect(data.id).not.toBe("myid1234");
    expect(data.password).not.toBe("my-chosen-password");
  });
});

describe("ID collision handling (deterministic)", () => {
  it("retries and succeeds when first IDs collide", async () => {
    const collidingId = "COLLIDE1";
    await env.PAGES.put(`page:${collidingId}`, JSON.stringify({
      html: "<p>existing</p>", password: "x", filename: "old.html", createdAt: "2026-01-01",
    }));

    let callCount = 0;
    const deps = {
      generateId: () => {
        callCount++;
        // First two calls return the colliding ID, third returns a fresh one
        return callCount <= 2 ? collidingId : "FRESHN01";
      },
    };

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>new</p>", filename: "new.html" }),
    });

    const res = await handleUpload(request, env, deps);
    expect(res.status).toBe(200);
    const data = await res.json<{ id: string }>();
    expect(data.id).toBe("FRESHN01");
    expect(callCount).toBe(3);

    // Original colliding entry is not overwritten
    const original = JSON.parse((await env.PAGES.get(`page:${collidingId}`, "text"))!);
    expect(original.html).toBe("<p>existing</p>");
  });

  it("returns 503 when all retries collide", async () => {
    const collidingId = "COLLID02";
    await env.PAGES.put(`page:${collidingId}`, JSON.stringify({
      html: "<p>existing</p>", password: "x", filename: "old.html", createdAt: "2026-01-01",
    }));

    const deps = {
      generateId: () => collidingId,
    };

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>new</p>", filename: "new.html" }),
    });

    const res = await handleUpload(request, env, deps);
    expect(res.status).toBe(503);

    // Original entry is not overwritten
    const original = JSON.parse((await env.PAGES.get(`page:${collidingId}`, "text"))!);
    expect(original.html).toBe("<p>existing</p>");
  });
});
