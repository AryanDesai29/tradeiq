import { performance, byCurrency, monthlyReturns } from "./analytics.js";
import { recurringMistakes } from "./reviews.js";
import { thesisStats, thesisCalibration } from "./thesis.js";
import { T } from "./theme.js";
import { Money, Term } from "./ui.jsx";
import PersonalAlpha from "./Alpha.jsx";
import DecisionQuality from "./DecisionQuality.jsx";

// ─── ALPHA LAB — "what makes Aryan money + a better investor" ─────────────────
// One room for the whole self-knowledge layer, three pillars: Investor IQ
// (prediction quality) · Personal Alpha (edges & leaks) · Decision Quality (is
// the AI actually improving decisions?). Risk-normalised (R-multiple) headline
// metrics are valid across ₹ and $; money blocks stay per-currency. Pure
// presentation over ./analytics.js + ./decisionQuality.js.
export default function Performance({ journal = [], reviews = [], opportunities = [], userId, theme }) {
  const C = theme;
  const p = performance(journal);
  const cur = byCurrency(journal);
  const monthly = monthlyReturns(journal);
  const mistakes = recurringMistakes(reviews); // from AI trade reviews (P2) → Personal Alpha seed
  const iq = thesisStats(reviews);             // P2.75 "investor IQ" — prediction quality
  const cal = thesisCalibration(journal, reviews);

  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  const r1 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
  const pf = (v) => (v === Infinity ? "∞" : v.toFixed(2));

  const Tile = ({ label, value, sub, color = C.accent }) => (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 7, padding: 14 }}>
      <div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: C.display, fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub != null && <div style={{ fontSize: T.caption, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  const AlphaLabHeader = () => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 17 }}>🧪 Alpha Lab</div>
      <div style={{ fontSize: T.caption, color: C.muted, marginTop: 2 }}>What makes you money · what makes you a better investor · is the AI helping</div>
    </div>
  );

  // Performance (P&L) needs closed trades; Decision Quality does NOT — it measures
  // the AI funnel, so it renders from the first opportunity, before any trade closes.
  if (p.trades === 0) {
    return (
      <div>
        <AlphaLabHeader />
        <div style={{ textAlign: "center", padding: "32px 16px", color: C.muted, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>📈</div>
          <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 6 }}>No closed trades yet</div>
          <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 420, margin: "0 auto" }}>
            Win rate, expectancy, Personal Alpha and Investor IQ appear once you close trades. Decision Quality below works now — it measures whether the AI is advancing ideas toward decisions.
            {p.open > 0 && <><br /><br />You have <b style={{ color: C.accent }}>{p.open}</b> open trade{p.open > 1 ? "s" : ""} in progress.</>}
          </div>
        </div>
        <DecisionQuality opportunities={opportunities} journal={journal} reviews={reviews} theme={C} userId={userId} />
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
        <div>
          <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 17 }}>🧪 Alpha Lab</div>
          <div style={{ fontSize: T.caption, color: C.muted, marginTop: 2 }}>What makes you money · what makes you a better investor · is the AI helping</div>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>{p.trades} closed · {p.open} open · {p.withRisk} with a stop (R valid)</div>
      </div>

      {/* Headline risk-normalised metrics (currency-agnostic) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <Tile label={<Term k="winRate">Win Rate</Term>} value={pct(p.winRate)} sub={`${p.wins}W / ${p.losses}L`} color={C.accent} />
        <Tile label={<Term k="expectancy">Expectancy</Term>} value={r1(p.expectancyR)} sub="avg R per trade" color={p.expectancyR >= 0 ? C.green : C.red} />
        <Tile label={<Term k="profitFactor">Profit Factor</Term>} value={pf(p.profitFactor)} sub="gross win ÷ loss (R)" color={p.profitFactor >= 1 ? C.green : C.red} />
        <Tile label="Payoff Ratio" value={p.payoff ? `${p.payoff.toFixed(2)}×` : "—"} sub="avg win ÷ avg loss" color={C.gold} />
        <Tile label={<Term k="maxDrawdown">Max Drawdown</Term>} value={`${p.maxDrawdownR.toFixed(2)}R`} sub="peak-to-trough" color={C.red} />
        <Tile label="Avg Win / Loss" value={`${p.avgWinR.toFixed(2)} / ${p.avgLossR.toFixed(2)}R`} sub="in R-multiples" color={C.purple} />
      </div>

      {/* Investor IQ (P2.75) — thesis accuracy is the TRUE score: prediction quality, not P&L */}
      {iq.n > 0 && (() => {
        const acc = iq.accuracy, accColor = acc >= 0.6 ? C.green : acc >= 0.45 ? C.gold : C.red;
        return (
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accColor}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 14 }}><Term k="investorIq">Investor IQ</Term> <span style={{ fontSize: T.caption, fontWeight: 400, color: C.dim }}>· thesis accuracy, not P&amp;L</span></div>
              <div style={{ fontSize: 12, color: C.muted }}>{iq.n} thesis{iq.n !== 1 ? "es" : ""} judged</div>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 34, color: accColor, lineHeight: 1 }}>{pct(acc)}</div>
                <div style={{ fontSize: T.caption, color: C.muted, marginTop: 2 }}><Term k="thesisAccuracy">thesis accuracy</Term></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 10, flex: 1, minWidth: 240 }}>
                {[
                  ["Correct", iq.correct, C.green], ["Partial", iq.partial, C.gold], ["Wrong", iq.incorrect, C.red],
                  ["Market wrong", `${iq.marketWrong}/${iq.marketWrong + iq.marketRight}`, C.accent],
                  ["Bear case hit", pct(iq.bearCaseRate), C.red],
                  ["Avg conviction", cal.n ? pct(cal.avgConfidence) : "—", C.purple],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, padding: 8 }}>
                    <div style={{ fontSize: T.caption, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{l}</div>
                    <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 14, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: T.caption, color: C.muted }}>
              {cal.n > 0 && <span><Term k="calibration">Calibration</Term>: <b style={{ color: cal.label === "Good" ? C.green : cal.label === "Fair" ? C.gold : C.red }}>{cal.label}</b> (conviction {pct(cal.avgConfidence)} vs reality {pct(cal.actualAccuracy)})</span>}
              <span>AI thesis accuracy: <b style={{ color: C.text }}>{pct(iq.aiAccuracy)}</b></span>
              <span>You agree with AI: <b style={{ color: C.text }}>{pct(iq.agreementRate)}</b> · override {pct(iq.overrideRate)}</span>
            </div>
          </div>
        );
      })()}

      {/* Equity curve in R */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Equity Curve (cumulative R)</div>
        <svg viewBox={`0 0 ${cw} ${ch}`} preserveAspectRatio="none" style={{ width: "100%", height: 90, display: "block" }}>
          <line x1="0" y1={zeroY} x2={cw} y2={zeroY} stroke={C.border} strokeWidth="0.5" />
          <polyline points={pts} fill="none" stroke={curve[curve.length - 1] >= 0 ? C.green : C.red} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ fontSize: T.caption, color: C.muted, marginTop: 6 }}>Final: <b style={{ color: curve[curve.length - 1] >= 0 ? C.green : C.red }}>{r1(curve[curve.length - 1] || 0)}</b> cumulative</div>
      </div>

      {/* Per-currency money blocks (never summed across currencies) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginBottom: 14 }}>
        {cur.map((b) => (
          <div key={b.currency} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: C.display, fontWeight: 800, fontSize: 14 }}>{b.symbol} {b.currency} trades</span>
              <span style={{ fontSize: 12, color: C.muted }}>{b.trades} closed</span>
            </div>
            <div style={{ marginBottom: 12 }}><Money value={b.net} currency={b.currency} signed size={24} /><span style={{ fontSize: T.caption, color: C.muted, fontWeight: 400, marginLeft: 6 }}>net P&L</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["Avg Win", <Money value={b.avgWin} currency={b.currency} color={C.green} />, C.green], ["Avg Loss", <Money value={b.avgLoss} currency={b.currency} color={C.red} />, C.red], ["Profit Factor", pf(b.profitFactor), b.profitFactor >= 1 ? C.green : C.red], ["W / L", `${b.wins} / ${b.losses}`, C.text], ["Largest Win", <Money value={b.largestWin} currency={b.currency} color={C.green} />, C.green], ["Largest Loss", <Money value={b.largestLoss} currency={b.currency} color={C.red} />, C.red]].map(([l, v, c]) => (
                <div key={l} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, padding: 8 }}>
                  <div style={{ fontSize: T.caption, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{l}</div>
                  <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: T.data, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recurring mistakes from AI trade reviews — the Personal Alpha seed */}
      {mistakes.length > 0 && (
        <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Recurring Mistakes <span style={{ color: C.dim }}>· from {reviews.length} reviewed trade{reviews.length !== 1 ? "s" : ""}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mistakes.slice(0, 8).map((m) => (
              <div key={m.tag} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: T.caption, color: C.text }}>{m.label}</div>
                <div style={{ height: 5, width: `${Math.min(100, m.count * 18)}px`, minWidth: 14, background: C.red, borderRadius: 3 }} />
                <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: T.data, color: C.red, width: 24, textAlign: "right" }}>{m.count}×</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal Alpha (P2.5) — the recurring-mistakes seed above grown into a
          full edge/leak engine: expectancy in R by strategy, sector, market,
          side, and holding period. */}
      <PersonalAlpha journal={journal} reviews={reviews} theme={C} />

      {/* Third pillar — Decision Quality: is the AI actually improving decisions? */}
      <DecisionQuality opportunities={opportunities} journal={journal} reviews={reviews} theme={C} userId={userId} />

      {/* Monthly returns per currency */}
      <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Monthly Returns</div>
        <div className="tiq-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.data }}>
            <thead><tr>{["Month", ...cur.map((b) => `${b.symbol} ${b.currency}`)].map((h) => (
              <th key={h} style={{ textAlign: h === "Month" ? "left" : "right", padding: "5px 6px", fontSize: T.caption, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}</tr></thead>
            <tbody>{Object.keys(monthly).sort().reverse().map((mo) => (
              <tr key={mo}>
                <td style={{ padding: "6px", fontFamily: C.mono, color: C.text }}>{mo}</td>
                {cur.map((b) => { const v = monthly[mo][b.currency]; return (
                  <td key={b.currency} style={{ padding: "6px", textAlign: "right" }}>{v == null ? <span style={{ color: C.muted }}>—</span> : <Money value={v} currency={b.currency} code={false} color={v >= 0 ? C.green : C.red} />}</td>
                ); })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
