// ─── OPPORTUNITY QUEUE VIEW — WORLD (what to look at) + PORTFOLIO (what to do) ──
// Two sections. WORLD = research candidates the system found to INVESTIGATE
// (never buy calls). PORTFOLIO = the highest-value actions reasoned across your
// own data. Every item is a verifiable fact — no scraping, no invented numbers.
import { C, T } from "./theme.js";
import { shortName } from "./stock.js";

const DISP = { surfaced: { l: "ignored", c: C.muted }, investigated: { l: "investigated", c: C.blue }, rejected: { l: "rejected", c: C.gold }, traded: { l: "traded", c: C.green } };
const fmtD = (d) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return ""; } };

const KIND = {
  // world
  discovered_idea: { i: "💡", c: C.blue }, rs_leader: { i: "📈", c: C.green },
  // portfolio
  conviction_gap: { i: "🎯", c: C.green }, stale_thesis: { i: "🕰️", c: C.gold },
  undecided_research: { i: "❓", c: C.blue }, rule_violation: { i: "⚠️", c: C.red },
  no_stop: { i: "🛑", c: C.red }, rule_review: { i: "↻", c: C.gold },
};

function LeadCard({ l }) {
  const k = KIND[l.kind] || { i: "•", c: C.muted };
  return (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.c}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 14, color: C.text }}>{k.i} {l.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {l.status === "research_candidate" && <span style={{ fontSize: T.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.blue, background: C.blue + "1a", border: `1px solid ${C.blue}44`, borderRadius: 999, padding: "1px 7px" }}>research candidate</span>}
          <div style={{ width: 54, height: 5, background: C.dim, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${l.priority}%`, height: "100%", background: k.c }} /></div>
          <span style={{ fontSize: T.micro, color: C.muted, fontFamily: C.mono }}>{l.priority}</span>
        </div>
      </div>
      <div style={{ margin: "8px 0 6px", display: "grid", gap: 3 }}>
        {l.reasons.map((r, i) => <div key={i} style={{ fontSize: T.caption, color: C.muted }}>✓ {r}</div>)}
      </div>
      <div style={{ fontSize: T.caption, fontWeight: 700, color: k.c }}>→ {l.action}</div>
    </div>
  );
}

const SectionHead = ({ children, sub }) => (
  <div style={{ margin: "4px 0 8px" }}>
    <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>{children}</div>
    {sub && <div style={{ fontSize: T.caption, color: C.dim, marginTop: 2 }}>{sub}</div>}
  </div>
);

export default function OpportunityQueue({ world = [], portfolio = [], gated = [], memory = [], memoryStats = null }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>🎯 Opportunity Queue</div>
      <div style={{ fontSize: T.caption, color: C.muted, marginBottom: 18, maxWidth: 680 }}>
        Two questions, answered every time you open it: <b style={{ color: C.text }}>what should I look at?</b> (World) and <b style={{ color: C.text }}>what should I do?</b> (Portfolio). World items are <i>research candidates</i> to investigate — never buy calls; portfolio items are actions reasoned across your own data. Verifiable facts only — no scraping, no invented “$ upside”.
      </div>

      {/* WORLD — primary section: things to investigate */}
      <div style={{ marginBottom: 20 }}>
        <SectionHead sub="Found in the market — investigate via Research → Council, never an instruction to buy.">🌐 World · research candidates</SectionHead>
        {world.length === 0 ? (
          <div style={{ background: C.s1, border: `1px dashed ${C.border}`, borderRadius: 10, padding: 16, color: C.muted, fontSize: T.caption }}>
            No world candidates surfaced right now. Generate ideas in Opportunities, or refresh prices — relative-strength leaders and AI-surfaced theses appear here. <span style={{ color: C.dim }}>(V2 adds insider filings, earnings revisions and macro shifts.)</span>
          </div>
        ) : <div style={{ display: "grid", gap: 10 }}>{world.map((l) => <LeadCard key={l.id} l={l} />)}</div>}
      </div>

      {/* PORTFOLIO — actions across your own data */}
      <div>
        <SectionHead sub="The highest-value next action on what you already own and decided.">📁 Portfolio · actions</SectionHead>
        {portfolio.length === 0 ? (
          <div style={{ background: C.s1, border: `1px dashed ${C.border}`, borderRadius: 10, padding: 16, color: C.muted, fontSize: T.caption }}>
            Nothing pressing — your book, theses and rules are consistent. As you trade and record decisions, this fills with the next best action.
          </div>
        ) : <div style={{ display: "grid", gap: 10 }}>{portfolio.map((l) => <LeadCard key={l.id} l={l} />)}</div>}
      </div>

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

      {/* OPPORTUNITY MEMORY — what we surfaced & what happened (incl. what you ignored) */}
      {(memory.length > 0 || (memoryStats && memoryStats.locked)) && (
        <div style={{ marginTop: 22 }}>
          <SectionHead sub="Every candidate we surfaced, what you did with it, and what the price did after — so the queue learns what's worth surfacing.">🧠 Opportunity Memory</SectionHead>
          {memoryStats && (memoryStats.locked ? (
            <div style={{ background: C.s1, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "11px 13px", marginBottom: 10 }}>
              <div style={{ fontSize: T.data, fontWeight: 700, color: C.muted }}>🔒 Learning locked — {memoryStats.n}/{memoryStats.minSample} priced records</div>
              <div style={{ marginTop: 4, fontSize: T.caption, color: C.dim }}>Avg performance by opportunity-type & by disposition (ignored / investigated / rejected) unlocks with more data.</div>
            </div>
          ) : (
            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginBottom: 10 }}>
              <div style={{ fontSize: T.caption, color: C.muted, marginBottom: 5 }}>Avg subsequent performance ({memoryStats.n} records):</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {memoryStats.byKind.map((k) => <span key={k.k} style={{ fontSize: T.caption }}><span style={{ color: C.muted }}>{k.k.replace(/_/g, " ")}</span> <b style={{ color: k.avg >= 0 ? C.green : C.red }}>{k.avg >= 0 ? "+" : ""}{k.avg}%</b> <span style={{ color: C.dim }}>(n{k.n})</span></span>)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 5 }}>
                {memoryStats.byDisposition.map((d) => <span key={d.k} style={{ fontSize: T.caption }}><span style={{ color: (DISP[d.k] || {}).c || C.muted }}>{(DISP[d.k] || {}).l || d.k}</span> <b style={{ color: d.avg >= 0 ? C.green : C.red }}>{d.avg >= 0 ? "+" : ""}{d.avg}%</b> <span style={{ color: C.dim }}>(n{d.n})</span></span>)}
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gap: 5 }}>
            {memory.slice(0, 30).map((r) => { const d = DISP[r.status] || DISP.surfaced; return (
              <div key={r.id} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span><span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 13 }}>{shortName(r.ticker)}</span><span style={{ color: C.muted, fontSize: T.caption, marginLeft: 8 }}>{(r.kind || "").replace(/_/g, " ")} · surfaced {fmtD(r.surfaced_at)}</span></span>
                <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontSize: T.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: d.c }}>{d.l}</span>
                  {r.perf_pct != null && <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 13, color: r.perf_pct >= 0 ? C.green : C.red }}>{r.perf_pct >= 0 ? "+" : ""}{r.perf_pct}%</span>}
                </span>
              </div>
            ); })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: T.caption, color: C.dim, borderTop: `1px solid ${C.border}`, paddingTop: 12, lineHeight: 1.6 }}>
        <b style={{ color: C.muted }}>World V1</b> uses only legally-clean data TradeIQ already has (AI-surfaced ideas + relative-strength from live prices). <b style={{ color: C.muted }}>V2</b> expands coverage — insider Form 4, XBRL buybacks, earnings revisions, macro regime (EDGAR is already integrated) — once we prove which signals actually generate worthwhile research. Never a news feed. See <code>docs/ARCHITECTURE-PILLARS.md</code>.
      </div>
    </div>
  );
}
