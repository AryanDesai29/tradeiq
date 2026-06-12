// ─── MISSION CONTROL USAGE TELEMETRY (local-only) ────────────────
// Counts which panels/actions actually get used so Phase 2 is shaped by
// real behavior, not guesses. Privacy: data never leaves the browser —
// localStorage only, per user, no network calls. Inspect anytime via
// `tiqUsage()` in the browser console.

const KEY = (uid) => `tradeiq_mc_usage_${uid}`;

// Known instrumented click points — anything here with zero count after a
// week of use is a candidate for demotion in Phase 2.
export const MC_KEYS = [
  "command.exposure",   // exposure detail toggle opened
  "risk.inspect",       // Biggest Risk → Inspect
  "action.breached", "action.review", "action.opps", "action.evidence", "action.thesis", "action.council", // Action Required rows
  "opp.openCouncil", "opp.openResearch", "opp.logTrade", // Best Opportunity CTAs
  "iq.drill", "alpha.drill", // snapshot → full analytics
  "council.open",       // Council Briefing → Open Council
];

export function track(store, userId, key, now = Date.now()) {
  try {
    const k = KEY(userId);
    const d = JSON.parse(store.getItem(k) || "null") || { since: now, events: {} };
    const e = d.events[key] || { count: 0, lastAt: 0 };
    d.events[key] = { count: e.count + 1, lastAt: now };
    store.setItem(k, JSON.stringify(d));
    return d.events[key].count;
  } catch { return 0; }
}

// Sorted usage report: most-clicked first, plus instrumented keys never
// clicked at all ("most ignored" is the absence, not a separate counter).
export function usageSummary(store, userId, known = MC_KEYS) {
  try {
    const d = JSON.parse(store.getItem(KEY(userId)) || "null") || { since: null, events: {} };
    const clicked = Object.entries(d.events)
      .map(([key, e]) => ({ key, count: e.count, lastAt: e.lastAt }))
      .sort((a, b) => b.count - a.count);
    return {
      since: d.since,
      total: clicked.reduce((s, x) => s + x.count, 0),
      clicked,
      never: known.filter((k) => !d.events[k]),
    };
  } catch { return { since: null, total: 0, clicked: [], never: [...known] }; }
}

// ─── FILING IMPACT TELEMETRY (P3.2, local-only) ──────────────────
// The question Phase 3.2 must answer: does reading filings actually improve
// research/council/decision quality, or is it just intellectually interesting?
// This is an EVENT LOG (not just counters) so impact can be attributed — which
// reads led to research that used the digest, which Council verdicts changed
// with a filing on the table, which trades followed a filing review. Privacy
// identical to above: localStorage only, never leaves the browser.

const FKEY = (uid) => `tradeiq_filing_events_${uid}`;
const FCAP = 1000;          // ring buffer
const FWINDOW = 90 * 864e5; // 90-day retention

export const FILING_EVENT_TYPES = [
  "filing_read_manual", "filing_read_council", "filing_digest_opened",
  "research_used_facts", "research_used_digest",
  "council_verdict_changed_after_filing", "trade_created_after_filing",
];

// Append one filing event. `payload` carries attribution context (ticker,
// accession, sectionsRead[], sectionsSkipped[], from/to verdict, …).
export function trackFiling(store, userId, type, payload = {}, now = Date.now()) {
  if (!FILING_EVENT_TYPES.includes(type)) return;
  try {
    const k = FKEY(userId);
    const d = JSON.parse(store.getItem(k) || "null") || { since: now, events: [] };
    d.events.push({ at: now, type, ...payload });
    d.events = d.events.filter((e) => now - e.at < FWINDOW).slice(-FCAP);
    store.setItem(k, JSON.stringify(d));
  } catch {}
}

export function filingEvents(store, userId) {
  try { return (JSON.parse(store.getItem(FKEY(userId)) || "null") || { events: [] }).events || []; }
  catch { return []; }
}

const tally = (arr) => {
  const m = new Map();
  for (const x of arr) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

// THE FILING INTELLIGENCE REPORT — pure aggregation of the event log into the
// metrics that reveal whether Filing Intelligence is genuinely valuable. Run
// after a 3-7 day validation period (console: `tiqFilings()`).
export function filingImpactReport(store, userId, now = Date.now()) {
  const events = filingEvents(store, userId);
  const of = (t) => events.filter((e) => e.type === t);
  const reads = [...of("filing_read_manual"), ...of("filing_read_council")];

  return {
    since: events.length ? events[0].at : null,
    days: events.length ? Math.max(1, Math.round((now - events[0].at) / 864e5)) : 0,
    totalReads: reads.length,
    manualReads: of("filing_read_manual").length,
    councilReads: of("filing_read_council").length,
    digestOpens: of("filing_digest_opened").length,
    // Which companies actually pull filing work.
    mostResearched: tally(reads.map((e) => e.ticker).filter(Boolean)).slice(0, 10),
    // Research that consumed real filing evidence (vs runs with none).
    researchUsedFacts: of("research_used_facts").length,
    researchUsedDigest: of("research_used_digest").length,
    // The sharpest value signal: Council verdicts that moved with a filing read.
    verdictChanges: of("council_verdict_changed_after_filing")
      .map((e) => ({ ticker: e.ticker, from: e.from, to: e.to, at: e.at })),
    // Decisions that followed a filing review.
    tradesAfterFiling: of("trade_created_after_filing").map((e) => e.ticker).filter(Boolean),
    // Section value proxy: what the pipeline READ vs what it SKIPPED across all
    // reads. "Valuable" = consistently read; "ignored" = consistently skipped.
    sectionsRead: tally(reads.flatMap((e) => e.sectionsRead || [])),
    sectionsSkipped: tally(reads.flatMap((e) => e.sectionsSkipped || [])),
  };
}
