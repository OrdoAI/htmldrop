import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { FONT_PATHS } from "../fonts";

describe("GET /_fonts/*", () => {
  it("serves each bundled font as cacheable woff2", async () => {
    for (const path of Object.values(FONT_PATHS)) {
      const res = await SELF.fetch(`http://localhost${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("font/woff2");
      expect(res.headers.get("Cache-Control")).toContain("immutable");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("wOF2");
    }
  });

  it("answers HEAD without a body and refuses other methods", async () => {
    const head = await SELF.fetch(`http://localhost${FONT_PATHS.sans}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await SELF.fetch(`http://localhost${FONT_PATHS.sans}`, { method: "POST" })).status).toBe(405);
  });

  it("an unknown font path is a 404", async () => {
    expect((await SELF.fetch("http://localhost/_fonts/nope.woff2")).status).toBe(404);
  });
});

describe("theme fonts", () => {
  it("the theme's @font-face and preload point at the served paths", async () => {
    const { THEME_CSS, FONT_PRELOAD } = await import("../pages/theme");
    expect(THEME_CSS).toContain(`url(${FONT_PATHS.sans})`);
    expect(THEME_CSS).toContain(`url(${FONT_PATHS.mono})`);
    expect(FONT_PRELOAD).toContain(`href="${FONT_PATHS.sans}"`);
  });
});
