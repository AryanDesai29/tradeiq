// ─── VALUATION — the ONE money path (pure) ────────────────────────────────────
//
// Platform-integrity rule: every place that turns positions into a value, a
// weight, a return, or a ranking input goes through here. Before this, App.jsx /
// MissionControl / Council / OpportunityQueue each summed ₹ and $ their own way —
// silent correctness drift (a ₹ holding and a $ holding added raw, a total
// labelled the wrong currency, weights skewed by geography). One base currency:
// INR (TradeIQ is India-first → normalized_value_inr).
//
// Every function returns the BASIS used (fxRate + local + inr), so when records
// are persisted later (Opportunity Memory outcomes), the valuation basis at the
// time is already computed — no future migration needed to make it correct.
//
// FX is a single constant for now (no live-FX source is wired; a live rate is a
// documented future enhancement). Change it in ONE place; pass `fx` to override.

export const FX_INR = { INR: 1, USD: 84 }; // ₹ per 1 unit of currency. Single source of truth.

const round = (n, d = 2) => { const p = 10 ** d; return Math.round((Number(n) || 0) * p) / p; };

export function fxRate(currency, fx = FX_INR) { return fx[currency] ?? 1; }

// Convert an amount in `currency` to INR, exposing the rate used.
export function toINR(amount, currency, fx = FX_INR) {
  return round((Number(amount) || 0) * fxRate(currency, fx));
}

// A single holding/position → { local, currency, fxRate, inr }.
export function positionValue(h, fx = FX_INR) {
  const local = (Number(h?.shares) || 0) * (Number(h?.price) || 0);
  const rate = fxRate(h?.currency, fx);
  return { ticker: h?.ticker, local: round(local), currency: h?.currency || "INR", fxRate: rate, inr: round(local * rate) };
}

// Whole portfolio, normalized to INR. byCurrency keeps per-currency LOCAL sums so
// money is never mixed in display (₹ shown as ₹, $ shown as $) while the total is
// a single honest INR figure.
export function portfolioValue(holdings = [], fx = FX_INR) {
  const positions = holdings.map((h) => positionValue(h, fx));
  const totalINR = positions.reduce((s, p) => s + p.inr, 0);
  const costINR = (holdings || []).reduce((s, h) => s + (Number(h.shares) || 0) * (Number(h.avgCost) || 0) * fxRate(h.currency, fx), 0);
  const byCurrency = {};
  for (const p of positions) byCurrency[p.currency] = round((byCurrency[p.currency] || 0) + p.local);
  return {
    totalINR: round(totalINR),
    costINR: round(costINR),
    pnlINR: round(totalINR - costINR),
    pnlPct: costINR > 0 ? round(((totalINR - costINR) / costINR) * 100, 2) : 0,
    byCurrency,
    positions,
    currencies: Object.keys(byCurrency),
    mixed: Object.keys(byCurrency).length > 1,
  };
}

// Portfolio weight of a holding (0..1), normalized — geography-neutral.
export function weightOf(h, holdings = [], fx = FX_INR) {
  const total = portfolioValue(holdings, fx).totalINR;
  return total > 0 ? positionValue(h, fx).inr / total : 0;
}

// Capital available expressed in a given currency (for position sizing), derived
// from the normalized portfolio value — so a $ trade isn't sized off a raw ₹ total.
export function capitalIn(currency, holdings = [], fx = FX_INR) {
  const inr = portfolioValue(holdings, fx).totalINR;
  return round(inr / fxRate(currency, fx));
}
