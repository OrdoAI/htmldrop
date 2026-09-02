import { describe, it, expect } from "vitest";
import {
  type LegacyPage,
  derivePageKey,
  migrateLegacyPage,
  openComment,
  openPage,
  resealPage,
  sealComment,
  sealPage,
  unwrapKey,
  wrapKey,
} from "../envelope";

const ID = "abcDEF12";
const PW = "passwordpassword";
const META = { id: ID, createdAt: "2026-09-01T00:00:00.000Z", version: "v-1" };
const PAYLOAD = { html: "<h1>hi</h1>", filename: "hi.html" };

describe("page key", () => {
  it("is deterministic per id + password and differs across ids", async () => {
    const a = await derivePageKey(ID, PW);
    const b = await derivePageKey(ID, PW);
    const c = await derivePageKey("otherid1", PW);
    expect(a.verifier).toBe(b.verifier);
    expect([...a.key]).toEqual([...b.key]);
    expect(c.verifier).not.toBe(a.verifier);
    expect(a.key.length).toBe(32);
    expect(a.verifier).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifier does not reveal the key", async () => {
    const { key, verifier } = await derivePageKey(ID, PW);
    const keyHex = [...key].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(verifier).not.toBe(keyHex);
  });
});

describe("sealPage / openPage", () => {
  it("round-trips and hides the payload", async () => {
    const pk = await derivePageKey(ID, PW);
    const stored = await sealPage(pk, META, PAYLOAD);
    expect(stored.v).toBe(2);
    expect(JSON.stringify(stored)).not.toContain("hi.html");
    expect(JSON.stringify(stored)).not.toContain("<h1>");
    expect(await openPage(pk.key, ID, stored)).toEqual(PAYLOAD);
  });

  it("fails with the wrong key", async () => {
    const pk = await derivePageKey(ID, PW);
    const other = await derivePageKey(ID, "xxxxxxxxxxxxxxxx");
    const stored = await sealPage(pk, META, PAYLOAD);
    expect(await openPage(other.key, ID, stored)).toBeNull();
  });

  it("fails when id, createdAt, version, or pinned is edited after sealing", async () => {
    const pk = await derivePageKey(ID, PW);
    const stored = await sealPage(pk, META, PAYLOAD);
    expect(await openPage(pk.key, "otherid1", stored)).toBeNull();
    expect(await openPage(pk.key, ID, { ...stored, createdAt: "2027-01-01T00:00:00.000Z" })).toBeNull();
    expect(await openPage(pk.key, ID, { ...stored, version: "v-2" })).toBeNull();
    expect(await openPage(pk.key, ID, { ...stored, pinned: true })).toBeNull();
    const pinned = await sealPage(pk, { ...META, pinned: true }, PAYLOAD);
    const { pinned: _drop, ...unpinned } = pinned;
    expect(await openPage(pk.key, ID, unpinned)).toBeNull();
    expect(await openPage(pk.key, ID, pinned)).toEqual(PAYLOAD);
  });

  it("fails on garbage ciphertext without throwing", async () => {
    const pk = await derivePageKey(ID, PW);
    const stored = await sealPage(pk, META, PAYLOAD);
    expect(await openPage(pk.key, ID, { ...stored, ct: "!!!" })).toBeNull();
    expect(await openPage(pk.key, ID, { ...stored, iv: "AAAA" })).toBeNull();
  });
});

describe("sealComment / openComment", () => {
  it("round-trips and binds the cid", async () => {
    const { key } = await derivePageKey(ID, PW);
    const record = { cid: "c1", author: "A", text: "hello", createdAt: "t", resolved: false };
    const stored = await sealComment(key, ID, "c1", record);
    expect(JSON.stringify(stored)).not.toContain("hello");
    expect(await openComment(key, ID, stored)).toEqual(record);
    expect(await openComment(key, ID, { ...stored, cid: "c2" })).toBeNull();
    expect(await openComment(key, "otherid1", stored)).toBeNull();
  });
});

describe("wrapKey / unwrapKey", () => {
  const SECRET = "s3cret";

  it("round-trips under the same secret, namespace, and id", async () => {
    const { key } = await derivePageKey(ID, PW);
    const token = await wrapKey(SECRET, "cookie", ID, key);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect([...(await unwrapKey(SECRET, "cookie", ID, token))!]).toEqual([...key]);
  });

  it("rejects a different namespace, id, or secret, and malformed input", async () => {
    const { key } = await derivePageKey(ID, PW);
    const token = await wrapKey(SECRET, "cookie", ID, key);
    expect(await unwrapKey(SECRET, "comments", ID, token)).toBeNull();
    expect(await unwrapKey(SECRET, "cookie", "otherid1", token)).toBeNull();
    expect(await unwrapKey("other", "cookie", ID, token)).toBeNull();
    expect(await unwrapKey(SECRET, "cookie", ID, "nodot")).toBeNull();
    expect(await unwrapKey(SECRET, "cookie", ID, "")).toBeNull();
    expect(await unwrapKey(SECRET, "cookie", ID, "ab".repeat(32))).toBeNull();
  });

  it("never reuses an iv, so two wraps of one key differ", async () => {
    const { key } = await derivePageKey(ID, PW);
    expect(await wrapKey(SECRET, "cookie", ID, key)).not.toBe(await wrapKey(SECRET, "cookie", ID, key));
  });
});

describe("operator transforms", () => {
  const legacy: LegacyPage = {
    html: "<p>old</p>", password: PW, filename: "old.html", createdAt: "2026-08-01T00:00:00.000Z",
  };

  it("migrateLegacyPage seals the record and keeps createdAt as the version fallback", async () => {
    const stored = await migrateLegacyPage(ID, legacy);
    expect(stored.version).toBe(legacy.createdAt);
    expect(stored.createdAt).toBe(legacy.createdAt);
    expect(JSON.stringify(stored)).not.toContain(PW);
    expect(JSON.stringify(stored)).not.toContain("<p>old</p>");
    const { key } = await derivePageKey(ID, PW);
    expect(await openPage(key, ID, stored)).toEqual({ html: "<p>old</p>", filename: "old.html" });
  });

  it("resealPage pins, renews, unpins, and keeps content and version", async () => {
    const pk = await derivePageKey(ID, PW);
    const stored = await sealPage(pk, META, PAYLOAD);
    const pinned = await resealPage(ID, PW, stored, { pinned: true, createdAt: "2026-09-02T00:00:00.000Z" });
    expect(pinned).not.toBeNull();
    expect(pinned!.pinned).toBe(true);
    expect(pinned!.createdAt).toBe("2026-09-02T00:00:00.000Z");
    expect(pinned!.version).toBe(META.version);
    expect(await openPage(pk.key, ID, pinned!)).toEqual(PAYLOAD);

    const unpinned = await resealPage(ID, PW, pinned!, { pinned: false });
    expect(unpinned!.pinned).toBeUndefined();
    expect(await openPage(pk.key, ID, unpinned!)).toEqual(PAYLOAD);
  });

  it("resealPage accepts a legacy record and refuses a wrong password or tampered input", async () => {
    const fromLegacy = await resealPage(ID, PW, legacy, { pinned: true });
    expect(fromLegacy!.pinned).toBe(true);
    expect(fromLegacy!.version).toBe(legacy.createdAt);
    expect(await resealPage(ID, "wrongpassword000", legacy, { pinned: true })).toBeNull();

    const pk = await derivePageKey(ID, PW);
    const stored = await sealPage(pk, META, PAYLOAD);
    expect(await resealPage(ID, "wrongpassword000", stored, { pinned: true })).toBeNull();
    expect(await resealPage(ID, PW, { ...stored, pinned: true }, { createdAt: "x" })).toBeNull();
  });
});
