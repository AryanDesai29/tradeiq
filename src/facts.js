// ─── XBRL FACTS (P3.2a, pure) — deterministic fundamentals, zero LLM ──────────
//
// The strongest evidence class in the app: hard numbers straight from a
// company's SEC XBRL companyfacts (api/facts.js reduces the 3.9MB blob to a
// compact quarterly series). This module does the trend math — YoY/QoQ revenue
// growth, gross/operating/net margins and their deltas, R&D intensity — and
// renders a ≤600-char prompt block labelled [FACT, XBRL …]. No LLM ever touches
// these numbers, so there is no hallucination surface: a missing tag is OMITTED,
// never guessed (banks/insurers use different tags; .NS issuers don't file XBRL).

const str = (v, max = 40) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v) => (Number.isFinite(+v) ? +v : null);

// One quarterly data point → {end(YYYY-MM-DD), val, fy, fp, form, filed}.
function normPoint(p) {
  if (!p || typeof p !== "object") return null;
  const end = str(p.end, 12), val = num(p.val);
  if (!end || val == null) return null;
  return { end, val, fy: num(p.fy), fp: str(p.fp, 4), form: str(p.form, 12), filed: str(p.filed, 12) };
}

// A series is chronological (oldest→newest), deduped by `end`, capped.
function normSeries(arr, max = 12) {
  if (!Array.isArray(arr)) return [];
  const byEnd = new Map();
  for (const raw of arr) {
    const p = normPoint(raw);
    if (!p) continue;
    const prev = byEnd.get(p.end);
    // Restatements win: keep the point with the latest `filed`.
    if (!prev || (p.filed && p.filed > prev.filed)) byEnd.set(p.end, p);
  }
  return [...byEnd.values()].sort((a, b) => (a.end < b.end ? -1 : 1)).slice(-max);
}

export const FACT_TAGS = ["revenue", "grossProfit", "operatingIncome", "netIncome", "rnd"];

// Defensive normalizer for the /api/facts payload (or cached copy). Never trusts
// raw shape — same clamp discipline as normalizeBrief/normalizeSession.
export function normalizeFacts(raw) {
  if (!raw || typeof raw !== "object") return null;
  const series = {};
  for (const tag of FACT_TAGS) series[tag] = normSeries(raw.series?.[tag]);
  if (!series.revenue.length && !series.netIncome.length) return null; // nothing citable
  return {
    ticker: str(raw.ticker, 20).toUpperCase(),
    company: str(raw.company, 80),
    asOf: str(raw.asOf, 12),
    series,
    note: str(raw.note, 160),
  };
}

export const hasFacts = (f) => !!(f && (f.series?.revenue?.length || f.series?.netIncome?.length));

// ── Trend math ──────────────────────────────────────────────────────────────
const last = (a) => (a.length ? a[a.length - 1] : null);

// Find the year-ago comparison point: same fiscal period one year back, else the
// 4th-prior quarter by position (regular quarterly spacing).
function yearAgo(series, latest) {
  if (!latest) return null;
  const matched = series.find((p) => p.fp && p.fp === latest.fp && p.fy === latest.fy - 1);
  if (matched) return matched;
  const i = series.indexOf(latest);
  return i >= 4 ? series[i - 4] : null;
}

const pct = (cur, base) => (base && Number.isFinite(cur) && base !== 0 ? (cur - base) / Math.abs(base) : null);

// Margin (0..1) for the metric value at a given quarter-end, against revenue at
// the same end. Returns null if either side is missing.
function marginAt(series, revByEnd, end) {
  const p = series.find((x) => x.end === end);
  const rev = revByEnd.get(end);
  if (!p || rev == null || rev === 0) return null;
  return p.val / rev;
}

// The full computed view used by both the prompt block and the UI panel.
export function factsTrends(f) {
  const nf = normalizeFacts(f);
  if (!nf) return null;
  const { revenue, grossProfit, operatingIncome, netIncome, rnd } = nf.series;
  const revByEnd = new Map(revenue.map((p) => [p.end, p.val]));
  const latestRev = last(revenue);
  const prevRev = revenue.length >= 2 ? revenue[revenue.length - 2] : null;
  const yaRev = yearAgo(revenue, latestRev);

  const end = latestRev?.end;
  const yaEnd = yaRev?.end;
  const marginDelta = (series) => {
    if (!end || !yaEnd) return null;
    const cur = marginAt(series, revByEnd, end), then = marginAt(series, revByEnd, yaEnd);
    return cur != null && then != null ? cur - then : null; // in fraction; ×100 = pp
  };

  return {
    ticker: nf.ticker,
    company: nf.company,
    asOf: nf.asOf,
    note: nf.note,
    quarters: revenue.length,
    revenue: latestRev
      ? { end, form: latestRev.form, val: latestRev.val, fp: latestRev.fp, fy: latestRev.fy,
          yoy: yaRev ? pct(latestRev.val, yaRev.val) : null,
          qoq: prevRev ? pct(latestRev.val, prevRev.val) : null }
      : null,
    grossMargin: end ? { latest: marginAt(grossProfit, revByEnd, end), deltaYoY: marginDelta(grossProfit) } : null,
    operatingMargin: end ? { latest: marginAt(operatingIncome, revByEnd, end), deltaYoY: marginDelta(operatingIncome) } : null,
    netMargin: end ? { latest: marginAt(netIncome, revByEnd, end), deltaYoY: marginDelta(netIncome) } : null,
    rndIntensity: end ? marginAt(rnd, revByEnd, end) : null,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────
const money = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return `${Math.round(v)}`;
};
const signPct = (x) => (x == null ? "?" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`);
const pp = (x) => (x == null ? null : `${x >= 0 ? "▲" : "▼"}${Math.abs(x * 100).toFixed(1)}pp`);
const marginStr = (m) => (m?.latest == null ? null : `${(m.latest * 100).toFixed(1)}%${pp(m.deltaYoY) ? ` (${pp(m.deltaYoY)} YoY)` : ""}`);

// ≤600-char prompt block for api/research + council context. Empty when there
// is nothing hard to cite (caller then falls back to the no-facts discipline).
// Every line is the FACT evidence class, dated to the source filing.
export function factsBlock(f) {
  const t = factsTrends(f);
  if (!t || !t.revenue) return "";
  const tag = `[FACT, XBRL ${t.revenue.form || "10-Q"} ${t.revenue.end}]`;
  const parts = [];
  parts.push(`REVENUE ${money(t.revenue.val)} (${signPct(t.revenue.yoy)} YoY, ${signPct(t.revenue.qoq)} QoQ)`);
  const gm = marginStr(t.grossMargin); if (gm) parts.push(`GROSS MARGIN ${gm}`);
  const om = marginStr(t.operatingMargin); if (om) parts.push(`OP MARGIN ${om}`);
  const nm = marginStr(t.netMargin); if (nm) parts.push(`NET MARGIN ${nm}`);
  if (t.rndIntensity != null) parts.push(`R&D ${(t.rndIntensity * 100).toFixed(0)}% of revenue`);
  const head = `VERIFIED FUNDAMENTALS ${tag} — hard XBRL numbers, cite as fact (never re-estimate; ${t.quarters}q of history):`;
  return `${head}\n${parts.join(" · ")}`.slice(0, 600);
}

// Compact one-liner for the council context (≤240 chars, no preamble).
export function factsLine(f) {
  const t = factsTrends(f);
  if (!t || !t.revenue) return "";
  const gm = t.grossMargin?.latest, nm = t.netMargin?.latest;
  return `XBRL ${t.revenue.form || "10-Q"} ${t.revenue.end}: rev ${money(t.revenue.val)} (${signPct(t.revenue.yoy)} YoY)${gm != null ? `, gross ${(gm * 100).toFixed(0)}%` : ""}${nm != null ? `, net ${(nm * 100).toFixed(0)}%` : ""}`.slice(0, 240);
}
