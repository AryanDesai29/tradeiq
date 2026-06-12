// Mission Control usage telemetry — injectable-store tests.
import test from "node:test";
import assert from "node:assert/strict";
import { track, usageSummary, MC_KEYS } from "../src/telemetry.js";

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test("track: increments per key, per user, and survives repeat clicks", () => {
  const s = memStore();
  assert.equal(track(s, "u1", "risk.inspect", 1000), 1);
  assert.equal(track(s, "u1", "risk.inspect", 2000), 2);
  assert.equal(track(s, "u1", "opp.logTrade", 3000), 1);
  assert.equal(track(s, "u2", "risk.inspect", 4000), 1); // separate user bucket
});

test("usageSummary: most-clicked first, never-clicked listed, totals correct", () => {
  const s = memStore();
  track(s, "u1", "opp.logTrade", 1); track(s, "u1", "opp.logTrade", 2); track(s, "u1", "opp.logTrade", 3);
  track(s, "u1", "risk.inspect", 4);
  const sum = usageSummary(s, "u1");
  assert.equal(sum.total, 4);
  assert.equal(sum.clicked[0].key, "opp.logTrade");
  assert.equal(sum.clicked[0].count, 3);
  assert.ok(sum.never.includes("council.open"));
  assert.ok(!sum.never.includes("risk.inspect"));
  assert.equal(sum.since, 1); // stamped on first event
});

test("telemetry is corruption-safe and empty-safe", () => {
  const broken = { getItem: () => "{not json", setItem: () => { throw new Error("quota"); } };
  assert.equal(track(broken, "u1", "x"), 0);
  const sum = usageSummary(broken, "u1");
  assert.equal(sum.total, 0);
  assert.deepEqual(sum.never, MC_KEYS);
  const empty = usageSummary(memStore(), "u1");
  assert.equal(empty.total, 0);
  assert.equal(empty.since, null);
});
