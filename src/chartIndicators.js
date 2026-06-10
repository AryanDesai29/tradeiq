// ─── CHART INDICATORS (pure) — computed client-side from candles ──────────────
// Deliberately small: the chart is a decision workspace, not an indicator dump.
// EMA20/EMA200/RSI/MACD come from the server; EMA50 + VWAP are computed here.

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// Exponential moving average. Returns an array aligned to closes; null before the
// period seeds (first value = SMA of the first `period` closes).
export function emaArr(closes = [], period = 50) {
  const out = Array(closes.length).fill(null);
  if (closes.length < period) return out;
  const k = 2 / (period + 1);
  let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = e;
  for (let i = period; i < closes.length; i++) { e = closes[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

// Running VWAP over the loaded window: Σ(typical×vol) / Σ(vol), typical=(h+l+c)/3.
// Daily candles have no intraday session, so this is a cumulative anchored VWAP.
export function vwapArr(candles = []) {
  let pv = 0, vv = 0;
  return candles.map((c) => {
    const tp = (c.h + c.l + c.c) / 3, v = c.v || 0;
    pv += tp * v; vv += v;
    return vv ? pv / vv : null;
  });
}

// Fibonacci retracement price levels between two swing points (order-independent).
export function fibLevels(priceA, priceB) {
  const hi = Math.max(priceA, priceB), lo = Math.min(priceA, priceB);
  return FIB_LEVELS.map((L) => ({ level: L, price: hi - (hi - lo) * L }));
}
