// ─── OPPORTUNITY QUEUE (pure) — the CIO Engine's ranking layer ────────────────
//
// "What is the highest-value investing ACTION I should take next?" — answered by
// reasoning ACROSS TradeIQ's own first-party data (holdings, journal, theses,
// opportunities, decisions). No external data, no scraping, no fabrication: every
// lead is a deterministic cross-reference of facts that already exist, ranked by
// transparent OBSERVABLE components (position weight, staleness, conviction) and
// fully explained by its `reasons`. There is NO invented "$ upside" or composite
// hype score — `priority` is only a sort key, and the reasons are the truth.
//
// Leads are `source:"cio"`. This is the ranking layer the future Hypothesis Hunter
// (`source:"hypothesis"`) will feed into — same shape, same queue.
//
// Statistical claims that need a track record ("similar to past winners", "this
// rule's overrides outperform") are NOT asserted here — they're surfaced via
// gatedInsights() with an explicit "needs N more closed trades", per the
// Conditioning Rule. We never claim what the data can't yet support.

import { findConflicts, decisionLabel } from "./decisions.js";
import { shortName } from "./stock.js";

const DAY = 86400000;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const daysSince = (d, now) => (d ? Math.floor((now - new Date(d).getTime()) / DAY) : null);

export function opportunityQueue({ holdings = [], journal = [], opportunities = [], decisions = [], now = 0, fx = { USD: 1, INR: 1 / 84 } } = {}) {
  if (!now) now = 0; // caller passes Date.now(); 0 only in degenerate test cases
  const leads = [];
  const val = (h) => (Number(h.shares) || 0) * (Number(h.price) || 0) * (fx[h.currency] || 1);
  const total = holdings.reduce((s, h) => s + val(h), 0) || 0;
  const held = new Set(holdings.map((h) => h.ticker));
  const lastActivity = {};
  for (const t of journal) { const d = t.date ? new Date(t.date).getTime() : null; if (d && (!lastActivity[t.ticker] || d > lastActivity[t.ticker])) lastActivity[t.ticker] = d; }

  // 1) Conviction ↔ exposure gap — council-approved idea you don't actually hold.
  for (const o of opportunities) {
    const buy = o.council_verdict === "Strong Buy" || o.council_verdict === "Buy";
    const conf = o.council_confidence ?? 0;
    if (buy && conf >= 70 && !held.has(o.ticker)) {
      leads.push({ id: `gap_${o.ticker}`, source: "cio", kind: "conviction_gap", ticker: o.ticker,
        title: `High-conviction idea, no position: ${shortName(o.ticker)}`,
        reasons: [`Council ${o.council_verdict} @ ${conf}%`, "No position currently held", o.thesis_type ? `Thesis: ${o.thesis_type}` : null].filter(Boolean),
        action: "Size a starter position, or reject the thesis", priority: clamp(40 + (conf - 70) * 1.5) });
    }
  }

  // 2) Unreviewed large holding — biggest exposures going stale.
  for (const h of holdings) {
    const w = total > 0 ? val(h) / total : 0;
    const stale = daysSince(lastActivity[h.ticker], now);
    if (w >= 0.1 && (stale == null || stale >= 45)) {
      leads.push({ id: `stale_${h.ticker}`, source: "cio", kind: "stale_thesis", ticker: h.ticker,
        title: `Refresh ${shortName(h.ticker)} — ${Math.round(w * 100)}% of book, ${stale == null ? "no activity logged" : `${stale}d since last activity`}`,
        reasons: [`${Math.round(w * 100)}% portfolio weight`, stale == null ? "No journal activity recorded" : `${stale} days since last journal activity`],
        action: "Refresh the thesis", priority: clamp(35 + w * 50 + Math.min(30, (stale || 60) / 4)) });
    }
  }

  // 3) Undecided research — effort spent, no decision recorded.
  for (const o of opportunities) {
    const decided = ["logged", "archived", "dismissed"].includes(o.status);
    const researched = !!o.research_brief || !!o.researched_at;
    const age = daysSince(o.researched_at || o.generated_at, now);
    if (researched && !decided && age != null && age >= 21) {
      leads.push({ id: `undecided_${o.id || o.ticker}`, source: "cio", kind: "undecided_research", ticker: o.ticker,
        title: `Researched ${shortName(o.ticker)} ${age}d ago — no decision recorded`,
        reasons: ["Research brief exists", "Never logged, archived or rejected", `${age} days old`],
        action: "Decide: trade, watch, or reject", priority: clamp(30 + Math.min(35, age / 3)) });
    }
  }

  // 4) Rule violation in live state — you hold/trade something you decided to avoid.
  const subjects = [
    ...holdings.map((h) => ({ ticker: h.ticker, currency: h.currency, sector: h.sector })),
    ...journal.filter((t) => !t.closed).map((t) => ({ ticker: t.ticker, currency: t.currency, thesis_type: t.thesisType, sector: t.sector })),
  ];
  const seen = new Set();
  for (const s of subjects) {
    for (const d of findConflicts(decisions, s)) {
      const key = `${d.id}_${s.ticker}`; if (seen.has(key)) continue; seen.add(key);
      leads.push({ id: `rule_${key}`, source: "cio", kind: "rule_violation", ticker: s.ticker,
        title: `${shortName(s.ticker)} conflicts with a rule you set`,
        reasons: [`Your decision: “${decisionLabel(d)}”`, `You currently hold or trade ${shortName(s.ticker)}`],
        action: "Exit the position, or retire the rule", priority: 85 });
    }
  }

  // 5) Open position with no stop — undefined risk (Survival principle).
  for (const t of journal.filter((t) => !t.closed)) {
    if (!(Number(t.stop) > 0)) {
      leads.push({ id: `nostop_${t.id || t.ticker}`, source: "cio", kind: "no_stop", ticker: t.ticker,
        title: `Open ${shortName(t.ticker)} has no stop — undefined risk`,
        reasons: ["Position is open", "No stop-loss recorded"], action: "Set a stop", priority: 78 });
    }
  }

  // 6) A rule you keep overriding — a fact (count), NOT a performance claim.
  for (const d of decisions) {
    if ((d.challenged_count || 0) >= 4 && d.active !== false) {
      leads.push({ id: `ruleworn_${d.id}`, source: "cio", kind: "rule_review",
        title: `A rule you keep overriding (${d.challenged_count}×)`,
        reasons: [`“${decisionLabel(d)}”`, `Overridden ${d.challenged_count} times`, "Is it still your rule?"],
        action: "Reaffirm or retire this rule", priority: clamp(40 + d.challenged_count * 4) });
    }
  }

  leads.sort((a, b) => b.priority - a.priority);
  return leads;
}

// ─── WORLD candidates ("monitor the world") — research LEADS, never buy calls ──
// The Hypothesis Hunter's V1 surface, built ONLY from data TradeIQ already has
// (no scraping, no fabrication, India-compatible). Each item is a "research
// candidate" → investigate via Research → Council; it never asserts alpha.
//   V1 signals: (a) AI-surfaced ideas not yet acted on; (b) relative-strength /
//   momentum leaders from the watchlist's live prices.
//   V2 (deferred, per docs/ARCHITECTURE-PILLARS.md): insider Form 4, XBRL
//   buybacks, earnings revisions via EDGAR (US) — once proven worthwhile.
export function worldCandidates({ watchlist = [], opportunities = [], holdings = [], limit = 6 } = {}) {
  const held = new Set(holdings.map((h) => h.ticker));
  const oppTickers = new Set(opportunities.map((o) => o.ticker));
  const out = [];

  // (a) AI-surfaced ideas the investor hasn't acted on yet.
  for (const o of opportunities) {
    const undecided = !["logged", "archived", "dismissed"].includes(o.status) && !o.research_brief;
    if (undecided && !held.has(o.ticker)) {
      out.push({ id: `world_opp_${o.id || o.ticker}`, source: "world", kind: "discovered_idea", ticker: o.ticker, status: "research_candidate",
        title: `${shortName(o.ticker)} — ${o.thesis_type || "idea"} (AI-surfaced)`,
        reasons: [o.reality_hypothesis || o.market_expectations || "Surfaced by Opportunity Discovery", o.confidence != null ? `Model conviction ${o.confidence}%` : null].filter(Boolean),
        action: "Investigate (research → council)", priority: clamp(40 + (o.confidence || 0) * 0.3) });
    }
  }

  // (b) Relative-strength leaders from live prices — uptrend with room, not held,
  // not already on the board. Deterministic, India-friendly, never a "buy".
  for (const w of watchlist) {
    if (!w || w.price == null || held.has(w.ticker) || oppTickers.has(w.ticker)) continue;
    const uptrend = w.ema200 && w.ema20 && w.price > w.ema200 && w.ema20 > w.ema200;
    if (uptrend && w.rsi >= 52 && w.rsi <= 66) {
      out.push({ id: `world_rs_${w.ticker}`, source: "world", kind: "rs_leader", ticker: w.ticker, status: "research_candidate",
        title: `${shortName(w.ticker)} — momentum / relative-strength leader`,
        reasons: ["Price above 200-EMA; 20-EMA above 200-EMA (established uptrend)", `RSI ${w.rsi} — strength with room to run`, w.chg != null ? `${w.chg >= 0 ? "+" : ""}${w.chg}% today` : null].filter(Boolean),
        action: "Investigate (research → council)", priority: clamp(35 + (w.rsi - 52) * 1.2) });
    }
  }

  out.sort((a, b) => b.priority - a.priority);
  return out.slice(0, limit);
}

// Statistical insights are LOCKED until the track record can support them — we
// surface the lock honestly rather than fabricate the claim (Conditioning Rule).
export function gatedInsights({ journal = [] } = {}, minClosed = 30) {
  const closed = journal.filter((t) => t.closed).length;
  if (closed >= minClosed) return [];
  return [{
    kind: "gated", locked: true,
    title: "Pattern insights locked — need more closed trades",
    reasons: [`${closed}/${minClosed} closed trades`, "“Similar to past winners” and “this rule's overrides outperform” need a real sample first"],
  }];
}
