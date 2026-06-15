import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictsWith, findConflicts, subjectTokens, decisionLabel, DECISION_KINDS } from "../src/decisions.js";

const avoidTurnaround = { id: 1, active: true, kind: "avoid", statement: "Avoid Turnaround theses above 75% confidence", tags: ["Turnaround"] };

test("conflictsWith: active avoid decision matches a subject by tag", () => {
  assert.equal(conflictsWith(avoidTurnaround, { thesis_type: "Turnaround", ticker: "RELIANCE.NS" }), true);
  assert.equal(conflictsWith(avoidTurnaround, { thesis_type: "Margin Expansion" }), false);
});

test("conflictsWith: matches a subject attribute appearing in the statement (plain English)", () => {
  const d = { active: true, kind: "avoid", statement: "We don't trade ADANIENT — governance risk", tags: [] };
  assert.equal(conflictsWith(d, { ticker: "ADANIENT.NS" }), true);   // ticker (suffix-stripped) appears in statement
  assert.equal(conflictsWith(d, { ticker: "TCS.NS" }), false);
});

test("conflictsWith: avoid a whole market via currency", () => {
  const d = { active: true, kind: "avoid", statement: "Stay out of US names for now", tags: ["us"] };
  assert.equal(conflictsWith(d, { ticker: "AAPL", currency: "USD" }), true);
  assert.equal(conflictsWith(d, { ticker: "TCS.NS", currency: "INR" }), false);
});

test("conflictsWith: inactive or non-avoid decisions never conflict", () => {
  assert.equal(conflictsWith({ ...avoidTurnaround, active: false }, { thesis_type: "Turnaround" }), false);
  assert.equal(conflictsWith({ ...avoidTurnaround, kind: "rule" }, { thesis_type: "Turnaround" }), false);
});

test("conflictsWith: short/empty tokens don't cause false statement matches", () => {
  const d = { active: true, kind: "avoid", statement: "no leverage, ever", tags: [] };
  assert.equal(conflictsWith(d, {}), false);                       // empty subject
  assert.equal(conflictsWith(d, { market: "us" }), false);         // "us" not present as a word in statement
});

test("findConflicts returns every matching active avoid decision", () => {
  const decisions = [
    avoidTurnaround,
    { id: 2, active: true, kind: "avoid", statement: "Avoid high-risk small caps", tags: ["small-cap"] },
    { id: 3, active: false, kind: "avoid", statement: "Avoid Turnaround", tags: ["Turnaround"] }, // inactive
  ];
  const hits = findConflicts(decisions, { thesis_type: "Turnaround" });
  assert.deepEqual(hits.map((d) => d.id), [1]);
});

test("decisionLabel truncates long statements", () => {
  assert.equal(decisionLabel({ statement: "short rule" }), "short rule");
  assert.ok(decisionLabel({ statement: "x".repeat(120) }).endsWith("…"));
});

test("subjectTokens + DECISION_KINDS sanity", () => {
  const toks = subjectTokens({ ticker: "TCS.NS", thesis_type: "Margin Expansion", currency: "INR" });
  assert.ok(toks.has("tcs"));            // suffix-stripped
  assert.ok(toks.has("margin expansion"));
  assert.ok(toks.has("india"));          // INR → india
  assert.deepEqual(DECISION_KINDS, ["avoid", "rule", "bet"]);
});
