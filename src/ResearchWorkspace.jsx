import { useState } from "react";
import { THESIS_TYPES } from "./thesis.js";
import { addEvidence, removeEvidence, researchScore, researchReady } from "./research.js";
import { TASK_LABEL, makeTask, mergeTasks, queuedTasks, taskProgress } from "./analyst.js";

// ─── RESEARCH WORKSPACE 2.0 — active, not passive ──────────────────────────────
// The original workspace (user edits thesis, logs evidence) plus the Research
// Analyst Engine: queued research tasks (default playbook, Council demands, or
// the user's own questions), one-click AI research runs, and the structured
// brief with facts / assumptions / opinions / speculation / unknowns kept
// strictly separate. Reuses the thesis schema so research still flows into the
// Journal → Reviews → Investor IQ → Personal Alpha with no translation.
const RISK_LEVELS = ["low", "medium", "high"];

export default function ResearchWorkspace({ opp, theme: C, onSave, onCreateTrade, onClose, onRunResearch, researching }) {
  const [d, setD] = useState(() => ({
    ...opp,
    evidence_log: Array.isArray(opp.evidence_log) ? opp.evidence_log : [],
    research_tasks: Array.isArray(opp.research_tasks) ? opp.research_tasks : [],
  }));
  const [ev, setEv] = useState("");
  const [tq, setTq] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setD((p) => ({ ...p, [k]: v })); setSaved(false); };
  const score = researchScore(d), ready = researchReady(d);
  const scoreCol = score >= 0.8 ? C.green : score >= 0.5 ? C.gold : C.muted;
  const riskCol = { low: C.green, medium: C.gold, high: C.red };
  const prog = taskProgress(d.research_tasks);
  const queued = queuedTasks(d.research_tasks).length;
  const brief = d.research_brief;

  const addEv = () => { const log = addEvidence(d.evidence_log, ev, new Date().toISOString()); set("evidence_log", log); setEv(""); };
  const addTask = () => { const t = makeTask({ question: tq, source: "user" }, new Date().toISOString()); if (!t) return; set("research_tasks", mergeTasks(d.research_tasks, [t])); setTq(""); };
  const run = async () => { const patch = await onRunResearch?.(d); if (patch) setD((p) => ({ ...p, ...patch })); };

  const ta = { background: C.s1, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 11px", color: C.text, fontFamily: C.mono, fontSize: 13, width: "100%", resize: "vertical", lineHeight: 1.5 };
  const lbl = { fontSize: 11, color: C.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.1em" };
  const Field = ({ k, label, ph, h = 60 }) => (
    <div style={{ flex: 1, minWidth: 220, marginBottom: 10 }}>
      <div style={lbl}>{label}</div>
      <textarea style={{ ...ta, height: h }} maxLength={800} placeholder={ph} value={d[k] || ""} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  const TASK_DOT = { queued: C.gold, running: C.blue, done: C.green, failed: C.red };
  const SRC_TAG = { auto: "playbook", council: "⚖ council", user: "you" };
  // The anti-hallucination contract, rendered: each epistemic class is its own list.
  const BRIEF_SECTIONS = [
    ["key_findings", "Key Findings", C.text], ["facts", "Facts", C.green], ["assumptions", "Assumptions", C.gold],
    ["opinions", "Opinions", C.blue], ["speculation", "Speculation", C.purple], ["unknowns", "Unknowns", C.red],
    ["risks", "Risks", C.red], ["missing_evidence", "Missing Evidence", C.gold],
    ["next_questions", "Next Research Questions", C.accent], ["council_questions", "Council Follow-Ups", C.accent],
  ];
  const Meter = ({ label, v }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <div style={{ width: 56, height: 5, background: C.dim, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${v}%`, height: "100%", background: v >= 60 ? C.green : v >= 35 ? C.gold : C.red }} /></div>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{v}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(3,6,11,0.78)", display: "flex", justifyContent: "center", alignItems: "flex-start", overflow: "auto", padding: "min(24px, 4vw) min(16px, 1.5vw)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 860, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 32px)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.s1, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.display, fontWeight: 800, fontSize: 16 }}>{d.ticker}</span>
          <span style={{ fontSize: 11, color: C.muted }}>{d.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>· Research Workspace</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 70, height: 5, background: C.dim, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${score * 100}%`, height: "100%", background: scoreCol }} /></div>
              <span style={{ fontSize: 11, color: scoreCol, fontWeight: 700 }}>{Math.round(score * 100)}%</span>
            </div>
            <button onClick={onClose} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 13, minWidth: 36, minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer" }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "16px min(16px, 3vw)", overflowY: "auto" }}>
          {/* Type / confidence / risk */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
            <div style={{ minWidth: 180 }}>
              <div style={lbl}>Thesis Type</div>
              <select value={d.thesis_type || ""} onChange={(e) => set("thesis_type", e.target.value)} style={{ ...ta, fontSize: 13 }}>
                <option value="">Select…</option>
                {THESIS_TYPES.map((t) => <option key={t} value={t} style={{ color: "#000" }}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ ...lbl, display: "flex", justifyContent: "space-between" }}><span>Confidence</span><span style={{ color: C.accent, fontWeight: 700 }}>{d.confidence ?? 60}%</span></div>
              <input type="range" min="0" max="100" value={d.confidence ?? 60} onChange={(e) => set("confidence", +e.target.value)} style={{ width: "100%", accentColor: C.accent }} />
            </div>
            <div>
              <div style={lbl}>Risk</div>
              <div style={{ display: "flex", gap: 4 }}>
                {RISK_LEVELS.map((r) => <button key={r} onClick={() => set("risk_level", r)} style={{ fontSize: 10, fontWeight: 700, padding: "11px 12px", minHeight: 36, borderRadius: 4, cursor: "pointer", textTransform: "uppercase", border: `1px solid ${d.risk_level === r ? riskCol[r] : C.border}`, background: d.risk_level === r ? riskCol[r] + "22" : "transparent", color: d.risk_level === r ? riskCol[r] : C.muted }}>{r}</button>)}
              </div>
            </div>
          </div>

          {/* Litman core: expectations vs reality */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Field k="market_expectations" label="Market Expectations" ph="What does the market currently believe?" h={64} />
            <Field k="reality_hypothesis" label="Reality Hypothesis" ph="What might actually be true that diverges?" h={64} />
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Field k="bull_case" label="Bull Case" ph="What goes right, and how big?" />
            <Field k="bear_case" label="Bear Case" ph="Why might you be wrong?" />
          </div>
          <Field k="invalidation" label="Invalidation Criteria" ph="What observation kills this thesis?" h={48} />

          {/* ── AI RESEARCH — tasks + one-click analyst run ── */}
          <div style={{ background: C.s1, border: `1px solid ${C.purple}30`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: "0.12em" }}>🤖 Research Tasks</span>
              {prog.total > 0 && <span style={{ fontSize: 11, color: C.muted }}>{prog.done}/{prog.total} answered</span>}
              <button className="tiq-btn" disabled={researching || !queued} onClick={run} style={{ marginLeft: "auto", background: researching || !queued ? C.muted + "25" : C.purple, border: "none", borderRadius: 6, color: researching || !queued ? C.muted : "#fff", fontFamily: C.display, fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", padding: "7px 13px", cursor: researching || !queued ? "not-allowed" : "pointer" }}>{researching ? "Analyst working…" : queued ? `▶ Run AI research (${queued})` : "All tasks answered"}</button>
            </div>
            {d.research_tasks.length === 0 && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 6 }}>No tasks yet — running AI research queues the 6-question analyst playbook automatically, or add your own question below.</div>}
            {d.research_tasks.map((t) => (
              <div key={t.id} style={{ marginBottom: 7 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 12.5 }}>
                  <span style={{ color: TASK_DOT[t.status] || C.muted }}>●</span>
                  <span style={{ flex: 1, color: C.text, lineHeight: 1.45 }}>{t.question}</span>
                  <span style={{ fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>{TASK_LABEL[t.type] || t.type} · {SRC_TAG[t.source] || t.source}</span>
                </div>
                {t.finding && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: "3px 0 0 18px", borderLeft: `2px solid ${C.purple}40`, paddingLeft: 8 }}>{t.finding}</div>}
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input value={tq} onChange={(e) => setTq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder="Add a research question for the analyst…" style={{ ...ta, flex: 1, height: "auto", padding: "6px 10px" }} />
              <button onClick={addTask} style={{ background: C.purple + "18", border: `1px solid ${C.purple}35`, borderRadius: 5, color: C.purple, padding: "0 12px", cursor: "pointer", fontFamily: C.display, fontWeight: 700, fontSize: 11 }}>Queue</button>
            </div>
          </div>

          {/* ── RESEARCH BRIEF — the analyst's structured output ── */}
          {brief && (
            <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.12em" }}>📑 Research Brief</span>
                <Meter label="Evidence" v={brief.evidence_strength} />
                <Meter label="Confidence" v={brief.research_confidence} />
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 10 }}>{brief.executive_summary}</div>
              {(brief.bull_case || brief.bear_case) && (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
                  {brief.bull_case && <div style={{ flex: 1, minWidth: 200 }}><div style={{ ...lbl, color: C.green }}>Bull Case</div><div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{brief.bull_case}</div></div>}
                  {brief.bear_case && <div style={{ flex: 1, minWidth: 200 }}><div style={{ ...lbl, color: C.red }}>Bear Case</div><div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{brief.bear_case}</div></div>}
                </div>
              )}
              {brief.reality_vs_expectations && <div style={{ marginBottom: 10 }}><div style={{ ...lbl, color: C.purple }}>Reality vs Expectations</div><div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{brief.reality_vs_expectations}</div></div>}
              {BRIEF_SECTIONS.map(([k, label, col]) => (brief[k] || []).length > 0 && (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ ...lbl, color: col }}>{label}</div>
                  {brief[k].map((x, i) => <div key={i} style={{ fontSize: 12, color: C.text, lineHeight: 1.55, display: "flex", gap: 7 }}><span style={{ color: col }}>▸</span><span style={{ flex: 1 }}>{x}</span></div>)}
                </div>
              ))}
            </div>
          )}

          {/* ── SOURCES — the real news + filings behind the last research run ── */}
          {d.research_sources && ((d.research_sources.news || []).length > 0 || (d.research_sources.filings || []).length > 0 || d.research_sources.filings_note) && (
            <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                🗞 Sources{d.research_sources.fetched_at ? <span style={{ color: C.dim, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> · fetched {new Date(d.research_sources.fetched_at).toLocaleDateString()}</span> : null}
              </div>
              {(d.research_sources.news || []).map((n, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 12, lineHeight: 1.55, marginBottom: 3 }}>
                  <span style={{ color: C.dim, whiteSpace: "nowrap" }}>{n.at ? n.at.slice(0, 10) : ""}</span>
                  {n.link
                    ? <a href={n.link} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: "underline", textDecorationColor: C.dim, flex: 1 }}>{n.title}</a>
                    : <span style={{ color: C.text, flex: 1 }}>{n.title}</span>}
                  {n.publisher && <span style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>{n.publisher}</span>}
                </div>
              ))}
              {(d.research_sources.filings || []).map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 12, lineHeight: 1.55, marginBottom: 3 }}>
                  <span style={{ color: C.gold, fontWeight: 700, whiteSpace: "nowrap" }}>{f.form}</span>
                  <span style={{ color: C.dim, whiteSpace: "nowrap" }}>{f.filed}</span>
                  {f.link
                    ? <a href={f.link} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: "underline", textDecorationColor: C.dim, flex: 1 }}>{f.title || "filing"}</a>
                    : <span style={{ color: C.text, flex: 1 }}>{f.title || "filing"}</span>}
                </div>
              ))}
              {!(d.research_sources.filings || []).length && d.research_sources.filings_note && <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{d.research_sources.filings_note}</div>}
              <div style={{ fontSize: 10, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>Headlines and filing dates are facts; contents are unread by the AI — open the links to verify before acting.</div>
            </div>
          )}

          {/* Evidence log */}
          <div style={{ marginBottom: 12 }}>
            <div style={lbl}>Evidence Log</div>
            {d.evidence && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, lineHeight: 1.5 }}><span style={{ color: C.dim, fontWeight: 700 }}>AI ·</span> {d.evidence}</div>}
            {d.evidence_log.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4, fontSize: 13, color: C.text }}>
                <span style={{ color: C.green }}>▸</span>
                <span style={{ flex: 1, lineHeight: 1.45 }}>{e.text}</span>
                <span style={{ color: C.dim, fontSize: 11, whiteSpace: "nowrap" }}>{e.at ? new Date(e.at).toLocaleDateString() : ""}</span>
                <span onClick={() => set("evidence_log", removeEvidence(d.evidence_log, i))} style={{ cursor: "pointer", color: C.muted, fontSize: 11 }}>✕</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input value={ev} onChange={(e) => setEv(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEv()} placeholder="Add evidence (filings, channel checks, data points)…" style={{ ...ta, flex: 1, height: "auto", padding: "6px 10px" }} />
              <button onClick={addEv} style={{ background: C.accent + "18", border: `1px solid ${C.accent}35`, borderRadius: 5, color: C.accent, padding: "0 12px", cursor: "pointer", fontFamily: C.display, fontWeight: 700, fontSize: 11 }}>Add</button>
            </div>
          </div>

          {/* Notes */}
          <Field k="notes" label="Notes" ph="Free-form research notes, open questions, what to watch…" h={56} />

          {/* Footer */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
            <button onClick={() => { onSave(d); setSaved(true); }} style={{ background: saved ? C.green + "22" : C.s3, border: `1px solid ${saved ? C.green : C.border}`, borderRadius: 5, color: saved ? C.green : C.text, padding: "8px 16px", cursor: "pointer", fontFamily: C.display, fontWeight: 700, fontSize: 12 }}>{saved ? "✓ Saved" : "Save research"}</button>
            <button onClick={() => { onSave(d); onCreateTrade(d); }} style={{ background: C.green, border: "none", borderRadius: 5, color: "#04150c", padding: "8px 16px", cursor: "pointer", fontFamily: C.display, fontWeight: 800, fontSize: 12, opacity: ready ? 1 : 0.6 }}>Create Trade from Research →</button>
            {!ready && <span style={{ fontSize: 11, color: C.gold }}>Fill expectations, reality, bear case & invalidation to trade with conviction</span>}
            <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>Research flows into the Journal · Investor IQ · Personal Alpha</span>
          </div>
        </div>
      </div>
    </div>
  );
}
