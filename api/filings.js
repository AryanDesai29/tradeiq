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

const SEC_UA = { 'User-Agent': 'TradeIQ personal research app (aryan.desai.viral@gmail.com)' };
const FORMS = new Set(['10-K', '10-Q', '8-K', 'DEF 14A', '20-F', '6-K', 'S-1']);

// ticker → CIK map, cached per warm lambda (the source file is ~1MB; SEC asks
// clients not to refetch it per request).
let cikCache = { map: null, at: 0 };
async function cikFor(ticker) {
  const now = Date.now();
  if (!cikCache.map || now - cikCache.at > 24 * 3600 * 1000) {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: SEC_UA });
    if (!r.ok) throw new Error(`SEC tickers status ${r.status}`);
    const d = await r.json();
    const map = new Map();
    for (const k of Object.keys(d)) map.set(String(d[k].ticker).toUpperCase(), { cik: d[k].cik_str, name: d[k].title });
    cikCache = { map, at: now };
  }
  return cikCache.map.get(ticker) || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  const rl = await enforce(callerKey(req, user?.id), [['filings_hourly', 30, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const ticker = String(req.query.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return res.status(400).json({ error: 'Bad ticker' });

  // Non-US listings: say so instead of returning a misleading empty list.
  if (ticker.endsWith('.NS') || ticker.endsWith('.BO')) {
    return res.status(200).json({ ticker, filings: [], note: 'Indian listings file with NSE/BSE, not the SEC — check the exchange announcements page directly.' });
  }

  try {
    const reg = await cikFor(ticker);
    if (!reg) return res.status(200).json({ ticker, filings: [], note: `No SEC registrant found for ${ticker} — it may be an ETF or non-US issuer.` });

    const cik10 = String(reg.cik).padStart(10, '0');
    const r = await fetch(`https://data.sec.gov/submissions/CIK${cik10}.json`, { headers: SEC_UA });
    if (!r.ok) throw new Error(`SEC submissions status ${r.status}`);
    const d = await r.json();
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
      });
    }
    return res.status(200).json({ ticker, company: reg.name, filings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
