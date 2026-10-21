import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { MASCOT_PATH } from "../mascot";

describe("mascot", () => {
  it("serves its script at a hashed path, cached for good", async () => {
    expect(MASCOT_PATH).toMatch(/^\/_assets\/mascot\.[0-9a-f]{10}\.js$/);
    const res = await SELF.fetch(`http://localhost${MASCOT_PATH}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const js = await res.text();
    expect(js).toContain("bloub, MIT");
    expect(js).toContain("data-mascot");
  });

  it("answers HEAD without a body, refuses other methods, and knows no other asset", async () => {
    const head = await SELF.fetch(`http://localhost${MASCOT_PATH}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await SELF.fetch(`http://localhost${MASCOT_PATH}`, { method: "POST" })).status).toBe(405);
    expect((await SELF.fetch("http://localhost/_assets/mascot.0000000000.js")).status).toBe(404);
  });

  it("every server-rendered page loads it and keeps the static mark until it runs", async () => {
    const { passwordPage } = await import("../pages/password");
    const pages = [
      await (await SELF.fetch("http://localhost/")).text(),
      await (await SELF.fetch("http://localhost/nope/x")).text(),
      passwordPage("abc", false),
    ];
    for (const html of pages) {
      expect(html).toContain(`<script src="${MASCOT_PATH}" defer></script>`);
      expect(html).toMatch(/<span class="mark" data-mascot="mark" aria-hidden="true"><svg viewBox="3\.4 3\.4 17\.2 17\.2"/);
    }
  });
});
