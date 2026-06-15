// ─── DECISIONS — the Founder Memory Graph surface ─────────────────────────────
// Record strategy decisions in your own words; the system flags trades that
// conflict with an active "avoid" decision (the protection happens in the trade
// form). Each override is captured as a manual "changed my mind" note here.
import { useState } from "react";
import { C, T } from "./theme.js";
import { DECISION_KINDS } from "./decisions.js";

const KIND_COLOR = { avoid: C.red, rule: C.blue, bet: C.green };
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return ""; } };

export default function Decisions({ decisions = [], onAdd, onSetActive }) {
  const [statement, setStatement] = useState("");
  const [kind, setKind] = useState("avoid");
  const [tags, setTags] = useState("");
  const add = () => {
    if (!statement.trim()) return;
    onAdd?.({ statement, kind, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
    setStatement(""); setTags(""); setKind("avoid");
  };
  const active = decisions.filter((d) => d.active !== false);
  const retired = decisions.filter((d) => d.active === false);

  const Row = ({ d }) => (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", opacity: d.active === false ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: T.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: KIND_COLOR[d.kind] || C.muted, marginRight: 8 }}>{d.kind}</span>
          <span style={{ fontSize: T.data, color: C.text }}>{d.statement}</span>
          {(d.tags || []).length > 0 && <div style={{ marginTop: 4, display: "flex", gap: 5, flexWrap: "wrap" }}>{d.tags.map((t) => <span key={t} style={{ fontSize: T.micro, color: C.muted, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 7px" }}>{t}</span>)}</div>}
          {d.challenged_count > 0 && <div style={{ marginTop: 5, fontSize: T.caption, color: C.gold }}>↻ overridden {d.challenged_count}×{d.last_challenge_note ? ` — “${d.last_challenge_note}”` : ""}{d.last_challenged_at ? ` (${fmtDate(d.last_challenged_at)})` : ""}</div>}
        </div>
        <button onClick={() => onSetActive?.(d.id, d.active === false)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 9px", fontSize: T.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", whiteSpace: "nowrap" }}>{d.active === false ? "Reactivate" : "Retire"}</button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>🧭 Decisions</div>
      <div style={{ fontSize: T.caption, color: C.muted, marginBottom: 16, maxWidth: 640 }}>
        Your strategy, in your own words. When a trade conflicts with an active <b style={{ color: C.red }}>avoid</b> decision, the trade form warns you — and if you go ahead anyway, it captures <i>why</i> (a manual “changed my mind”). The system protects your strategy from you on a bad day.
      </div>

      {/* Add */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="e.g. Avoid Turnaround theses above 75% confidence" onKeyDown={(e) => { if (e.key === "Enter") add(); }} style={{ width: "100%", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontFamily: C.mono, fontSize: T.data, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontFamily: C.mono, fontSize: T.data }}>
            {DECISION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags (e.g. Turnaround, ADANIENT.NS, US)" style={{ flex: "1 1 220px", minWidth: 0, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontFamily: C.mono, fontSize: T.data }} />
          <button onClick={add} disabled={!statement.trim()} style={{ background: statement.trim() ? C.accent : C.muted, border: "none", color: C.bg, fontFamily: C.display, fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", padding: "9px 16px", borderRadius: 8, cursor: statement.trim() ? "pointer" : "not-allowed" }}>Record</button>
        </div>
        <div style={{ fontSize: T.micro, color: C.dim, marginTop: 7 }}>“avoid” decisions are the ones the trade form enforces. Tags match a trade's thesis type, ticker, sector or market.</div>
      </div>

      {decisions.length === 0 && <div style={{ background: C.s1, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 22, textAlign: "center", color: C.muted, fontSize: T.data }}>No decisions recorded yet. Write down the rules you keep breaking.</div>}

      {active.length > 0 && <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>{active.map((d) => <Row key={d.id} d={d} />)}</div>}
      {retired.length > 0 && <>
        <div style={{ fontSize: T.caption, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", margin: "4px 0 8px" }}>Retired</div>
        <div style={{ display: "grid", gap: 8 }}>{retired.map((d) => <Row key={d.id} d={d} />)}</div>
      </>}
    </div>
  );
}
