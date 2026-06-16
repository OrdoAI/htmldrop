import { describe, it, expect } from "vitest";
import { generateId, generatePassword, hmacSign, hmacVerify, utf8ByteLength, parseCookies } from "../utils";

describe("generateId", () => {
  it("returns 8-char base62 string", () => {
    const id = generateId();
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[0-9A-Za-z]{8}$/);
  });

  it("generates different IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBeGreaterThan(40);
  });
});

describe("generatePassword", () => {
  it("returns 16-char alphanumeric string", () => {
    const pw = generatePassword();
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/^[0-9A-Za-z]{16}$/);
  });
});

describe("hmacSign / hmacVerify", () => {
  it("produces consistent signatures", async () => {
    const sig1 = await hmacSign("secret", "data");
    const sig2 = await hmacSign("secret", "data");
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different secrets produce different signatures", async () => {
    const sig1 = await hmacSign("secret1", "data");
    const sig2 = await hmacSign("secret2", "data");
    expect(sig1).not.toBe(sig2);
  });

  it("verifies valid signatures", async () => {
    const sig = await hmacSign("secret", "data");
    expect(await hmacVerify("secret", "data", sig)).toBe(true);
  });

  it("rejects invalid signatures", async () => {
    expect(await hmacVerify("secret", "data", "wrong")).toBe(false);
  });

  it("rejects signatures from different data", async () => {
    const sig = await hmacSign("secret", "data1");
    expect(await hmacVerify("secret", "data2", sig)).toBe(false);
  });
});

describe("utf8ByteLength", () => {
  it("counts ASCII correctly", () => {
    expect(utf8ByteLength("hello")).toBe(5);
  });

  it("counts multi-byte characters", () => {
    expect(utf8ByteLength("你好")).toBe(6);
  });

  it("handles empty string", () => {
    expect(utf8ByteLength("")).toBe(0);
  });
});

describe("parseCookies", () => {
  it("parses cookie header", () => {
    expect(parseCookies("a=1; b=2")).toEqual({ a: "1", b: "2" });
  });

  it("handles null", () => {
    expect(parseCookies(null)).toEqual({});
  });

  it("handles empty string", () => {
    expect(parseCookies("")).toEqual({});
  });
});
