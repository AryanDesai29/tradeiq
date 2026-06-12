// ─── VALIDATION LAB — pure evaluation math (no I/O, no LLM, fully tested) ─────
//
// DOCTRINE: the lab grades DECISION QUALITY, never P&L. Returns appear only as
// relative grading inputs (excess vs the universe median / market baseline) —
// never as "this trade would have made X%". Optimizing the product around
// hypothetical profits is explicitly out of scope (hindsight-bias hazard).
//
// Candle shape everywhere: [{ t: "YYYY-MM-DD", c: close }] ascending by date.

// ── No-leak primitives ────────────────────────────────────────────────────────
// Everything the replay "sees" passes through sliceAsOf — candles strictly on
// or before the freeze date. Tested as the lab's core leak guard.
export function idxAsOf(candles = [], dateStr) {
  let i = -1;
  for (let k = 0; k < candles.length; k++) { if (candles[k].t <= dateStr) i = k; else break; }
  return i;
}
export function sliceAsOf(candles = [], dateStr) {
  const i = idxAsOf(candles, dateStr);
  return i < 0 ? [] : candles.slice(0, i + 1);
}

// ── Indicators — copied verbatim from api/prices.js so the replayed snapshot
// is computed EXACTLY like the live one (drift-guarded by tests). ─────────────
export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return parseFloat(e.toFixed(2));
}
export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  const rs = (gains / period) / ((losses / period) || 0.0001);
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

// The watchlist snapshot as the live app would have computed it on that date.
export function snapshotAt(candles, dateStr) {
  const past = sliceAsOf(candles, dateStr);
  if (past.length < 2) return null;
  const closes = past.map((x) => x.c);
  const price = closes[closes.length - 1], prev = closes[closes.length - 2];
  return {
    date: past[past.length - 1].t,
    price: +price.toFixed(2),
    chg: +(((price - prev) / prev) * 100).toFixed(2),
    rsi: calcRSI(closes),
    ema20: ema(closes, 20),
    ema200: ema(closes, 200),
  };
}

// ── Outcomes (revealed only AFTER the replay) ────────────────────────────────
const addDays = (dateStr, days) => {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// % move from the as-of close to the close nearest (≤) asOf+horizon days.
export function forwardReturn(candles, fromDate, horizonDays) {
  const i = idxAsOf(candles, fromDate);
  if (i < 0) return null;
  const j = idxAsOf(candles, addDays(candles[i].t, horizonDays));
  if (j <= i) return null;
  return {
    pct: +(((candles[j].c - candles[i].c) / candles[i].c) * 100).toFixed(2),
    from: candles[i].t, to: candles[j].t,
  };
}

export const median = (a) => {
  const s = [...a].filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const excessOf = (ret, baseline) =>
  ret == null || baseline == null ? null : +(ret - baseline).toFixed(2);

// ── Grading: calibration, council discrimination, member predictiveness ──────
export const CONF_BUCKETS = [[0, 50, "<50"], [50, 70, "50-69"], [70, 101, "70+"]];

// items: [{confidence, excess}] → does stated confidence track relative outcome?
export function calibration(items = []) {
  return CONF_BUCKETS.map(([lo, hi, label]) => {
    const xs = items.filter((x) => Number.isFinite(x.excess) && x.confidence >= lo && x.confidence < hi);
    return {
      bucket: label, n: xs.length,
      hitRate: xs.length ? +(xs.filter((x) => x.excess > 0).length / xs.length).toFixed(2) : null,
      avgExcess: xs.length ? +mean(xs.map((x) => x.excess)).toFixed(2) : null,
    };
  });
}

// items: [{verdict, excess}] → did Buy-ish verdicts beat Avoid-ish ones?
const verdictSide = (v) => (typeof v === "string" && v.includes("Buy") ? "buy" : typeof v === "string" && v.includes("Avoid") ? "avoid" : "neutral");
export function verdictDiscrimination(items = []) {
  const g = { buy: [], neutral: [], avoid: [] };
  for (const x of items) if (Number.isFinite(x.excess)) g[verdictSide(x.verdict)].push(x.excess);
  const agg = (a) => ({ n: a.length, avgExcess: a.length ? +mean(a).toFixed(2) : null });
  const out = { buy: agg(g.buy), neutral: agg(g.neutral), avoid: agg(g.avoid) };
  out.spread = out.buy.avgExcess != null && out.avoid.avgExcess != null
    ? +(out.buy.avgExcess - out.avoid.avgExcess).toFixed(2) : null; // >0 = council discriminates
  return out;
}

// rows: [{member, voteScore(−2…+2), excess}] → per-member directional skill.
// score = mean((voteScore/2) × sign(excess)) ∈ [−1, 1]: +1 = always strongly
// right, 0 = uninformative, −1 = reliably wrong (which is also information).
export function memberPredictiveness(rows = []) {
  const by = {};
  for (const r of rows) {
    if (!Number.isFinite(r.excess) || !Number.isFinite(r.voteScore)) continue;
    (by[r.member] = by[r.member] || []).push((r.voteScore / 2) * Math.sign(r.excess));
  }
  return Object.entries(by)
    .map(([member, xs]) => ({ member, n: xs.length, score: +mean(xs).toFixed(2) }))
    .sort((a, b) => b.score - a.score);
}

// rows: [{raised, excess}] — did a power (EVIDENCE MISSING / RED FLAGS) fire on
// the right ideas? saved = raised on an underperformer, cost = raised on a
// winner, quietMiss = silent while the idea badly underperformed.
export function powerAnalysis(rows = []) {
  const ok = rows.filter((r) => Number.isFinite(r.excess));
  return {
    raisedN: ok.filter((r) => r.raised).length,
    savedN: ok.filter((r) => r.raised && r.excess < 0).length,
    costN: ok.filter((r) => r.raised && r.excess > 0).length,
    quietMissN: ok.filter((r) => !r.raised && r.excess < -10).length,
    n: ok.length,
  };
}

// items: [{thesis_type, rsi, aboveEma200, excess}] → which signals carried
// information (avg excess by thesis type / RSI zone / trend side).
const rsiZone = (r) => (r < 40 ? "RSI<40" : r > 60 ? "RSI>60" : "RSI 40-60");
export function signalAnalysis(items = []) {
  const group = (keyFn) => {
    const m = {};
    for (const x of items) {
      if (!Number.isFinite(x.excess)) continue;
      const k = keyFn(x);
      if (k == null) continue;
      (m[k] = m[k] || []).push(x.excess);
    }
    return Object.entries(m)
      .map(([key, xs]) => ({ key, n: xs.length, avgExcess: +mean(xs).toFixed(2) }))
      .sort((a, b) => b.avgExcess - a.avgExcess);
  };
  return {
    byThesisType: group((x) => x.thesis_type || null),
    byRsi: group((x) => (Number.isFinite(x.rsi) ? rsiZone(x.rsi) : null)),
    byTrend: group((x) => (x.aboveEma200 == null ? null : x.aboveEma200 ? "above EMA200" : "below EMA200")),
  };
}

// ── Bottleneck taxonomy — deterministic first pass; transcripts still need a
// human read (an LLM grading an LLM here would reintroduce hindsight bias). ───
export function classifyMiss(it) {
  const e = it.excess;
  if (!Number.isFinite(e)) return null;
  const buyish = verdictSide(it.verdict) === "buy", avoidish = verdictSide(it.verdict) === "avoid";
  if (e < -3) {
    if (buyish) return "council_endorsed_miss";
    if ((it.confidence ?? 0) >= 70) return "overconfident_selection";
    return "weak_selection";
  }
  if (e > 3) {
    if (avoidish) return "council_blocked_winner";  // excessive skepticism, costed
    if ((it.confidence ?? 100) < 50) return "underconfident_winner";
  }
  return null; // in line with the universe — not a bottleneck signal
}

// Rank correlation: does a score (composite/confidence/evidence) ORDER outcomes?
export function spearman(xs = [], ys = []) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length;
  if (n < 3) return null;
  const rank = (arr) => {
    const sorted = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    sorted.forEach(([, orig], pos) => { r[orig] = pos + 1; });
    return r;
  };
  const rx = rank(pairs.map((p) => p[0])), ry = rank(pairs.map((p) => p[1]));
  const d2 = rx.reduce((s, r, i) => s + (r - ry[i]) ** 2, 0);
  return +(1 - (6 * d2) / (n * (n * n - 1))).toFixed(2);
}
