import { test } from "node:test";
import assert from "node:assert/strict";
import { opportunityQueue, gatedInsights, worldCandidates } from "../src/opportunityQueue.js";

const NOW = new Date("2026-06-16").getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);

test("conviction–exposure gap: council Buy at high confidence, no position", () => {
  const q = opportunityQueue({ opportunities: [{ id: 1, ticker: "TCS.NS", council_verdict: "Buy", council_confidence: 82, thesis_type: "Margin Expansion" }], now: NOW });
  const lead = q.find((l) => l.kind === "conviction_gap");
  assert.ok(lead);
  assert.equal(lead.ticker, "TCS.NS");
  assert.match(lead.reasons.join(" "), /Council Buy @ 82%/);
});

test("conviction gap suppressed when the position is already held", () => {
  const q = opportunityQueue({ opportunities: [{ id: 1, ticker: "TCS.NS", council_verdict: "Buy", council_confidence: 82 }], holdings: [{ ticker: "TCS.NS", shares: 10, price: 100, currency: "INR" }], now: NOW });
  assert.equal(q.find((l) => l.kind === "conviction_gap"), undefined);
});

test("unreviewed large holding fires on weight + staleness", () => {
  const holdings = [
    { ticker: "RELIANCE.NS", shares: 100, price: 1400, currency: "INR" }, // dominant weight
    { ticker: "TCS.NS", shares: 1, price: 100, currency: "INR" },
  ];
  const journal = [{ ticker: "RELIANCE.NS", date: daysAgo(90), closed: true, entry: "1", stop: "0.9", exit: "1.1", shares: "1" }];
  const q = opportunityQueue({ holdings, journal, now: NOW });
  const lead = q.find((l) => l.kind === "stale_thesis" && l.ticker === "RELIANCE.NS");
  assert.ok(lead);
  assert.match(lead.reasons.join(" "), /portfolio weight/);
  assert.match(lead.reasons.join(" "), /90 days/);
});

test("undecided research: brief exists, no decision, old enough", () => {
  const opps = [{ id: 7, ticker: "INFY.NS", research_brief: { x: 1 }, researched_at: daysAgo(120), status: "council_review" }];
  const q = opportunityQueue({ opportunities: opps, now: NOW });
  const lead = q.find((l) => l.kind === "undecided_research");
  assert.ok(lead);
  assert.match(lead.title, /120d ago/);
  // a decided opp does NOT fire
  const q2 = opportunityQueue({ opportunities: [{ ...opps[0], status: "logged" }], now: NOW });
  assert.equal(q2.find((l) => l.kind === "undecided_research"), undefined);
});

test("rule violation: holding something an active avoid-decision forbids", () => {
  const decisions = [{ id: 1, active: true, kind: "avoid", statement: "Avoid Adani names", tags: ["ADANIENT.NS"] }];
  const holdings = [{ ticker: "ADANIENT.NS", shares: 5, price: 2000, currency: "INR" }];
  const q = opportunityQueue({ holdings, decisions, now: NOW });
  const lead = q.find((l) => l.kind === "rule_violation");
  assert.ok(lead);
  assert.equal(lead.priority, 85);
  assert.match(lead.reasons.join(" "), /Avoid Adani names/);
});

test("open position with no stop is flagged", () => {
  const q = opportunityQueue({ journal: [{ ticker: "TCS.NS", closed: false, stop: "" }], now: NOW });
  assert.ok(q.find((l) => l.kind === "no_stop"));
  // with a stop, no flag
  assert.equal(opportunityQueue({ journal: [{ ticker: "TCS.NS", closed: false, stop: "95" }], now: NOW }).find((l) => l.kind === "no_stop"), undefined);
});

test("over-overridden rule surfaces as a fact, no performance claim", () => {
  const q = opportunityQueue({ decisions: [{ id: 3, active: true, kind: "avoid", statement: "Never average down", challenged_count: 6 }], now: NOW });
  const lead = q.find((l) => l.kind === "rule_review");
  assert.ok(lead);
  assert.match(lead.reasons.join(" "), /Overridden 6 times/);
  assert.ok(!/outperform/i.test(lead.reasons.join(" ")));  // never claims outperformance
});

test("queue is sorted by priority desc and every lead is explainable", () => {
  const q = opportunityQueue({
    holdings: [{ ticker: "ADANIENT.NS", shares: 5, price: 2000, currency: "INR" }],
    decisions: [{ id: 1, active: true, kind: "avoid", statement: "Avoid Adani", tags: ["ADANIENT.NS"] }],
    opportunities: [{ id: 1, ticker: "TCS.NS", council_verdict: "Buy", council_confidence: 72 }],
    now: NOW,
  });
  for (let i = 1; i < q.length; i++) assert.ok(q[i - 1].priority >= q[i].priority);
  assert.ok(q.every((l) => Array.isArray(l.reasons) && l.reasons.length > 0));
  assert.ok(q.every((l) => !JSON.stringify(l).includes("$")));  // no fabricated dollar figures
});

test("worldCandidates: AI-surfaced un-acted idea becomes a research candidate", () => {
  const w = worldCandidates({ opportunities: [{ id: 5, ticker: "INFY.NS", thesis_type: "Margin Expansion", reality_hypothesis: "margins may inflect", confidence: 70, status: "new" }] });
  const lead = w.find((l) => l.kind === "discovered_idea");
  assert.ok(lead);
  assert.equal(lead.status, "research_candidate");
  assert.equal(lead.source, "world");
  assert.match(lead.action, /Investigate/);
  assert.ok(!/will outperform/i.test(JSON.stringify(lead)));  // never a buy/alpha call
});

test("worldCandidates: RS leader from prices; excludes held + already-on-board", () => {
  const watchlist = [
    { ticker: "TCS.NS", price: 100, ema20: 95, ema200: 90, rsi: 60, chg: 1.2 },   // uptrend + room → candidate
    { ticker: "WIPRO.NS", price: 100, ema20: 95, ema200: 90, rsi: 80, chg: 0 },    // overbought → excluded
    { ticker: "SBIN.NS", price: 100, ema20: 95, ema200: 90, rsi: 60 },             // held → excluded
    { ticker: "AXISBANK.NS", price: 100, ema20: 95, ema200: 90, rsi: 60 },         // already an opp → excluded
  ];
  const w = worldCandidates({ watchlist, holdings: [{ ticker: "SBIN.NS" }], opportunities: [{ ticker: "AXISBANK.NS", status: "new" }] });
  const rs = w.filter((l) => l.kind === "rs_leader").map((l) => l.ticker);
  assert.deepEqual(rs, ["TCS.NS"]);
});

test("worldCandidates respects the limit and sorts by priority", () => {
  const watchlist = Array.from({ length: 10 }, (_, i) => ({ ticker: `T${i}`, price: 100, ema20: 95, ema200: 90, rsi: 60 }));
  const w = worldCandidates({ watchlist, limit: 4 });
  assert.equal(w.length, 4);
  for (let i = 1; i < w.length; i++) assert.ok(w[i - 1].priority >= w[i].priority);
});

test("gatedInsights locks pattern claims until enough closed trades", () => {
  assert.equal(gatedInsights({ journal: [] }).length, 1);
  assert.equal(gatedInsights({ journal: [] })[0].locked, true);
  const many = Array.from({ length: 30 }, () => ({ closed: true }));
  assert.equal(gatedInsights({ journal: many }).length, 0);
});
