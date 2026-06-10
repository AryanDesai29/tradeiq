// ─── PORTFOLIO INTELLIGENCE (pure) ───────────────────────────────────────────
//
// Answers "what am I ACTUALLY exposed to?" — not just a list of tickers. Surfaces
// sector + theme concentration and correlation clusters, so "NVDA + AMD + TSM +
// SMCI" reads as ONE AI bet made four times, not four independent positions.
//
// Currency-agnostic: callers pass items with `value` already in a common base
// (the app converts ₹/$ to USD), so percentages are comparable across markets.

// Theme map for the known universe (ticker → correlated bet). Falls back to sector.
export const THEME_MAP = {
  NVDA:"AI & Semiconductors", AMD:"AI & Semiconductors", AVGO:"AI & Semiconductors", SMCI:"AI & Semiconductors", "TSM":"AI & Semiconductors",
  AAPL:"Big Tech Platforms", MSFT:"Big Tech Platforms", GOOGL:"Big Tech Platforms", META:"Big Tech Platforms", AMZN:"Big Tech Platforms",
  NFLX:"Consumer Internet", PLTR:"Data & Software", TSLA:"EV & Auto", "TATAMOTORS.NS":"EV & Auto",
  "QQQ":"Index / Broad",
  "HDFCBANK.NS":"Indian Banks", "ICICIBANK.NS":"Indian Banks", "SBIN.NS":"Indian Banks", "AXISBANK.NS":"Indian Banks",
  "BAJFINANCE.NS":"Indian Financials",
  "TCS.NS":"Indian IT", "INFY.NS":"Indian IT", "WIPRO.NS":"Indian IT",
  "RELIANCE.NS":"Energy & Conglomerate", "ADANIENT.NS":"Energy & Conglomerate",
  "HINDUNILVR.NS":"Consumer Staples",
};
export function themeOf(ticker, sector) {
  return THEME_MAP[ticker] || (sector && sector.trim()) || "Uncategorised";
}

const sum = (a) => a.reduce((s, x) => s + x, 0);

// Group items by a key → value, %, count, tickers — largest first.
export function exposureBy(items = [], keyFn) {
  const total = sum(items.map((i) => +i.value || 0)) || 0;
  const g = {};
  for (const it of items) {
    const k = keyFn(it) || "Uncategorised";
    (g[k] ||= { key: k, value: 0, count: 0, tickers: [] });
    g[k].value += +it.value || 0; g[k].count++; g[k].tickers.push(it.ticker);
  }
  return Object.values(g)
    .map((o) => ({ ...o, pct: total ? o.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export const sectorExposure = (items) => exposureBy(items, (i) => i.sector);
export const themeExposure  = (items) => exposureBy(items, (i) => themeOf(i.ticker, i.sector));

// Concentration: largest name, top-3, Herfindahl (HHI) and effective # of bets.
export function concentration(items = []) {
  const total = sum(items.map((i) => +i.value || 0)) || 0;
  if (!total) return { totalValue: 0, largest: null, top1Pct: 0, top3Pct: 0, hhi: 0, effectiveN: 0 };
  const sorted = [...items].map((i) => ({ ticker: i.ticker, pct: (+i.value || 0) / total })).sort((a, b) => b.pct - a.pct);
  const hhi = sum(sorted.map((s) => s.pct * s.pct));            // 0–1; 1 = single position
  return {
    totalValue: total,
    largest: sorted[0] || null,
    top1Pct: sorted[0]?.pct || 0,
    top3Pct: sum(sorted.slice(0, 3).map((s) => s.pct)),
    hhi,
    effectiveN: hhi ? 1 / hhi : 0,                              // # of equally-weighted bets you effectively hold
  };
}

// Correlation proxy: positions sharing a THEME move together. A theme holding >1
// name is effectively one correlated bet. (True correlation needs return series;
// this is an honest theme-cluster proxy, flagged as such in the UI.)
export function correlationClusters(items = []) {
  return themeExposure(items)
    .filter((t) => t.count > 1)
    .map((t) => ({ theme: t.key, count: t.count, pct: t.pct, value: t.value, tickers: t.tickers }));
}

// Human-readable risk flags over the portfolio.
export function portfolioRiskFlags(items = [], { singleName = 0.25, theme = 0.40, minPositions = 4 } = {}) {
  const flags = [];
  const c = concentration(items);
  if (c.largest && c.top1Pct > singleName)
    flags.push({ level: "high", text: `${c.largest.ticker} is ${(c.top1Pct * 100).toFixed(0)}% of the book — single-name concentration` });
  for (const cl of correlationClusters(items)) {
    if (cl.pct > theme)
      flags.push({ level: "high", text: `${cl.count} names in "${cl.theme}" = ${(cl.pct * 100).toFixed(0)}% — effectively one correlated bet` });
    else if (cl.count >= 3)
      flags.push({ level: "med", text: `${cl.count} correlated "${cl.theme}" positions (${(cl.pct * 100).toFixed(0)}%)` });
  }
  if (items.length >= minPositions && c.effectiveN && c.effectiveN < 3)
    flags.push({ level: "med", text: `Only ~${c.effectiveN.toFixed(1)} effective bets across ${items.length} positions — low real diversification` });
  return flags;
}
