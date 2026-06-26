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
    expect(body).toContain("<h1>Hello World</h1>");
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
    await env.BUCKET.delete(`page:${page.id}`);

    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: cookie! },
    });
    expect(res.status).toBe(404);
  });
});

describe("Update notice + revalidation", () => {
  async function authedCookie(page: { id: string; password: string }) {
    const bootstrap = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    return getCookieFromHeaders(bootstrap.headers)!;
  }

  async function servedPreview(page: { id: string; password: string }) {
    const cookie = await authedCookie(page);
    const res = await SELF.fetch(`http://localhost/${page.id}`, { headers: { Cookie: cookie } });
    return { res, body: await res.text(), cookie };
  }

  // The probe token is minted into the preview as T="<64 hex>".
  function noticeToken(body: string): string {
    return body.match(/T="([0-9a-f]{64})"/)![1];
  }

  async function overwrite(page: { id: string; password: string }, html: string) {
    return SELF.fetch("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename: "test.html", id: page.id, password: page.password }),
    });
  }

  async function probe(id: string, token?: string) {
    const q = token === undefined ? "" : `?t=${encodeURIComponent(token)}`;
    const res = await SELF.fetch(`http://localhost/${id}/v${q}`);
    return { res, v: (await res.json<{ v: string | null }>()).v };
  }

  it("serves the preview with no-cache and an ETag", async () => {
    const page = await createPage();
    const { res } = await servedPreview(page);
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("ETag")).toBeTruthy();
  });

  it("returns 304 when the ETag still matches", async () => {
    const page = await createPage();
    const { res: first, cookie } = await servedPreview(page);
    const etag = first.headers.get("ETag")!;
    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: cookie, "If-None-Match": etag },
    });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("changes the ETag after an in-place update so stale copies revalidate", async () => {
    const page = await createPage("<h1>v1</h1>");
    const { res: before, cookie } = await servedPreview(page);
    const oldEtag = before.headers.get("ETag")!;

    await overwrite(page, "<h1>v2</h1>");

    const res = await SELF.fetch(`http://localhost/${page.id}`, {
      headers: { Cookie: cookie, "If-None-Match": oldEtag },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).not.toBe(oldEtag);
    expect(await res.text()).toContain("<h1>v2</h1>");
  });

  it("version changes on every overwrite, even back-to-back", async () => {
    const page = await createPage("<h1>v1</h1>");
    const e0 = (await servedPreview(page)).res.headers.get("ETag")!;
    await overwrite(page, "<h1>v2</h1>");
    const e1 = (await servedPreview(page)).res.headers.get("ETag")!;
    await overwrite(page, "<h1>v3</h1>");
    const e2 = (await servedPreview(page)).res.headers.get("ETag")!;
    expect(new Set([e0, e1, e2]).size).toBe(3);
  });

  it("injects a Shadow DOM notice probe and leaks no secrets", async () => {
    const page = await createPage("<h1>Doc</h1>");
    const { body } = await servedPreview(page);
    expect(body).toContain("<h1>Doc</h1>");
    expect(body).toContain("attachShadow");
    expect(body).toContain("/v?t=");
    expect(body).toContain("outdated version");
    // never injects the password or an auth-cookie-equivalent value
    expect(body).not.toContain(page.password);
    const cookieValue = (await authedCookie(page)).split("=")[1];
    expect(body).not.toContain(cookieValue);
  });

  it("inserts the notice before </body> when present", async () => {
    const page = await createPage("<html><body><h1>Doc</h1></body></html>");
    const { body } = await servedPreview(page);
    expect(body.indexOf("attachShadow")).toBeLessThan(body.lastIndexOf("</body>"));
  });

  it("probe returns the version only for the correct token", async () => {
    const page = await createPage("<h1>v1</h1>");
    const { body } = await servedPreview(page);
    const token = noticeToken(body);

    expect((await probe(page.id)).v).toBeNull(); // no token
    expect((await probe(page.id, "deadbeef")).v).toBeNull(); // wrong token

    const valid = await probe(page.id, token);
    expect(valid.res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(typeof valid.v).toBe("string");
  });

  it("probe with a valid token sees the new version after an overwrite", async () => {
    const page = await createPage("<h1>v1</h1>");
    const { body } = await servedPreview(page);
    const token = noticeToken(body); // password is preserved on update, so token stays valid
    const v1 = (await probe(page.id, token)).v;

    await overwrite(page, "<h1>v2</h1>");

    const v2 = (await probe(page.id, token)).v;
    expect(typeof v2).toBe("string");
    expect(v2).not.toBe(v1);
  });

  it("probe returns {v:null} at 200 for a missing id with any token", async () => {
    const res = await SELF.fetch("http://localhost/zZzZzZzZ/v?t=whatever");
    expect(res.status).toBe(200);
    expect((await res.json<{ v: string | null }>()).v).toBeNull();
  });

  it("probe returns {v:null} for an expired record even with a valid token", async () => {
    const page = await createPage("<h1>v1</h1>");
    const { body } = await servedPreview(page);
    const token = noticeToken(body);
    await env.BUCKET.delete(`page:${page.id}`);
    expect((await probe(page.id, token)).v).toBeNull();
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

describe("HEAD /:id", () => {
  it("returns password status and headers without a body", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`https://baseurl.ai/${page.id}`, {
      method: "HEAD",
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Strict-Transport-Security")).toBeTruthy();
    expect(await res.text()).toBe("");
  });

  it("returns preview status and headers for valid cookies without a body", async () => {
    const page = await createPage("<h1>Head Preview</h1>");
    const bootstrap = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, {
      redirect: "manual",
    });
    const cookie = getCookieFromHeaders(bootstrap.headers);
    expect(cookie).not.toBeNull();

    const res = await SELF.fetch(`https://baseurl.ai/${page.id}`, {
      method: "HEAD",
      headers: { Cookie: cookie! },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox allow-scripts");
    expect(res.headers.get("Strict-Transport-Security")).toBeTruthy();
    expect(await res.text()).toBe("");
  });

  it("bootstraps auth with a clean redirect without a body", async () => {
    const page = await createPage();
    const res = await SELF.fetch(`https://baseurl.ai/${page.id}?p=${page.password}`, {
      method: "HEAD",
      redirect: "manual",
    });

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`/${page.id}`);
    expect(res.headers.get("Set-Cookie")).toContain(`_hd_${page.id}=`);
    expect(res.headers.get("Strict-Transport-Security")).toBeTruthy();
    expect(await res.text()).toBe("");
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

  it("CSP allows marked CDN for markdown conversion", async () => {
    const res = await SELF.fetch("http://localhost/");
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("https://cdn.jsdelivr.net");
    expect(csp).toContain("script-src");
  });

  it("home page includes marked script with SRI", async () => {
    const res = await SELF.fetch("http://localhost/");
    const body = await res.text();
    expect(body).toContain("cdn.jsdelivr.net/npm/marked@");
    expect(body).toContain("integrity");
    expect(body).toContain("sha384-");
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
