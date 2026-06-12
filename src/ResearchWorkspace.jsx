import { useState } from "react";
import { THESIS_TYPES } from "./thesis.js";
import { addEvidence, removeEvidence, researchScore, researchReady } from "./research.js";

// ─── RESEARCH WORKSPACE — turn a generated opportunity into investable research ─
// A focused full-screen overlay: edit/expand the thesis, log evidence, take notes,
// then create a trade from it. Reuses the thesis schema so research flows into the
// Journal → Reviews → Investor IQ → Personal Alpha with no translation.
const RISK_LEVELS = ["low", "medium", "high"];

export default function ResearchWorkspace({ opp, theme: C, onSave, onCreateTrade, onClose }) {
  const [d, setD] = useState(() => ({ ...opp, evidence_log: Array.isArray(opp.evidence_log) ? opp.evidence_log : [] }));
  const [ev, setEv] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setD((p) => ({ ...p, [k]: v })); setSaved(false); };
  const score = researchScore(d), ready = researchReady(d);
  const scoreCol = score >= 0.8 ? C.green : score >= 0.5 ? C.gold : C.muted;
  const riskCol = { low: C.green, medium: C.gold, high: C.red };

  const addEv = () => { const log = addEvidence(d.evidence_log, ev, new Date().toISOString()); set("evidence_log", log); setEv(""); };
  const ta = { background: C.s1, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 11px", color: C.text, fontFamily: C.mono, fontSize: 13, width: "100%", resize: "vertical", lineHeight: 1.5 };
  const lbl = { fontSize: 11, color: C.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.1em" };
  const Field = ({ k, label, ph, h = 60 }) => (
    <div style={{ flex: 1, minWidth: 220, marginBottom: 10 }}>
      <div style={lbl}>{label}</div>
      <textarea style={{ ...ta, height: h }} maxLength={800} placeholder={ph} value={d[k] || ""} onChange={(e) => set(k, e.target.value)} />
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
