import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_STATES, pipelineState, canMove, boardColumn, stateCounts,
  personalLens, lensBlock, edgeScore, researchConfidenceScore,
  councilConfidenceScore, riskScore, scoreOpportunity, rankOpportunities,
} from "../src/pipeline.js";

// A closed trade with a usable R: entry 100, stop 90 (risk 10/sh) → exit sets R.
const closed = (r, thesisType = "Demand Acceleration") => ({
  closed: true, side: "BUY", entry: "100", stop: "90", exit: String(100 + r * 10),
  shares: "1", date: "2026-01-01", closedAt: "2026-01-05", thesisType, strategy: "EMA Pullback",
});

test("pipelineState maps legacy statuses and defaults unknowns to discovered", () => {
  assert.equal(pipelineState({ status: "new" }), "discovered");
  assert.equal(pipelineState({ status: "watching" }), "discovered");
  assert.equal(pipelineState({ status: "dismissed" }), "archived");
  assert.equal(pipelineState({ status: "council_review" }), "council_review");
  assert.equal(pipelineState({ status: "garbage" }), "discovered");
  assert.equal(pipelineState(null), "discovered");
});

test("transitions: the council loop can reopen research; logged only archives", () => {
  assert.ok(canMove("discovered", "researching"));
  assert.ok(canMove("council_review", "researching")); // evidence missing → back to research
  assert.ok(canMove("council_review", "ready"));
  assert.ok(canMove("ready", "logged"));
  assert.ok(!canMove("logged", "ready"));
  assert.ok(!canMove("researching", "ready")); // must pass through the council
  assert.ok(canMove("archived", "discovered")); // un-archive
});

test("boardColumn buckets logged under ready; stateCounts tallies all states", () => {
  assert.equal(boardColumn({ status: "logged" }), "ready");
  const counts = stateCounts([{ status: "new" }, { status: "researching" }, { status: "logged" }, { status: "dismissed" }]);
  assert.equal(counts.discovered, 1);
  assert.equal(counts.researching, 1);
  assert.equal(counts.logged, 1);
  assert.equal(counts.archived, 1);
  assert.equal(PIPELINE_STATES.length, 6);
});

test("personalLens surfaces only statistically confident thesis types", () => {
  const journal = [
    ...Array.from({ length: 6 }, () => closed(1.5, "Demand Acceleration")), // proven edge
    ...Array.from({ length: 2 }, () => closed(-1, "Turnaround")),           // too thin
  ];
  const lens = personalLens(journal);
  assert.ok(lens.byThesisType["Demand Acceleration"].confident);
  assert.ok(lens.byThesisType["Demand Acceleration"].expectancyR > 0);
  assert.ok(!lens.byThesisType["Turnaround"].confident);
  const block = lensBlock(lens);
  assert.match(block, /PROVEN EDGE/);
  assert.match(block, /Demand Acceleration/);
  assert.ok(!/Turnaround/.test(block)); // thin samples never reach the prompt
  assert.equal(lensBlock(null), "");
});

test("edgeScore shifts by confident personal record only, clamped to ±15", () => {
  const lens = { byThesisType: {
    "Demand Acceleration": { expectancyR: 3, n: 8, confident: true },   // +15 cap
    "Turnaround": { expectancyR: -2, n: 9, confident: true },           // −15 cap
    "Mean Reversion": { expectancyR: 5, n: 2, confident: false },       // ignored
  } };
  assert.equal(edgeScore({ confidence: 60, thesis_type: "Demand Acceleration" }, lens), 75);
  assert.equal(edgeScore({ confidence: 60, thesis_type: "Turnaround" }, lens), 45);
  assert.equal(edgeScore({ confidence: 60, thesis_type: "Mean Reversion" }, lens), 60);
  assert.equal(edgeScore({ confidence: 60, thesis_type: "Earnings Beat" }, lens), 60);
  assert.equal(edgeScore({ confidence: 95, thesis_type: "Demand Acceleration" }, lens), 100); // clamped
});

test("researchConfidenceScore: brief wins; bare completeness caps at 60", () => {
  assert.equal(researchConfidenceScore({ research_brief: { research_confidence: 45 } }), 45);
  const complete = { market_expectations: "x", reality_hypothesis: "y", bear_case: "z", invalidation: "w", evidence: "e", notes: "n", confidence: 70 };
  assert.equal(researchConfidenceScore(complete), 60); // 100% complete but unverified → capped
  assert.equal(researchConfidenceScore({}), 0);
});

test("councilConfidenceScore maps verdict direction × confidence around 50", () => {
  assert.equal(councilConfidenceScore({ council_verdict: "Strong Buy", council_confidence: 100 }), 100);
  assert.equal(councilConfidenceScore({ council_verdict: "Strong Avoid", council_confidence: 100 }), 0);
  assert.equal(councilConfidenceScore({ council_verdict: "Buy", council_confidence: 80 }), 70);
  assert.equal(councilConfidenceScore({ council_verdict: "Neutral", council_confidence: 90 }), 50);
  assert.equal(councilConfidenceScore({}), null);
  assert.equal(councilConfidenceScore({ council_verdict: "Maybe" }), null);
});

test("riskScore: unresearched premium vs the brief's own admitted unknowns", () => {
  assert.equal(riskScore({ risk_level: "low" }), 40);    // 25 + 15 unresearched
  assert.equal(riskScore({ risk_level: "high" }), 90);
  // Researched with everything resolved → premium gone.
  assert.equal(riskScore({ risk_level: "medium", research_brief: { unknowns: [], missing_evidence: [] } }), 50);
  // Research that admits many unknowns keeps (capped) epistemic risk.
  assert.equal(riskScore({ risk_level: "medium", research_brief: { unknowns: ["a", "b", "c", "d"], missing_evidence: ["e", "f", "g"] } }), 70);
});

test("composite redistributes the council weight when no verdict exists", () => {
  const o = { confidence: 80, risk_level: "low", research_brief: { research_confidence: 60, unknowns: [], missing_evidence: [] } };
  const without = scoreOpportunity(o, null);
  assert.equal(without.council, null);
  assert.equal(without.composite, Math.round(0.45 * 80 + 0.35 * 60 + 0.20 * 75));
  const withC = scoreOpportunity({ ...o, council_verdict: "Strong Buy", council_confidence: 90 }, null);
  assert.ok(withC.council > 90);
  assert.equal(withC.composite, Math.round(0.35 * 80 + 0.25 * 60 + 0.25 * withC.council + 0.15 * 75));
});

test("rankOpportunities excludes archived and sorts by composite", () => {
  const ranked = rankOpportunities([
    { id: 1, status: "new", confidence: 40, risk_level: "high" },
    { id: 2, status: "ready", confidence: 85, risk_level: "low", council_verdict: "Strong Buy", council_confidence: 90 },
    { id: 3, status: "dismissed", confidence: 99, risk_level: "low" },
  ], null);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].opp.id, 2);
});
