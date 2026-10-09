import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import {
  DEFAULT_TTL_DAYS,
  NEW_PAGE_TTL_DAYS,
  RENEW_CAP_DAYS,
  expiresAtMs,
  expiryFields,
  isExpired,
  isPageExpired,
  mintNoticeToken,
  readLastSeen,
  recordVisit,
  renewUntilMs,
  seenKey,
  verifyPassword,
  windowStartOf,
} from "../auth";
import { purgeExpired } from "../cleanup";
import {
  type PageMeta,
  derivePageKey,
  openPageV3,
  openPageV3Bytes,
  parseV3Header,
  resealPage,
  resealPageV3,
  sealPage,
  sealPageV3Bytes,
} from "../envelope";
import { encodeObject, rawUpload, storedHeader, storedObject } from "./v3-helpers";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const PW = "passwordpassword";
const enc = (s: string) => new TextEncoder().encode(s);
const iso = (ms: number) => new Date(ms).toISOString();

interface Link {
  url: string;
  id: string;
  password: string;
  expiresAt: string | null;
  public: boolean;
  publicUrl?: string;
  renewOnView: boolean;
  renewUntil?: string;
}

async function jsonUpload(body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: "<h1>Renew</h1>", filename: "r.html", ...body }),
  });
}

async function create(meta: Record<string, unknown> = {}): Promise<Link> {
  const res = await rawUpload({ filename: "r.html", ...meta }, "<h1>Renew</h1>");
  expect(res.status).toBe(200);
  return res.json<Link>();
}

function settings(body: Record<string, unknown>) {
  return SELF.fetch("http://localhost/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Rewrites the page with a patched header, the way the operator scripts do.
async function reseal(page: { id: string; password: string }, patch: Parameters<typeof resealPageV3>[3]) {
  const next = (await resealPageV3(page.id, page.password, await storedObject(page.id), patch))!;
  expect(next).not.toBeNull();
  await env.BUCKET.put(`page:${page.id}`, next);
}

async function age(page: { id: string; password: string }, ms: number) {
  await reseal(page, { createdAt: iso(Date.now() - ms) });
}

async function setSeen(id: string, at: number) {
  await env.BUCKET.put(seenKey(id), iso(at));
}

async function seenOf(id: string): Promise<string | null> {
  const obj = await env.BUCKET.get(seenKey(id));
  return obj ? obj.text() : null;
}

async function exists(key: string) {
  return (await env.BUCKET.head(key)) !== null;
}

async function cookieFor(page: Link): Promise<string> {
  const boot = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, { redirect: "manual" });
  expect(boot.status).toBe(303);
  return boot.headers.get("Set-Cookie")!.match(/^([^;]+)/)![1];
}

function view(page: Link, cookie: string, init: RequestInit = {}) {
  return SELF.fetch(`http://localhost/${page.id}`, {
    ...init,
    headers: { Cookie: cookie, ...(init.headers ?? {}) },
  });
}

describe("expiry helper", () => {
  const created = Date.parse("2026-01-01T00:00:00.000Z");
  const createdAt = iso(created);

  it("a fixed page runs from createdAt and ignores visits", () => {
    const e = { createdAt, ttlDays: 14, lastSeen: iso(created + 10 * DAY) };
    expect(windowStartOf(e)).toBe(created);
    expect(expiresAtMs(e)).toBe(created + 14 * DAY);
    expect(renewUntilMs(e)).toBeNull();
    expect(isPageExpired(e, created + 14 * DAY)).toBe(false);
    expect(isPageExpired(e, created + 14 * DAY + 1)).toBe(true);
  });

  it("a renew page runs from the later of createdAt and the last visit", () => {
    const e = { createdAt, ttlDays: 14, renew: true, lastSeen: iso(created + 10 * DAY) };
    expect(windowStartOf(e)).toBe(created + 10 * DAY);
    expect(expiresAtMs(e)).toBe(created + 24 * DAY);
    expect(isPageExpired(e, created + 20 * DAY)).toBe(false);
    expect(isPageExpired(e, created + 24 * DAY + 1)).toBe(true);
    // A visit older than createdAt (left over from before an update) does not count.
    const stale = { createdAt, ttlDays: 14, renew: true, lastSeen: iso(created - 5 * DAY) };
    expect(windowStartOf(stale)).toBe(created);
    // Missing or garbage sidecar: no visit.
    expect(windowStartOf({ createdAt, renew: true, lastSeen: "not a date" })).toBe(created);
    expect(windowStartOf({ createdAt, renew: true })).toBe(created);
  });

  it("caps a renew page at createdAt + 365 days", () => {
    const cap = created + RENEW_CAP_DAYS * DAY;
    const e = { createdAt, ttlDays: 30, renew: true, lastSeen: iso(cap - DAY) };
    expect(renewUntilMs(e)).toBe(cap);
    expect(expiresAtMs(e)).toBe(cap);
    expect(isPageExpired(e, cap)).toBe(false);
    expect(isPageExpired(e, cap + 1)).toBe(true);
    // Even a sidecar claiming a visit after the cap cannot extend it.
    expect(isPageExpired({ ...e, lastSeen: iso(cap + 10 * DAY) }, cap + 1)).toBe(true);
  });

  it("a pinned page never expires, renew or not", () => {
    for (const renew of [false, true]) {
      const e = { createdAt, ttlDays: 1, pinned: true, renew };
      expect(expiresAtMs(e)).toBeNull();
      expect(renewUntilMs(e)).toBeNull();
      expect(isPageExpired(e, created + 1000 * DAY)).toBe(false);
    }
    expect(expiryFields({ createdAt, pinned: true, renew: true })).toEqual({ expiresAt: null, renewOnView: true });
  });

  it("an absent ttlDays still means 7 days; new pages are created with 14", () => {
    expect(DEFAULT_TTL_DAYS).toBe(7);
    expect(NEW_PAGE_TTL_DAYS).toBe(14);
    expect(expiresAtMs({ createdAt })).toBe(created + 7 * DAY);
    expect(expiresAtMs({ createdAt, renew: true })).toBe(created + 7 * DAY);
    expect(isExpired(createdAt, undefined, false, created + 7 * DAY + 1)).toBe(true);
    expect(isExpired(createdAt, undefined, true, created + 7 * DAY + 1)).toBe(false);
  });

  it("expiryFields shapes the API response", () => {
    expect(expiryFields({ createdAt, ttlDays: 14, renew: true })).toEqual({
      expiresAt: iso(created + 14 * DAY),
      renewOnView: true,
      renewUntil: iso(created + 365 * DAY),
    });
    expect(expiryFields({ createdAt, ttlDays: 14 })).toEqual({
      expiresAt: iso(created + 14 * DAY),
      renewOnView: false,
    });
  });
});

// The v3 AAD as it was before `renew` existed, rebuilt independently so a
// change to the formula for non-renew pages fails here.
async function hkdf(ikm: Uint8Array, salt: string, info: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: enc(salt), info: enc(info) }, base, 256);
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt"]);
}
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sealOldFormat(id: string, password: string, html: string): Promise<Uint8Array> {
  const pk = await derivePageKey(id, password);
  const seal = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const page = enc(html);
  const fields = {
    v: 3, verifier: pk.verifier, createdAt: new Date().toISOString(), version: "old-v", ttlDays: 7,
    bytes: page.length, chunk: 1024 * 1024, seal,
  };
  const aad = `htmldrop:page:v3|${id}|${fields.createdAt}|${fields.version}|0|ttl=7`
    + `|open=|verifier=${fields.verifier}|seal=${seal}|bytes=${fields.bytes}|chunk=${fields.chunk}`;
  const salt = `htmldrop:page:v3|${seal}`;
  const metaKey = await hkdf(pk.key, salt, "meta");
  const contentKey = await hkdf(pk.key, salt, "content");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const metaCt = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc(`${aad}|meta`) }, metaKey, enc(JSON.stringify({ filename: "old.html" })),
  ));
  const frame = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(12), additionalData: enc(`${aad}|0`) }, contentKey, page,
  ));
  return encodeObject({ ...fields, meta: { iv: b64u(iv), ct: b64u(metaCt) } }, frame);
}

describe("renew flag in the v3 header", () => {
  const ID = "renewAAD";
  const META: PageMeta = { id: ID, createdAt: "2026-09-01T00:00:00.000Z", version: "v-1", ttlDays: 14 };

  it("an object sealed before the flag existed still opens, and still opens through the Worker", async () => {
    const object = await sealOldFormat("OLDAAD01", PW, "<p>from before</p>");
    const pk = await derivePageKey("OLDAAD01", PW);
    const opened = await openPageV3Bytes(pk.key, "OLDAAD01", object);
    expect(opened).not.toBeNull();
    expect(new TextDecoder().decode(opened!.html)).toBe("<p>from before</p>");
    expect(opened!.header.renew).toBeUndefined();
    await env.BUCKET.put("page:OLDAAD01", object);
    const boot = await SELF.fetch(`http://localhost/OLDAAD01?p=${PW}`, { redirect: "manual" });
    expect(boot.status).toBe(303);
  });

  it("a sealed renew flag round-trips and is authenticated both ways", async () => {
    const pk = await derivePageKey(ID, PW);
    const on = await sealPageV3Bytes(pk, { ...META, renew: true }, "a.html", enc("<p>x</p>"));
    const off = await sealPageV3Bytes(pk, META, "a.html", enc("<p>x</p>"));
    const onParsed = parseV3Header(on)!;
    const offParsed = parseV3Header(off)!;
    expect(onParsed.header.renew).toBe(true);
    expect(offParsed.header.renew).toBeUndefined();
    expect(await openPageV3Bytes(pk.key, ID, on)).not.toBeNull();
    expect(await openPageV3Bytes(pk.key, ID, off)).not.toBeNull();

    // Stripping the flag from a renew page, or adding it to a fixed one, fails closed.
    const { renew: _drop, ...stripped } = onParsed.header;
    expect(await openPageV3(pk.key, ID, stripped as never)).toBeNull();
    expect(await openPageV3Bytes(pk.key, ID, encodeObject(stripped, on.subarray(onParsed.end)))).toBeNull();
    const added = { ...offParsed.header, renew: true };
    expect(await openPageV3(pk.key, ID, added as never)).toBeNull();
    expect(await openPageV3Bytes(pk.key, ID, encodeObject(added, off.subarray(offParsed.end)))).toBeNull();
    // Only `true` is a valid value.
    expect(parseV3Header(encodeObject({ ...offParsed.header, renew: false }, off.subarray(offParsed.end)))).toBeNull();
  });

  it("resealPageV3 sets and clears the flag, keeping everything else", async () => {
    const pk = await derivePageKey(ID, PW);
    const off = await sealPageV3Bytes(pk, META, "a.html", enc("<p>x</p>"));
    const on = (await resealPageV3(ID, PW, off, { renew: true }))!;
    expect(parseV3Header(on)!.header.renew).toBe(true);
    expect(parseV3Header(on)!.header.createdAt).toBe(META.createdAt);
    const kept = (await resealPageV3(ID, PW, on, { public: true }))!;
    expect(parseV3Header(kept)!.header.renew).toBe(true);
    const back = (await resealPageV3(ID, PW, kept, { renew: false }))!;
    expect(parseV3Header(back)!.header.renew).toBeUndefined();
    expect(new TextDecoder().decode((await openPageV3Bytes(pk.key, ID, back))!.html)).toBe("<p>x</p>");
  });

  it("v2 records never carry the flag", async () => {
    const pk = await derivePageKey(ID, PW);
    const v2 = await sealPage(pk, { ...META, renew: true }, { html: "<p>x</p>", filename: "a.html" });
    expect("renew" in v2).toBe(false);
    expect(await resealPage(ID, PW, v2, { renew: false })).not.toBeNull();
    await expect(resealPage(ID, PW, v2, { renew: true })).rejects.toThrow(/v3/);
  });
});

describe("upload: renewOnView", () => {
  it("a new page defaults to 14 days, renewing on view, capped a year out", async () => {
    const t0 = Date.now();
    const page = await create();
    expect(page.renewOnView).toBe(true);
    const h = await storedHeader(page.id);
    expect(h.ttlDays).toBe(14);
    expect(h.renew).toBe(true);
    const created = Date.parse(h.createdAt);
    expect(page.expiresAt).toBe(iso(created + 14 * DAY));
    expect(page.renewUntil).toBe(iso(created + 365 * DAY));
    expect(created).toBeGreaterThanOrEqual(t0 - 1000);

    // The JSON API gets the same defaults.
    const viaJson = await (await jsonUpload({})).json<Link>();
    expect(viaJson.renewOnView).toBe(true);
    expect(viaJson.renewUntil).toBeTruthy();
    expect((await storedHeader(viaJson.id)).renew).toBe(true);
    expect((await storedHeader(viaJson.id)).ttlDays).toBe(14);
  });

  it("renewOnView: false gives today's fixed window", async () => {
    const page = await create({ renewOnView: false, expiresInDays: 7 });
    expect(page.renewOnView).toBe(false);
    expect(page.renewUntil).toBeUndefined();
    const h = await storedHeader(page.id);
    expect(h.renew).toBeUndefined();
    expect(h.ttlDays).toBe(7);
    expect(page.expiresAt).toBe(iso(Date.parse(h.createdAt) + 7 * DAY));
  });

  it("rejects a non-boolean renewOnView on both upload shapes", async () => {
    for (const bad of ["yes", 1, null, "true"]) {
      const raw = await rawUpload({ filename: "r.html", renewOnView: bad }, "<p>x</p>");
      expect(raw.status).toBe(400);
      expect(await raw.text()).toContain("'renewOnView' must be a boolean");
      expect((await jsonUpload({ renewOnView: bad })).status).toBe(400);
    }
  });

  it("an update keeps the stored flag unless renewOnView is given", async () => {
    const fixed = await create({ renewOnView: false });
    const kept = await (await jsonUpload({ id: fixed.id, password: fixed.password })).json<Link>();
    expect(kept.renewOnView).toBe(false);
    expect((await storedHeader(fixed.id)).renew).toBeUndefined();
    const turnedOn = await (await jsonUpload({ id: fixed.id, password: fixed.password, renewOnView: true })).json<Link>();
    expect(turnedOn.renewOnView).toBe(true);
    expect(turnedOn.renewUntil).toBeTruthy();
    expect((await storedHeader(fixed.id)).renew).toBe(true);

    const renewing = await create();
    const stillOn = await rawUpload({ filename: "r.html", id: renewing.id, password: renewing.password }, "<p>v2</p>");
    expect((await stillOn.json<Link>()).renewOnView).toBe(true);
    expect((await storedHeader(renewing.id)).renew).toBe(true);
    const off = await rawUpload(
      { filename: "r.html", id: renewing.id, password: renewing.password, renewOnView: false },
      "<p>v3</p>",
    );
    const offData = await off.json<Link>();
    expect(offData.renewOnView).toBe(false);
    expect(offData.renewUntil).toBeUndefined();
    expect((await storedHeader(renewing.id)).renew).toBeUndefined();
  });

  it("an update of a page stored before renew existed keeps it fixed and its window", async () => {
    const pk = await derivePageKey("OLDUPD01", PW);
    await env.BUCKET.put("page:OLDUPD01", JSON.stringify(await sealPage(pk, {
      id: "OLDUPD01", createdAt: new Date().toISOString(), version: "v",
    }, { html: "<p>old</p>", filename: "o.html" })));
    const res = await jsonUpload({ id: "OLDUPD01", password: PW });
    expect(res.status).toBe(200);
    const data = await res.json<Link>();
    expect(data.renewOnView).toBe(false);
    const h = await storedHeader("OLDUPD01");
    expect(h.renew).toBeUndefined();
    expect(h.ttlDays).toBeUndefined(); // still the 7-day default
    expect(data.expiresAt).toBe(iso(Date.parse(h.createdAt) + 7 * DAY));
  });
});

describe("settings: renewOnView", () => {
  it("toggles renew without restarting the window or changing the version", async () => {
    const page = await create();
    await age(page, 5 * DAY);
    const before = await storedHeader(page.id);

    const off = await settings({ id: page.id, password: page.password, renewOnView: false });
    expect(off.status).toBe(200);
    const offData = await off.json<Link>();
    expect(offData.renewOnView).toBe(false);
    expect(offData.renewUntil).toBeUndefined();
    expect(offData.expiresAt).toBe(iso(Date.parse(before.createdAt) + 14 * DAY));
    let h = await storedHeader(page.id);
    expect(h.renew).toBeUndefined();
    expect(h.createdAt).toBe(before.createdAt);
    expect(h.version).toBe(before.version);

    const on = await settings({ id: page.id, password: page.password, renewOnView: true });
    expect(on.status).toBe(200);
    const onData = await on.json<Link>();
    expect(onData.renewOnView).toBe(true);
    expect(onData.renewUntil).toBe(iso(Date.parse(before.createdAt) + 365 * DAY));
    h = await storedHeader(page.id);
    expect(h.renew).toBe(true);
    expect(h.createdAt).toBe(before.createdAt);
    expect(h.version).toBe(before.version);

    // Content survives the re-seals.
    const viewRes = await view(page, await cookieFor(page));
    expect(await viewRes.text()).toContain("<h1>Renew</h1>");
  });

  it("an unchanged flag does not rewrite the page", async () => {
    const page = await create();
    const etag = (await env.BUCKET.head(`page:${page.id}`))!.etag;
    const res = await settings({ id: page.id, password: page.password, renewOnView: true });
    expect(res.status).toBe(200);
    expect((await env.BUCKET.head(`page:${page.id}`))!.etag).toBe(etag);
  });

  it("reports the window visits moved, and turning renew off keeps that date", async () => {
    const page = await create();
    await age(page, 10 * DAY);
    const seen = Date.now() - 3 * DAY;
    await setSeen(page.id, seen);
    const pub = await (await settings({ id: page.id, password: page.password, public: true })).json<Link>();
    expect(pub.expiresAt).toBe(iso(seen + 14 * DAY));
    const off = await (await settings({ id: page.id, password: page.password, renewOnView: false })).json<Link>();
    expect(off.expiresAt).toBe(iso(seen + 14 * DAY));
    expect((await storedHeader(page.id)).createdAt).toBe(iso(seen));
  });

  it("turning renew off and on again restarts the one-year cap from the fixed window start", async () => {
    const page = await create();
    await age(page, 10 * DAY);
    const seen = Date.now() - 3 * DAY;
    await setSeen(page.id, seen);
    const created = Date.parse((await storedHeader(page.id)).createdAt);
    const first = await (await settings({ id: page.id, password: page.password, public: true })).json<Link>();
    expect(first.renewUntil).toBe(iso(created + 365 * DAY));
    await settings({ id: page.id, password: page.password, renewOnView: false });
    const on = await (await settings({ id: page.id, password: page.password, renewOnView: true })).json<Link>();
    // Off fixed createdAt at the last visit, so the cap now counts from there:
    // never later than a new expiresInDays would put it.
    expect((await storedHeader(page.id)).createdAt).toBe(iso(seen));
    expect(on.renewUntil).toBe(iso(seen + 365 * DAY));
    expect(on.expiresAt).toBe(iso(seen + 14 * DAY));
  });

  it("turning renew off near the one-year cap keeps the capped date", async () => {
    const page = await create();
    await age(page, 360 * DAY);
    const seen = Date.now() - DAY;
    await setSeen(page.id, seen);
    const created = Date.parse((await storedHeader(page.id)).createdAt);
    const capped = created + 365 * DAY;
    const before = await (await settings({ id: page.id, password: page.password, public: true })).json<Link>();
    expect(before.expiresAt).toBe(iso(capped));
    const off = await (await settings({ id: page.id, password: page.password, renewOnView: false })).json<Link>();
    expect(off.expiresAt).toBe(iso(capped));
    expect((await storedHeader(page.id)).createdAt).toBe(iso(capped - 14 * DAY));
  });

  it("a new expiresInDays still restarts the window", async () => {
    const page = await create();
    await age(page, 5 * DAY);
    const t0 = Date.now();
    const data = await (await settings({ id: page.id, password: page.password, expiresInDays: 30 })).json<Link>();
    expect(data.renewOnView).toBe(true);
    expect(Date.parse(data.expiresAt!) - t0).toBeGreaterThan(30 * DAY - 60_000);
    expect(Date.parse(data.renewUntil!) - t0).toBeGreaterThan(365 * DAY - 60_000);
  });

  it("rejects a non-boolean renewOnView; renewOnView alone is something to change", async () => {
    const page = await create();
    const cred = { id: page.id, password: page.password };
    const bad = await settings({ ...cred, renewOnView: "no" });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("'renewOnView' must be a boolean");
    const nothing = await settings(cred);
    expect(nothing.status).toBe(400);
    expect(await nothing.text()).toContain("renewOnView");
    expect((await settings({ ...cred, renewOnView: false })).status).toBe(200);
  });

  it("a pinned renew page reports no expiry and no cap", async () => {
    const page = await create();
    await reseal(page, { pinned: true });
    const data = await (await settings({ id: page.id, password: page.password, public: true })).json<Link>();
    expect(data.expiresAt).toBeNull();
    expect(data.renewOnView).toBe(true);
    expect(data.renewUntil).toBeUndefined();
  });
});

describe("counting visits", () => {
  it("a GET that serves the page writes seen:, HEAD and the version probe do not", async () => {
    const page = await create();
    await age(page, 2 * DAY);
    const cookie = await cookieFor(page);
    expect(await seenOf(page.id)).toBeNull(); // the ?p= redirect is not a view

    expect((await view(page, cookie, { method: "HEAD" })).status).toBe(200);
    expect(await seenOf(page.id)).toBeNull();

    const h = await storedHeader(page.id);
    const t = await mintNoticeToken(env.AUTH_SECRET, page.id, h.verifier);
    const probe = await SELF.fetch(`http://localhost/${page.id}/v?t=${encodeURIComponent(t)}`);
    expect(await probe.json()).toEqual({ v: h.version });
    expect(await seenOf(page.id)).toBeNull();

    expect((await SELF.fetch(`http://localhost/${page.id}/comments`, { headers: { Cookie: cookie } })).status)
      .not.toBe(500);
    expect(await seenOf(page.id)).toBeNull();

    const t0 = Date.now();
    const res = await view(page, cookie);
    expect(res.status).toBe(200);
    await res.text();
    const seen = await seenOf(page.id);
    expect(seen).not.toBeNull();
    expect(Date.parse(seen!)).toBeGreaterThanOrEqual(t0 - 1000);
  });

  it("is throttled to once a day per page", async () => {
    // A fresh page: the window started less than a day ago, nothing to write.
    const fresh = await create();
    await (await view(fresh, await cookieFor(fresh))).text();
    expect(await seenOf(fresh.id)).toBeNull();

    const page = await create();
    await age(page, 3 * DAY);
    const cookie = await cookieFor(page);
    await (await view(page, cookie)).text();
    const first = (await env.BUCKET.head(seenKey(page.id)))!;
    await (await view(page, cookie)).text();
    await (await view(page, cookie)).text();
    expect((await env.BUCKET.head(seenKey(page.id)))!.etag).toBe(first.etag);

    // A visit recorded 23 hours ago holds; 25 hours ago is renewed.
    await setSeen(page.id, Date.now() - 23 * HOUR);
    const held = (await env.BUCKET.head(seenKey(page.id)))!.etag;
    await (await view(page, cookie)).text();
    expect((await env.BUCKET.head(seenKey(page.id)))!.etag).toBe(held);
    await setSeen(page.id, Date.now() - 25 * HOUR);
    await (await view(page, cookie)).text();
    expect(Date.now() - Date.parse((await seenOf(page.id))!)).toBeLessThan(HOUR);
  });

  it("counts a public-link view and a 304 revalidation, not a refusal", async () => {
    const page = await create({ public: true });
    await age(page, 2 * DAY);
    expect((await SELF.fetch(`http://localhost/${page.id}?p=wrongpassword000`, { redirect: "manual" })).status).toBe(403);
    expect(await seenOf(page.id)).toBeNull();
    const bare = await SELF.fetch(`http://localhost/${page.id}`);
    expect(bare.status).toBe(200);
    const etag = bare.headers.get("ETag")!;
    await bare.text();
    expect(await seenOf(page.id)).not.toBeNull();

    await env.BUCKET.delete(seenKey(page.id));
    const cached = await SELF.fetch(`http://localhost/${page.id}`, { headers: { "If-None-Match": etag } });
    expect(cached.status).toBe(304);
    expect(await seenOf(page.id)).not.toBeNull();
  });

  it("never writes seen: for a fixed or a pinned page", async () => {
    const fixed = await create({ renewOnView: false });
    await age(fixed, 2 * DAY);
    await (await view(fixed, await cookieFor(fixed))).text();
    expect(await seenOf(fixed.id)).toBeNull();

    const pinned = await create();
    await reseal(pinned, { pinned: true, createdAt: iso(Date.now() - 400 * DAY) });
    await (await view(pinned, await cookieFor(pinned))).text();
    expect(await seenOf(pinned.id)).toBeNull();
  });

  it("recordVisit never fails the view when the write fails", async () => {
    const broken = { put: async () => { throw new Error("r2 down"); } } as unknown as R2Bucket;
    const old = iso(Date.now() - 3 * DAY);
    expect(await recordVisit(broken, "x", { createdAt: old, renew: true })).toBe(false);
    expect(await recordVisit(env.BUCKET, "RVfixed1", { createdAt: old, renew: false })).toBe(false);
    expect(await recordVisit(env.BUCKET, "RVrenew1", { createdAt: old, renew: true })).toBe(true);
    expect(await seenOf("RVrenew1")).not.toBeNull();
  });
});

describe("renew pages expire when unopened", () => {
  it("a visited renew page outlives createdAt + ttl; an unvisited one is purged with its sidecar", async () => {
    const visited = await create();
    await age(visited, 20 * DAY);
    await setSeen(visited.id, Date.now() - 3 * DAY);
    const res = await view(visited, await cookieFor(visited));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<h1>Renew</h1>");
    // That view restarted the window.
    expect(Date.now() - Date.parse((await seenOf(visited.id))!)).toBeLessThan(HOUR);

    const idle = await create();
    await age(idle, 15 * DAY);
    await setSeen(idle.id, Date.now() - 15 * DAY + HOUR); // stale: before the window
    const gone = await SELF.fetch(`http://localhost/${idle.id}?p=${idle.password}`, { redirect: "manual" });
    expect(gone.status).toBe(403);
    expect(await exists(`page:${idle.id}`)).toBe(false);
    expect(await exists(seenKey(idle.id))).toBe(false);
  });

  it("the 365-day cap holds however recent the last visit", async () => {
    const page = await create();
    await age(page, 366 * DAY);
    await setSeen(page.id, Date.now() - HOUR);
    const res = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, { redirect: "manual" });
    expect(res.status).toBe(403);
    expect(await exists(`page:${page.id}`)).toBe(false);
    expect(await exists(seenKey(page.id))).toBe(false);
  });

  it("a fixed page is deleted on its date, visits or not", async () => {
    const page = await create({ renewOnView: false });
    await age(page, 15 * DAY);
    await setSeen(page.id, Date.now() - HOUR);
    const res = await SELF.fetch(`http://localhost/${page.id}?p=${page.password}`, { redirect: "manual" });
    expect(res.status).toBe(403);
    expect(await exists(`page:${page.id}`)).toBe(false);
  });
});

describe("purgeExpired and renew pages", () => {
  it("reads the sidecar: keeps visited renew pages, purges idle and over-cap ones with their sidecars", async () => {
    const visited = await create();
    await age(visited, 20 * DAY);
    await setSeen(visited.id, Date.now() - 2 * DAY);
    const idle = await create();
    await age(idle, 20 * DAY);
    await setSeen(idle.id, Date.now() - 16 * DAY);
    const capped = await create({ expiresInDays: 30 });
    await age(capped, 366 * DAY);
    await setSeen(capped.id, Date.now() - HOUR);
    const fixed = await create({ renewOnView: false });
    await age(fixed, 15 * DAY);
    await setSeen(fixed.id, Date.now() - HOUR);

    await purgeExpired(env.BUCKET);
    expect(await exists(`page:${visited.id}`)).toBe(true);
    expect(await exists(seenKey(visited.id))).toBe(true);
    for (const p of [idle, capped, fixed]) {
      expect(await exists(`page:${p.id}`), p.id).toBe(false);
      expect(await exists(seenKey(p.id)), p.id).toBe(false);
    }

    // Twelve days on, the visited page's window (from two days ago) has run out.
    await purgeExpired(env.BUCKET, Date.now() + 13 * DAY);
    expect(await exists(`page:${visited.id}`)).toBe(false);
    expect(await exists(seenKey(visited.id))).toBe(false);
  });

  it("sweeps orphan seen: keys, keeping those of live pages", async () => {
    const live = await create();
    await setSeen(live.id, Date.now() - HOUR);
    await setSeen("ORPHAN01", Date.now() - DAY);
    const r = await purgeExpired(env.BUCKET);
    expect(r.purgedSeen).toBeGreaterThanOrEqual(1);
    expect(await exists(seenKey("ORPHAN01"))).toBe(false);
    expect(await exists(seenKey(live.id))).toBe(true);
  });

  it("keeps the sidecar of a page created after the page listing", async () => {
    await setSeen("LATEPAGE", Date.now() - HOUR);
    const page = await derivePageKey("LATEPAGE", PW);
    const late = await sealPageV3Bytes(
      page,
      { id: "LATEPAGE", createdAt: new Date().toISOString(), version: "v", ttlDays: 14, renew: true },
      "l.html",
      enc("<p>late</p>"),
    );
    let listedPages = false;
    const bucket = new Proxy(env.BUCKET, {
      get(target, prop) {
        if (prop === "list") {
          return async (opts: R2ListOptions) => {
            const out = await target.list(opts);
            // The page lands right after the page listing was taken.
            if (opts.prefix === "page:" && !listedPages) {
              listedPages = true;
              await target.put("page:LATEPAGE", late);
            }
            return out;
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    await purgeExpired(bucket);
    expect(await exists("page:LATEPAGE")).toBe(true);
    expect(await exists(seenKey("LATEPAGE"))).toBe(true);
  });
});

describe("a failed sidecar read", () => {
  // A bucket whose reads of `seen:` keys fail, as a transient R2 error would.
  function failingSeen(): R2Bucket {
    return new Proxy(env.BUCKET, {
      get(target, prop) {
        if (prop === "get") {
          return async (key: string, opts?: R2GetOptions) => {
            if (key.startsWith("seen:")) throw new Error("r2 read failed");
            return target.get(key, opts);
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  }

  it("readLastSeen: no sidecar or a malformed one is no visit; a failed read throws", async () => {
    expect(await readLastSeen(env.BUCKET, "NOSEEN01")).toBeUndefined();
    await env.BUCKET.put(seenKey("BADSEEN1"), "not a date");
    expect(await readLastSeen(env.BUCKET, "BADSEEN1")).toBeUndefined();
    await env.BUCKET.put(seenKey("EMPTYSN1"), "");
    expect(await readLastSeen(env.BUCKET, "EMPTYSN1")).toBeUndefined();
    await env.BUCKET.put(seenKey("BIGSEEN1"), "2026-01-01T00:00:00.000Z".padEnd(200, " "));
    expect(await readLastSeen(env.BUCKET, "BIGSEEN1")).toBeUndefined();
    const at = iso(Date.now() - DAY);
    await env.BUCKET.put(seenKey("OKSEEN01"), at);
    expect(await readLastSeen(env.BUCKET, "OKSEEN01")).toBe(at);
    await expect(readLastSeen(failingSeen(), "OKSEEN01")).rejects.toThrow("r2 read failed");
  });

  it("fails the read instead of purging a page that visits keep alive", async () => {
    const page = await create();
    await age(page, 20 * DAY);
    await setSeen(page.id, Date.now() - DAY);
    await expect(verifyPassword(failingSeen(), page.id, page.password)).rejects.toThrow("r2 read failed");
    expect(await exists(`page:${page.id}`)).toBe(true);
    expect(await exists(seenKey(page.id))).toBe(true);
    // Once the sidecar reads again, the page is there and alive.
    expect(await verifyPassword(env.BUCKET, page.id, page.password)).not.toBeNull();
  });

  it("the cron leaves the page and its sidecar for the next sweep", async () => {
    const page = await create();
    await age(page, 20 * DAY);
    await setSeen(page.id, Date.now() - DAY);
    await purgeExpired(failingSeen());
    expect(await exists(`page:${page.id}`)).toBe(true);
    expect(await exists(seenKey(page.id))).toBe(true);
    await purgeExpired(env.BUCKET);
    expect(await exists(`page:${page.id}`)).toBe(true);
  });
});
