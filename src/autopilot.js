// ─── PAPER AUTOPILOT (pure) ───────────────────────────────────────────────────
//
// A simulated trader that executes the system's OWN council-ready opportunities.
// Money is virtual; prices are real. Every function here is pure and deterministic
// (unit-tested) — the React/DB shell in App.jsx feeds it live/historical prices
// and persists what it returns. It NEVER invents prices or reasons: entries use
// the real live price, explanations are assembled from the real council verdict /
// thesis / R:R math.
//
// Strategy = council-gated swing: open only when an opportunity reached a BUY
// verdict at sufficient confidence; size by the 2%-risk rule; exit on a fixed
// stop/target (1:2 R:R). This mirrors the app's own risk doctrine (SIM_CAP,
// ≤2% risk/trade, always a stop, min 1:2 R:R).

export const BUY_VERDICTS = ["Strong Buy", "Buy"];

export function defaultConfig() {
  return {
    riskPct: 0.02,            // ≤2% of equity risked per trade
    stopPct: 0.05,            // protective stop 5% below entry
    rr: 2,                    // target = 1:2 reward:risk → +10%
    minCouncilConfidence: 60, // council-gated entry threshold
    maxPositions: 6,          // tight book, per the swarm/coordination doctrine
    maxPositionPct: 0.25,     // no single sim position > 25% of equity at entry
    buyVerdicts: BUY_VERDICTS,
  };
}

const round = (n, d = 2) => { const p = 10 ** d; return Math.round((Number(n) || 0) * p) / p; };

// ── Sizing: risk-based, then capped by available cash and the concentration cap ─
export function positionSize({ cash, equity, entry, stop, cfg = defaultConfig() }) {
  const e = +entry, s = +stop;
  if (!(e > 0) || !(s > 0) || e <= s) return 0;
  const riskAmt = (Number(equity) || 0) * cfg.riskPct;
  const perShareRisk = e - s;
  let qty = Math.floor(riskAmt / perShareRisk);                 // whole shares
  const capByCash = Math.floor((Number(cash) || 0) / e);
  const capByConc = Math.floor(((Number(equity) || 0) * cfg.maxPositionPct) / e);
  qty = Math.min(qty, capByCash, capByConc);
  return qty > 0 ? qty : 0;
}

// ── Levels & explanation for a new entry (all from real data) ──
export function planEntry(opp, entry, cfg = defaultConfig()) {
  const stop = round(entry * (1 - cfg.stopPct));
  const target = round(entry * (1 + cfg.stopPct * cfg.rr));
  return { stop, target };
}

export function explainEntry(opp, { entry, stop, target, qty, equity, cfg = defaultConfig() }) {
  const sym = opp?.currency === "USD" ? "$" : "₹";
  const riskAmt = round((entry - stop) * qty);
  const thesis = (opp?.reality_hypothesis || opp?.market_expectations || "").trim();
  return [
    `Council ${opp?.council_verdict || "verdict"} @ ${opp?.council_confidence ?? "?"}% on a ${opp?.thesis_type || "thesis"} idea.`,
    `Bought ${qty} @ ${sym}${round(entry)}; stop ${sym}${stop} (−${round(cfg.stopPct * 100)}%), target ${sym}${target} (+${round(cfg.stopPct * cfg.rr * 100)}%, 1:${cfg.rr} R:R).`,
    `Risking ${sym}${riskAmt} (~${round(cfg.riskPct * 100)}% of ${sym}${round(equity)}).`,
    thesis ? `Thesis: ${thesis}` : "",
  ].filter(Boolean).join(" ");
}

// ── Entry decisions: which council-ready opportunities to open right now ──
// `priceOf(ticker)` returns the current price or null. `held` = set of open tickers.
// `scoreOf(opp)` ranks candidates (composite); higher first.
export function decideEntries({ opportunities = [], held = new Set(), account, equity, priceOf, scoreOf = () => 0, cfg = defaultConfig(), now }) {
  let cash = Number(account?.cash) || 0;
  let slots = cfg.maxPositions - held.size;
  if (slots <= 0) return [];

  const eligible = opportunities
    .filter((o) => o && !held.has(o.ticker))
    .filter((o) => cfg.buyVerdicts.includes(o.council_verdict) && (o.council_confidence ?? 0) >= cfg.minCouncilConfidence)
    .map((o) => ({ o, price: priceOf(o.ticker) }))
    .filter((x) => x.price != null && x.price > 0)
    .sort((a, b) => scoreOf(b.o) - scoreOf(a.o));

  const opens = [];
  const seen = new Set();
  for (const { o, price } of eligible) {
    if (slots <= 0) break;
    if (seen.has(o.ticker)) continue;               // never two positions in one name
    const { stop, target } = planEntry(o, price, cfg);
    const qty = positionSize({ cash, equity, entry: price, stop, cfg });
    if (qty < 1) continue;                           // can't afford a risk-correct position
    const reason = explainEntry(o, { entry: price, stop, target, qty, equity, cfg });
    opens.push({
      ticker: o.ticker, name: o.name, currency: o.currency, side: "BUY",
      qty, entry_price: round(price), entry_at: now, stop, target, status: "open",
      reason_open: reason,
      opportunity_id: typeof o.id === "number" ? o.id : null,
      council_session_hash: o.council_session_hash || null,
      council_verdict: o.council_verdict || null,
      council_confidence: o.council_confidence ?? null,
      generation_confidence: o.confidence ?? null,
      opp_risk_level: o.risk_level || null,
      decision_sector: o.decision_sector || null,
      thesis_type: o.thesis_type || null,
      price_at_gen: o.price_at_gen ?? null,
    });
    seen.add(o.ticker);
    cash -= round(price) * qty;
    slots--;
  }
  return opens;
}

// ── Exit decisions for open positions, given the latest price (or a day's H/L) ──
// For live use pass {price}; for the historical backtest pass {high, low} of the bar.
export function decideExit(position, { price, high, low } = {}, now) {
  const stop = +position.stop, target = +position.target;
  const hi = high != null ? +high : +price;
  const lo = low != null ? +low : +price;
  if (stop && lo <= stop) return { exit_price: round(stop), exit_reason: "stop", exit_at: now };
  if (target && hi >= target) return { exit_price: round(target), exit_reason: "target", exit_at: now };
  return null;
}

export function pnlOf(t) {
  const dir = t.side === "SELL" ? -1 : 1;
  return round((Number(t.exit_price) - Number(t.entry_price)) * Number(t.qty) * dir);
}
export function rMultipleOf(t) {
  const risk = Number(t.entry_price) - Number(t.stop);
  if (!(risk > 0)) return null;
  const dir = t.side === "SELL" ? -1 : 1;
  return round(((Number(t.exit_price) - Number(t.entry_price)) * dir) / risk, 2);
}

// ── Mark-to-market equity = cash + open positions at current price ──
export function equityOf(account, openPositions = [], priceOf = () => null) {
  let eq = Number(account?.cash) || 0;
  for (const p of openPositions) {
    const px = priceOf(p.ticker);
    eq += (px != null ? +px : +p.entry_price) * Number(p.qty);
  }
  return round(eq);
}

export function accountStats(account, trades = [], priceOf = () => null) {
  const open = trades.filter((t) => t.status === "open");
  const closed = trades.filter((t) => t.status === "closed");
  const equity = equityOf(account, open, priceOf);
  const realized = round(closed.reduce((s, t) => s + (Number(t.pnl) || 0), 0));
  const wins = closed.filter((t) => (Number(t.pnl) || 0) > 0).length;
  const start = Number(account?.starting_cash) || 0;
  return {
    equity,
    cash: round(Number(account?.cash) || 0),
    invested: round(equity - (Number(account?.cash) || 0)),
    openCount: open.length,
    closedCount: closed.length,
    realizedPnl: realized,
    winRate: closed.length ? round((wins / closed.length) * 100, 1) : null,
    totalReturnPct: start ? round(((equity - start) / start) * 100, 2) : null,
  };
}

// ── Honest historical seed: replay council-ready ideas as if entered `days` ago,
// walking REAL daily candles forward, applying stop/target on each bar's H/L.
// `candles` = [{date, close, high, low}] ascending; the entry bar is the first
// bar on/after the start date. Returns closed/open paper-trade records, real-dated.
export function backtestPosition(opp, candles = [], cfg = defaultConfig()) {
  if (!candles.length) return null;
  const entryBar = candles[0];
  const entry = +entryBar.close;
  if (!(entry > 0)) return null;
  const { stop, target } = planEntry(opp, entry, cfg);
  // equity basis for sizing is the per-trade slice of starting capital (kept simple
  // + honest: the seed sizes each idea independently off the sim capital).
  const qty = positionSize({ cash: Infinity, equity: cfg.startingCash ?? 100000, entry, stop, cfg });
  if (qty < 1) return null;
  const base = {
    ticker: opp.ticker, name: opp.name, currency: opp.currency, side: "BUY", qty,
    entry_price: round(entry), entry_at: entryBar.date, stop, target, is_backtest: true,
    reason_open: explainEntry(opp, { entry, stop, target, qty, equity: cfg.startingCash ?? 100000, cfg }),
    opportunity_id: typeof opp.id === "number" ? opp.id : null,
    council_verdict: opp.council_verdict || null, council_confidence: opp.council_confidence ?? null,
    generation_confidence: opp.confidence ?? null, opp_risk_level: opp.risk_level || null,
    decision_sector: opp.decision_sector || null, thesis_type: opp.thesis_type || null,
    price_at_gen: opp.price_at_gen ?? null,
  };
  for (let i = 1; i < candles.length; i++) {
    const ex = decideExit({ stop, target }, { high: candles[i].high, low: candles[i].low }, candles[i].date);
    if (ex) {
      const t = { ...base, status: "closed", ...ex };
      return { ...t, pnl: pnlOf(t), r_multiple: rMultipleOf(t) };
    }
  }
  // never hit: still open, marked-to-market at the latest close
  return { ...base, status: "open" };
}
