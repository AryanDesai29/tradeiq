// ─── SHARED UI PRIMITIVES (Phase 0) ──────────────────────────────
// TickerID — the one way to render a ticker anywhere in the app.
// Money    — the one way to render a monetary value (symbol + code, no ambiguity).
// Term     — lightweight glossary tooltip for trading concepts.
// Components read currency/exchange/sector from DATA only — they never parse
// tickers (see the regression guard in tests; currency logic lives in stock.js).

import { useState } from "react";
import { C, T } from "./theme.js";
import { symbolFor, decimalsFor } from "./stock.js";

// Yahoo exchange codes → human labels. Explicit exchange data wins; the
// currency-derived market label is only a display fallback (still data, not
// ticker parsing).
const EXCHANGE_LABELS = {
  NSI: "NSE", NSE: "NSE", BSE: "BSE",
  NMS: "NASDAQ", NGM: "NASDAQ", NCM: "NASDAQ", NASDAQ: "NASDAQ",
  NYQ: "NYSE", NYSE: "NYSE", PCX: "NYSE ARCA", ASE: "NYSE AMER", BTS: "CBOE",
};
export const exchangeLabel = (exchange, currency) => {
  if (exchange) {
    const e = String(exchange).toUpperCase().trim();
    return EXCHANGE_LABELS[e] || e;
  }
  return currency === "INR" ? "NSE" : currency === "USD" ? "US" : null;
};

// ─── TickerID ────────────────────────────────────────────────────
// AAPL                          RELIANCE.NS
// NASDAQ • USD • Technology     NSE • INR • Energy
// size: "row" (14px, lists/tables) | "card" (16px, cards) | "hero" (20px, headers)
export function TickerID({ symbol, name, exchange, currency, sector, size = "row", nameMax = 160, style = {} }) {
  const px = size === "hero" ? 20 : size === "card" ? 16 : 14;
  const curColor = currency === "INR" ? C.gold : C.blue;
  const ex = exchangeLabel(exchange, currency);
  const meta = [];
  if (ex) meta.push(<span key="ex">{ex}</span>);
  if (currency) meta.push(<b key="cur" style={{ color: curColor, fontWeight: 700 }}>{currency}</b>);
  if (sector) meta.push(<span key="sec">{sector}</span>);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
        <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: px, color: C.text, letterSpacing: "0.01em", whiteSpace: "nowrap", lineHeight: 1.15 }}>{symbol}</span>
        {name && name !== symbol && (
          <span style={{ fontSize: T.caption, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: nameMax }}>{name}</span>
        )}
      </div>
      {meta.length > 0 && (
        <div style={{ fontSize: T.caption, color: C.muted, display: "flex", alignItems: "baseline", gap: 0, whiteSpace: "nowrap", lineHeight: 1.3 }}>
          {meta.map((m, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "baseline" }}>
              {i > 0 && <span style={{ color: C.dim, margin: "0 5px" }}>•</span>}{m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Money ───────────────────────────────────────────────────────
// ₹1,28,000 INR · +$420 USD · −₹1,250 INR
// signed: show +/− and color green/red (for P&L, deltas).
// code: render the ISO code after the number (default true — only disable
//       inside tight table cells where the column header carries the code).
export function Money({ value, currency, signed = false, decimals, size = T.data, bold = true, color, code = true, style = {} }) {
  const v = Number(value);
  if (!isFinite(v)) return <span style={{ color: C.dim, fontSize: size }}>—</span>;
  const cur = currency || "INR";
  // Large whole amounts (aggregates like ₹1,28,000) drop the ".00" noise;
  // anything fractional or price-sized keeps full decimalsFor precision.
  const d = decimals ?? (Math.abs(v) >= 1000 && v % 1 === 0 ? 0 : decimalsFor(cur));
  const num = Math.abs(v).toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  const col = color ?? (signed ? (v > 0 ? C.green : v < 0 ? C.red : C.muted) : C.text);
  const codePx = Math.max(10, Math.round(size * 0.72));
  return (
    <span style={{ fontFamily: C.mono, fontWeight: bold ? 700 : 500, fontSize: size, color: col, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...style }}>
      {sign}{symbolFor(cur)}{num}
      {code && <span style={{ fontSize: codePx, fontWeight: 700, color: C.muted, marginLeft: 4, letterSpacing: "0.04em" }}>{cur}</span>}
    </span>
  );
}

// ─── Term — glossary tooltip ─────────────────────────────────────
export const GLOSSARY = {
  expectancy: "Average profit or loss per trade, in R (units of your initial risk). +0.45R means on average you make 45% of what you risked, every trade.",
  r: "R-multiple: result measured against your initial risk. Risk ₹1,000 and make ₹2,000 → +2R. Stopped out → −1R. Lets INR and USD trades be compared fairly.",
  rr: "Risk : Reward — potential gain vs what you risk. 1:2 means the target wins twice what the stop loses.",
  winRate: "Share of closed trades that made money. High win rate with tiny wins can still lose overall — read it with expectancy.",
  profitFactor: "Gross profits ÷ gross losses. Above 1.5 is solid; below 1.0 means losses outweigh wins.",
  maxDrawdown: "Worst peak-to-trough fall of your cumulative R curve — the deepest hole you had to trade out of.",
  process: "Grades the QUALITY of the decision (thesis, execution, risk, regime) separately from the outcome. Good process can lose money; bad process can win. Only process repeats.",
  thesisAccuracy: "How often reality diverged from market expectations the way you predicted — independent of whether the trade made money.",
  investorIq: "Composite of thesis accuracy, calibration and bear-case awareness. Measures whether your predictions are good — not whether you got lucky.",
  calibration: "Whether your confidence matches reality: theses logged at 80% conviction should be right about 80% of the time.",
  effectiveBets: "How many truly independent positions you hold after concentration. 5 positions with one at 60% of the book ≈ 2 effective bets.",
  signal: "Rule-based technical setups from the strategy playbook (EMA Pullback, Breakout Watch). WAIT = no setup criteria currently met.",
};

export function Term({ k, children, style = {} }) {
  const [open, setOpen] = useState(false);
  const text = GLOSSARY[k];
  if (!text) return children ?? null;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{ borderBottom: `1px dotted ${C.muted}99`, cursor: "help", ...style }}
      >{children}</span>
      {open && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 7px)", left: "50%", transform: "translateX(-50%)",
          zIndex: 200, width: 240, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "10px 12px", fontSize: T.caption, lineHeight: 1.55, color: C.text,
          boxShadow: "0 10px 28px #00000077", textTransform: "none", letterSpacing: "normal",
          fontWeight: 500, fontFamily: "inherit", whiteSpace: "normal", textAlign: "left", pointerEvents: "none",
        }}>{text}</span>
      )}
    </span>
  );
}
