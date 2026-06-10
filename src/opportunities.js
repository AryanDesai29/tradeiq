// ─── OPPORTUNITY DISCOVERY (P3) — proactive AI-generated theses ───────────────
//
// The AI proposes investable ideas from the watchlist/universe. Each is a THESIS
// in the same shape the journal uses (so it flows into the trade form and the
// thesis-type analytics), framed as a HYPOTHESIS to critique — never a fact, since
// the model has no fundamentals. Stored with the snapshot price so the idea can be
// measured against outcome later, whether or not it's traded.
import { THESIS_TYPES } from "./thesis.js";

export const RISK_LEVELS = ["low", "medium", "high"];
export const OPP_STATUS = ["new", "watching", "logged", "dismissed"];

const clampConf = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const str = (v, max = 240) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Validate one raw AI opportunity into a safe, storable record. Returns null if
// it isn't usable (no ticker, or a ticker outside the known universe → anti-hallucination).
export function normalizeOpportunity(raw, knownTickers) {
  if (!raw || typeof raw !== "object") return null;
  const ticker = typeof raw.ticker === "string" ? raw.ticker.trim().toUpperCase() : "";
  if (!ticker) return null;
  // If a known-universe set is supplied, reject anything the model invented.
  if (knownTickers && !knownTickers.has(ticker)) return null;
  const risk = RISK_LEVELS.includes(raw.risk_level) ? raw.risk_level : "medium";
  return {
    ticker,
    thesis_type:         THESIS_TYPES.includes(raw.thesis_type) ? raw.thesis_type : "",
    market_expectations: str(raw.market_expectations),
    reality_hypothesis:  str(raw.reality_hypothesis),
    evidence:            str(raw.evidence),
    bull_case:           str(raw.bull_case),
    bear_case:           str(raw.bear_case),
    invalidation:        str(raw.invalidation),
    confidence:          clampConf(raw.confidence),
    risk_level:          risk,
  };
}

// Normalise + dedupe (one idea per ticker, highest confidence wins) + cap to N.
export function normalizeOpportunities(rawArr, knownTickers, limit = 10) {
  if (!Array.isArray(rawArr)) return [];
  const best = new Map();
  for (const raw of rawArr) {
    const o = normalizeOpportunity(raw, knownTickers);
    if (!o) continue;
    const prev = best.get(o.ticker);
    if (!prev || o.confidence > prev.confidence) best.set(o.ticker, o);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

// Idea performance since generation, direction-aware-ish (all ideas are long-bias
// here). Returns % move from the snapshot price; null if either price is missing.
export function opportunityReturn(opp, currentPrice) {
  const p0 = +opp?.price_at_gen, p1 = +currentPrice;
  if (!p0 || !p1) return null;
  return ((p1 - p0) / p0) * 100;
}
