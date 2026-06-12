import { test } from "node:test";
import assert from "node:assert/strict";
import {
  opportunityFunnel, researchFunnel, councilQuality, filingValue, decisionQualitySummary,
} from "../src/decisionQuality.js";

// Opportunities at every pipeline stage; D is fully converted (logged) and wins.
const OPPS = [
  { id: 1, ticker: "A", status: "discovered" },
  { id: 2, ticker: "B", status: "researching", research_brief: { executive_summary: "x" } },
  { id: 3, ticker: "C", status: "council_review", research_brief: { executive_summary: "x" }, council_verdict: "Buy" },
  { id: 4, ticker: "D", status: "logged", research_brief: { executive_summary: "x" }, council_verdict: "Strong Buy" },
  { id: 5, ticker: "E", status: "dismissed" }, // legacy → archived
];
const JOURNAL = [
  { ticker: "D", closed: true, entry: 100, exit: 110, stop: 90, shares: 10, side: "BUY" }, // +1R winner
  { ticker: "Z", closed: true, entry: 50, exit: 40, stop: 45, shares: 10, side: "BUY" },   // loser, unrelated
];

test("opportunityFunnel: monotonic stages, conversions, ticker-matched success", () => {
  const f = opportunityFunnel(OPPS, JOURNAL);
  assert.equal(f.generated, 5);
  assert.equal(f.researched, 3);       // B, C, D
  assert.equal(f.councilReviewed, 2);  // C, D
  assert.equal(f.traded, 1);           // D (logged)
  assert.equal(f.archived, 1);         // E
  assert.equal(f.successful, 1);       // D ticker has a closed winner
  assert.deepEqual(f.stages.map((s) => s.n), [5, 3, 2, 1, 1]);
  assert.ok(Math.abs(f.stages[1].convFromPrev - 3 / 5) < 1e-9); // researched/generated
  assert.ok(Math.abs(f.stages[1].convFromTop - 3 / 5) < 1e-9);
});

test("opportunityFunnel: no winner match → successful 0, empty-safe", () => {
  assert.equal(opportunityFunnel(OPPS, []).successful, 0);
  const empty = opportunityFunnel([], []);
  assert.equal(empty.generated, 0);
  assert.equal(empty.stages[0].convFromPrev, 1);
});

test("researchFunnel: brief generation, council use, trade conversion + usage clicks", () => {
  const usage = { clicked: [{ key: "opp.openResearch", count: 7 }] };
  const r = researchFunnel(OPPS, usage);
  assert.equal(r.generated, 3);     // B, C, D have briefs
  assert.equal(r.usedInCouncil, 2); // C, D
  assert.equal(r.ledToTrade, 1);    // D
  assert.equal(r.opened, 7);
  assert.ok(Math.abs(r.usedRate - 2 / 3) < 1e-9);
  assert.equal(researchFunnel([], null).opened, 0); // usage-safe
});

test("councilQuality: verdict count, distribution, conversion, override from reviews", () => {
  const reviews = [
    { ai_thesis_verdict: "correct", user_thesis_verdict: "correct", expectations_changed: true },
    { ai_thesis_verdict: "correct", user_thesis_verdict: "incorrect", expectations_changed: false },
  ];
  const c = councilQuality(OPPS, reviews);
  assert.equal(c.verdicts, 2);          // C, D have council_verdict
  assert.equal(c.ledToTrade, 1);        // D logged
  assert.equal(c.distribution[0].count, 1);
  assert.equal(c.judged, 2);
  assert.ok(c.overrideRate >= 0 && c.overrideRate <= 1);
});

test("filingValue passes the tiqFilings report through the value lens, empty-safe", () => {
  const report = { totalReads: 4, manualReads: 3, councilReads: 1, verdictChanges: [{ ticker: "D" }], tradesAfterFiling: ["D"], researchUsedDigest: 2, sectionsRead: [{ key: "MD&A", count: 4 }], sectionsSkipped: [] };
  const v = filingValue(report);
  assert.equal(v.totalReads, 4);
  assert.equal(v.verdictChanges, 1);
  assert.equal(v.tradesAfterFiling, 1);
  assert.equal(filingValue(null).totalReads, 0);
});

test("decisionQualitySummary: sample gates hide misleading reads until enough data", () => {
  const thin = decisionQualitySummary({ opportunities: OPPS, journal: JOURNAL, reviews: [] });
  const oppSig = thin.signals.find((s) => s.layer === "Opportunity Discovery");
  assert.equal(oppSig.enough, false);          // 5 generated < 10 need
  assert.match(oppSig.read, /need 10\+/);
  assert.equal(oppSig.sample, 5);

  // Enough opportunities → the gate opens and the real read shows.
  const many = Array.from({ length: 12 }, (_, i) => ({ id: i, ticker: `T${i}`, status: "researching", research_brief: { executive_summary: "x" } }));
  const fat = decisionQualitySummary({ opportunities: many, journal: [] });
  const oppSig2 = fat.signals.find((s) => s.layer === "Opportunity Discovery");
  assert.equal(oppSig2.enough, true);
  assert.match(oppSig2.read, /researched/);
});

test("decisionQualitySummary is fully empty-safe", () => {
  const s = decisionQualitySummary({});
  assert.equal(s.opp.generated, 0);
  assert.equal(s.research.generated, 0);
  assert.equal(s.council.verdicts, 0);
  assert.equal(s.filing.totalReads, 0);
  assert.ok(s.signals.every((x) => x.enough === false)); // nothing claimed on no data
});
