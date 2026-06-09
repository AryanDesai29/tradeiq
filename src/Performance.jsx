import { performance, byCurrency, monthlyReturns } from "./analytics.js";
import { recurringMistakes } from "./reviews.js";

// ─── PERFORMANCE DASHBOARD (Priority 1) ──────────────────────────────────────
// Risk-normalised (R-multiple) headline metrics that are valid across ₹ and $,
// plus per-currency money blocks and monthly returns. Pure presentation over
// ./analytics.js — no currency logic lives here.
export default function Performance({ journal = [], reviews = [], theme }) {
  const C = theme;
  const p = performance(journal);
  const cur = byCurrency(journal);
  const monthly = monthlyReturns(journal);
  const mistakes = recurringMistakes(reviews); // from AI trade reviews (P2) → Personal Alpha seed

  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  const r1 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
  const pf = (v) => (v === Infinity ? "∞" : v.toFixed(2));
  const money = (sym, v) => `${v < 0 ? "−" : ""}${sym}${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const Tile = ({ label, value, sub, color = C.accent }) => (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: C.display, fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub != null && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  if (p.trades === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 16px", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
        <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 6 }}>No closed trades yet</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
          Close a few trades in the Journal and your performance — win rate, expectancy, profit factor, drawdown — appears here automatically.
          {p.open > 0 && <><br /><br />You have <b style={{ color: C.accent }}>{p.open}</b> open trade{p.open > 1 ? "s" : ""} in progress.</>}
        </div>
      </div>
    );
  }

  // Equity curve (cumulative R) → simple sparkline.
  const curve = p.curve;
  const cw = 100, ch = 36;
  const mn = Math.min(0, ...curve), mx = Math.max(0, ...curve), rng = mx - mn || 1;
  const pts = curve.map((v, i) => `${(i / Math.max(1, curve.length - 1)) * cw},${ch - ((v - mn) / rng) * ch}`).join(" ");
  const zeroY = ch - ((0 - mn) / rng) * ch;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 17 }}>Performance</div>
        <div style={{ fontSize: 11, color: C.muted }}>{p.trades} closed · {p.open} open · {p.withRisk} with a stop (R valid)</div>
      </div>

      {/* Headline risk-normalised metrics (currency-agnostic) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <Tile label="Win Rate" value={pct(p.winRate)} sub={`${p.wins}W / ${p.losses}L`} color={C.accent} />
        <Tile label="Expectancy" value={r1(p.expectancyR)} sub="avg R per trade" color={p.expectancyR >= 0 ? C.green : C.red} />
        <Tile label="Profit Factor" value={pf(p.profitFactor)} sub="gross win ÷ loss (R)" color={p.profitFactor >= 1 ? C.green : C.red} />
        <Tile label="Payoff Ratio" value={p.payoff ? `${p.payoff.toFixed(2)}×` : "—"} sub="avg win ÷ avg loss" color={C.gold} />
        <Tile label="Max Drawdown" value={`${p.maxDrawdownR.toFixed(2)}R`} sub="peak-to-trough" color={C.red} />
        <Tile label="Avg Win / Loss" value={`${p.avgWinR.toFixed(2)} / ${p.avgLossR.toFixed(2)}R`} sub="in R-multiples" color={C.purple} />
      </div>

      {/* Equity curve in R */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Equity Curve (cumulative R)</div>
        <svg viewBox={`0 0 ${cw} ${ch}`} preserveAspectRatio="none" style={{ width: "100%", height: 90, display: "block" }}>
          <line x1="0" y1={zeroY} x2={cw} y2={zeroY} stroke={C.border} strokeWidth="0.5" />
          <polyline points={pts} fill="none" stroke={curve[curve.length - 1] >= 0 ? C.green : C.red} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>Final: <b style={{ color: curve[curve.length - 1] >= 0 ? C.green : C.red }}>{r1(curve[curve.length - 1] || 0)}</b> cumulative</div>
      </div>

      {/* Per-currency money blocks (never summed across currencies) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginBottom: 14 }}>
        {cur.map((b) => (
          <div key={b.currency} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: C.display, fontWeight: 800, fontSize: 14 }}>{b.symbol} {b.currency} trades</span>
              <span style={{ fontSize: 11, color: C.muted }}>{b.trades} closed</span>
            </div>
            <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 24, color: b.net >= 0 ? C.green : C.red, marginBottom: 12 }}>{money(b.symbol, b.net)}<span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 6 }}>net P&L</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["Avg Win", money(b.symbol, b.avgWin), C.green], ["Avg Loss", money(b.symbol, b.avgLoss), C.red], ["Profit Factor", pf(b.profitFactor), b.profitFactor >= 1 ? C.green : C.red], ["W / L", `${b.wins} / ${b.losses}`, C.text], ["Largest Win", money(b.symbol, b.largestWin), C.green], ["Largest Loss", money(b.symbol, b.largestLoss), C.red]].map(([l, v, c]) => (
                <div key={l} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, padding: 8 }}>
                  <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{l}</div>
                  <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 13, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recurring mistakes from AI trade reviews — the Personal Alpha seed */}
      {mistakes.length > 0 && (
        <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Recurring Mistakes <span style={{ color: C.dim }}>· from {reviews.length} reviewed trade{reviews.length !== 1 ? "s" : ""}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mistakes.slice(0, 8).map((m) => (
              <div key={m.tag} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: 11, color: C.text }}>{m.label}</div>
                <div style={{ height: 5, width: `${Math.min(100, m.count * 18)}px`, minWidth: 14, background: C.red, borderRadius: 3 }} />
                <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 12, color: C.red, width: 24, textAlign: "right" }}>{m.count}×</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly returns per currency */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Monthly Returns</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead><tr>{["Month", ...cur.map((b) => `${b.symbol} ${b.currency}`)].map((h) => (
            <th key={h} style={{ textAlign: h === "Month" ? "left" : "right", padding: "5px 6px", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}</tr></thead>
          <tbody>{Object.keys(monthly).sort().reverse().map((mo) => (
            <tr key={mo}>
              <td style={{ padding: "6px", fontFamily: C.mono, color: C.text }}>{mo}</td>
              {cur.map((b) => { const v = monthly[mo][b.currency]; return (
                <td key={b.currency} style={{ padding: "6px", textAlign: "right", fontWeight: 600, color: v == null ? C.muted : v >= 0 ? C.green : C.red }}>{v == null ? "—" : money(b.symbol, v)}</td>
              ); })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
