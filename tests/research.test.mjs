import { test } from "node:test";
import assert from "node:assert/strict";
import { addEvidence, removeEvidence, researchScore, researchReady } from "../src/research.js";

test("addEvidence appends a timestamped entry immutably, ignores blanks", () => {
  const a = addEvidence([], "TSMC capex guide raised", "2026-06-10T00:00:00Z");
  assert.equal(a.length, 1);
  assert.deepEqual(a[0], { text: "TSMC capex guide raised", at: "2026-06-10T00:00:00Z" });
  const b = addEvidence(a, "   ", "2026-06-11");        // blank → unchanged
  assert.equal(b.length, 1);
  assert.notEqual(a, addEvidence(a, "second", "x"));    // immutable (new array)
  assert.equal(addEvidence(null, "x", "t").length, 1);  // null-safe
});

test("removeEvidence drops by index, null-safe", () => {
  const log = [{ text: "a", at: "1" }, { text: "b", at: "2" }];
  assert.deepEqual(removeEvidence(log, 0), [{ text: "b", at: "2" }]);
  assert.deepEqual(removeEvidence(null, 0), []);
});

test("researchScore reflects how much of the workspace is filled", () => {
  assert.equal(researchScore(null), 0);
  assert.equal(researchScore({}), 0);
  // 4 thesis fields + evidence + notes all present → 1.0
  const full = { market_expectations: "x", reality_hypothesis: "x", bear_case: "x", invalidation: "x", evidence: "e", notes: "n" };
  assert.equal(researchScore(full), 1);
  // evidence via the log counts too
  assert.equal(researchScore({ market_expectations: "x", evidence_log: [{ text: "e" }] }), Math.round((2 / 6) * 100) / 100);
});

test("researchReady requires the 4 core fields + valid confidence", () => {
  const ok = { market_expectations: "x", reality_hypothesis: "x", bear_case: "x", invalidation: "x", confidence: 60 };
  assert.equal(researchReady(ok), true);
  assert.equal(researchReady({ ...ok, invalidation: "" }), false);
  assert.equal(researchReady({ ...ok, confidence: 150 }), false);
  assert.equal(researchReady(null), false);
});
