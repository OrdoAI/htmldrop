import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { handleVersionInfo, versionInfo } from "../version";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("GET /version", () => {
  it("reports the CI build metadata with repo links", async () => {
    const res = await SELF.fetch("http://localhost/version");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<Record<string, unknown>>();
    expect(body).toEqual({
      commit: SHA,
      ref: "main",
      source: `https://github.com/OrdoAI/htmldrop/commit/${SHA}`,
      deploy: "https://github.com/OrdoAI/htmldrop/actions/runs/424242",
      ci: true,
    });
  });

  it("is reserved: never treated as a page id", async () => {
    const res = await SELF.fetch("http://localhost/version?p=whatever");
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("Password Required");
    const post = await SELF.fetch("http://localhost/version", { method: "POST" });
    expect(post.status).toBe(405);
  });

  it("answers HEAD without a body", async () => {
    const res = await SELF.fetch("http://localhost/version", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("flags a deploy without CI metadata", () => {
    expect(versionInfo({})).toEqual({
      commit: null, ref: null, source: null, deploy: null, ci: false,
      note: "deployed without CI build metadata",
    });
    const res = handleVersionInfo(new Request("http://localhost/version"), {});
    expect(res.status).toBe(200);
  });

  it("drops malformed values instead of building links from them", () => {
    const info = versionInfo({ GIT_SHA: "not-a-sha", BUILD_RUN: "12; drop", GIT_REF: "ok/ref" });
    expect(info.commit).toBeNull();
    expect(info.deploy).toBeNull();
    expect(info.ref).toBe("ok/ref");
    expect(info.ci).toBe(false);
  });
});
