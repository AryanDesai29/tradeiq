// ─── FOUNDER MEMORY GRAPH (pure) ──────────────────────────────────────────────
// Memory of DECISIONS, not conversations. Detects when a new trade/opportunity
// conflicts with an ACTIVE "avoid" decision so the system can protect strategy
// ("this conflicts with decision #N — has your strategy changed?"). Deterministic
// + unit-tested; no LLM, no fabrication.

export const DECISION_KINDS = ["avoid", "rule", "bet"];

const norm = (s) => String(s || "").trim().toLowerCase();
const stripSuffix = (t) => norm(t).replace(/\.(ns|bo)$/i, "");

// The attributes of a trade/opportunity a decision can govern.
export function subjectTokens(subject = {}) {
  const toks = new Set();
  for (const v of [subject.thesis_type, subject.thesisType, subject.ticker, subject.sector, subject.decision_sector, subject.market]) {
    const n = norm(v); if (n) toks.add(n);
  }
  const tk = subject.ticker; if (tk) toks.add(stripSuffix(tk));
  // currency → market word, so "avoid US" / "avoid India" decisions match
  if (subject.currency === "USD") toks.add("us"); if (subject.currency === "INR") toks.add("india");
  return toks;
}

// A subject conflicts with a decision when the decision is ACTIVE, kind "avoid",
// and one of its tags matches a subject attribute, OR a subject attribute appears
// as a whole word in the decision statement (so plain-English rules still catch).
export function conflictsWith(decision, subject) {
  if (!decision || decision.active === false || decision.kind !== "avoid") return false;
  const toks = subjectTokens(subject);
  if (toks.size === 0) return false;
  const tags = (decision.tags || []).map(norm).filter(Boolean);
  if (tags.some((t) => toks.has(t))) return true;
  const s = norm(decision.statement);
  // whole-token substring match, only for tokens long enough to be meaningful
  return [...toks].some((t) => t.length >= 3 && new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(s));
}

export function findConflicts(decisions = [], subject) {
  return (decisions || []).filter((d) => conflictsWith(d, subject));
}

// Short label for a decision (for badges/feeds).
export function decisionLabel(d) {
  const s = String(d?.statement || "").trim();
  return s.length > 90 ? s.slice(0, 87) + "…" : s;
}
