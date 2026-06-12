// Vercel Serverless Function — XBRL FACTS ENGINE (P3.2a), deterministic, zero LLM.
//
// data.sec.gov XBRL companyfacts → pure computation → hard FACTS. Fetches the
// (~4MB) companyfacts blob, extracts a fixed tag set, keeps only true
// single-quarter data points (period ≈ 90 days, so 9-month/annual cumulatives
// never pollute QoQ/YoY math), dedupes by period-end keeping the latest filing
// (restatements win), and returns the last 12 quarters reduced to ~2KB. The big
// blob never reaches the client. Numbers come from XBRL only — never an LLM —
// so there is no hallucination surface; a missing tag is omitted, never guessed.

import { verifyUser } from './_auth.js';
import { enforce, callerKey, tooMany } from './_ratelimit.js';
import { cikFor, fetchCompanyFacts, isNonUS, NON_US_NOTE } from './_edgar.js';

// Our metric → ordered list of us-gaap tags (first present wins; fallbacks for
// companies that report under the newer revenue-recognition tag).
const TAG_MAP = {
  revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss'],
  rnd: ['ResearchAndDevelopmentExpense'],
};

const dayspan = (start, end) => {
  const a = Date.parse(start), b = Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 86400000 : NaN;
};

// Pull the cleanest quarterly series for one metric from the companyfacts facts.
function quarterly(facts, tags) {
  const ns = facts?.['us-gaap'] || {};
  for (const tag of tags) {
    const units = ns[tag]?.units?.USD;
    if (!Array.isArray(units) || !units.length) continue;
    const byEnd = new Map();
    for (const p of units) {
      if (!p || typeof p.val !== 'number' || !p.end) continue;
      // Flow metrics: keep only ~single-quarter periods. Instant/duration-less
      // points (no start) are balance-sheet items we don't request, so skip.
      if (!p.start) continue;
      const d = dayspan(p.start, p.end);
      if (!(d >= 80 && d <= 100)) continue;
      const prev = byEnd.get(p.end);
      if (!prev || String(p.filed || '') > String(prev.filed || '')) {
        byEnd.set(p.end, { end: p.end, val: p.val, fy: p.fy ?? null, fp: p.fp || '', form: p.form || '', filed: p.filed || '' });
      }
    }
    if (byEnd.size) return [...byEnd.values()].sort((a, b) => (a.end < b.end ? -1 : 1)).slice(-12);
  }
  return [];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  const rl = await enforce(callerKey(req, user?.id), [['facts_hourly', 40, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const ticker = String(req.query.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return res.status(400).json({ error: 'Bad ticker' });

  if (isNonUS(ticker)) return res.status(200).json({ ticker, series: {}, note: NON_US_NOTE });

  try {
    const reg = await cikFor(ticker);
    if (!reg) return res.status(200).json({ ticker, series: {}, note: `No SEC registrant found for ${ticker} — it may be an ETF or non-US issuer.` });

    const cf = await fetchCompanyFacts(reg.cik);
    if (!cf?.facts) return res.status(200).json({ ticker, company: reg.name, cik: reg.cik, series: {}, note: `${ticker} files with the SEC but publishes no XBRL financial facts (common for ETFs and some foreign issuers).` });

    const series = {};
    let asOf = '';
    for (const [metric, tags] of Object.entries(TAG_MAP)) {
      series[metric] = quarterly(cf.facts, tags);
      for (const p of series[metric]) if (p.filed > asOf) asOf = p.filed;
    }

    const note = series.revenue.length || series.netIncome.length
      ? '' // honest signal when a financial issuer uses tags we don't extract:
      : `No standard revenue/income XBRL tags found for ${ticker} — banks, insurers and REITs report under different tags, so fundamentals are unavailable here.`;

    return res.status(200).json({ ticker, company: reg.name, cik: reg.cik, asOf, series, note });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
