import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSeed, validateSeed } from "../scripts/seed-opportunities.mjs";

// The seed harness must always produce a valid, diverse, loggable dataset — this
// turns requirement #6 (verification) into a CI-enforced guarantee.
test("seed produces exactly 50 opportunities", () => {
  assert.equal(generateSeed().length, 50);
});

test("seed passes every integrity check (#6)", () => {
  const { checks } = validateSeed(generateSeed());
  assert.equal(checks.noHallucinatedTickers, true, "no hallucinated tickers");
  assert.equal(checks.noDuplicates, true, "no duplicate opportunities");
  assert.equal(checks.confidenceReasonable, true, "confidence distribution reasonable");
  assert.equal(checks.thesisDiversity, true, "thesis diversity (all 6, none >40%)");
  assert.equal(checks.critiqueAndLogReady, true, "every opp flows into Critique & Log");
});

test("seed is deterministic (reproducible validation)", () => {
  const a = generateSeed(), b = generateSeed();
  assert.deepEqual(a.map(o => `${o.ticker}|${o.thesis_type}|${o.confidence}`), b.map(o => `${o.ticker}|${o.thesis_type}|${o.confidence}`));
});

test("all 6 requested thesis types are represented", () => {
  const { byType } = validateSeed(generateSeed());
  for (const t of ["Demand Acceleration","Product Cycle","Technical Momentum","Mean Reversion","Earnings Beat","Valuation Re-rating"])
    assert.ok(byType[t] > 0, `${t} present`);
});
