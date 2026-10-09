import assert from "node:assert/strict";
import test from "node:test";
import { formatExpiry, formatStatusLine } from "../status-line.mjs";

test("a renew-on-view page prints the unopened date and the hard cap", () => {
  const data = {
    id: "abc",
    expiresAt: "2026-10-23T08:00:00.000Z",
    renewOnView: true,
    renewUntil: "2027-10-09T08:00:00.000Z",
  };
  assert.equal(formatExpiry(data), "2026-10-23 if unopened (renews on visit, until 2027-10-09)");
  assert.equal(
    formatStatusLine(data),
    "  id: abc | expires: 2026-10-23 if unopened (renews on visit, until 2027-10-09)",
  );
});

test("a renew-on-view page without renewUntil still says it renews", () => {
  assert.equal(
    formatExpiry({ expiresAt: "2026-10-23T08:00:00.000Z", renewOnView: true }),
    "2026-10-23 if unopened (renews on visit)",
  );
});

test("a fixed-expiry page prints just the date, as before", () => {
  for (const data of [
    { id: "abc", expiresAt: "2026-10-23T08:00:00.000Z", renewOnView: false },
    { id: "abc", expiresAt: "2026-10-23T08:00:00.000Z" }, // older service, no field
  ]) {
    assert.equal(formatStatusLine(data), "  id: abc | expires: 2026-10-23");
  }
});

test("a pinned page never expires, whatever the renew flag says", () => {
  assert.equal(formatExpiry({ expiresAt: null, renewOnView: true }), "never");
  assert.equal(formatExpiry({ expiresAt: null, renewOnView: false }), "never");
});

test("update and public notes follow the expiry", () => {
  const data = {
    id: "abc", public: true, expiresAt: "2026-10-23T08:00:00.000Z",
    renewOnView: true, renewUntil: "2027-10-09T08:00:00.000Z",
  };
  assert.equal(
    formatStatusLine(data, { updated: true }),
    "  id: abc | expires: 2026-10-23 if unopened (renews on visit, until 2027-10-09) | updated in place | public",
  );
});
