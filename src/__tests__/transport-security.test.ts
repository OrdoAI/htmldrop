import { describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";

async function createPage(html = "<h1>Secure</h1>", filename = "secure.html") {
  const res = await SELF.fetch("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, filename }),
  });
  return res.json<{ url: string; id: string; password: string; expiresAt: string }>();
}

function getCookieFromHeaders(headers: Headers): string | null {
  const setCookie = headers.get("Set-Cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/^([^;]+)/);
  return match ? match[1] : null;
}

async function bucketContainsHtml(marker: string): Promise<boolean> {
  let cursor: string | undefined;
  do {
    const listed = await env.BUCKET.list({ prefix: "page:", cursor });
    for (const object of listed.objects) {
      const stored = await env.BUCKET.get(object.key);
      if (stored && (await stored.text()).includes(marker)) return true;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return false;
}

describe("Transport security", () => {
  it("redirects production HTTP GET requests to HTTPS without serving content", async () => {
    const res = await SELF.fetch("http://baseurl.ai/", { redirect: "manual" });

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://baseurl.ai/");
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
    expect(await res.text()).toBe("");
  });

  it("redirects HTTP upload POSTs with 308 before writing R2", async () => {
    const marker = `http-upload-should-not-store-${crypto.randomUUID()}`;
    const res = await SELF.fetch("http://baseurl.ai/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: `<p>${marker}</p>`, filename: "http.html" }),
      redirect: "manual",
    });

    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe("https://baseurl.ai/api/upload");
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(await res.text()).toBe("");
    expect(await bucketContainsHtml(marker)).toBe(false);
  });

  it("redirects HTTP password bootstrap without issuing an auth cookie", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://baseurl.ai/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(`https://baseurl.ai/${page.id}?p=${page.password}`);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("redirects HTTP auth POSTs before password verification", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://baseurl.ai/${page.id}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: page.password }).toString(),
      redirect: "manual",
    });

    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe(`https://baseurl.ai/${page.id}/auth`);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("does not redirect local HTTP development requests", async () => {
    const home = await SELF.fetch("http://localhost/", { redirect: "manual" });
    expect(home.status).toBe(200);
    expect(home.headers.get("Location")).toBeNull();
    expect(home.headers.get("Strict-Transport-Security")).toBeNull();

    const upload = await SELF.fetch("http://127.0.0.1/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>local</p>", filename: "local.html" }),
      redirect: "manual",
    });
    expect(upload.status).toBe(200);
    expect(upload.headers.get("Location")).toBeNull();
    const data = await upload.json<{ url: string }>();
    expect(data.url).toMatch(/^http:\/\/127\.0\.0\.1\//);
  });

  it("returns HTTPS preview links from HTTPS upload requests", async () => {
    const res = await SELF.fetch("https://baseurl.ai/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>https</p>", filename: "https.html" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Strict-Transport-Security")).toBeTruthy();
    const data = await res.json<{ url: string }>();
    expect(data.url).toMatch(/^https:\/\/baseurl\.ai\/[0-9A-Za-z]{8}\?p=[0-9A-Za-z]{16}$/);
  });

  it("adds HSTS to HTTPS install redirects without mutating immutable redirect responses", async () => {
    const res = await SELF.fetch("https://baseurl.ai/cli/install", { redirect: "manual" });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      "https://raw.githubusercontent.com/OrdoAI/htmldrop/main/cli/install.sh",
    );
    expect(res.headers.get("Strict-Transport-Security")).toBeTruthy();
  });

  it("adds HSTS on HTTPS app and preview responses only", async () => {
    const home = await SELF.fetch("https://baseurl.ai/");
    expect(home.status).toBe(200);
    expect(home.headers.get("Strict-Transport-Security")).toBeTruthy();

    const httpHome = await SELF.fetch("http://baseurl.ai/", { redirect: "manual" });
    expect(httpHome.headers.get("Strict-Transport-Security")).toBeNull();

    const localHome = await SELF.fetch("http://localhost/");
    expect(localHome.headers.get("Strict-Transport-Security")).toBeNull();

    const page = await createPage("<h1>HSTS preview</h1>");
    const bootstrap = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    const cookie = getCookieFromHeaders(bootstrap.headers);
    expect(cookie).not.toBeNull();

    const preview = await SELF.fetch(`https://baseurl.ai/${page.id}`, {
      headers: { Cookie: cookie! },
    });
    expect(preview.status).toBe(200);
    expect(await preview.text()).toBe("<h1>HSTS preview</h1>");
    expect(preview.headers.get("Strict-Transport-Security")).toBeTruthy();
  });
});
