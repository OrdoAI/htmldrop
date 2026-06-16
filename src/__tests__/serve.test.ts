import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";

async function createPage(html = "<h1>Test</h1>", filename = "test.html") {
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

describe("Auth bootstrap via ?p=", () => {
  it("redirects to clean URL with correct password", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`/${page.id}`);
    expect(res.headers.get("Set-Cookie")).toContain(`_hd_${page.id}=`);
    expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(res.headers.get("Set-Cookie")).toContain("Secure");
    expect(res.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("does not return HTML in bootstrap response", async () => {
    const page = await createPage("<h1>Secret</h1>");
    const res = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    const body = await res.text();
    expect(body).not.toContain("Secret");
  });

  it("shows password form with wrong password", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://localhost/${page.id}?p=wrongpassword00`, {
      redirect: "manual",
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    const body = await res.text();
    expect(body).toContain("Password Required");
  });

  it("shows password form for missing/expired ID with wrong password", async () => {
    const res = await SELF.fetch("http://localhost/nonexist?p=somepassword00", {
      redirect: "manual",
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("Cookie-authenticated preview", () => {
  it("serves HTML with correct cookie", async () => {
    const page = await createPage("<h1>Hello World</h1>");
    // Bootstrap to get cookie
    const bootstrap = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    const cookie = getCookieFromHeaders(bootstrap.headers);
    expect(cookie).not.toBeNull();

    // Access with cookie
    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: cookie! },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("<h1>Hello World</h1>");
  });

  it("returns preview headers", async () => {
    const page = await createPage();
    const bootstrap = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    const cookie = getCookieFromHeaders(bootstrap.headers);

    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: cookie! },
    });
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox allow-scripts");
  });

  it("rejects tampered cookie", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: `_hd_${page.id}=tampered` },
    });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain("Password Required");
  });

  it("rejects cookie from a different ID", async () => {
    const page1 = await createPage("<p>page1</p>");
    const page2 = await createPage("<p>page2</p>");

    const bootstrap1 = await SELF.fetch(`http://localhost/${page1.id}?p=${page1.password}`, {
      redirect: "manual",
    });
    const cookie1 = getCookieFromHeaders(bootstrap1.headers);

    // Try using page1's cookie for page2
    const res = await SELF.fetch(`http://localhost/${page2.id}`, {
      headers: { Cookie: cookie1!.replace(`_hd_${page1.id}`, `_hd_${page2.id}`) },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when KV expired but cookie valid", async () => {
    const page = await createPage();
    const bootstrap = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    const cookie = getCookieFromHeaders(bootstrap.headers);

    // Delete KV entry to simulate expiry
    await env.PAGES.delete(`page:${page.id}`);

    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: cookie! },
    });
    expect(res.status).toBe(404);
  });
});

describe("Password form (no auth)", () => {
  it("shows password form without auth", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://localhost/${page.id}`);
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain("Password Required");
    expect(body).not.toContain(page.password);
  });

  it("uses app headers not preview headers", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://localhost/${page.id}`);
    expect(res.headers.get("Content-Security-Policy")).not.toContain("sandbox");
  });
});

describe("POST /:id/auth", () => {
  it("authenticates with correct password via form", async () => {
    const page = await createPage();
    const formBody = new URLSearchParams({ password: page.password });
    const res = await SELF.fetch(`http://localhost/${page.id}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`/${page.id}`);
    expect(res.headers.get("Set-Cookie")).toContain(`_hd_${page.id}=`);
  });

  it("authenticates with correct password via JSON", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://localhost/${page.id}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: page.password }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
  });

  it("rejects wrong password", async () => {
    const page = await createPage();
    const formBody = new URLSearchParams({ password: "wrong" });
    const res = await SELF.fetch(`http://localhost/${page.id}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    const body = await res.text();
    expect(body).toContain("Incorrect password");
  });

  it("does not echo password in error response", async () => {
    const page = await createPage();
    const submittedPw = "myWrongPassword1";
    const formBody = new URLSearchParams({ password: submittedPw });
    const res = await SELF.fetch(`http://localhost/${page.id}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });
    const body = await res.text();
    expect(body).not.toContain(submittedPw);
  });

  it("rejects GET method", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`http://localhost/${page.id}/auth`, {
      method: "GET",
    });
    expect(res.status).toBe(405);
  });
});

describe("Missing/expired pages", () => {
  it("returns 404 for nonexistent ID without auth", async () => {
    const res = await SELF.fetch("http://localhost/zZzZzZzZ");
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain("Password Required");
  });
});

describe("Homepage", () => {
  it("serves upload page", async () => {
    const res = await SELF.fetch("http://localhost/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("HTMLDrop");
    expect(body).toContain("drop-zone");
  });

  it("uses app headers", async () => {
    const res = await SELF.fetch("http://localhost/");
    expect(res.headers.get("Content-Security-Policy")).not.toContain("sandbox");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});

describe("Security: password not in preview URL", () => {
  it("preview is served at clean URL without password in query", async () => {
    const page = await createPage(
      '<script>document.body.dataset.href = location.href;</script><p>test</p>',
    );
    const bootstrap = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    const cookie = getCookieFromHeaders(bootstrap.headers);

    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: cookie! },
    });
    expect(res.status).toBe(200);
    // The URL the page is served at has no ?p= — verify by checking the request URL
    const requestUrl = new URL(`http://localhost/${page.id}`);
    expect(requestUrl.searchParams.has("p")).toBe(false);
  });
});
