import { test } from "node:test";
import assert from "node:assert/strict";
import { disposition, perfPct, newToRemember, memoryStats } from "../src/opportunityMemory.js";

test("disposition: traded > rejected > investigated > surfaced", () => {
  assert.equal(disposition({ ticker: "A" }, { held: new Set(["A"]) }), "traded");
  assert.equal(disposition({ ticker: "A" }, { rejected: new Set(["A"]) }), "rejected");
  assert.equal(disposition({ ticker: "A" }, { researched: new Set(["A"]) }), "investigated");
  assert.equal(disposition({ ticker: "A" }, {}), "surfaced");
  // precedence: held wins over researched
  assert.equal(disposition({ ticker: "A" }, { held: new Set(["A"]), researched: new Set(["A"]) }), "traded");
});

test("perfPct: real measured delta, null on bad input", () => {
  assert.equal(perfPct(100, 180), 80);     // the "ignored, +80%" case
  assert.equal(perfPct(100, 55), -45);     // the "investigated, rejected, -45%" case
  assert.equal(perfPct(0, 100), null);
  assert.equal(perfPct(100, null), null);
});

test("newToRemember dedups by ticker+kind against existing and within the batch", () => {
  const existing = [{ ticker: "TCS.NS", kind: "rs_leader" }];
  const candidates = [
    { ticker: "TCS.NS", kind: "rs_leader" },     // already remembered
    { ticker: "INFY.NS", kind: "rs_leader" },    // new
    { ticker: "INFY.NS", kind: "rs_leader" },    // dup in batch
    { ticker: "INFY.NS", kind: "discovered_idea" }, // same ticker, different kind → new
  ];
  const out = newToRemember(candidates, existing);
  assert.deepEqual(out.map((c) => `${c.ticker}|${c.kind}`), ["INFY.NS|rs_leader", "INFY.NS|discovered_idea"]);
});

test("memoryStats: locked until enough priced records (Conditioning Rule)", () => {
  const few = [{ kind: "rs_leader", status: "surfaced", perf_pct: 10 }];
  const s = memoryStats(few, 20);
  assert.equal(s.locked, true);
  assert.equal(s.n, 1);
});

test("memoryStats: once unlocked, ranks avg perf by kind and disposition", () => {
  const recs = [];
  for (let i = 0; i < 12; i++) recs.push({ kind: "rs_leader", status: "surfaced", perf_pct: 20 }); // ignored winners
  for (let i = 0; i < 12; i++) recs.push({ kind: "discovered_idea", status: "rejected", perf_pct: -10 });
  const s = memoryStats(recs, 20);
  assert.equal(s.locked, false);
  assert.equal(s.n, 24);
  assert.equal(s.byKind[0].k, "rs_leader");        // best-performing kind first
  assert.equal(s.byKind[0].avg, 20);
  assert.equal(s.byDisposition.find((d) => d.k === "surfaced").avg, 20); // "ignored" cohort tracked
});
