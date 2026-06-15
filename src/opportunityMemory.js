// ─── OPPORTUNITY MEMORY (pure) ────────────────────────────────────────────────
// The feedback loop for the Opportunity Queue: remember everything it surfaced,
// what you did with it, and what the price did AFTER. Facts only — perf_pct is a
// measured delta, never a forecast. The "which opportunity types work for Aryan"
// inference is gated behind sample size (memoryStats), never asserted early.

// Disposition derived from current portfolio/opportunity state.
export function disposition(rec, { held = new Set(), researched = new Set(), rejected = new Set() } = {}) {
  const t = rec.ticker;
  if (held.has(t)) return "traded";
  if (rejected.has(t)) return "rejected";
  if (researched.has(t)) return "investigated";
  return "surfaced"; // surfaced but not acted on = "ignored", the most valuable signal
}

export function perfPct(priceAtSurface, priceNow) {
  const a = Number(priceAtSurface), b = Number(priceNow);
  if (!(a > 0) || !(b > 0)) return null;
  return Math.round(((b - a) / a) * 1000) / 10;
}

// Candidates not yet remembered (dedup by ticker+kind against existing rows).
export function newToRemember(candidates = [], existing = []) {
  const have = new Set(existing.map((r) => `${r.ticker}|${r.kind}`));
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const key = `${c.ticker}|${c.kind}`;
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}

const avgBy = (records, keyFn) => {
  const m = {};
  for (const r of records) { const k = keyFn(r) || "?"; (m[k] = m[k] || []).push(r.perf_pct); }
  return Object.entries(m)
    .map(([k, arr]) => ({ k, n: arr.length, avg: Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg);
};

// Gated learning: only once enough PRICED records exist do we report averages —
// otherwise we return the lock (Conditioning Rule: never claim a pattern on noise).
export function memoryStats(records = [], minSample = 20) {
  const priced = records.filter((r) => r.perf_pct != null);
  if (priced.length < minSample) {
    return { locked: true, n: priced.length, minSample, reasons: [`${priced.length}/${minSample} priced opportunities recorded`, "Avg performance by opportunity-type & disposition unlocks with more data"] };
  }
  return { locked: false, n: priced.length, byKind: avgBy(priced, (r) => r.kind), byDisposition: avgBy(priced, (r) => r.status) };
}
