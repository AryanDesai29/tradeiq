// Tests for the trading-analytics engine. Deterministic synthetic trades with
// hand-computed R-multiples cover the cross-currency (R) and per-currency (money)
// paths plus drawdown ordering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance, byCurrency, monthlyReturns, byStrategy, pnlOf, rMultipleOf } from '../src/analytics.js';

// T1 USD BUY 100→130, stop 90  → P&L +30, risk 10, R +3  (win)  2026-05-01
// T2 USD BUY 100→80,  stop 90  → P&L −20, risk 10, R −2  (loss) 2026-05-10
// T3 INR BUY 1000→1100, stop 950 → P&L +100, risk 50, R +2 (win) 2026-06-01
// T4 open (excluded)
const TR = [
  { closed: true,  side: 'BUY', entry: '100',  exit: '130',  stop: '90',  shares: '1', currency: 'USD', date: '2026-05-01', strategy: 'EMA Pullback' },
  { closed: true,  side: 'BUY', entry: '100',  exit: '80',   stop: '90',  shares: '1', currency: 'USD', date: '2026-05-10', strategy: 'Breakout Consolidation' },
  { closed: true,  side: 'BUY', entry: '1000', exit: '1100', stop: '950', shares: '1', currency: 'INR', date: '2026-06-01', strategy: 'EMA Pullback' },
  { closed: false, side: 'BUY', entry: '50',   exit: null,   stop: '45',  shares: '1', currency: 'USD', date: '2026-06-05', strategy: 'EMA Pullback' },
];

test('pnlOf and rMultipleOf are direction- and risk-aware', () => {
  assert.equal(pnlOf(TR[0]), 30);
  assert.equal(rMultipleOf(TR[0]), 3);
  assert.equal(pnlOf(TR[1]), -20);
  assert.equal(rMultipleOf(TR[1]), -2);
  // SELL (short): profit when price falls.
  assert.equal(pnlOf({ side: 'SELL', entry: '100', exit: '90', shares: '2' }), 20);
  // No stop → R undefined.
  assert.equal(rMultipleOf({ entry: '100', exit: '110', shares: '1' }), null);
});

test('performance: cross-currency R metrics', () => {
  const p = performance(TR);
  assert.equal(p.trades, 3);
  assert.equal(p.open, 1);
  assert.equal(p.wins, 2);
  assert.equal(p.losses, 1);
  assert.ok(Math.abs(p.winRate - 2 / 3) < 1e-9);
  assert.equal(p.withRisk, 3);
  assert.ok(Math.abs(p.expectancyR - 1) < 1e-9);       // mean(3,-2,2)=1
  assert.ok(Math.abs(p.avgWinR - 2.5) < 1e-9);         // mean(3,2)
  assert.ok(Math.abs(p.avgLossR - -2) < 1e-9);
  assert.ok(Math.abs(p.profitFactor - 2.5) < 1e-9);    // (3+2)/2
  assert.ok(Math.abs(p.payoff - 1.25) < 1e-9);         // 2.5/2
  assert.ok(Math.abs(p.maxDrawdownR - -2) < 1e-9);     // curve 3,1,3 → trough at 1 (−2 from peak 3)
  assert.deepEqual(p.curve, [3, 1, 3]);
});

test('byCurrency keeps ₹ and $ separate (never summed)', () => {
  const m = Object.fromEntries(byCurrency(TR).map((b) => [b.currency, b]));
  assert.equal(m.USD.net, 10);            // +30 −20
  assert.equal(m.USD.avgWin, 30);
  assert.equal(m.USD.avgLoss, -20);
  assert.ok(Math.abs(m.USD.profitFactor - 1.5) < 1e-9);
  assert.equal(m.USD.largestWin, 30);
  assert.equal(m.USD.largestLoss, -20);
  assert.equal(m.INR.net, 100);
  assert.equal(m.INR.profitFactor, Infinity); // no losing INR trade
  assert.equal(m.INR.symbol, '₹');
});

test('monthlyReturns buckets per month per currency', () => {
  const m = monthlyReturns(TR);
  assert.deepEqual(m['2026-05'], { USD: 10 });   // +30 −20
  assert.deepEqual(m['2026-06'], { INR: 100 });
});

test('byStrategy aggregates win rate + expectancy per strategy', () => {
  const s = Object.fromEntries(byStrategy(TR).map((x) => [x.strategy, x]));
  assert.equal(s['EMA Pullback'].trades, 2);
  assert.equal(s['EMA Pullback'].wins, 2);
  assert.equal(s['EMA Pullback'].winRate, 1);
  assert.ok(Math.abs(s['EMA Pullback'].expectancyR - 2.5) < 1e-9); // mean(3,2)
  assert.equal(s['Breakout Consolidation'].wins, 0);
});

test('empty journal is safe', () => {
  const p = performance([]);
  assert.equal(p.trades, 0);
  assert.equal(p.winRate, 0);
  assert.deepEqual(byCurrency([]), []);
});
