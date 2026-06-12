import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFacts, factsTrends, factsBlock, factsLine, hasFacts } from "../src/facts.js";

// Synthetic but internally-consistent quarterly series (chronological).
// Latest quarter (2025-07-31, fy2026 Q2) has a clean year-ago match (2024-07-31, fy2025 Q2).
const B = 1e9;
const RAW = {
  ticker: "nvda",
  company: "NVIDIA Corp",
  asOf: "2025-08-20",
  series: {
    revenue: [
      { end: "2024-07-31", val: 30 * B, fy: 2025, fp: "Q2", form: "10-Q", filed: "2024-08-20" },
      { end: "2024-10-31", val: 35 * B, fy: 2025, fp: "Q3", form: "10-Q", filed: "2024-11-20" },
      { end: "2025-01-31", val: 39 * B, fy: 2025, fp: "Q4", form: "10-K", filed: "2025-02-20" },
      { end: "2025-04-30", val: 44 * B, fy: 2026, fp: "Q1", form: "10-Q", filed: "2025-05-20" },
      { end: "2025-07-31", val: 57 * B, fy: 2026, fp: "Q2", form: "10-Q", filed: "2025-08-20" },
    ],
    grossProfit: [
      { end: "2024-07-31", val: 22.8 * B, fy: 2025, fp: "Q2", form: "10-Q", filed: "2024-08-20" }, // 76%
      { end: "2025-07-31", val: 42.75 * B, fy: 2026, fp: "Q2", form: "10-Q", filed: "2025-08-20" }, // 75%
    ],
    operatingIncome: [{ end: "2025-07-31", val: 34.2 * B, fy: 2026, fp: "Q2", form: "10-Q", filed: "2025-08-20" }], // 60%
    netIncome: [{ end: "2025-07-31", val: 28.5 * B, fy: 2026, fp: "Q2", form: "10-Q", filed: "2025-08-20" }], // 50%
    rnd: [{ end: "2025-07-31", val: 5.7 * B, fy: 2026, fp: "Q2", form: "10-Q", filed: "2025-08-20" }], // 10%
  },
};

test("normalizeFacts dedupes by end keeping the latest filing (restatements win)", () => {
  const f = normalizeFacts({
    ...RAW,
    series: { ...RAW.series, revenue: [
      { end: "2025-07-31", val: 50 * B, fy: 2026, fp: "Q2", form: "10-Q", filed: "2025-08-20" }, // original
      { end: "2025-07-31", val: 57 * B, fy: 2026, fp: "Q2", form: "10-Q/A", filed: "2025-09-30" }, // restated, later filed
    ] },
  });
  assert.equal(f.series.revenue.length, 1);
  assert.equal(f.series.revenue[0].val, 57 * B);
});

test("normalizeFacts rejects empty/garbage and sorts chronologically", () => {
  assert.equal(normalizeFacts(null), null);
  assert.equal(normalizeFacts({ series: {} }), null);
  const f = normalizeFacts({ series: { revenue: [
    { end: "2025-07-31", val: 57 * B }, { end: "2024-07-31", val: 30 * B },
    { end: "bad" }, { val: 1 }, null,
  ] } });
  assert.equal(f.series.revenue.length, 2);
  assert.equal(f.series.revenue[0].end, "2024-07-31"); // sorted oldest→newest
});

test("factsTrends computes YoY (fp-matched), QoQ, margins and pp deltas", () => {
  const t = factsTrends(RAW);
  assert.equal(t.ticker, "NVDA");
  assert.equal(t.quarters, 5);
  assert.equal(t.revenue.val, 57 * B);
  // YoY vs the fp-matched 2024-07-31 (30B): (57-30)/30 = +0.90
  assert.ok(Math.abs(t.revenue.yoy - 0.9) < 1e-9);
  // QoQ vs prior quarter 2025-04-30 (44B): (57-44)/44 ≈ +0.2955
  assert.ok(Math.abs(t.revenue.qoq - 13 / 44) < 1e-9);
  // Gross margin latest 42.75/57 = 0.75; year-ago 22.8/30 = 0.76 → delta -0.01
  assert.ok(Math.abs(t.grossMargin.latest - 0.75) < 1e-9);
  assert.ok(Math.abs(t.grossMargin.deltaYoY - -0.01) < 1e-9);
  assert.ok(Math.abs(t.operatingMargin.latest - 0.6) < 1e-9);
  assert.ok(Math.abs(t.netMargin.latest - 0.5) < 1e-9);
  assert.ok(Math.abs(t.rndIntensity - 0.1) < 1e-9);
});

test("factsTrends falls back to 4-quarters-back when no fp match exists", () => {
  // Strip fp/fy so the matcher must use positional index-4.
  const stripped = { ...RAW, series: { ...RAW.series, revenue: RAW.series.revenue.map((p) => ({ end: p.end, val: p.val })) } };
  const t = factsTrends(stripped);
  assert.ok(Math.abs(t.revenue.yoy - 0.9) < 1e-9); // index 4 back = first point, 30B
});

test("factsBlock renders the FACT line with provenance, omits missing metrics, caps at 600", () => {
  const block = factsBlock(RAW);
  assert.match(block, /\[FACT, XBRL 10-Q 2025-07-31\]/);
  assert.match(block, /REVENUE 57\.0B \(\+90% YoY, \+30% QoQ\)/);
  assert.match(block, /GROSS MARGIN 75\.0% \(▼1\.0pp YoY\)/);
  assert.match(block, /OP MARGIN 60\.0%/);
  assert.match(block, /NET MARGIN 50\.0%/);
  assert.match(block, /R&D 10% of revenue/);
  assert.ok(block.length <= 600);
  // No revenue → nothing to cite.
  assert.equal(factsBlock({ series: {} }), "");
  assert.equal(factsBlock(null), "");
});

test("factsBlock drops margin metrics that have no data instead of guessing", () => {
  const revOnly = { series: { revenue: RAW.series.revenue } };
  const block = factsBlock(revOnly);
  assert.match(block, /REVENUE 57\.0B/);
  assert.doesNotMatch(block, /GROSS MARGIN/); // omitted, never fabricated
});

test("factsLine is a compact council one-liner; hasFacts gates presence", () => {
  const line = factsLine(RAW);
  assert.match(line, /XBRL 10-Q 2025-07-31: rev 57\.0B \(\+90% YoY\), gross 75%, net 50%/);
  assert.ok(line.length <= 240);
  assert.equal(hasFacts(normalizeFacts(RAW)), true);
  assert.equal(hasFacts(null), false);
  assert.equal(hasFacts({ series: {} }), false);
});
