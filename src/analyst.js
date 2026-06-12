// ─── RESEARCH ANALYST ENGINE (P3, pure) — tasks + research briefs ─────────────
//
// The AI becomes the junior analyst. Research TASKS are generated here (a
// default playbook, or the Council's own demands), executed server-side
// (api/research.js), and the returned brief is normalized with the same
// never-trust-the-model discipline as council.js. UNKNOWN is a first-class
// answer: the engine separates what is knowable from what is not — it never
// invents evidence.

export const TASK_TYPES = ["company", "industry", "competitive", "expectations", "risk", "thesis_validation"];
export const TASK_LABEL = {
  company: "Company Research", industry: "Industry Research", competitive: "Competitive Research",
  expectations: "Expectations Research", risk: "Risk Research", thesis_validation: "Thesis Validation",
};
export const TASK_STATUSES = ["queued", "running", "done", "failed"];
export const TASK_SOURCES = ["auto", "council", "user"];

const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clamp01 = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const strArr = (a, max = 8, len = 240) => (Array.isArray(a) ? a.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);

// Stable id from content (djb2, like council.hashTopic) — merging task lists
// dedupes naturally, and pure code never needs Date.now for identity.
export function taskId(type, question) {
  const s = `${type}|${(question || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// Council demand → task type, by vocabulary. Defaults to company research.
export function classifyResearchItem(text = "") {
  const s = String(text).toLowerCase();
  if (/(compet|rival|market share|moat|positioning)/.test(s)) return "competitive";
  if (/(industry|sector|trend|tam|supply chain|supplier|demand)/.test(s)) return "industry";
  if (/(priced in|expectation|consensus|valuation|multiple|guidance)/.test(s)) return "expectations";
  if (/(risk|downside|bear|break|invalidat|red flag|margin)/.test(s)) return "risk";
  if (/(thesis|evidence|support|validat|confirm)/.test(s)) return "thesis_validation";
  return "company";
}

export function makeTask({ type, question, source = "user" } = {}, at = "") {
  const q = str(question, 240);
  if (!q) return null;
  const t = TASK_TYPES.includes(type) ? type : classifyResearchItem(q);
  return {
    id: taskId(t, q), type: t, question: q,
    source: TASK_SOURCES.includes(source) ? source : "user",
    status: "queued", finding: null, created_at: at || "",
  };
}

// The default playbook — the six questions a junior analyst always answers,
// templated with the opportunity's own thesis so research attacks THIS idea.
export function defaultTasks(opp, at = "") {
  const tk = opp?.ticker || "this company";
  return [
    { type: "company", question: `What does ${tk} actually do — products, customers, revenue drivers?` },
    { type: "industry", question: `Which industry trends matter for ${tk} right now, and in which direction?` },
    { type: "competitive", question: `Who are ${tk}'s main competitors, and how defensible is its position?` },
    { type: "expectations", question: opp?.market_expectations ? `What appears priced into ${tk}? Test: "${str(opp.market_expectations, 120)}"` : `What appears priced into ${tk} at the current valuation?` },
    { type: "risk", question: opp?.invalidation ? `What could break the thesis on ${tk}? Known kill: "${str(opp.invalidation, 120)}"` : `What could break the thesis on ${tk}?` },
    { type: "thesis_validation", question: opp?.reality_hypothesis ? `What evidence would support or weaken: "${str(opp.reality_hypothesis, 140)}"?` : `What evidence would support or weaken the thesis on ${tk}?` },
  ].map((t) => makeTask({ ...t, source: "auto" }, at)).filter(Boolean);
}

// COUNCIL-INITIATED RESEARCH: Marlowe's EVIDENCE MISSING demand, Popper's RED
// FLAG REVIEW flags, and the verdict's required_research all become queued tasks.
export function tasksFromCouncil(session, at = "") {
  if (!session) return [];
  const items = [
    ...(session.verdict?.required_research || []),
    ...(session.evidence_hold?.raised && session.evidence_hold.demand ? [session.evidence_hold.demand] : []),
    ...(session.red_flags?.raised ? session.red_flags.flags || [] : []),
  ];
  return items.map((q) => makeTask({ question: q, source: "council" }, at)).filter(Boolean);
}

// Merge keeping existing progress: a task already done is never re-queued.
export function mergeTasks(existing = [], incoming = []) {
  const m = new Map();
  for (const t of [...existing, ...incoming]) if (t?.id && !m.has(t.id)) m.set(t.id, t);
  return [...m.values()];
}

export function taskProgress(tasks = []) {
  const total = tasks.length;
  const done = tasks.filter((t) => t && (t.status === "done" || t.status === "failed")).length;
  return { total, done, pct: total ? done / total : 0 };
}
export const researchDone = (tasks = []) => tasks.length > 0 && taskProgress(tasks).done === tasks.length;
export const queuedTasks = (tasks = []) => tasks.filter((t) => t && t.status === "queued");

// Apply the analyst's findings: matched tasks complete, unmatched stay queued
// (an unanswered task is unanswered — it is not silently marked done).
export function applyFindings(tasks = [], findings = [], at = "") {
  const byId = new Map();
  for (const f of Array.isArray(findings) ? findings : []) {
    const id = typeof f?.id === "string" ? f.id : "";
    const summary = str(f?.summary, 600);
    if (id && summary) byId.set(id, summary);
  }
  return tasks.map((t) => (t && byId.has(t.id) ? { ...t, status: "done", finding: byId.get(t.id), completed_at: at || "" } : t));
}

// ── RESEARCH BRIEF — the model's JSON is never trusted raw ───────────────────
// Sections mirror the anti-hallucination contract: facts / assumptions /
// opinions / speculation / unknowns are SEPARATE lists, never blended.
export const BRIEF_LISTS = [
  "key_findings", "facts", "assumptions", "opinions", "speculation",
  "unknowns", "risks", "missing_evidence", "next_questions", "council_questions",
];
export function normalizeBrief(raw) {
  if (!raw || typeof raw !== "object") return null;
  const b = {
    executive_summary: str(raw.executive_summary, 600),
    bull_case: str(raw.bull_case, 300),
    bear_case: str(raw.bear_case, 300),
    reality_vs_expectations: str(raw.reality_vs_expectations, 400),
    evidence_strength: clamp01(raw.evidence_strength),
    research_confidence: clamp01(raw.research_confidence),
  };
  for (const k of BRIEF_LISTS) b[k] = strArr(raw[k]);
  return b.executive_summary ? b : null;
}
