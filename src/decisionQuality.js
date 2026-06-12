// ─── DECISION QUALITY (P3.3, pure) — does the AI actually improve decisions? ──
//
// The meta-layer. Every other engine produces intelligence; this one measures
// whether that intelligence changes decisions for the better. It is a SYNTHESIS
// over data that already exists — the opportunity pipeline state machine, the
// journal, reviews, and the two local telemetry streams (tiqUsage + tiqFilings)
// — so it adds measurement, not more intelligence.
//
// Honesty rule (same as the rest of the app): every metric is sample-gated. With
// thin data it says "insufficient — need N more", never a confident-looking zero.
// This is the gauge you watch fill during a validation week, not a verdict.

import { pipelineState } from "./pipeline.js";
import { thesisStats } from "./thesis.js";
import { rMultipleOf } from "./analytics.js";

const hasResearch = (o) => !!(o && (o.research_brief || o.researched_at));
const hasCouncil = (o) => !!(o && o.council_verdict);
const isLogged = (o) => pipelineState(o) === "logged";
const isArchived = (o) => pipelineState(o) === "archived";

// Count of a tiqUsage click key (engagement signal, aggregate not per-opp).
const usageCount = (usage, key) => (usage?.clicked || []).find((x) => x.key === key)?.count || 0;

const ratio = (a, b) => (b > 0 ? a / b : 0);
const tally = (arr) => {
  const m = new Map();
  for (const x of arr) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

// ── 1. OPPORTUNITY FUNNEL — do generated ideas advance toward decisions? ──────
// Generated → Researched → Council Reviewed → Traded → Successful. Monotonic:
// each stage counts opportunities that REACHED it. "Successful" is ticker-matched
// against closed winning trades (the opp→trade link isn't a hard FK), so it is an
// approximation — labelled as such in the UI.
export function opportunityFunnel(opportunities = [], journal = []) {
  const opps = opportunities.filter(Boolean);
  const generated = opps.length;
  const researched = opps.filter(hasResearch).length;
  const councilReviewed = opps.filter(hasCouncil).length;
  const traded = opps.filter(isLogged).length;
  const archived = opps.filter(isArchived).length;

  const winners = new Set(journal.filter((t) => t.closed && (rMultipleOf(t) ?? 0) > 0).map((t) => t.ticker));
  const successful = opps.filter((o) => isLogged(o) && winners.has(o.ticker)).length;

  const stages = [
    { key: "generated", label: "Generated", n: generated },
    { key: "researched", label: "Researched", n: researched },
    { key: "council", label: "Council Reviewed", n: councilReviewed },
    { key: "traded", label: "Traded", n: traded },
    { key: "successful", label: "Successful", n: successful },
  ];
  stages.forEach((s, i) => {
    s.convFromPrev = i === 0 ? 1 : ratio(s.n, stages[i - 1].n);
    s.convFromTop = ratio(s.n, generated);
  });
  return { generated, researched, councilReviewed, traded, archived, successful, stages };
}

// ── 2. RESEARCH FUNNEL — is the research engine actually used? ────────────────
export function researchFunnel(opportunities = [], usage = null) {
  const opps = opportunities.filter(Boolean);
  const generated = opps.filter((o) => !!o.research_brief).length;
  const usedInCouncil = opps.filter((o) => o.research_brief && o.council_verdict).length;
  const ledToTrade = opps.filter((o) => o.research_brief && isLogged(o)).length;
  return {
    generated,
    opened: usageCount(usage, "opp.openResearch"), // engagement (clicks), not per-opp
    usedInCouncil,
    ledToTrade,
    usedRate: ratio(usedInCouncil, generated),
    tradeRate: ratio(ledToTrade, generated),
  };
}

// ── 3. COUNCIL QUALITY — do verdicts convert, and does the user trust them? ───
export function councilQuality(opportunities = [], reviews = []) {
  const voted = opportunities.filter((o) => o && o.council_verdict);
  const ledToTrade = voted.filter(isLogged).length;
  const iq = thesisStats(reviews); // AI-vs-user thesis verdicts → override/agreement
  return {
    verdicts: voted.length,
    distribution: tally(voted.map((o) => o.council_verdict)),
    ledToTrade,
    tradeRate: ratio(ledToTrade, voted.length),
    judged: iq.n,
    overrideRate: iq.overrideRate,   // how often the user overrules the AI verdict
    agreementRate: iq.agreementRate,
    aiAccuracy: iq.aiAccuracy,
  };
}

// ── 4. FILING VALUE — re-expose the tiqFilings report through the value lens ──
// (filingReport is the output of telemetry.filingImpactReport — passed in so this
// module stays pure and storage-agnostic.)
export function filingValue(filingReport = null) {
  const r = filingReport || {};
  return {
    totalReads: r.totalReads || 0,
    manualReads: r.manualReads || 0,
    councilReads: r.councilReads || 0,
    verdictChanges: (r.verdictChanges || []).length,
    tradesAfterFiling: (r.tradesAfterFiling || []).length,
    researchUsedDigest: r.researchUsedDigest || 0,
    sectionsRead: r.sectionsRead || [],
    sectionsSkipped: r.sectionsSkipped || [],
  };
}

// ── Per-layer signal with a sample gate ──────────────────────────────────────
// `enough` is false until `sample >= need`; the UI then shows "need N more"
// instead of a misleading read. `read` is the one-line interpretation.
function signal(layer, sample, need, read, enoughRead) {
  const enough = sample >= need;
  return { layer, sample, need, enough, read: enough ? enoughRead : read };
}

// ── Top-level summary — the "is the AI helping?" board ────────────────────────
export function decisionQualitySummary({ opportunities = [], journal = [], reviews = [], usage = null, filingReport = null } = {}) {
  const opp = opportunityFunnel(opportunities, journal);
  const research = researchFunnel(opportunities, usage);
  const council = councilQuality(opportunities, reviews);
  const filing = filingValue(filingReport);

  const pc = (x) => `${Math.round(x * 100)}%`;
  const signals = [
    signal(
      "Opportunity Discovery", opp.generated, 10,
      `${opp.generated} generated — need 10+ to judge whether discovery finds investable ideas.`,
      `${pc(ratio(opp.researched, opp.generated))} of generated ideas got researched; ${pc(ratio(opp.traded, opp.generated))} reached a trade.`,
    ),
    signal(
      "Research Engine", research.generated, 5,
      `${research.generated} briefs — need 5+ to tell whether research is used.`,
      `${pc(research.usedRate)} of briefs fed a Council verdict; ${pc(research.tradeRate)} led to a trade.`,
    ),
    signal(
      "Council", council.verdicts, 5,
      `${council.verdicts} verdicts — need 5+ to read conversion and trust.`,
      `${pc(council.tradeRate)} of verdicts became trades; you override the AI ${pc(council.overrideRate)} of the time.`,
    ),
    signal(
      "Filing Intelligence", filing.totalReads, 3,
      `${filing.totalReads} filings read — need 3+ reads to judge filing value.`,
      filing.verdictChanges > 0
        ? `${filing.verdictChanges} Council verdict${filing.verdictChanges > 1 ? "s" : ""} moved after a filing read; ${filing.tradesAfterFiling} trade(s) followed a filing.`
        : `No verdict changed after a filing yet — filings may not be adding decision value.`,
    ),
    signal(
      "Thesis Quality (Investor IQ)", council.judged, 3,
      `${council.judged} theses judged — need 3+ to score prediction quality.`,
      `Your thesis accuracy is the true score; AI thesis accuracy ${pc(council.aiAccuracy)}, you agree ${pc(council.agreementRate)}.`,
    ),
  ];

  return { opp, research, council, filing, signals };
}
