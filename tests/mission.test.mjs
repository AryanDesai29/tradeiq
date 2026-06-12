// Mission Control engine — pure-function tests (mirrors the style of the
// other engine suites: real shapes, no mocks of our own modules).
import test from "node:test";
import assert from "node:assert/strict";
import {
  thesisHealth, actionQueue, featuredOpportunity, biggestRisk,
  missionBriefing, iqSnapshot, alphaSnapshot, learningLoop,
  lastCouncil, commandStats, openPositions,
} from "../src/mission.js";

// ── fixtures ─────────────────────────────────────────────────────
let nextId = 1;
const trade = (over = {}) => ({
  id: nextId++, ticker: "NVDA", name: "NVIDIA", currency: "USD", sector: "Tech",
  side: "BUY", entry: "100", stop: "90", target: "120", shares: "10",
  strategy: "EMA Pullback", thesisType: "Demand Acceleration", thesisConfidence: 70,
  date: "2026-06-01", closed: false, closedAt: null, exit: null, ...over,
});
const closedWin = (over = {}) => trade({ closed: true, exit: "120", closedAt: "2026-06-05T00:00:00Z", ...over });
const closedLoss = (over = {}) => trade({ closed: true, exit: "90", closedAt: "2026-06-05T00:00:00Z", ...over });
const review = (tradeId, over = {}) => ({
  trade_id: tradeId, verdict: "good_process_good_outcome",
  thesis_score: 80, execution_score: 75, risk_score: 70, regime_score: 65, outcome_score: 90,
  ai_thesis_verdict: "correct", user_thesis_verdict: null, tags: [],
  lessons: { continue: ["kept the stop"], improve: ["size up on A setups"], avoid: [] }, ...over,
});

// ── thesisHealth ─────────────────────────────────────────────────
test("thesisHealth: BUY intact / weakening / broken by stop progress", () => {
  const t = trade({ entry: "100", stop: "90" });
  assert.equal(thesisHealth(t, 99).status, "intact");     // 10% toward stop
  assert.equal(thesisHealth(t, 94).status, "weakening");  // 60%
  assert.equal(thesisHealth(t, 89).status, "broken");     // breached
});
test("thesisHealth: SELL direction inverts", () => {
  const t = trade({ side: "SELL", entry: "100", stop: "110" });
  assert.equal(thesisHealth(t, 101).status, "intact");
  assert.equal(thesisHealth(t, 106).status, "weakening");
  assert.equal(thesisHealth(t, 111).status, "broken");
});
test("thesisHealth: missing stop or price → unknown", () => {
  assert.equal(thesisHealth(trade({ stop: "" }), 99).status, "unknown");
  assert.equal(thesisHealth(trade(), null).status, "unknown");
});

// ── actionQueue ──────────────────────────────────────────────────
test("actionQueue: surfaces unreviewed closed trades, new opps, thin research, thesis-less opens — severity-sorted", () => {
  const closed = closedWin();
  const open = trade({ thesisType: "" });
  const q = actionQueue({
    journal: [closed, open],
    reviews: [],
    opportunities: [
      { id: 1, ticker: "AAPL", status: "new" },
      { id: 2, ticker: "TSLA", status: "researching", evidence_log: [], evidence: "" },
      { id: 3, ticker: "MSFT", status: "logged" },
    ],
  });
  const ids = q.map((i) => i.id);
  assert.ok(ids.includes("review") && ids.includes("opps") && ids.includes("evidence") && ids.includes("thesis"));
  assert.equal(q[0].id, "review"); // severity 3 first
  for (let i = 1; i < q.length; i++) assert.ok(q[i - 1].severity >= q[i].severity);
});
test("actionQueue: breached stop is top severity; reviewed trades drop out; council action appears", () => {
  const closed = closedWin();
  const open = trade({ ticker: "PLTR", entry: "100", stop: "90" });
  const council = { at: Date.now(), session: { verdict: { next_action: "Check Q2 guidance" } } };
  const q = actionQueue({ journal: [closed, open], reviews: [review(closed.id)], opportunities: [], liveOf: () => 88, council });
  assert.equal(q[0].id, "breached");
  assert.ok(!q.find((i) => i.id === "review"));
  assert.equal(q.find((i) => i.id === "council").detail, "Check Q2 guidance");
});

// ── featuredOpportunity ──────────────────────────────────────────
test("featuredOpportunity: highest-confidence live idea; logged/dismissed excluded", () => {
  const opp = featuredOpportunity([
    { ticker: "A", status: "logged", confidence: 95 },
    { ticker: "B", status: "new", confidence: 60 },
    { ticker: "C", status: "watching", confidence: 80 },
    { ticker: "D", status: "dismissed", confidence: 99 },
  ]);
  assert.equal(opp.ticker, "C");
  assert.equal(featuredOpportunity([]), null);
});

// ── biggestRisk ──────────────────────────────────────────────────
test("biggestRisk: theme concentration >40% with high flag wins", () => {
  const pf = [
    { ticker: "NVDA", sector: "Tech", value: 50 },
    { ticker: "AMD", sector: "Tech", value: 30 },
    { ticker: "KO", sector: "Consumer", value: 20 },
  ];
  const r = biggestRisk({ pfItems: pf, journal: [], reviews: [] });
  assert.equal(r.kind, "concentration");
  assert.equal(r.severity, 3);
  assert.match(r.headline, /%/);
});
test("biggestRisk: overconfidence beats minor flags; empty data → null", () => {
  const trades = [], reviews = [];
  for (let i = 0; i < 6; i++) {
    const t = closedLoss({ thesisConfidence: 90 });
    trades.push(t);
    reviews.push(review(t.id, { ai_thesis_verdict: "incorrect" }));
  }
  const r = biggestRisk({ pfItems: [], journal: trades, reviews });
  assert.equal(r.kind, "calibration");
  assert.equal(biggestRisk({}), null);
});

// ── missionBriefing ──────────────────────────────────────────────
test("missionBriefing: empty desk gets onboarding line; busy desk gets ≤4 actionable lines", () => {
  const empty = missionBriefing({});
  assert.equal(empty.length, 1);
  assert.match(empty[0], /Empty desk/);

  const closed = closedWin();
  const lines = missionBriefing({
    pfItems: [{ ticker: "NVDA", sector: "Tech", value: 80 }, { ticker: "KO", sector: "Consumer", value: 20 }],
    journal: [closed], reviews: [], opportunities: [{ id: 1, ticker: "AAPL", status: "new" }],
  });
  assert.ok(lines.length >= 2 && lines.length <= 4);
  assert.ok(lines.some((l) => /concentrated/i.test(l)));
  assert.ok(lines.some((l) => /Review 1 closed trade/.test(l)));
});

// ── iqSnapshot ───────────────────────────────────────────────────
test("iqSnapshot: accuracy, process average, good-process rate", () => {
  const t1 = closedWin(), t2 = closedLoss();
  const iq = iqSnapshot([t1, t2], [
    review(t1.id),
    review(t2.id, { verdict: "bad_process_bad_outcome", ai_thesis_verdict: "incorrect", thesis_score: 30, execution_score: 30, risk_score: 30, regime_score: 30 }),
  ]);
  assert.equal(iq.n, 2);
  assert.ok(iq.thesisAccuracy > 0.4 && iq.thesisAccuracy < 0.6); // 1 correct + 1 incorrect
  assert.equal(iq.goodProcessRate, 0.5);
  assert.ok(Number.isFinite(iq.processAvg));
});

// ── alphaSnapshot ────────────────────────────────────────────────
test("alphaSnapshot: surfaces best edge once a bucket clears the sample gate", () => {
  const trades = [];
  for (let i = 0; i < 6; i++) trades.push(closedWin());     // +2R EMA Pullback wins
  const a = alphaSnapshot(trades);
  assert.ok(a.bestEdge);
  assert.ok(a.bestEdge.expectancyR > 0);
  assert.equal(alphaSnapshot([]).bestEdge, null);
});

// ── learningLoop ─────────────────────────────────────────────────
test("learningLoop: latest lesson + common mistake + verdict; trend needs 4+ reviews", () => {
  const t1 = closedWin({ closedAt: "2026-06-01T00:00:00Z" });
  const t2 = closedLoss({ ticker: "TSLA", closedAt: "2026-06-10T00:00:00Z" });
  const loop = learningLoop([t1, t2], [
    review(t1.id, { tags: ["moved_stop"] }),
    review(t2.id, { verdict: "bad_process_bad_outcome", tags: ["moved_stop"], lessons: { continue: [], improve: ["respect the stop"], avoid: [] } }),
  ]);
  assert.equal(loop.recentLesson, "respect the stop"); // from the LATEST (t2) review
  assert.equal(loop.commonMistake.count, 2);
  assert.equal(loop.lastVerdict.ticker, "TSLA");
  assert.equal(loop.processTrend, null);
});

// ── lastCouncil + commandStats ───────────────────────────────────
test("lastCouncil: reads the council's saved record from an injectable store", () => {
  const rec = { topic: { ticker: "NVDA" }, mode: "quick", at: 123, session: { votes: [], verdict: { recommendation: "Buy", confidence: 70 } } };
  const store = { getItem: (k) => (k === "tradeiq_council_last_u1" ? JSON.stringify(rec) : null) };
  assert.equal(lastCouncil(store, "u1").session.verdict.recommendation, "Buy");
  assert.equal(lastCouncil(store, "u2"), null);
  assert.equal(lastCouncil({ getItem: () => "{broken" }, "u1"), null);
});
test("commandStats: positions, open trades, largest, theme, effective bets", () => {
  const pf = [{ ticker: "NVDA", sector: "Tech", value: 60 }, { ticker: "KO", sector: "Consumer", value: 40 }];
  const s = commandStats(pf, [{ id: 1 }, { id: 2 }], [trade(), closedWin()]);
  assert.equal(s.positions, 2);
  assert.equal(s.openTrades, 1);
  assert.equal(s.largest.ticker, "NVDA");
  assert.ok(s.effectiveN > 1 && s.effectiveN < 2.1);
  assert.equal(openPositions([trade({ closed: true })]).length, 0);
});
