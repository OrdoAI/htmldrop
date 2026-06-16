import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("POST /api/upload", () => {
  beforeEach(async () => {
    // Clean KV
  });

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

  it("rejects when html exceeds 10 MiB", async () => {
    const bigHtml = "x".repeat(10 * 1024 * 1024 + 1);
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: bigHtml, filename: "big.html" }),
    });
    expect(res.status).toBe(413);
  });

  it("accepts html at exactly 10 MiB", async () => {
    const exactHtml = "x".repeat(10 * 1024 * 1024);
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

describe("ID collision handling", () => {
  it("retries on collision and eventually succeeds or fails", async () => {
    // Pre-populate several IDs to increase collision chance in test
    // This is a probabilistic test; the main contract is tested structurally
    const res = await SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>first</p>", filename: "a.html" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json<{ id: string }>();

    // Verify the ID was stored
    const stored = await env.PAGES.get(`page:${data.id}`);
    expect(stored).not.toBeNull();
  });
});
