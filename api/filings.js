// Vercel Serverless Function — SEC EDGAR filings index for the Research Analyst.
// Free, official, no API key: ticker → CIK via the SEC's company_tickers.json
// (cached per warm instance, 24h TTL), then the registrant's recent filings
// from data.sec.gov. Returns the filings INDEX only (form, date, doc link) —
// contents are never fetched, so the analyst can cite that a 10-Q exists and
// point the user at it, never claim what's inside. Indian (.NS) tickers are
// reported honestly as unsupported (EDGAR covers SEC registrants only).
//
// SEC fair-access policy requires a declared User-Agent with a contact.

import { verifyUser } from './_auth.js';
import { enforce, callerKey, tooMany } from './_ratelimit.js';
import { cikFor, fetchSubmissions, isNonUS, NON_US_NOTE } from './_edgar.js';

const FORMS = new Set(['10-K', '10-Q', '8-K', 'DEF 14A', '20-F', '6-K', 'S-1']);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  const rl = await enforce(callerKey(req, user?.id), [['filings_hourly', 30, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const ticker = String(req.query.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return res.status(400).json({ error: 'Bad ticker' });

  // Non-US listings: say so instead of returning a misleading empty list.
  if (isNonUS(ticker)) {
    return res.status(200).json({ ticker, filings: [], note: NON_US_NOTE });
  }

  try {
    const reg = await cikFor(ticker);
    if (!reg) return res.status(200).json({ ticker, filings: [], note: `No SEC registrant found for ${ticker} — it may be an ETF or non-US issuer.` });

    const d = await fetchSubmissions(reg.cik);
    const rec = d?.filings?.recent || {};
    const filings = [];
    for (let i = 0; i < (rec.form || []).length && filings.length < 10; i++) {
      const form = rec.form[i];
      if (!FORMS.has(form)) continue;
      const acc = String(rec.accessionNumber[i] || '').replace(/-/g, '');
      const doc = rec.primaryDocument?.[i] || '';
      filings.push({
        form,
        filed: rec.filingDate[i] || '',
        title: String(rec.primaryDocDescription?.[i] || '').slice(0, 120),
        link: acc && doc ? `https://www.sec.gov/Archives/edgar/data/${reg.cik}/${acc}/${doc}` : '',
        accession: acc, // permanent cache key for /api/ingest (P3.2b)
      });
    }
    return res.status(200).json({ ticker, company: reg.name, filings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
