// ─── OPPORTUNITY PIPELINE (P3) — states, transitions, scoring (pure) ──────────
//
// Turns the flat opportunity statuses into an explicit state machine
// (discovered → researching → council_review → ready → logged/archived) and
// scores every idea through the lens of the user's REAL track record. Legacy
// statuses (new/watching/dismissed) are mapped on read — never rewritten — so
// pre-pipeline rows keep working untouched. UI lives in Pipeline.jsx.

import { personalAlpha } from "./alpha.js";
import { researchScore } from "./research.js";
import { VOTE_SCORE } from "./council.js";

export const PIPELINE_STATES = ["discovered", "researching", "council_review", "ready", "logged", "archived"];
export const STATE_LABEL = {
  discovered: "Discovered", researching: "Researching", council_review: "Council Review",
  ready: "Ready for Decision", logged: "Logged", archived: "Archived",
};

// Pre-pipeline vocabulary maps onto pipeline states on read. `watching` is a
// user flag, not a workflow stage — it stays in Discovered with its badge.
const LEGACY = { new: "discovered", watching: "discovered", dismissed: "archived" };
export function pipelineState(opp) {
  const s = LEGACY[opp?.status] || opp?.status;
  return PIPELINE_STATES.includes(s) ? s : "discovered";
}

// Allowed moves. council_review → researching is the Council loop: Marlowe or
// Popper demand evidence, research reopens, the Council reconvenes.
export const TRANSITIONS = {
  discovered: ["researching", "council_review", "archived"],
  researching: ["council_review", "archived"],
  council_review: ["ready", "researching", "archived"],
  ready: ["logged", "researching", "archived"],
  logged: ["archived"],
  archived: ["discovered"], // un-archive
};
export const canMove = (from, to) => (TRANSITIONS[from] || []).includes(to);

// Board buckets = the five pipeline columns. `logged` (decision already made)
// shows in Ready with its badge rather than hiding a success state.
export const BOARD_COLUMNS = ["discovered", "researching", "council_review", "ready", "archived"];
export const boardColumn = (opp) => { const s = pipelineState(opp); return s === "logged" ? "ready" : s; };

export function stateCounts(opps = []) {
  const out = Object.fromEntries(PIPELINE_STATES.map((s) => [s, 0]));
  for (const o of opps) if (o) out[pipelineState(o)]++;
  return out;
}

// ── PERSONAL LENS — the user's proven strengths/weaknesses, fed to discovery,
// research and scoring. Derived from the journal: zero tokens, always honest.
export function personalLens(journal = []) {
  const alpha = personalAlpha(journal);
  const dim = alpha.dims.find((d) => d.id === "thesis");
  const byThesisType = {};
  for (const g of dim?.groups || [])
    byThesisType[g.key] = { expectancyR: +g.expectancyR.toFixed(2), n: g.withRisk, confident: g.withRisk >= alpha.minSample };
  return { byThesisType, bestEdge: alpha.bestEdge, worstLeak: alpha.worstLeak, closed: alpha.closed };
}

const fmtR = (v) => `${v >= 0 ? "+" : ""}${(+v).toFixed(2)}R`;

// Render the lens as prompt lines for the server engines. Empty string when the
// sample is too thin — we never claim an edge that isn't statistically proven.
export function lensBlock(lens) {
  if (!lens) return "";
  const out = [];
  if (lens.bestEdge) out.push(`PROVEN EDGE: ${lens.bestEdge.dimension} "${lens.bestEdge.key}" → ${fmtR(lens.bestEdge.expectancyR)} over ${lens.bestEdge.withRisk} trades — prioritize ideas that fit it.`);
  if (lens.worstLeak) out.push(`PROVEN LEAK: ${lens.worstLeak.dimension} "${lens.worstLeak.key}" → ${fmtR(lens.worstLeak.expectancyR)} over ${lens.worstLeak.withRisk} trades — apply extra skepticism there.`);
  const tt = Object.entries(lens.byThesisType || {}).filter(([, v]) => v.confident);
  if (tt.length) out.push(`THESIS-TYPE RECORD: ${tt.map(([k, v]) => `${k} ${fmtR(v.expectancyR)} (${v.n}t)`).join(", ")}.`);
  return out.join("\n");
}

// ── SCORING ENGINE — every score 0–100, computed live (never stale) ──────────
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

// Expected edge: the model's conviction shifted by the user's CONFIDENT
// thesis-type record (±15 max). Thin samples shift nothing — noise ≠ alpha.
export function edgeScore(opp, lens) {
  let s = clamp(opp?.confidence ?? 50);
  const t = lens?.byThesisType?.[opp?.thesis_type];
  if (t?.confident) s += Math.max(-15, Math.min(15, t.expectancyR * 10));
  return clamp(s);
}

// Research confidence: with an AI brief, use the analyst's own honesty signal;
// without one, completeness alone caps at 60 — presence of text isn't quality.
export function researchConfidenceScore(opp) {
  const b = opp?.research_brief;
  if (b && Number.isFinite(+b.research_confidence)) return clamp(b.research_confidence);
  return Math.min(60, clamp(researchScore(opp) * 100));
}

// Council confidence: vote direction (−2…+2) × stated confidence, mapped around
// a neutral 50 (Strong Buy @100% → 100, Strong Avoid @100% → 0). null = no verdict.
export function councilConfidenceScore(opp) {
  const v = opp?.council_verdict;
  if (typeof v !== "string" || !(v in VOTE_SCORE)) return null;
  const conf = clamp(opp?.council_confidence ?? 0) / 100;
  return clamp(50 + (VOTE_SCORE[v] / 2) * conf * 50);
}

// Risk: stated level + an epistemic premium. Unresearched ideas carry a flat
// premium; researched ones carry what their own brief admits is still unknown —
// so research only de-risks when it genuinely resolves unknowns.
export function riskScore(opp) {
  const base = { low: 25, medium: 50, high: 75 }[opp?.risk_level] ?? 50;
  const b = opp?.research_brief;
  const premium = b ? Math.min(20, 3 * ((b.unknowns?.length || 0) + (b.missing_evidence?.length || 0))) : 15;
  return clamp(base + premium);
}

// Composite for ranking. The council's weight redistributes when no verdict
// exists yet, instead of silently scoring an absent opinion as neutral.
export function scoreOpportunity(opp, lens) {
  const edge = edgeScore(opp, lens);
  const research = researchConfidenceScore(opp);
  const council = councilConfidenceScore(opp);
  const risk = riskScore(opp);
  const composite = council == null
    ? clamp(0.45 * edge + 0.35 * research + 0.20 * (100 - risk))
    : clamp(0.35 * edge + 0.25 * research + 0.25 * council + 0.15 * (100 - risk));
  return { edge, research, council, risk, composite };
}

// Live pipeline ranked by composite, archived excluded.
export function rankOpportunities(opps = [], lens) {
  return opps
    .filter((o) => o && pipelineState(o) !== "archived")
    .map((o) => ({ opp: o, scores: scoreOpportunity(o, lens) }))
    .sort((a, b) => b.scores.composite - a.scores.composite);
}
