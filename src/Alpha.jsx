import { personalAlpha } from "./alpha.js";

// ─── PERSONAL ALPHA (P2.5) — "what conditions make / lose you money" ──────────
// Pure presentation over src/alpha.js. Edges (+R) are green, leaks (−R) red;
// every figure carries its sample size, and buckets below the confidence gate
// are shown dimmed and labelled "building" rather than dressed up as insight.
export default function PersonalAlpha({ journal = [], theme }) {
  const C = theme;
  const a = personalAlpha(journal);
  const r1 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
  const pct = (v) => `${(v * 100).toFixed(0)}%`;

  // Need at least one confident bucket to say anything honest about edge.
  if (a.confidentBuckets === 0) {
    return (
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>Personal Alpha</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          Learning what makes you money. Once any condition — strategy, sector, market, hold time — reaches <b style={{ color: C.text }}>{a.minSample}</b> closed trades with a stop, its expectancy appears here.
          {a.closed > 0 && <> So far <b style={{ color: C.accent }}>{a.closed}</b> closed; keep logging with a stop set.</>}
        </div>
      </div>
    );
  }

  const Headline = ({ label, g, color }) => (
    <div style={{ flex: 1, minWidth: 220, background: C.s2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>{label}</div>
      {g ? (<>
        <div style={{ fontFamily: C.display, fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>{g.key}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: C.display, fontSize: 20, fontWeight: 800, color }}>{r1(g.expectancyR)}</span>
          <span style={{ fontSize: 10, color: C.muted }}>{g.dimension} · {pct(g.winRate)} win · {g.withRisk} trades</span>
        </div>
      </>) : <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>—</div>}
    </div>
  );

  // Widest |expectancy| across confident buckets → bar scale.
  const maxAbs = Math.max(0.5, ...a.dims.flatMap((d) => d.groups.filter((g) => g.withRisk >= a.minSample).map((g) => Math.abs(g.expectancyR))));

  return (
    <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 14 }}>Personal Alpha <span style={{ fontSize: 10, fontWeight: 400, color: C.dim }}>· what makes you money</span></div>
        <div style={{ fontSize: 10, color: C.muted }}>expectancy in R · ≥{a.minSample} trades = confident</div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Headline label="Biggest edge" g={a.bestEdge} color={C.green} />
        <Headline label="Biggest leak" g={a.worstLeak} color={C.red} />
      </div>

      {a.dims.map((d) => (
        <div key={d.id} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{d.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.groups.map((g) => {
              const confident = g.withRisk >= a.minSample;
              const col = !confident ? C.dim : g.expectancyR >= 0 ? C.green : C.red;
              const w = `${Math.min(100, (Math.abs(g.expectancyR) / maxAbs) * 100)}%`;
              return (
                <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 10, opacity: confident ? 1 : 0.55 }}>
                  <div style={{ width: 130, fontSize: 11, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.key}</div>
                  {/* diverging bar: centre line, grows right (green) or left (red) */}
                  <div style={{ flex: 1, display: "flex", justifyContent: g.expectancyR >= 0 ? "flex-start" : "flex-end", flexDirection: g.expectancyR >= 0 ? "row" : "row-reverse" }}>
                    <div style={{ height: 6, width: w, minWidth: 3, background: col, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 12, color: col, width: 56, textAlign: "right" }}>{r1(g.expectancyR)}</div>
                  <div style={{ fontSize: 9, color: C.muted, width: 86, textAlign: "right" }}>{pct(g.winRate)} · {confident ? `${g.withRisk} trades` : `${g.withRisk}, building`}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 9, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>
        Expectancy uses only closed trades with a stop (valid R), grouped by objective fills. Dimmed rows haven't hit {a.minSample} trades yet. Holding-period covers trades closed since the feature shipped. Regime is intentionally excluded until a real regime engine exists.
      </div>
    </div>
  );
}
