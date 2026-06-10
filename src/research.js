// ─── RESEARCH WORKSPACE (pure) — enrich an opportunity into investable research ─
//
// Research edits the opportunity's thesis fields in place and adds an evidence
// log + notes. It reuses the thesis schema, so a researched opportunity flows
// straight into the trade form → Journal/Reviews/Investor IQ/Personal Alpha.

// Thesis fields that make research "complete enough" to act on (drives the
// completeness meter and gates the friendly "ready to trade" hint).
export const RESEARCH_THESIS_FIELDS = ["market_expectations", "reality_hypothesis", "bear_case", "invalidation"];

const MAX_EVIDENCE = 600;

// Append a timestamped evidence entry immutably. Ignores blank text; trims/caps.
// `at` is passed in (not generated here) so the function stays pure/testable.
export function addEvidence(log, text, at) {
  const t = typeof text === "string" ? text.trim().slice(0, MAX_EVIDENCE) : "";
  if (!t) return Array.isArray(log) ? log : [];
  const base = Array.isArray(log) ? log : [];
  return [...base, { text: t, at: at || "" }];
}

export function removeEvidence(log, idx) {
  const base = Array.isArray(log) ? log : [];
  return base.filter((_, i) => i !== idx);
}

// Completeness 0–1: the 4 core thesis fields + evidence (AI or logged) + notes.
// A nudge toward doing the work, not a hard gate.
export function researchScore(opp) {
  if (!opp) return 0;
  const filled = (v) => typeof v === "string" && v.trim().length > 0;
  let have = 0;
  const total = RESEARCH_THESIS_FIELDS.length + 2; // + evidence + notes
  for (const f of RESEARCH_THESIS_FIELDS) if (filled(opp[f])) have++;
  if (filled(opp.evidence) || (Array.isArray(opp.evidence_log) && opp.evidence_log.length)) have++;
  if (filled(opp.notes)) have++;
  return Math.round((have / total) * 100) / 100;
}

// Is the research solid enough to confidently create a trade from?
export function researchReady(opp) {
  if (!opp) return false;
  const filled = (v) => typeof v === "string" && v.trim().length > 0;
  return RESEARCH_THESIS_FIELDS.every((f) => filled(opp[f]))
    && Number.isFinite(+opp.confidence) && +opp.confidence >= 0 && +opp.confidence <= 100;
}
