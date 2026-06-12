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
