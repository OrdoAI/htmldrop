import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { purgeExpired } from "../cleanup";
import worker from "../index";
import { derivePageKey, sealPage } from "../envelope";

const DAY = 24 * 60 * 60 * 1000;

async function seedSealed(id: string, ageDays: number, pinned = false) {
  const createdAt = new Date(Date.now() - ageDays * DAY).toISOString();
  const stored = await sealPage(
    await derivePageKey(id, "passwordpassword"),
    { id, createdAt, version: "v", ...(pinned ? { pinned: true } : {}) },
    { html: "<p>x</p>".repeat(400), filename: "x.html" }, // > 1 KiB so the ranged read matters
  );
  await env.BUCKET.put(`page:${id}`, JSON.stringify(stored));
}

async function seedLegacy(id: string, ageDays: number, pinned = false) {
  const createdAt = new Date(Date.now() - ageDays * DAY).toISOString();
  await env.BUCKET.put(`page:${id}`, JSON.stringify({
    html: "<p>legacy</p>".repeat(200), password: "passwordpassword", filename: "l.html", createdAt,
    ...(pinned ? { pinned: true } : {}),
  }));
}

async function seedComment(id: string, cid: string) {
  await env.BUCKET.put(`comment:${id}:${cid}`, JSON.stringify({ v: 2, cid, iv: "AAAAAAAAAAAAAAAA", ct: "AAAA" }));
}

async function exists(key: string) {
  return (await env.BUCKET.head(key)) !== null;
}

describe("purgeExpired", () => {
  it("deletes expired pages, keeps live and pinned ones, in both storage formats", async () => {
    await seedSealed("CLNsEXP1", 8);
    await seedSealed("CLNsLIVE", 6);
    await seedSealed("CLNsPIN1", 400, true);
    await seedLegacy("CLNlEXP1", 8);
    await seedLegacy("CLNlLIVE", 1);
    await seedLegacy("CLNlPIN1", 400, true);

    const r = await purgeExpired(env.BUCKET);
    expect(r.purgedPages).toBeGreaterThanOrEqual(2);
    expect(await exists("page:CLNsEXP1")).toBe(false);
    expect(await exists("page:CLNlEXP1")).toBe(false);
    expect(await exists("page:CLNsLIVE")).toBe(true);
    expect(await exists("page:CLNsPIN1")).toBe(true);
    expect(await exists("page:CLNlLIVE")).toBe(true);
    expect(await exists("page:CLNlPIN1")).toBe(true);
  });

  it("deletes comments of purged and already-missing pages, keeps comments of live pages", async () => {
    await seedSealed("CLNcEXP2", 9);
    await seedComment("CLNcEXP2", "a");
    await seedComment("CLNcGONE", "b"); // page never existed / purged on read earlier
    await seedSealed("CLNcLIV2", 1);
    await seedComment("CLNcLIV2", "c");

    const r = await purgeExpired(env.BUCKET);
    expect(r.purgedComments).toBeGreaterThanOrEqual(2);
    expect(await exists("comment:CLNcEXP2:a")).toBe(false);
    expect(await exists("comment:CLNcGONE:b")).toBe(false);
    expect(await exists("comment:CLNcLIV2:c")).toBe(true);
  });

  it("leaves an unreadable page and its comments alone", async () => {
    await env.BUCKET.put("page:CLNbroke", "not json at all");
    await seedComment("CLNbroke", "d");
    await purgeExpired(env.BUCKET);
    expect(await exists("page:CLNbroke")).toBe(true);
    expect(await exists("comment:CLNbroke:d")).toBe(true);
  });

  it("respects the injected clock", async () => {
    await seedSealed("CLNclock", 3);
    await purgeExpired(env.BUCKET, Date.now() + 10 * DAY);
    expect(await exists("page:CLNclock")).toBe(false);
  });

  it("runs from the scheduled handler", async () => {
    await seedSealed("CLNcron1", 30);
    const controller = { cron: "17 3 * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController;
    await worker.scheduled!(controller, env as never);
    expect(await exists("page:CLNcron1")).toBe(false);
  });
});
