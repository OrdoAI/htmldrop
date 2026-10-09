import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

describe("favicon", () => {
  it("serves the brand mark as SVG", async () => {
    const res = await SELF.fetch("http://localhost/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await res.text()).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  });

  it("serves /favicon.ico and the touch icon as PNG", async () => {
    for (const path of ["/favicon.ico", "/apple-touch-icon.png"]) {
      const res = await SELF.fetch(`http://localhost${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect([...bytes.subarray(0, 4)]).toEqual(PNG_MAGIC);
    }
  });

  it("answers HEAD without a body and refuses other methods", async () => {
    const head = await SELF.fetch("http://localhost/favicon.svg", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await SELF.fetch("http://localhost/favicon.ico", { method: "POST" })).status).toBe(405);
  });

  it("every server-rendered page links all three", async () => {
    const { passwordPage } = await import("../pages/password");
    const pages = [
      await (await SELF.fetch("http://localhost/")).text(),
      await (await SELF.fetch("http://localhost/nope/x")).text(),
      passwordPage("abc", false),
    ];
    for (const html of pages) {
      expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32">');
      expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
      expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    }
  });
});
