// Vercel Serverless Function — ticker symbol autocomplete.
// Proxies Yahoo Finance's symbol-search endpoint so the user can type a few
// letters of a company name and pick the correct ticker (with the right
// exchange suffix, e.g. RELIANCE.NS for the Indian market). Keeping it on the
// server avoids CORS issues and lets us normalise the shape the UI needs.

import { verifyUser } from './_auth.js';
import { enforce, callerKey, tooMany } from './_ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Autocomplete is chatty, so the cap is generous: 300 requests/hour per user
  // (or per IP when anonymous). Debounced typing stays well under this.
  const user = await verifyUser(req);
  const rl = await enforce(callerKey(req, user?.id), [['search_hourly', 300, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(200).json({ results: [] });

  // Optional market hint ("india" | "us") to rank the most relevant exchange first.
  const market = String(req.query.market || '').toLowerCase();

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`Yahoo status ${r.status}`);
    const d = await r.json();

    const isIndia = (sym = '', exch = '') =>
      /\.(NS|BO)$/i.test(sym) || /^(NSI|BSE)$/i.test(exch);

    let results = (d.quotes || [])
      // Equities / ETFs only — skip options, futures, currencies, indices noise.
      .filter(x => x.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'))
      .map(x => ({
        symbol:   x.symbol,
        name:     x.shortname || x.longname || x.symbol,
        exchange: x.exchDisp || x.exchange || '',
        type:     x.quoteType,
        currency: isIndia(x.symbol, x.exchange) ? 'INR' : 'USD',
      }));

    // Bias the requested market to the top without dropping the rest.
    if (market === 'india')   results.sort((a, b) => (b.currency === 'INR') - (a.currency === 'INR'));
    else if (market === 'us') results.sort((a, b) => (b.currency === 'USD') - (a.currency === 'USD'));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ results: results.slice(0, 8) });
  } catch (err) {
    return res.status(200).json({ results: [], error: err.message });
  }
}
