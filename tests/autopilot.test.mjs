import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig, positionSize, planEntry, decideEntries, decideExit,
  pnlOf, rMultipleOf, equityOf, accountStats, backtestPosition, BUY_VERDICTS,
} from "../src/autopilot.js";

const cfg = defaultConfig();

test("positionSize: risk-based, capped by cash and concentration, whole shares", () => {
  // equity 100000, risk 2% = 2000; entry 100, stop 95 → per-share risk 5 → 400 shares risk-based
  // but concentration cap 25% of 100000 = 25000 / 100 = 250 shares → wins
  assert.equal(positionSize({ cash: 100000, equity: 100000, entry: 100, stop: 95, cfg }), 250);
  // cash-constrained: only 1000 cash, entry 100 → 10 shares max
  assert.equal(positionSize({ cash: 1000, equity: 100000, entry: 100, stop: 95, cfg }), 10);
  // invalid (stop >= entry) → 0
  assert.equal(positionSize({ cash: 100000, equity: 100000, entry: 100, stop: 100, cfg }), 0);
});

test("planEntry: 5% stop, 10% target (1:2 R:R)", () => {
  assert.deepEqual(planEntry({}, 100, cfg), { stop: 95, target: 110 });
});

test("decideEntries: council-gated only, ranked, dedup, slot- and cash-limited", () => {
  const opportunities = [
    { id: 1, ticker: "A", currency: "INR", council_verdict: "Strong Buy", council_confidence: 80, confidence: 70 },
    { id: 2, ticker: "B", currency: "INR", council_verdict: "Buy", council_confidence: 50, confidence: 90 },     // below conf gate
    { id: 3, ticker: "C", currency: "INR", council_verdict: "Neutral", council_confidence: 99, confidence: 90 }, // not a buy
    { id: 4, ticker: "D", currency: "INR", council_verdict: "Buy", council_confidence: 65, confidence: 60 },
  ];
  const prices = { A: 100, B: 100, C: 100, D: 100 };
  const opens = decideEntries({
    opportunities, held: new Set(), account: { cash: 100000 }, equity: 100000,
    priceOf: (t) => prices[t] ?? null, scoreOf: (o) => o.council_confidence, cfg,
  });
  assert.deepEqual(opens.map((o) => o.ticker), ["A", "D"]);  // B (low conf) + C (not buy) excluded; A ranks above D
  assert.equal(opens[0].opportunity_id, 1);
  assert.ok(opens[0].reason_open.includes("Council Strong Buy"));
  assert.ok(opens[0].reason_open.includes("R:R"));
});

test("decideEntries: never opens a name already held, respects maxPositions", () => {
  const opportunities = [
    { id: 1, ticker: "A", currency: "INR", council_verdict: "Buy", council_confidence: 80 },
    { id: 2, ticker: "B", currency: "INR", council_verdict: "Buy", council_confidence: 80 },
  ];
  const heldOpens = decideEntries({
    opportunities, held: new Set(["A"]), account: { cash: 100000 }, equity: 100000,
    priceOf: () => 100, cfg,
  });
  assert.deepEqual(heldOpens.map((o) => o.ticker), ["B"]);
  const capped = decideEntries({
    opportunities, held: new Set(), account: { cash: 100000 }, equity: 100000,
    priceOf: () => 100, cfg: { ...cfg, maxPositions: 1 },
  });
  assert.equal(capped.length, 1);
});

test("decideExit: stop and target via day high/low; null when neither hit", () => {
  const pos = { stop: 95, target: 110 };
  assert.equal(decideExit(pos, { low: 94, high: 100 }, "d").exit_reason, "stop");
  assert.equal(decideExit(pos, { low: 100, high: 111 }, "d").exit_reason, "target");
  assert.equal(decideExit(pos, { low: 96, high: 109 }, "d"), null);
});

test("pnlOf / rMultipleOf for a closed long", () => {
  const t = { side: "BUY", entry_price: 100, stop: 95, exit_price: 110, qty: 10 };
  assert.equal(pnlOf(t), 100);          // (110-100)*10
  assert.equal(rMultipleOf(t), 2);      // (110-100)/(100-95)
});

test("equityOf + accountStats: mark-to-market and realized stats", () => {
  const account = { cash: 50000, starting_cash: 100000 };
  const trades = [
    { status: "open", ticker: "A", qty: 100, entry_price: 100 },          // mark @ 120 → 12000
    { status: "closed", pnl: 500 }, { status: "closed", pnl: -200 },
  ];
  const eq = equityOf(account, trades.filter((t) => t.status === "open"), (t) => (t === "A" ? 120 : null));
  assert.equal(eq, 62000);
  const s = accountStats(account, trades, (t) => (t === "A" ? 120 : null));
  assert.equal(s.openCount, 1);
  assert.equal(s.closedCount, 2);
  assert.equal(s.realizedPnl, 300);
  assert.equal(s.winRate, 50);
});

test("backtestPosition: closes on the bar that crosses target/stop, real-dated", () => {
  const opp = { id: 7, ticker: "Z", currency: "INR", council_verdict: "Buy", council_confidence: 70 };
  const candles = [
    { date: "2026-06-09", close: 100, high: 101, low: 99 },  // entry @100, stop 95, target 110
    { date: "2026-06-10", close: 104, high: 106, low: 102 },
    { date: "2026-06-11", close: 109, high: 111, low: 108 }, // high 111 ≥ 110 → target hit
    { date: "2026-06-12", close: 120, high: 121, low: 118 },
  ];
  const t = backtestPosition(opp, candles, { ...cfg, startingCash: 100000 });
  assert.equal(t.status, "closed");
  assert.equal(t.exit_reason, "target");
  assert.equal(t.exit_price, 110);
  assert.equal(t.entry_at, "2026-06-09");
  assert.equal(t.exit_at, "2026-06-11");
  assert.equal(t.is_backtest, true);
  assert.ok(t.r_multiple > 0);
});

test("backtestPosition: stays open (marked to market) when neither level is hit", () => {
  const opp = { id: 8, ticker: "Y", currency: "INR", council_verdict: "Buy", council_confidence: 70 };
  const candles = [
    { date: "2026-06-09", close: 100, high: 101, low: 99 },
    { date: "2026-06-10", close: 102, high: 103, low: 98 },
  ];
  const t = backtestPosition(opp, candles, { ...cfg, startingCash: 100000 });
  assert.equal(t.status, "open");
  assert.equal(t.exit_price, undefined);
});

test("BUY_VERDICTS are the council buy tier", () => {
  assert.deepEqual(BUY_VERDICTS, ["Strong Buy", "Buy"]);
});
