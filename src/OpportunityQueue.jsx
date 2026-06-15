// ─── OPPORTUNITY QUEUE VIEW — the CIO Engine's ranking layer ──────────────────
// "What's the highest-value investing action to take next?" Every lead is a
// verifiable fact reasoned across your own data — no scraping, no invented numbers.
import { C, T } from "./theme.js";

const KIND = {
  conviction_gap: { i: "🎯", c: C.green }, stale_thesis: { i: "🕰️", c: C.gold },
  undecided_research: { i: "❓", c: C.blue }, rule_violation: { i: "⚠️", c: C.red },
  no_stop: { i: "🛑", c: C.red }, rule_review: { i: "↻", c: C.gold },
};

export default function OpportunityQueue({ leads = [], gated = [] }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>🎯 Opportunity Queue</div>
      <div style={{ fontSize: T.caption, color: C.muted, marginBottom: 16, maxWidth: 660 }}>
        The CIO Engine's ranking layer — the highest-value next actions, reasoned across your <b style={{ color: C.text }}>own</b> decisions, theses, holdings and outcomes. Every item is a fact you can verify; there are no scraped signals and no invented “$ upside”. Ranked by what's observable.
      </div>

      {leads.length === 0 ? (
        <div style={{ background: C.s1, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 22, textAlign: "center", color: C.muted, fontSize: T.data }}>
          Nothing pressing right now — your book, theses and rules are consistent. As you trade, research, and record decisions, this queue fills with the next best action.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {leads.map((l) => { const k = KIND[l.kind] || { i: "•", c: C.muted }; return (
            <div key={l.id} style={{ background: C.s2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.c}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 14, color: C.text }}>{k.i} {l.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 54, height: 5, background: C.dim, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${l.priority}%`, height: "100%", background: k.c }} /></div>
                  <span style={{ fontSize: T.micro, color: C.muted, fontFamily: C.mono }}>{l.priority}</span>
                </div>
              </div>
              <div style={{ margin: "8px 0 6px", display: "grid", gap: 3 }}>
                {l.reasons.map((r, i) => <div key={i} style={{ fontSize: T.caption, color: C.muted }}>✓ {r}</div>)}
              </div>
              <div style={{ fontSize: T.caption, fontWeight: 700, color: k.c }}>→ {l.action}</div>
            </div>
          ); })}
        </div>
      )}

      {gated.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {gated.map((g, i) => (
            <div key={i} style={{ background: C.s1, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: T.data, fontWeight: 700, color: C.muted }}>🔒 {g.title}</div>
              <div style={{ marginTop: 5, display: "grid", gap: 3 }}>{g.reasons.map((r, j) => <div key={j} style={{ fontSize: T.caption, color: C.dim }}>{r}</div>)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: T.caption, color: C.dim, borderTop: `1px solid ${C.border}`, paddingTop: 12, lineHeight: 1.6 }}>
        <b style={{ color: C.muted }}>Next pillar — Hypothesis Hunter.</b> Legally-obtainable external signals (insider filings, earnings revisions, macro regime) will feed this same queue as <i>research leads</i> — “this deserves investigation,” never “this will outperform” — routed through Research → Council before any decision. See <code>docs/ARCHITECTURE-PILLARS.md</code>.
      </div>
    </div>
  );
}
