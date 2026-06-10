// ─── THESIS LAYER (P2.75) — Litman: edge = reality diverging from expectations ──
//
// Every trade records an explicit thesis: what the MARKET expects vs what you
// believe REALITY is, plus the bear case and what would invalidate you. The
// review engine later judges whether reality actually diverged as predicted —
// that verdict, not P&L, is the "investor IQ" score. Capture is concise (≤200
// chars/field) by design: the value is forcing the expectation-vs-reality gap to
// be explicit, not writing essays.

export const THESIS_TYPES = [
  "Demand Acceleration", "Demand Deceleration", "Market Share Gain", "Margin Expansion",
  "Product Cycle", "Turnaround", "Cyclical Recovery", "Valuation Re-rating",
  "Technical Momentum", "Earnings Beat", "Mean Reversion",
];

export const THESIS_FIELD_MAX = 200;                 // per-field char cap (concise, not essays)
export const THESIS_REQUIRED = ["expectations", "reality", "bearCase", "invalidation"]; // evidence optional

// 3-state verdict (AI proposes, user can override). partial = half credit.
export const THESIS_VERDICTS = ["correct", "partial", "incorrect"];
export const VERDICT_WEIGHT = { correct: 1, partial: 0.5, incorrect: 0 };
export const VERDICT_LABEL  = { correct: "Thesis validated", partial: "Partially validated", incorrect: "Thesis wrong" };
export const VERDICT_COLOR_KEY = { correct: "green", partial: "gold", incorrect: "red" };

// A trade's thesis is complete when all required fields + a valid type and
// confidence are present. Evidence is encouraged but optional.
export function thesisComplete(t) {
  if (!t) return false;
  const okText = (v) => typeof v === "string" && v.trim().length > 0;
  return THESIS_TYPES.includes(t.thesisType)
    && THESIS_REQUIRED.every((k) => okText(t[k]))
    && Number.isFinite(+t.confidence) && +t.confidence >= 0 && +t.confidence <= 100;
}

// Which required fields are still missing — drives the form's inline validation.
export function missingThesisFields(t) {
  const miss = [];
  if (!t || !THESIS_TYPES.includes(t.thesisType)) miss.push("thesisType");
  for (const k of THESIS_REQUIRED) if (!(typeof t?.[k] === "string" && t[k].trim())) miss.push(k);
  if (!(Number.isFinite(+t?.confidence) && +t.confidence >= 0 && +t.confidence <= 100)) miss.push("confidence");
  return miss;
}

// final verdict = user override when given, else the AI's.
export function finalVerdict(r) {
  return r?.user_thesis_verdict || r?.ai_thesis_verdict || null;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const weightAcc = (verdicts) => (verdicts.length ? verdicts.reduce((s, v) => s + (VERDICT_WEIGHT[v] ?? 0), 0) / verdicts.length : 0);

// "Investor IQ" — thesis-quality stats over reviewed trades. This is the score
// Litman cares about: prediction quality, not P&L.
export function thesisStats(reviews = []) {
  const judged = reviews.filter((r) => r && !r.error && (r.ai_thesis_verdict || r.user_thesis_verdict));
  const finals = judged.map(finalVerdict).filter(Boolean);
  const count = (v) => finals.filter((x) => x === v).length;

  // expectations_changed = market was wrong (reality diverged from consensus).
  const withEC = judged.filter((r) => typeof r.expectations_changed === "boolean");
  const marketWrong = withEC.filter((r) => r.expectations_changed).length;

  const withBC = judged.filter((r) => typeof r.bear_case_realized === "boolean");

  // AI vs user reliability — how good the model is, and how often you override it.
  const aiVerdicts = judged.map((r) => r.ai_thesis_verdict).filter(Boolean);
  const userSet = judged.filter((r) => r.user_thesis_verdict);
  const overridden = userSet.filter((r) => r.ai_thesis_verdict && r.user_thesis_verdict !== r.ai_thesis_verdict);

  return {
    n: judged.length,
    accuracy: weightAcc(finals),               // 0–1, partial = 0.5
    correct: count("correct"),
    partial: count("partial"),
    incorrect: count("incorrect"),
    marketWrong,
    marketRight: withEC.length - marketWrong,
    bearCaseRate: withBC.length ? withBC.filter((r) => r.bear_case_realized).length / withBC.length : 0,
    aiAccuracy: weightAcc(aiVerdicts),
    overrideRate:  userSet.length ? overridden.length / userSet.length : 0,
    agreementRate: userSet.length ? (userSet.length - overridden.length) / userSet.length : 0,
  };
}

// Calibration: do your confidence levels track reality? Joins each reviewed
// trade's stated confidence to its final verdict (correct=1/partial=0.5/wrong=0).
// gap = avgConfidence − actualAccuracy; small gap = well-calibrated.
export function thesisCalibration(trades = [], reviews = []) {
  const byId = new Map(trades.map((t) => [t.id, t]));
  const pairs = reviews
    .filter((r) => r && !r.error && finalVerdict(r))
    .map((r) => ({ conf: +byId.get(r.trade_id)?.thesisConfidence, v: finalVerdict(r) }))
    .filter((p) => Number.isFinite(p.conf));
  if (!pairs.length) return { n: 0, avgConfidence: 0, actualAccuracy: 0, gap: 0, label: "—" };
  const avgConfidence = mean(pairs.map((p) => p.conf)) / 100;
  const actualAccuracy = weightAcc(pairs.map((p) => p.v));
  const gap = avgConfidence - actualAccuracy;          // + = overconfident, − = underconfident
  const a = Math.abs(gap);
  const label = a <= 0.1 ? "Good" : a <= 0.2 ? "Fair" : gap > 0 ? "Overconfident" : "Underconfident";
  return { n: pairs.length, avgConfidence, actualAccuracy, gap, label };
}
