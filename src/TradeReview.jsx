import { processScore, gradeFromScore, VERDICT_LABEL, MISTAKE_TAGS } from "./reviews.js";

// ─── TRADE REVIEW ARTIFACT (Priority 2) ──────────────────────────────────────
// Renders the structured, persistent review attached to a closed trade.
export default function TradeReview({ review, theme, onRegenerate }) {
  const C = theme;
  if (!review) return null;
  if (review.error) return <div style={{ fontSize: 10, color: C.red, marginTop: 8 }}>⚠️ Review failed: {review.error}</div>;

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
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 4 }}>{title}</div>
      {items.map((x, i) => <div key={i} style={{ fontSize: 10, color: C.text, lineHeight: 1.5, marginBottom: 2 }}>• {x}</div>)}
    </div>
  ) : null);

  return (
    <div style={{ marginTop: 10, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ width: 34, height: 34, borderRadius: 7, background: gradeColor + "20", border: `1px solid ${gradeColor}50`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.display, fontWeight: 800, fontSize: 15, color: gradeColor }}>{grade}</div>
        <div>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 11, color: C.text }}>AI Trade Review</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: verdictColor }}>{VERDICT_LABEL[verdict] || verdict}</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 9, color: C.muted }}>Process {proc}/100</div>
        {onRegenerate && <span onClick={onRegenerate} title="Regenerate" style={{ cursor: "pointer", color: C.muted, fontSize: 12 }}>↻</span>}
      </div>

      {/* Score bars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 8, marginBottom: 10 }}>
        {SCORES.map(([l, v]) => (
          <div key={l}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.muted, marginBottom: 2 }}><span>{l}</span><span style={{ color: bar(v), fontWeight: 700 }}>{v}</span></div>
            <div style={{ height: 4, background: C.dim, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${v}%`, height: "100%", background: bar(v) }} /></div>
          </div>
        ))}
      </div>

      {review.review_text && <div style={{ fontSize: 11, color: C.text, lineHeight: 1.6, marginBottom: 10 }}>{review.review_text}</div>}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: (review.tags && review.tags.length) ? 10 : 0 }}>
        <L title="Continue" items={lessons.continue} color={C.green} />
        <L title="Improve" items={lessons.improve} color={C.gold} />
        <L title="Avoid" items={lessons.avoid} color={C.red} />
      </div>

      {review.tags && review.tags.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          {review.tags.map((t) => (
            <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: C.red + "15", color: C.red, border: `1px solid ${C.red}30` }}>{MISTAKE_TAGS[t] || t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
