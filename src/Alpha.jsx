import { personalAlpha, mistakeCost, confidenceOf, dataQuality } from "./alpha.js";

// ─── PERSONAL ALPHA (P2.5) — "what conditions make / lose you money" ──────────
// Pure presentation over src/alpha.js. Edges (+R) are green, leaks (−R) red;
// every figure carries its sample size + a confidence tier, and buckets below
// the gate are shown dimmed and labelled "building" rather than dressed up as
// insight. The headline card distils everything into one edge + one leak.
export default function PersonalAlpha({ journal = [], reviews = [], theme }) {
  const C = theme;
  const a = personalAlpha(journal);
  const r1 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
  const pct = (v) => `${(v * 100).toFixed(0)}%`;

  // Behavioural leak: costliest recurring mistake with enough R-valued trades to
  // quantify. Falls back to the worst negative-expectancy condition if no mistake
  // has been costed yet (e.g. trades closed before the review table existed).
  const costed = mistakeCost(reviews, journal);
  const topMistake = costed.find((m) => m.avgR != null && m.avgR < 0 && m.withRisk >= 3) || null;
  const tierColor = { high: C.green, medium: C.gold, low: C.muted, none: C.dim };

  // Data-quality strip — coverage of the inputs each analytic relies on, so an
  // insight's trustworthiness is visible, not assumed. Shown in every state.
  const dq = dataQuality(journal, reviews);
  const covColor = (p) => (p >= 70 ? C.green : p >= 40 ? C.gold : C.red);
  const Coverage = () => (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>Data Quality <span style={{ color: C.dim }}>· {dq.closed} closed trades</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
        {[["Stop set (valid R)", dq.withRisk], ["Reviewed", dq.reviews], ["Sector", dq.sector], ["Holding period", dq.holding]].map(([label, c]) => (
          <div key={label} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: C.text }}>{label}</span>
              <span style={{ fontFamily: C.display, fontWeight: 700, fontSize: 12, color: covColor(c.pct) }}>{c.pct}%</span>
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${c.pct}%`, background: covColor(c.pct) }} /></div>
            <div style={{ fontSize: 8, color: C.muted, marginTop: 3 }}>{c.n}/{dq.closed} trades</div>
          </div>
        ))}
      </div>
    </div>
  );

  // Need at least one confident bucket to say anything honest about edge.
  if (a.confidentBuckets === 0) {
    return (
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>Personal Alpha</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          Learning what makes you money. Once any condition — strategy, sector, market, hold time — reaches <b style={{ color: C.text }}>{a.minSample}</b> closed trades with a stop, its expectancy appears here.
          {a.closed > 0 && <> So far <b style={{ color: C.accent }}>{a.closed}</b> closed; keep logging with a stop set.</>}
        </div>
        {a.closed > 0 && <Coverage />}
      </div>
    );
  }

  // Shared shell for the two headline cards.
  const Card = ({ label, color, children }) => (
    <div style={{ flex: 1, minWidth: 230, background: C.s2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
  const ConfTag = ({ n }) => { const c = confidenceOf(n); return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: tierColor[c.tier], border: `1px solid ${tierColor[c.tier]}55`, borderRadius: 4, padding: "1px 5px" }}>{c.label.toUpperCase()}</span>
  ); };

  // Your Current Edge — the single highest-expectancy confident condition.
  const EdgeCard = () => (
    <Card label="Your current edge" color={C.green}>
      {a.bestEdge ? (<>
        <div style={{ fontFamily: C.display, fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.15 }}>{a.bestEdge.key}</div>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{a.bestEdge.dimension}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.display, fontSize: 22, fontWeight: 800, color: C.green }}>{r1(a.bestEdge.expectancyR)}</span>
          <span style={{ fontSize: 10, color: C.muted }}>{pct(a.bestEdge.winRate)} win · {a.bestEdge.withRisk} trades</span>
          <ConfTag n={a.bestEdge.withRisk} />
        </div>
      </>) : <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>No condition has hit {a.minSample} trades yet — keep logging.</div>}
    </Card>
  );

  // Your Biggest Leak — costliest behavioural mistake (preferred, actionable),
  // else the worst negative-expectancy condition.
  const LeakCard = () => (
    <Card label="Your biggest leak" color={C.red}>
      {topMistake ? (<>
        <div style={{ fontFamily: C.display, fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.15 }}>{topMistake.label}</div>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>recurring mistake · {topMistake.count}× across reviews</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.display, fontSize: 22, fontWeight: 800, color: C.red }}>{r1(topMistake.avgR)}</span>
          <span style={{ fontSize: 10, color: C.muted }}>avg · {r1(topMistake.totalR)} total · {topMistake.withRisk} trades</span>
        </div>
      </>) : a.worstLeak ? (<>
        <div style={{ fontFamily: C.display, fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.15 }}>{a.worstLeak.key}</div>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{a.worstLeak.dimension}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.display, fontSize: 22, fontWeight: 800, color: C.red }}>{r1(a.worstLeak.expectancyR)}</span>
          <span style={{ fontSize: 10, color: C.muted }}>{pct(a.worstLeak.winRate)} win · {a.worstLeak.withRisk} trades</span>
          <ConfTag n={a.worstLeak.withRisk} />
        </div>
      </>) : <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>No costed leak yet — review a few closed trades to surface mistakes.</div>}
    </Card>
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
        <EdgeCard />
        <LeakCard />
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
                  <div style={{ fontSize: 9, color: C.muted, width: 104, textAlign: "right" }}>{pct(g.winRate)} · {g.withRisk}t · {confident ? confidenceOf(g.withRisk).short : "building"}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 9, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>
        Expectancy uses only closed trades with a stop (valid R), grouped by objective fills. Dimmed rows haven't hit {a.minSample} trades yet. Holding-period covers trades closed since the feature shipped. Regime is intentionally excluded until a real regime engine exists.
      </div>
      <Coverage />
    </div>
  );
}
