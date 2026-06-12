// ─── OPPORTUNITY PIPELINE — the analyst desk board (UI) ──────────────────────
// Five columns (Discovered → Researching → Council Review → Ready → Archived)
// rendered from pipeline.js state + scores. Every card shows the composite
// score, research progress, council status and risk — the user sees the AI's
// work happening and only has to decide. All domain logic lives in pipeline.js
// and analyst.js; this file is presentation + action dispatch only.
import { useMemo, useState } from "react";
import { C, T } from "./theme.js";
import { TickerID } from "./ui.jsx";
import { BOARD_COLUMNS, STATE_LABEL, boardColumn, pipelineState, personalLens, scoreOpportunity } from "./pipeline.js";
import { taskProgress, queuedTasks } from "./analyst.js";
import { sourceCount } from "./sources.js";
import { opportunityReturn } from "./opportunities.js";

const COL_TONE = { discovered: C.blue, researching: C.purple, council_review: C.gold, ready: C.green, archived: C.dim };
const RISK_COL = { low: C.green, medium: C.gold, high: C.red };

const Chip = ({ c, children, title }) => (
  <span title={title} style={{ display: "inline-block", fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, background: c + "16", color: c, border: `1px solid ${c}30`, whiteSpace: "nowrap" }}>{children}</span>
);
const Act = ({ onClick, color = C.accent, solid, disabled, children }) => (
  <button className="tiq-btn" disabled={disabled} onClick={onClick} style={{ background: solid ? color : color + "14", border: solid ? "none" : `1px solid ${color}3a`, borderRadius: 6, color: solid ? C.bg : color, fontFamily: C.display, fontWeight: 700, fontSize: T.micro, letterSpacing: "0.07em", textTransform: "uppercase", padding: "6px 10px", whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>{children}</button>
);
const ScoreKv = ({ label, value, color }) => (
  <div style={{ textAlign: "center", minWidth: 0 }}>
    <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 13, color: color || C.text }}>{value == null ? "—" : value}</div>
    <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{label}</div>
  </div>
);

function Card({ opp, scores, live, busy, onResearch, onOpenWorkspace, onCouncil, onLog, onMove }) {
  const state = pipelineState(opp);
  const prog = taskProgress(opp.research_tasks || []);
  const queued = queuedTasks(opp.research_tasks || []).length;
  const ret = live ? opportunityReturn(opp, live.price) : null;
  const vc = opp.council_verdict ? (opp.council_verdict.includes("Buy") ? C.green : opp.council_verdict.includes("Avoid") ? C.red : C.gold) : null;
  const compCol = scores.composite >= 65 ? C.green : scores.composite >= 45 ? C.gold : C.muted;
  return (
    <div className="tiq-card" style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 9, padding: 11, opacity: state === "archived" ? 0.65 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
        <TickerID size="row" symbol={opp.ticker} name={opp.name} currency={opp.currency} nameMax={80} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 19, color: compCol, lineHeight: 1 }}>{scores.composite}</div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>Score</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {opp.thesis_type && <Chip c={C.accent}>{opp.thesis_type}</Chip>}
        <Chip c={RISK_COL[opp.risk_level] || C.gold}>{(opp.risk_level || "med")} risk</Chip>
        {opp.status === "watching" && <Chip c={C.blue}>watching</Chip>}
        {opp.status === "logged" && <Chip c={C.green}>logged</Chip>}
        {sourceCount(opp.research_sources) > 0 && <Chip c={C.blue} title="Real news + filings cited by the last research run">🗞 {sourceCount(opp.research_sources)} sources</Chip>}
        {ret != null && <Chip c={ret >= 0 ? C.green : C.red}>{ret >= 0 ? "+" : ""}{ret.toFixed(1)}% since gen</Chip>}
      </div>
      {/* Score strip: the four components behind the composite */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 4px", marginBottom: 8 }}>
        <ScoreKv label="Edge" value={scores.edge} color={scores.edge >= 60 ? C.green : C.text} />
        <ScoreKv label="Research" value={scores.research} color={scores.research >= 60 ? C.green : scores.research >= 35 ? C.gold : C.muted} />
        <ScoreKv label="Council" value={scores.council} color={vc || C.dim} />
        <ScoreKv label="Risk" value={scores.risk} color={scores.risk >= 65 ? C.red : scores.risk >= 45 ? C.gold : C.green} />
      </div>
      {/* Research progress — visible work */}
      {prog.total > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: T.micro, color: C.muted, marginBottom: 3 }}>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Research</span>
            <span>{prog.done}/{prog.total} tasks{queued ? ` · ${queued} queued` : ""}</span>
          </div>
          <div style={{ height: 4, background: C.dim, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${prog.pct * 100}%`, height: "100%", background: C.purple }} /></div>
        </div>
      )}
      {opp.council_verdict && (
        <div style={{ fontSize: T.caption, color: vc, marginBottom: 8 }}>⚖ Council: <b>{opp.council_verdict}</b> ({opp.council_confidence ?? "—"}%)</div>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        {state === "discovered" && <>
          <Act solid color={C.purple} disabled={busy} onClick={() => onResearch(opp)}>{busy ? "Researching…" : "🔬 Research"}</Act>
          <Act color={C.gold} onClick={() => onCouncil(opp)}>⚖ Council</Act>
        </>}
        {state === "researching" && <>
          {queued > 0 && <Act solid color={C.purple} disabled={busy} onClick={() => onResearch(opp)}>{busy ? "Researching…" : "▶ Run AI research"}</Act>}
          <Act color={C.purple} onClick={() => onOpenWorkspace(opp)}>Workspace</Act>
          <Act color={C.gold} onClick={() => onMove(opp.id, "council_review")}>→ Council review</Act>
        </>}
        {state === "council_review" && <>
          <Act solid color={C.gold} onClick={() => onCouncil(opp)}>{opp.council_verdict ? "⚖ Reconvene" : "⚖ Convene Council"}</Act>
          {queued > 0 && <Act color={C.purple} disabled={busy} onClick={() => onResearch(opp)}>{busy ? "…" : "▶ Research"}</Act>}
          <Act color={C.purple} onClick={() => onOpenWorkspace(opp)}>Brief</Act>
        </>}
        {(state === "ready" || state === "logged") && <>
          {state === "ready" && <Act solid color={C.green} onClick={() => onLog(opp)}>Log Trade →</Act>}
          <Act color={C.purple} onClick={() => onOpenWorkspace(opp)}>Brief</Act>
          {state === "ready" && <Act color={C.gold} onClick={() => onMove(opp.id, "researching")}>↩ More research</Act>}
        </>}
        {state === "archived"
          ? <Act color={C.blue} onClick={() => onMove(opp.id, "discovered")}>Restore</Act>
          : <Act color={C.muted} onClick={() => onMove(opp.id, "archived")}>Archive</Act>}
      </div>
    </div>
  );
}

export default function OpportunityPipeline({ opportunities = [], liveData = {}, journal = [], marketTab, generating, researchingId, onGenerate, onResearch, onOpenWorkspace, onCouncil, onLog, onMove }) {
  const [showArchived, setShowArchived] = useState(false);
  const lens = useMemo(() => personalLens(journal), [journal]);
  const cols = useMemo(() => {
    const m = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, []]));
    for (const o of opportunities) if (o) (m[boardColumn(o)] || m.discovered).push({ opp: o, scores: scoreOpportunity(o, lens) });
    for (const c of BOARD_COLUMNS) m[c].sort((a, b) => b.scores.composite - a.scores.composite);
    return m;
  }, [opportunities, lens]);
  const main = BOARD_COLUMNS.filter((c) => c !== "archived");

  return (
    <div>
      <style>{`
        .pipe-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(265px,1fr);gap:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;align-items:start;padding-bottom:6px;scroll-snap-type:x proximity;}
        .pipe-board>section{scroll-snap-align:start;}
        @media(max-width:700px){
          /* phones: the board stacks — a 5-column sideways scroll is unusable one-handed */
          .pipe-board{grid-auto-flow:row;grid-auto-columns:unset;grid-template-columns:1fr;overflow-x:visible;}
          .pipe-empty-hint{display:none;}
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 17 }}>Opportunity Pipeline</div>
          <div style={{ fontSize: 11, color: C.muted }}>The AI finds and researches — you decide. Ranked by composite score{lens.bestEdge ? ` · personalized to your proven edge (${lens.bestEdge.key})` : ` · personalizes after ${Math.max(0, 5 - lens.closed)} more closed trades`}.</div>
        </div>
        <button className="tiq-btn" disabled={generating} onClick={onGenerate} style={{ background: generating ? C.muted + "30" : `linear-gradient(135deg,${C.green},${C.green}d8)`, border: "none", borderRadius: 8, color: generating ? C.muted : C.bg, fontFamily: C.display, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", padding: "9px 17px", cursor: generating ? "not-allowed" : "pointer" }}>{generating ? "Discovering…" : `✨ Discover from ${marketTab === "us" ? "US" : "India"} watchlist`}</button>
      </div>
      <div style={{ fontSize: T.caption, color: C.gold, marginBottom: 12, lineHeight: 1.5 }}>⚠️ AI research separates fact from assumption from unknown — it has no filings. Unknowns stay unknowns; verify the primary sources before acting.</div>

      <div className="pipe-board">
        {main.map((col) => (
          <section key={col} style={{ background: C.s1, border: `1px solid ${C.border}`, borderTop: `2px solid ${COL_TONE[col]}`, borderRadius: 10, padding: 10, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ fontFamily: C.display, fontWeight: 700, fontSize: T.micro, letterSpacing: "0.14em", textTransform: "uppercase", color: COL_TONE[col] }}>{STATE_LABEL[col]}</span>
              <span style={{ fontSize: T.caption, color: C.dim, fontFamily: C.mono }}>{cols[col].length}</span>
            </div>
            {cols[col].length === 0
              ? <div className="pipe-empty-hint" style={{ fontSize: T.caption, color: C.dim, lineHeight: 1.6, padding: "8px 2px" }}>{col === "discovered" ? "Hit Discover — the AI scans your watchlist for expectation gaps." : col === "researching" ? "Start research on a discovered idea." : col === "council_review" ? "Researched ideas await the Council here." : "Council-approved ideas land here for your decision."}</div>
              : cols[col].map(({ opp, scores }) => (
                <div key={opp.id} style={{ marginBottom: 9 }}>
                  <Card opp={opp} scores={scores} live={liveData[opp.ticker]} busy={researchingId === opp.id}
                    onResearch={onResearch} onOpenWorkspace={onOpenWorkspace} onCouncil={onCouncil} onLog={onLog} onMove={onMove} />
                </div>
              ))}
          </section>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={() => setShowArchived((s) => !s)} style={{ background: "none", border: "none", color: C.muted, fontSize: T.caption, cursor: "pointer", fontFamily: C.mono }}>
          {showArchived ? "▾" : "▸"} Archived ({cols.archived.length})
        </button>
        {showArchived && cols.archived.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(265px,1fr))", gap: 9, marginTop: 8 }}>
            {cols.archived.map(({ opp, scores }) => (
              <Card key={opp.id} opp={opp} scores={scores} live={liveData[opp.ticker]} busy={false}
                onResearch={onResearch} onOpenWorkspace={onOpenWorkspace} onCouncil={onCouncil} onLog={onLog} onMove={onMove} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
