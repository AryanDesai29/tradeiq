// ─── DECISION QUALITY — the "is the AI helping?" pillar of Alpha Lab ──────────
// Pure presentation over src/decisionQuality.js. Reads the two local telemetry
// streams (tiqUsage + tiqFilings) itself, joins them with the opportunity
// pipeline + journal + reviews, and renders the funnels every metric sample-
// gated. With thin data it shows "need N more", never a confident-looking zero —
// this is the gauge you watch fill during a validation week.
import { decisionQualitySummary } from "./decisionQuality.js";
import { usageSummary, filingImpactReport } from "./telemetry.js";
import { T } from "./theme.js";

export default function DecisionQuality({ opportunities = [], journal = [], reviews = [], theme, userId }) {
  const C = theme;
  const usage = usageSummary(localStorage, userId);
  const filingReport = filingImpactReport(localStorage, userId);
  const s = decisionQualitySummary({ opportunities, journal, reviews, usage, filingReport });
  const pc = (x) => `${Math.round((x || 0) * 100)}%`;

  const card = { background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 };
  const hLabel = { fontFamily: C.display, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 };

  // Funnel as stacked bars scaled to the top stage (Generated = 100%).
  const Funnel = ({ stages }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {stages.map((st, i) => (
        <div key={st.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 110, fontSize: T.caption, color: C.text, textAlign: "right" }}>{st.label}</div>
          <div style={{ flex: 1, height: 18, background: C.s2, borderRadius: 4, overflow: "hidden", position: "relative" }}>
            <div style={{ width: `${Math.max(2, (st.convFromTop || 0) * 100)}%`, height: "100%", background: i === stages.length - 1 ? C.green : C.accent, opacity: 1 - i * 0.12, borderRadius: 4 }} />
          </div>
          <div style={{ width: 78, fontSize: T.caption, color: C.muted, textAlign: "left" }}>
            <b style={{ color: C.text }}>{st.n}</b>{i > 0 && <span> · {pc(st.convFromPrev)}</span>}
          </div>
        </div>
      ))}
    </div>
  );

  const Stat = ({ label, value, color = C.text }) => (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, padding: 8 }}>
      <div style={{ fontSize: T.caption, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 15, color }}>{value}</div>
    </div>
  );

  return (
    <div>
      {/* Signal board — the headline read per layer, sample-gated */}
      <div style={card}>
        <div style={hLabel}>Decision Quality <span style={{ color: C.dim }}>· is the AI helping?</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {s.signals.map((sig) => (
            <div key={sig.layer} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <div style={{ width: 8, height: 8, borderRadius: 8, background: sig.enough ? C.green : C.dim, flexShrink: 0, alignSelf: "center" }} />
              <div style={{ width: 150, fontSize: T.caption, fontWeight: 700, color: C.text, flexShrink: 0 }}>{sig.layer}</div>
              <div style={{ flex: 1, fontSize: T.caption, color: sig.enough ? C.text : C.muted, lineHeight: 1.5 }}>{sig.read}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>Every layer is sample-gated — a grey dot means not enough data yet to judge it. Outcome rows fill as you research, convene the Council, and close trades.</div>
      </div>

      {/* Opportunity funnel */}
      <div style={card}>
        <div style={hLabel}>Opportunity Funnel <span style={{ color: C.dim }}>· generated → researched → council → traded → successful</span></div>
        <Funnel stages={s.opp.stages} />
        <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>"Successful" is ticker-matched to closed winning trades (the opportunity→trade link isn't a hard key) — read it as directional, not exact.</div>
      </div>

      {/* Research + Council, side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginBottom: 12 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={hLabel}>Research Engine</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Stat label="Briefs generated" value={s.research.generated} color={C.accent} />
            <Stat label="Opened (clicks)" value={s.research.opened} color={C.blue} />
            <Stat label="Used in Council" value={`${s.research.usedInCouncil} · ${pc(s.research.usedRate)}`} color={C.purple} />
            <Stat label="Led to trade" value={`${s.research.ledToTrade} · ${pc(s.research.tradeRate)}`} color={C.green} />
          </div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={hLabel}>Council Quality</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Stat label="Verdicts" value={s.council.verdicts} color={C.gold} />
            <Stat label="Became trades" value={`${s.council.ledToTrade} · ${pc(s.council.tradeRate)}`} color={C.green} />
            <Stat label="You override AI" value={s.council.judged ? pc(s.council.overrideRate) : "—"} color={C.red} />
            <Stat label="AI thesis acc." value={s.council.judged ? pc(s.council.aiAccuracy) : "—"} color={C.text} />
          </div>
          {s.council.distribution.length > 0 && (
            <div style={{ fontSize: T.caption, color: C.muted, marginTop: 8 }}>Verdicts: {s.council.distribution.map((d) => `${d.key} ×${d.count}`).join(" · ")}</div>
          )}
        </div>
      </div>

      {/* Filing Intelligence value */}
      <div style={card}>
        <div style={hLabel}>Filing Intelligence <span style={{ color: C.dim }}>· do read filings change decisions?</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
          <Stat label="Manual reads" value={s.filing.manualReads} color={C.blue} />
          <Stat label="Council reads" value={s.filing.councilReads} color={C.purple} />
          <Stat label="Verdict changes" value={s.filing.verdictChanges} color={s.filing.verdictChanges > 0 ? C.green : C.muted} />
          <Stat label="Trades after filing" value={s.filing.tradesAfterFiling} color={s.filing.tradesAfterFiling > 0 ? C.green : C.muted} />
        </div>
        {(s.filing.sectionsRead.length > 0 || s.filing.sectionsSkipped.length > 0) && (
          <div style={{ fontSize: T.caption, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
            {s.filing.sectionsRead.length > 0 && <div>Most-read sections: {s.filing.sectionsRead.slice(0, 4).map((x) => `${x.key} (${x.count})`).join(" · ")}</div>}
            {s.filing.sectionsSkipped.length > 0 && <div style={{ color: C.dim }}>Most-skipped: {s.filing.sectionsSkipped.slice(0, 4).map((x) => `${x.key} (${x.count})`).join(" · ")}</div>}
          </div>
        )}
        {s.filing.totalReads === 0 && <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>No filings read yet — read one from a research workspace, then watch whether Council verdicts move.</div>}
      </div>
    </div>
  );
}
