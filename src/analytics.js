// ─── TRADING ANALYTICS — pure, currency-correct metrics over the journal ──────
//
// Cross-currency aggregates use R-multiples (result ÷ initial risk), which are
// unitless and therefore comparable across ₹ and $ trades. Money figures
// (net, avg winner/loser) are NEVER summed across currencies — they are kept
// per-currency. This is the same single-source-of-truth discipline as stock.js:
// currency is data; we segment by it rather than silently mixing it.
import { symbolFor } from "./stock.js";

// A trade is analysable only once it's closed with a real exit price.
export const isClosed = (t) => !!t && t.closed && t.exit != null && t.exit !== "";

// Direction-aware realised P&L in the trade's OWN currency. SELL = short.
export function pnlOf(t) {
  const entry = +t.entry, exit = +t.exit, shares = +t.shares || 0;
  const dir = t.side === "SELL" ? -1 : 1;
  return (exit - entry) * shares * dir;
}

// Initial money risk = |entry − stop| × shares. null when no usable stop, so
// the trade is excluded from R-based metrics (but still counts for win rate).
export function riskOf(t) {
  const entry = +t.entry, stop = +t.stop, shares = +t.shares || 0;
  if (!stop || !shares || stop === entry) return null;
  return Math.abs(entry - stop) * shares;
}

// R-multiple = P&L ÷ initial risk. Currency cancels → unitless. null if no risk.
export function rMultipleOf(t) {
  const risk = riskOf(t);
  return risk ? pnlOf(t) / risk : null;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sum  = (a) => a.reduce((s, x) => s + x, 0);

// Cross-currency, risk-normalised summary over all closed trades.
export function performance(trades = []) {
  const closed = trades.filter(isClosed);
  const wins   = closed.filter((t) => pnlOf(t) > 0);
  const losses = closed.filter((t) => pnlOf(t) < 0);

  const withR  = closed.filter((t) => rMultipleOf(t) != null);
  const rs     = withR.map(rMultipleOf);
  const winR   = rs.filter((r) => r > 0);
  const lossR  = rs.filter((r) => r < 0);
  const grossR = sum(winR);
  const grossLossR = Math.abs(sum(lossR));

  // Equity curve in R, ordered by trade date → peak-to-trough max drawdown.
  const ordered = [...withR].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let cum = 0, peak = 0, maxDD = 0;
  const curve = ordered.map((t) => { cum += rMultipleOf(t); peak = Math.max(peak, cum); maxDD = Math.min(maxDD, cum - peak); return +cum.toFixed(3); });

  return {
    trades: closed.length,
    open: trades.length - closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    withRisk: withR.length,           // trades that had a usable stop (R is valid)
    expectancyR: mean(rs),            // avg R per trade — the key edge metric
    avgWinR: mean(winR),
    avgLossR: mean(lossR),            // ≤ 0
    payoff: (winR.length && lossR.length) ? Math.abs(mean(winR) / mean(lossR)) : 0,
    profitFactor: grossLossR ? grossR / grossLossR : (grossR ? Infinity : 0),
    maxDrawdownR: maxDD,              // ≤ 0
    curve,
  };
}

// Per-currency money figures — ₹ and $ are reported separately, never summed.
export function byCurrency(trades = []) {
  const out = {};
  for (const t of trades.filter(isClosed)) {
    const c = t.currency || "USD";
    const o = out[c] || (out[c] = { currency: c, symbol: symbolFor(c), trades: 0, net: 0, gross: 0, grossLoss: 0, wins: 0, losses: 0, winSum: 0, lossSum: 0, largestWin: 0, largestLoss: 0 });
    const p = pnlOf(t);
    o.trades++; o.net += p;
    if (p >= 0) { o.wins++;   o.gross += p;            o.winSum  += p; o.largestWin  = Math.max(o.largestWin, p); }
    else        { o.losses++; o.grossLoss += Math.abs(p); o.lossSum += p; o.largestLoss = Math.min(o.largestLoss, p); }
  }
  return Object.values(out).map((o) => ({
    ...o,
    avgWin:  o.wins   ? o.winSum  / o.wins   : 0,
    avgLoss: o.losses ? o.lossSum / o.losses : 0,
    profitFactor: o.grossLoss ? o.gross / o.grossLoss : (o.gross ? Infinity : 0),
  }));
}

// Monthly net P&L per currency → { "2026-06": { INR: 1200, USD: 35 }, … }.
// Bucketed by trade_date (entry date) — the only date we store today.
export function monthlyReturns(trades = []) {
  const m = {};
  for (const t of trades.filter(isClosed)) {
    const key = String(t.date || "").slice(0, 7) || "—";
    const c = t.currency || "USD";
    (m[key] = m[key] || {})[c] = (m[key][c] || 0) + pnlOf(t);
  }
  return m;
}

// Win rate / expectancy grouped by strategy — used by Strategy Analytics (P4).
export function byStrategy(trades = []) {
  const out = {};
  for (const t of trades.filter(isClosed)) {
    const k = t.strategy || "—";
    const o = out[k] || (out[k] = { strategy: k, trades: 0, wins: 0, rs: [] });
    o.trades++; if (pnlOf(t) > 0) o.wins++;
    const r = rMultipleOf(t); if (r != null) o.rs.push(r);
  }
  return Object.values(out).map((o) => ({
    strategy: o.strategy, trades: o.trades, wins: o.wins,
    winRate: o.trades ? o.wins / o.trades : 0,
    expectancyR: mean(o.rs),
  }));
}
