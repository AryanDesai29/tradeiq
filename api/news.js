// Vercel Serverless Function — ticker news headlines for the Research Analyst.
// Proxies Yahoo Finance's search endpoint with newsCount only (no API key,
// works for US and .NS symbols). Returns dated headlines the analyst may cite
// as facts-of-publication; article contents are never fetched, so claims about
// what's INSIDE an article stay assumptions — the same honesty rule as
// api/research.js enforces.

import { verifyUser } from './_auth.js';
import { enforce, callerKey, tooMany } from './_ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  const rl = await enforce(callerKey(req, user?.id), [['news_hourly', 60, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const ticker = String(req.query.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return res.status(400).json({ error: 'Bad ticker' });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=0&newsCount=10`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`Yahoo status ${r.status}`);
    const d = await r.json();
    const news = (d.news || [])
      .filter((n) => n && n.title && n.providerPublishTime)
      .slice(0, 10)
      .map((n) => ({
        title: String(n.title).slice(0, 160),
        publisher: String(n.publisher || '').slice(0, 40),
        providerPublishTime: n.providerPublishTime,
        link: typeof n.link === 'string' ? n.link.slice(0, 400) : '',
      }));
    return res.status(200).json({ ticker, news });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
