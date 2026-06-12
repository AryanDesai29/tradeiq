import { processScore, gradeFromScore, VERDICT_LABEL, MISTAKE_TAGS } from "./reviews.js";
import { finalVerdict, VERDICT_LABEL as THESIS_VERDICT_LABEL, THESIS_VERDICTS } from "./thesis.js";
import { Term } from "./ui.jsx";

// ─── TRADE REVIEW ARTIFACT (Priority 2 + P2.75 thesis verdict) ────────────────
// Renders the structured, persistent review attached to a closed trade, including
// the thesis verdict (AI grades, user can override).
export default function TradeReview({ review, trade, theme, onRegenerate, onVerdict }) {
  const C = theme;
  const tColor = { correct: C.green, partial: C.gold, incorrect: C.red };
  if (!review) return null;
  if (review.error) return <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>⚠️ Review failed: {review.error}</div>;

  const proc = processScore(review);
  const grade = review.overall_grade || gradeFromScore(proc);
  const gradeColor = grade.startsWith("A") ? C.green : grade === "B" ? C.accent : grade === "C" ? C.gold : C.red;
  const verdict = review.verdict || "";
  // Highlight the two teaching verdicts: good process/bad outcome (keep going),
  // bad process/good outcome (got lucky).
  const verdictColor = verdict.startsWith("good_process") ? C.green : C.red;

  const SCORES = [
    ["Thesis", review.thesis_score], ["Execution", review.execution_score],
    ["Risk", review.risk_score], ["Regime", review.regime_score], ["Outcome", review.outcome_score],
  ];
  const bar = (v) => (v >= 70 ? C.green : v >= 50 ? C.gold : C.red);
  const lessons = review.lessons || {};
  const L = ({ title, items, color }) => (items && items.length ? (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 4 }}>{title}</div>
      {items.map((x, i) => <div key={i} style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 2 }}>• {x}</div>)}
    </div>
  ) : null);

  return (
    <div style={{ marginTop: 10, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ width: 34, height: 34, borderRadius: 7, background: gradeColor + "20", border: `1px solid ${gradeColor}50`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.display, fontWeight: 800, fontSize: 15, color: gradeColor }}>{grade}</div>
        <div>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 11, color: C.text }}>AI Trade Review</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: verdictColor }}>{VERDICT_LABEL[verdict] || verdict}</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}><Term k="process">Process</Term> {proc}/100</div>
        {onRegenerate && <span onClick={onRegenerate} title="Regenerate" style={{ cursor: "pointer", color: C.muted, fontSize: 12 }}>↻</span>}
      </div>

      {/* Score bars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 8, marginBottom: 10 }}>
        {SCORES.map(([l, v]) => (
          <div key={l}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 2 }}><span>{l}</span><span style={{ color: bar(v), fontWeight: 700 }}>{v}</span></div>
            <div style={{ height: 4, background: C.dim, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${v}%`, height: "100%", background: bar(v) }} /></div>
          </div>
        ))}
      </div>

      {/* THESIS VERDICT (P2.75) — prediction quality, judged separately from P&L */}
      {(review.ai_thesis_verdict || review.user_thesis_verdict) && (() => {
        const fin = finalVerdict(review);
        const col = tColor[fin] || C.muted;
        return (
          <div style={{ marginBottom: 10, background: C.s1, border: `1px solid ${col}40`, borderLeft: `3px solid ${col}`, borderRadius: 6, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.muted }}>Thesis Verdict</span>
              <span style={{ fontFamily: C.display, fontWeight: 800, fontSize: 12, color: col }}>{THESIS_VERDICT_LABEL[fin] || "—"}</span>
            </div>
            {trade && (trade.expectations || trade.reality) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 8 }}>
                <div><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Market expected</div><div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{trade.expectations || "—"}</div></div>
                <div><div style={{ fontSize: 11, color: C.green, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>What happened</div><div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{review.thesis_reason || trade.reality || "—"}</div></div>
              </div>
            )}
            {review.thesis_reason && !(trade && (trade.expectations || trade.reality)) && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>{review.thesis_reason}</div>
            )}
            <div style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: onVerdict ? 8 : 0, flexWrap: "wrap" }}>
              {typeof review.expectations_changed === "boolean" && <span style={{ color: review.expectations_changed ? C.green : C.muted }}>● Market {review.expectations_changed ? "was wrong" : "was right"}</span>}
              {typeof review.bear_case_realized === "boolean" && <span style={{ color: review.bear_case_realized ? C.red : C.muted }}>● Bear case {review.bear_case_realized ? "triggered" : "avoided"}</span>}
              <span style={{ color: C.muted, marginLeft: "auto" }}>AI: <b style={{ color: tColor[review.ai_thesis_verdict] || C.muted }}>{THESIS_VERDICT_LABEL[review.ai_thesis_verdict] || "—"}</b></span>
            </div>
            {onVerdict && (
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.muted, marginRight: 2 }}>Your call:</span>
                {THESIS_VERDICTS.map((v) => { const active = fin === v; const vc = tColor[v]; return (
                  <button key={v} onClick={() => onVerdict(v)} style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 4, cursor: "pointer", border: `1px solid ${active ? vc : C.border}`, background: active ? vc + "22" : "transparent", color: active ? vc : C.muted }}>
                    {v === "correct" ? "Confirm" : v === "partial" ? "Partial" : "Incorrect"}
                  </button>
                ); })}
              </div>
            )}
          </div>
        );
      })()}

      {review.review_text && <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 10 }}>{review.review_text}</div>}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: (review.tags && review.tags.length) ? 10 : 0 }}>
        <L title="Continue" items={lessons.continue} color={C.green} />
        <L title="Improve" items={lessons.improve} color={C.gold} />
        <L title="Avoid" items={lessons.avoid} color={C.red} />
      </div>

      {review.tags && review.tags.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          {review.tags.map((t) => (
            <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: C.red + "15", color: C.red, border: `1px solid ${C.red}30` }}>{MISTAKE_TAGS[t] || t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
