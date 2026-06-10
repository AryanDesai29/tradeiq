import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOpportunity, normalizeOpportunities, opportunityReturn, RISK_LEVELS } from "../src/opportunities.js";

const known = new Set(["NVDA", "RELIANCE.NS", "HDFCBANK.NS"]);
const raw = (o = {}) => ({
  ticker: "NVDA", thesis_type: "Demand Acceleration", market_expectations: "AI demand slowing",
  reality_hypothesis: "Cloud capex still accelerating", evidence: "hyperscaler guidance",
  bull_case: "re-rate higher", bear_case: "spend pause", invalidation: "guide cut",
  confidence: 72, risk_level: "medium", ...o,
});

test("normalizeOpportunity validates type/risk/confidence and keeps fields", () => {
  const o = normalizeOpportunity(raw(), known);
  assert.equal(o.ticker, "NVDA");
  assert.equal(o.thesis_type, "Demand Acceleration");
  assert.equal(o.confidence, 72);
  assert.equal(o.risk_level, "medium");
  // Bad type → blanked; bad risk → defaults medium; confidence clamps.
  const b = normalizeOpportunity(raw({ thesis_type: "Wizardry", risk_level: "extreme", confidence: 250 }), known);
  assert.equal(b.thesis_type, "");
  assert.equal(b.risk_level, "medium");
  assert.equal(b.confidence, 100);
});

test("normalizeOpportunity rejects hallucinated tickers outside the universe", () => {
  assert.equal(normalizeOpportunity(raw({ ticker: "FAKE" }), known), null);
  assert.equal(normalizeOpportunity(raw({ ticker: "" }), known), null);
  // Without a known set, any ticker is accepted (uppercased).
  assert.equal(normalizeOpportunity(raw({ ticker: "abcd" }), null).ticker, "ABCD");
});

test("normalizeOpportunities dedupes by ticker (highest confidence), sorts, caps", () => {
  const list = normalizeOpportunities([
    raw({ ticker: "NVDA", confidence: 60 }),
    raw({ ticker: "NVDA", confidence: 80 }),       // dup → keep 80
    raw({ ticker: "RELIANCE.NS", confidence: 90 }),
    raw({ ticker: "FAKE", confidence: 99 }),        // rejected
  ], known, 10);
  assert.equal(list.length, 2);
  assert.equal(list[0].ticker, "RELIANCE.NS");      // sorted by confidence desc
  assert.equal(list[1].ticker, "NVDA");
  assert.equal(list[1].confidence, 80);
});

test("normalizeOpportunities respects the limit and is input-safe", () => {
  const many = Array.from({ length: 20 }, (_, i) => raw({ ticker: `T${i}`, confidence: i }));
  assert.equal(normalizeOpportunities(many, null, 10).length, 10);
  assert.deepEqual(normalizeOpportunities(null, known), []);
});

test("opportunityReturn computes % move from snapshot price", () => {
  assert.equal(opportunityReturn({ price_at_gen: 100 }, 110), 10);
  assert.equal(opportunityReturn({ price_at_gen: 200 }, 150), -25);
  assert.equal(opportunityReturn({ price_at_gen: 0 }, 110), null);
  assert.equal(opportunityReturn({ price_at_gen: 100 }, null), null);
});

test("RISK_LEVELS are the three expected buckets", () => {
  assert.deepEqual(RISK_LEVELS, ["low", "medium", "high"]);
});
