import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THESIS_TYPES, thesisComplete, missingThesisFields, finalVerdict,
  thesisStats, thesisCalibration,
} from "../src/thesis.js";

const goodThesis = {
  thesisType: "Demand Acceleration",
  expectations: "Market thinks AI demand is slowing",
  reality: "Cloud capex still accelerating",
  bearCase: "Enterprise AI spend pauses",
  invalidation: "NVDA guides below consensus",
  confidence: 72,
};

test("thesisComplete requires type, the 4 core fields, and valid confidence", () => {
  assert.equal(thesisComplete(goodThesis), true);
  assert.equal(thesisComplete({ ...goodThesis, evidence: "" }), true);   // evidence optional
  assert.equal(thesisComplete({ ...goodThesis, reality: "  " }), false); // blank required field
  assert.equal(thesisComplete({ ...goodThesis, thesisType: "Nonsense" }), false);
  assert.equal(thesisComplete({ ...goodThesis, confidence: 150 }), false);
  assert.equal(thesisComplete({ ...goodThesis, confidence: undefined }), false);
  assert.equal(thesisComplete(null), false);
});

test("missingThesisFields lists exactly what's blocking submit", () => {
  assert.deepEqual(missingThesisFields(goodThesis), []);
  const m = missingThesisFields({ thesisType: "Turnaround", expectations: "x", reality: "", bearCase: "y", invalidation: "", confidence: 50 });
  assert.deepEqual(m.sort(), ["invalidation", "reality"]);
});

test("finalVerdict prefers the user override over the AI verdict", () => {
  assert.equal(finalVerdict({ ai_thesis_verdict: "correct", user_thesis_verdict: "partial" }), "partial");
  assert.equal(finalVerdict({ ai_thesis_verdict: "correct" }), "correct");
  assert.equal(finalVerdict({}), null);
});

test("thesisStats: accuracy weights partial as half; tracks market-wrong + AI/user agreement", () => {
  const reviews = [
    { trade_id: 1, ai_thesis_verdict: "correct",   expectations_changed: true,  bear_case_realized: false },
    { trade_id: 2, ai_thesis_verdict: "incorrect", user_thesis_verdict: "partial", expectations_changed: false, bear_case_realized: true },
    { trade_id: 3, ai_thesis_verdict: "correct",   user_thesis_verdict: "correct", expectations_changed: true,  bear_case_realized: false },
    { error: "skip me" },
    null,
  ];
  const s = thesisStats(reviews);
  assert.equal(s.n, 3);
  // finals: correct, partial(override), correct → (1 + 0.5 + 1)/3 = 0.833…
  assert.ok(Math.abs(s.accuracy - 0.8333) < 0.001);
  assert.equal(s.correct, 2);
  assert.equal(s.partial, 1);
  assert.equal(s.marketWrong, 2);     // trades 1 & 3 had expectations_changed
  assert.equal(s.marketRight, 1);
  assert.ok(Math.abs(s.bearCaseRate - 1 / 3) < 0.001);
  // trade 2 user overrode AI (incorrect→partial); trade 3 agreed → override 1/2.
  assert.equal(s.overrideRate, 0.5);
  assert.equal(s.agreementRate, 0.5);
});

test("thesisStats is empty-safe", () => {
  const s = thesisStats([]);
  assert.equal(s.n, 0);
  assert.equal(s.accuracy, 0);
});

test("thesisCalibration joins stated confidence to actual accuracy", () => {
  const trades = [{ id: 1, thesisConfidence: 90 }, { id: 2, thesisConfidence: 80 }];
  // Both confident (~85%) but both wrong → overconfident, big gap.
  const reviews = [
    { trade_id: 1, ai_thesis_verdict: "incorrect" },
    { trade_id: 2, ai_thesis_verdict: "incorrect" },
  ];
  const c = thesisCalibration(trades, reviews);
  assert.equal(c.n, 2);
  assert.ok(Math.abs(c.avgConfidence - 0.85) < 0.001);
  assert.equal(c.actualAccuracy, 0);
  assert.equal(c.label, "Overconfident");
  assert.equal(thesisCalibration([], []).label, "—");
});
