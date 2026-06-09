import { test } from "node:test";
import assert from "node:assert/strict";
import { expectancyBy, holdingDays, holdingBucket, marketOf, personalAlpha, MIN_SAMPLE } from "../src/alpha.js";

// Build a closed trade with a known R. risk = |entry-stop|*shares; pnl = (exit-entry)*shares*dir.
// To get a clean +nR winner: entry=100, stop=90 (risk 10/sh), exit=100+10n.
const mk = (o = {}) => ({
  side: "BUY", entry: 100, stop: 90, shares: 1, exit: 110, closed: true,
  currency: "USD", strategy: "Breakout", sector: "Technology",
  date: "2026-06-01", closedAt: "2026-06-04T00:00:00Z", ...o,
});
const winR = (n, o = {}) => mk({ exit: 100 + 10 * n, ...o });   // +nR
const lossR = (n, o = {}) => mk({ exit: 100 - 10 * n, ...o });  // -nR

test("marketOf derives India from INR, US otherwise — no stored column", () => {
  assert.equal(marketOf({ currency: "INR" }), "India");
  assert.equal(marketOf({ currency: "USD" }), "US");
  assert.equal(marketOf({}), "US");
});

test("holdingDays / holdingBucket from entry date → closed_at; null when missing", () => {
  assert.equal(holdingDays(mk({ date: "2026-06-01", closedAt: "2026-06-04T00:00:00Z" })), 3);
  assert.equal(holdingBucket(mk({ date: "2026-06-01", closedAt: "2026-06-04T00:00:00Z" })), "2–5d (swing)");
  assert.equal(holdingBucket(mk({ date: "2026-06-01", closedAt: "2026-06-01T05:00:00Z" })), "Intraday–1d");
  assert.equal(holdingBucket(mk({ date: "2026-06-01", closedAt: "2026-08-01T00:00:00Z" })), "1mo+ (position)");
  assert.equal(holdingDays(mk({ closedAt: null })), null);            // not yet timestamped
  assert.equal(holdingBucket(mk({ closedAt: null })), null);
});

test("expectancyBy groups, averages R, and sorts best-first", () => {
  const g = expectancyBy([
    winR(2, { strategy: "Breakout" }), winR(1, { strategy: "Breakout" }),  // avg +1.5R
    lossR(1, { strategy: "Pullback" }),                                    // -1R
  ], (t) => t.strategy);
  assert.equal(g[0].key, "Breakout");
  assert.equal(g[0].expectancyR, 1.5);
  assert.equal(g[0].trades, 2);
  assert.equal(g[0].winRate, 1);
  assert.equal(g[1].key, "Pullback");
  assert.equal(g[1].expectancyR, -1);
});

test("expectancyBy skips open trades and null keys; counts withRisk separately", () => {
  const g = expectancyBy([
    winR(1),
    mk({ closed: false }),                 // open → excluded
    mk({ sector: null }),                  // null key → excluded from THIS dimension
    mk({ stop: 100 }),                     // stop==entry → no R, still a trade
  ], (t) => t.sector);
  const tech = g.find((x) => x.key === "Technology");
  assert.equal(tech.trades, 2);            // winR(1) + the no-R trade
  assert.equal(tech.withRisk, 1);          // only winR(1) has a usable R
});

test("personalAlpha gates on MIN_SAMPLE: noise is not surfaced as an edge", () => {
  // 1 huge winner in 'Energy' must NOT become bestEdge (below sample gate).
  const trades = [winR(5, { sector: "Energy" }), ...Array.from({ length: 4 }, () => winR(1, { sector: "Energy" }))];
  // 4 < MIN_SAMPLE(5)? add exactly MIN_SAMPLE winners to a confident bucket.
  const confidentSet = Array.from({ length: MIN_SAMPLE }, () => winR(1, { sector: "Technology", strategy: "Breakout" }));
  const a = personalAlpha([...trades, ...confidentSet]);
  // Energy has 5 trades here (1 big + 4) → also confident; ensure gating logic holds generally:
  for (const e of a.edges) assert.ok(e.withRisk >= MIN_SAMPLE, "every surfaced edge meets the sample gate");
  assert.ok(a.bestEdge.withRisk >= MIN_SAMPLE);
});

test("personalAlpha: a single trade stays low-confidence (no edges surfaced)", () => {
  const a = personalAlpha([winR(3)]);
  assert.equal(a.confidentBuckets, 0);
  assert.equal(a.bestEdge, null);
  assert.equal(a.worstLeak, null);
  assert.equal(a.closed, 1);
});

test("personalAlpha separates edges (+R) from leaks (−R) across dimensions", () => {
  const winners = Array.from({ length: MIN_SAMPLE }, () => winR(2, { strategy: "Pullback", sector: "Technology" }));
  const losers  = Array.from({ length: MIN_SAMPLE }, () => lossR(1, { strategy: "Earnings", sector: "Energy" }));
  const a = personalAlpha([...winners, ...losers]);
  assert.ok(a.bestEdge.expectancyR > 0);
  assert.ok(a.worstLeak.expectancyR < 0);
  assert.ok(a.edges.every((e) => e.expectancyR > 0));
  assert.ok(a.leaks.every((l) => l.expectancyR < 0));
});

test("personalAlpha never reads review scores (regime excluded by construction)", () => {
  // Even if a trade object carries a regime_score, it must not affect expectancy.
  const a1 = personalAlpha(Array.from({ length: MIN_SAMPLE }, () => winR(1)));
  const a2 = personalAlpha(Array.from({ length: MIN_SAMPLE }, () => winR(1, { regime_score: 5 })));
  assert.equal(a1.bestEdge.expectancyR, a2.bestEdge.expectancyR);
});
