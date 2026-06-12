// ─── MISSION CONTROL ENGINE (pure) ───────────────────────────────
// Derives "what matters right now" from real TradeIQ data. No fetches, no
// LLM calls, no DOM — every output is computed from journal/reviews/
// opportunities/holdings already in memory, so the briefing is free and
// always current. UI lives in MissionControl.jsx.

import { isClosed, rMultipleOf } from "./analytics.js";
import { personalAlpha } from "./alpha.js";
import { themeExposure, concentration, portfolioRiskFlags } from "./portfolio.js";
import { thesisStats, thesisCalibration, finalVerdict } from "./thesis.js";
import { recurringMistakes, processScore, VERDICT_LABEL } from "./reviews.js";
import { pipelineState, scoreOpportunity, personalLens } from "./pipeline.js";
import { taskProgress, researchDone } from "./analyst.js";

const num = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? v : null; };

export const openPositions = (journal = []) => journal.filter((t) => t && !t.closed);

// ── Thesis health — objective stop-distance heuristic ────────────
// We cannot parse free-text invalidation criteria, so health is measured as
// progress toward the trade's own stop: ≥100% = stop breached ("broken"),
// ≥50% = "weakening", else "intact". Honest proxy, clearly labeled in UI.
export function thesisHealth(t, livePrice) {
  const entry = num(t?.entry), stop = num(t?.stop), live = num(livePrice);
  if (entry == null || stop == null || live == null || entry === stop) return { status: "unknown", progress: null };
  const prog = t.side === "SELL" ? (live - entry) / (stop - entry) : (entry - live) / (entry - stop);
  if (!Number.isFinite(prog)) return { status: "unknown", progress: null };
  const status = prog >= 1 ? "broken" : prog >= 0.5 ? "weakening" : "intact";
  return { status, progress: Math.max(0, Math.min(2, prog)) };
}
export const HEALTH_LABEL = { intact: "Thesis intact", weakening: "Thesis weakening", broken: "Stop breached", unknown: "No stop set" };

// ── Action queue — "what should I do next", prioritized ──────────
// severity: 3 = act now, 2 = soon, 1 = informational.
export function actionQueue({ journal = [], reviews = [], opportunities = [], liveOf = () => null, council = null } = {}) {
  const items = [];
  const open = openPositions(journal);

  const breached = open.filter((t) => thesisHealth(t, liveOf(t.ticker)).status === "broken");
  if (breached.length) items.push({ id: "breached", severity: 3, count: breached.length, tab: "journal",
    label: `${breached.length} open trade${breached.length > 1 ? "s" : ""} breached the stop`, detail: breached.map((t) => t.ticker).join(", ") });

  const reviewedIds = new Set(reviews.filter((r) => r && !r.error).map((r) => r.trade_id));
  const unreviewed = journal.filter((t) => isClosed(t) && !reviewedIds.has(t.id));
  if (unreviewed.length) items.push({ id: "review", severity: 3, count: unreviewed.length, tab: "journal",
    label: `Review ${unreviewed.length} closed trade${unreviewed.length > 1 ? "s" : ""}`, detail: "Unreviewed trades teach nothing — close the learning loop" });

  // Pipeline (P3): decisions waiting on the user outrank everything but money at risk.
  const decide = opportunities.filter((o) => o && pipelineState(o) === "ready");
  if (decide.length) items.push({ id: "decide", severity: 3, count: decide.length, tab: "opps",
    label: `${decide.length} opportunit${decide.length > 1 ? "ies" : "y"} ready for your decision`, detail: decide.slice(0, 4).map((o) => o.ticker).join(", ") });

  const forCouncil = opportunities.filter((o) => o && pipelineState(o) === "council_review");
  if (forCouncil.length) items.push({ id: "council_review", severity: 2, count: forCouncil.length, tab: "opps",
    label: `${forCouncil.length} researched idea${forCouncil.length > 1 ? "s" : ""} awaiting Council review`, detail: forCouncil.slice(0, 4).map((o) => o.ticker).join(", ") });

  const fresh = opportunities.filter((o) => o && o.status === "new");
  if (fresh.length) items.push({ id: "opps", severity: 2, count: fresh.length, tab: "opps",
    label: `${fresh.length} new opportunit${fresh.length > 1 ? "ies" : "y"} awaiting review`, detail: fresh.slice(0, 4).map((o) => o.ticker).join(", ") });

  const thin = opportunities.filter((o) => o && o.status === "researching" && !(o.evidence_log || []).length && !o.evidence);
  if (thin.length) items.push({ id: "evidence", severity: 2, count: thin.length, tab: "opps",
    label: `${thin.length} research item${thin.length > 1 ? "s" : ""} missing evidence`, detail: thin.slice(0, 4).map((o) => o.ticker).join(", ") });

  const noThesis = open.filter((t) => !t.thesisType);
  if (noThesis.length) items.push({ id: "thesis", severity: 2, count: noThesis.length, tab: "journal",
    label: `${noThesis.length} open trade${noThesis.length > 1 ? "s" : ""} without a thesis`, detail: noThesis.map((t) => t.ticker).join(", ") });

  // Council "next action" stays visible for 7 days unless a newer session exists.
  if (council?.session?.verdict?.next_action && Date.now() - (council.at || 0) < 7 * 864e5)
    items.push({ id: "council", severity: 1, count: 1, tab: "council",
      label: "Council next action pending", detail: council.session.verdict.next_action });

  return items.sort((a, b) => b.severity - a.severity);
}

// ── Featured opportunity — single highest-conviction live idea ───
export function featuredOpportunity(opportunities = []) {
  const live = opportunities.filter((o) => o && ["new", "researching", "watching"].includes(o.status));
  return live.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null;
}

// ── Biggest risk — one featured risk, picked by severity ─────────
export function biggestRisk({ pfItems = [], journal = [], reviews = [], liveOf = () => null } = {}) {
  const cands = [];

  const flags = portfolioRiskFlags(pfItems);
  const themes = themeExposure(pfItems);
  const topTheme = themes[0];
  if (flags.some((f) => f.level === "high") && topTheme && topTheme.pct > 0.4)
    cands.push({ kind: "concentration", severity: 3, headline: `${topTheme.key} = ${(topTheme.pct * 100).toFixed(0)}% of portfolio`,
      detail: `${topTheme.count} position${topTheme.count > 1 ? "s" : ""} moving as one bet. ${flags.find((f) => f.level === "high")?.text || ""}`.trim(), tab: "dash" });
  else if (flags.length)
    cands.push({ kind: "concentration", severity: 2, headline: flags[0].text, detail: "From Portfolio Intelligence risk flags", tab: "dash" });

  const breached = openPositions(journal).filter((t) => thesisHealth(t, liveOf(t.ticker)).status === "broken");
  if (breached.length)
    cands.push({ kind: "trade", severity: 3, headline: `${breached.map((t) => t.ticker).join(", ")} breached the stop`,
      detail: "Price is past the planned invalidation level — act or re-underwrite", tab: "journal" });

  const cal = thesisCalibration(journal, reviews);
  if (cal.n >= 5 && cal.gap > 0.2)
    cands.push({ kind: "calibration", severity: 3, headline: `Confidence ${(cal.avgConfidence * 100).toFixed(0)}% vs accuracy ${(cal.actualAccuracy * 100).toFixed(0)}%`,
      detail: `Overconfident across ${cal.n} reviewed theses — size positions for the accuracy you have`, tab: "perf" });
  else if (cal.n >= 5 && Math.abs(cal.gap) > 0.2)
    cands.push({ kind: "calibration", severity: 2, headline: `Underconfident: accuracy ${(cal.actualAccuracy * 100).toFixed(0)}% vs stated ${(cal.avgConfidence * 100).toFixed(0)}%`,
      detail: "Your theses are better than you size them", tab: "perf" });

  const alpha = personalAlpha(journal);
  if (alpha.worstLeak)
    cands.push({ kind: "leak", severity: 2, headline: `${alpha.worstLeak.key} leaks ${alpha.worstLeak.expectancyR.toFixed(2)}R per trade`,
      detail: `${alpha.worstLeak.dimension} · ${alpha.worstLeak.withRisk} trades — your costliest repeatable pattern`, tab: "perf" });

  return cands.sort((a, b) => b.severity - a.severity)[0] || null;
}

// ── Mission briefing — 2-4 plain sentences from real data ────────
export function missionBriefing({ pfItems = [], journal = [], reviews = [], opportunities = [], liveOf = () => null } = {}) {
  const out = [];
  const themes = themeExposure(pfItems);
  if (themes[0] && themes[0].pct >= 0.35) out.push(`Portfolio concentrated in ${themes[0].key} (${(themes[0].pct * 100).toFixed(0)}%).`);

  const alpha = personalAlpha(journal);
  if (alpha.bestEdge) out.push(`${alpha.bestEdge.key} remains your strongest edge (+${alpha.bestEdge.expectancyR.toFixed(1)}R).`);
  if (alpha.worstLeak) out.push(`${alpha.worstLeak.key} is still leaking (${alpha.worstLeak.expectancyR.toFixed(1)}R).`);

  const q = actionQueue({ journal, reviews, opportunities, liveOf });
  const top = q[0];
  if (top) out.push(top.label + ".");
  const second = q.find((i) => i.id !== top?.id && i.severity >= 2);
  if (second && out.length < 4) out.push(second.label + ".");

  if (!out.length) out.push(journal.length || opportunities.length ? "All clear — no pending actions. Generate opportunities or convene the Council."
    : "Empty desk. Add holdings, generate opportunities, and log your first trade to bring Mission Control online.");
  return out.slice(0, 4);
}

// ── Investor IQ snapshot ─────────────────────────────────────────
export function iqSnapshot(journal = [], reviews = []) {
  const valid = reviews.filter((r) => r && !r.error);
  const ts = thesisStats(valid);
  const cal = thesisCalibration(journal, valid);
  const scored = valid.map(processScore).filter((s) => Number.isFinite(s));
  const good = valid.filter((r) => String(r.verdict || "").startsWith("good_process"));
  return {
    n: ts.n,
    thesisAccuracy: ts.accuracy,
    processAvg: scored.length ? scored.reduce((s, x) => s + x, 0) / scored.length : null,
    goodProcessRate: valid.length ? good.length / valid.length : null,
    calibration: cal,
  };
}

// ── Personal Alpha snapshot ──────────────────────────────────────
const bestWorst = (alpha, dimId) => {
  const d = alpha.dims.find((x) => x.id === dimId);
  const ok = (d?.groups || []).filter((g) => g.withRisk >= alpha.minSample);
  if (!ok.length) return { best: null, worst: null };
  const sorted = [...ok].sort((a, b) => b.expectancyR - a.expectancyR);
  return { best: sorted[0], worst: sorted.length > 1 ? sorted[sorted.length - 1] : null };
};
export function alphaSnapshot(journal = []) {
  const alpha = personalAlpha(journal);
  const sector = bestWorst(alpha, "sector");
  const thesis = bestWorst(alpha, "thesis");
  return { bestEdge: alpha.bestEdge, worstLeak: alpha.worstLeak,
    bestSector: sector.best, worstSector: sector.worst, bestThesisType: thesis.best, closed: alpha.closed };
}

// ── Learning loop — latest lesson / mistake / verdict / trend ────
export function learningLoop(journal = [], reviews = []) {
  const valid = reviews.filter((r) => r && !r.error);
  const closedAt = new Map(journal.map((t) => [t.id, Date.parse(t.closedAt || t.date || 0) || 0]));
  const ordered = [...valid].sort((a, b) => (closedAt.get(b.trade_id) || 0) - (closedAt.get(a.trade_id) || 0));
  const latest = ordered[0] || null;
  const lesson = latest ? [...(latest.lessons?.improve || []), ...(latest.lessons?.continue || [])][0] || null : null;
  const mistakes = recurringMistakes(valid);
  // Process trend: mean of last 3 reviews vs the 3 before them.
  const scores = ordered.map(processScore).filter(Number.isFinite);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const trend = scores.length >= 4 ? mean(scores.slice(0, 3)) - mean(scores.slice(3, 6)) : null;
  return {
    recentLesson: lesson,
    commonMistake: mistakes[0] || null,
    lastVerdict: latest?.verdict ? { key: latest.verdict, label: VERDICT_LABEL[latest.verdict] || latest.verdict, ticker: journal.find((t) => t.id === latest.trade_id)?.ticker || null } : null,
    lastThesisVerdict: latest ? finalVerdict(latest) : null,
    processTrend: trend, // >0 improving, <0 declining, null = not enough data
  };
}

// ── Research pipeline (P3) — what the AI analyst is working on ───
// Stage counts plus the items waiting on each actor: the analyst (researching,
// with task progress), the Council (researched, awaiting debate — including
// reconvenes where demanded research is now complete), and the user (ready).
export function researchPipeline(opportunities = [], journal = []) {
  const lens = personalLens(journal);
  const live = opportunities.filter((o) => o && pipelineState(o) !== "archived");
  const by = (s) => live.filter((o) => pipelineState(o) === s);
  const councilQueue = by("council_review");
  return {
    discovered: by("discovered").length,
    researching: by("researching").map((o) => ({ ticker: o.ticker, progress: taskProgress(o.research_tasks || []) })),
    councilReady: councilQueue.length,
    reconvene: councilQueue.filter((o) => o.council_verdict && researchDone(o.research_tasks || [])).length,
    ready: by("ready").map((o) => ({ ticker: o.ticker, verdict: o.council_verdict || null, composite: scoreOpportunity(o, lens).composite })),
    logged: by("logged").length,
  };
}

// ── Latest Council session (display-only read of Council's store) ─
export function lastCouncil(store, userId) {
  try { const rec = JSON.parse(store.getItem(`tradeiq_council_last_${userId}`)); return rec?.session?.verdict ? rec : null; }
  catch { return null; }
}

// ── Portfolio command-center stats ───────────────────────────────
export function commandStats(pfItems = [], holdings = [], journal = []) {
  const con = concentration(pfItems);
  const themes = themeExposure(pfItems);
  return {
    positions: holdings.length,
    openTrades: openPositions(journal).length,
    largest: con.largest ? { ticker: con.largest.ticker, pct: con.top1Pct } : null,
    topTheme: themes[0] || null,
    effectiveN: con.effectiveN || null,
    top3Pct: con.top3Pct || null,
    flags: portfolioRiskFlags(pfItems),
    themes, // for the detail drill-down
  };
}
