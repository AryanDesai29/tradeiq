// ─── PERSONAL ALPHA ENGINE (P2.5) — "what conditions make Aryan money?" ───────
//
// Generalises analytics.js's byStrategy into expectancy-in-R grouped by ANY
// objective dimension we actually store: strategy, sector, market, side, holding
// period. R-multiples are unitless, so a sector/strategy can be ranked across ₹
// and $ trades without ever mixing money.
//
// Two disciplines, both deliberate:
//   1. PROCESS over outcome — we never pull review.regime_score (or any other
//      review score) into these numbers. The engine reads TRADES only; the AI's
//      heuristic regime_score is excluded by construction until a real regime
//      engine exists. Edge is measured from objective fills, not model opinion.
//   2. SAMPLE honesty — expectancy on 1–2 trades is noise. Groups below
//      MIN_SAMPLE R-valued trades are still shown but flagged low-confidence and
//      never surfaced as a headline edge/leak.
import { isClosed, pnlOf, rMultipleOf } from "./analytics.js";

// Market is derived from currency (single source of truth), never a stored column.
export const marketOf = (t) => (t?.currency === "INR" ? "India" : "US");

// Holding period in days: entry date → closed_at. null if either is missing
// (e.g. a trade closed before closed_at shipped) so it's excluded, not guessed.
export function holdingDays(t) {
  if (!t?.closedAt || !t?.date) return null;
  const start = Date.parse(t.date), end = Date.parse(t.closedAt);
  if (isNaN(start) || isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86400000);
}

export function holdingBucket(t) {
  const d = holdingDays(t);
  if (d == null) return null;
  if (d <= 1) return "Intraday–1d";
  if (d <= 5) return "2–5d (swing)";
  if (d <= 20) return "1–4wk";
  return "1mo+ (position)";
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// Group closed trades by keyFn → expectancy/win-rate/sample per bucket, best
// expectancy first. keyFn returning null drops the trade from THAT dimension
// (the dimension simply isn't recorded for it), without affecting others.
export function expectancyBy(trades = [], keyFn) {
  const out = {};
  for (const t of trades.filter(isClosed)) {
    const k = keyFn(t);
    if (k == null || k === "") continue;
    const o = out[k] || (out[k] = { key: k, trades: 0, wins: 0, rs: [] });
    o.trades++;
    if (pnlOf(t) > 0) o.wins++;
    const r = rMultipleOf(t);
    if (r != null) o.rs.push(r);
  }
  return Object.values(out)
    .map((o) => ({
      key: o.key,
      trades: o.trades,           // closed trades in this bucket
      withRisk: o.rs.length,      // of those, how many have a usable R (drive expectancy)
      wins: o.wins,
      winRate: o.trades ? o.wins / o.trades : 0,
      expectancyR: mean(o.rs),    // avg R per R-valued trade — the edge metric
      totalR: +o.rs.reduce((s, x) => s + x, 0).toFixed(3),
    }))
    .sort((a, b) => b.expectancyR - a.expectancyR);
}

// Below this many R-valued trades, a bucket's expectancy is treated as noise.
export const MIN_SAMPLE = 5;

export const DIMENSIONS = [
  { id: "strategy", label: "Strategy",       keyFn: (t) => t.strategy || null },
  { id: "sector",   label: "Sector",         keyFn: (t) => t.sector || null },
  { id: "market",   label: "Market",         keyFn: marketOf },
  { id: "side",     label: "Side",           keyFn: (t) => t.side || null },
  { id: "holding",  label: "Holding period", keyFn: holdingBucket },
];

// Full profile: per-dimension breakdowns (only dimensions that have any data),
// plus confident edges (+R) and leaks (−R) across every dimension meeting
// MIN_SAMPLE. This is the answer to "what makes / loses money".
export function personalAlpha(trades = [], minSample = MIN_SAMPLE) {
  const closed = trades.filter(isClosed);
  const dims = DIMENSIONS
    .map((d) => ({ id: d.id, label: d.label, groups: expectancyBy(closed, d.keyFn) }))
    .filter((d) => d.groups.length > 0);

  const confident = [];
  for (const d of dims)
    for (const g of d.groups)
      if (g.withRisk >= minSample) confident.push({ dimension: d.label, ...g });

  const edges = confident.filter((g) => g.expectancyR > 0).sort((a, b) => b.expectancyR - a.expectancyR);
  const leaks = confident.filter((g) => g.expectancyR < 0).sort((a, b) => a.expectancyR - b.expectancyR);

  return {
    dims,
    edges,
    leaks,
    bestEdge: edges[0] || null,
    worstLeak: leaks[0] || null,
    minSample,
    closed: closed.length,
    confidentBuckets: confident.length,
  };
}
