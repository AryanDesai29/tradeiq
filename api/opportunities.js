// Vercel Serverless Function — Opportunity Discovery Engine.
// Given a snapshot of watchlist/universe stocks (price + simple technicals), the
// AI proactively proposes investable THESES. Returns JSON (Groq JSON mode); the
// client validates/clamps (src/opportunities.js). No fundamentals are available,
// so output is explicitly HYPOTHESES to critique, not facts — the prompt enforces
// the same anti-fabrication discipline as the rest of the app.

import { verifyUser } from './_auth.js';
import { enforce, tooMany } from './_ratelimit.js';

const THESIS_TYPES = [
  'Demand Acceleration', 'Demand Deceleration', 'Market Share Gain', 'Margin Expansion',
  'Product Cycle', 'Turnaround', 'Cyclical Recovery', 'Valuation Re-rating',
  'Technical Momentum', 'Earnings Beat', 'Mean Reversion',
];

const SYSTEM = `You are the Opportunity Discovery engine of a disciplined investing OS. From a list of stocks (with price and basic technicals), proactively propose the most interesting investable IDEAS, Litman-style: edge comes from REALITY diverging from what the MARKET EXPECTS.

Hard rules:
- You have NO fundamentals, filings, or news — only the technical snapshot given. So every "reality_hypothesis" is a HYPOTHESIS for the user to critique, never a stated fact. Phrase reality/evidence as possibilities ("may", "could", "if"). Do NOT fabricate specific numbers, guidance, or events.
- Only use tickers from the provided list. Never invent a ticker.
- Be selective and honest. A flat, uninteresting stock should be skipped, not forced into an idea. Prefer fewer strong ideas over filler.
- Ground each idea in the snapshot (trend vs EMA20/EMA200, RSI, recent change) plus general, non-fabricated market understanding.
- If a USER TRACK RECORD section is provided, personalize: prefer thesis types where the user has a PROVEN edge, and be noticeably more skeptical (lower confidence, sharper bear case) on thesis types that are proven leaks. Never invent a track record that isn't given.

For each opportunity:
- thesis_type: ONE of exactly: ${THESIS_TYPES.join(', ')}.
- market_expectations: what consensus likely believes now (1 sentence).
- reality_hypothesis: what might actually be true that diverges (1 sentence, hypothesis).
- evidence: what to check to confirm/deny it (concrete research pointers, not invented facts).
- bull_case / bear_case: 1 sentence each.
- invalidation: what observation would kill the idea.
- confidence: integer 0-100 (your conviction in the DIVERGENCE, given limited data — be modest).
- risk_level: "low" | "medium" | "high".

Respond with ONLY a JSON object: {"opportunities":[{"ticker":string,"thesis_type":string,"market_expectations":string,"reality_hypothesis":string,"evidence":string,"bull_case":string,"bear_case":string,"invalidation":string,"confidence":int,"risk_level":string}]}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  // Generation is expensive (big prompt) → tight cap: 6/hour, 2/min burst.
  const rl = await enforce(`u:${user.id}`, [['opps_burst', 2, 60], ['opps_hourly', 6, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const { stocks, market, count, lens } = req.body || {};
  if (!Array.isArray(stocks) || stocks.length === 0) return res.status(400).json({ error: 'Missing stocks' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  const n = Math.max(1, Math.min(10, +count || 8));
  const universe = stocks.slice(0, 30).map((s) => ({
    ticker: s.ticker, name: s.name, currency: s.currency,
    price: s.price, chgPct: s.chg, rsi: s.rsi, ema20: s.ema20, ema200: s.ema200,
  }));
  const lensBlock = typeof lens === 'string' && lens.trim() ? `\nUSER TRACK RECORD (real, from their journal):\n${lens.trim().slice(0, 700)}` : '';
  const userMsg = `Market: ${market === 'india' ? 'India NSE' : 'US (NYSE/NASDAQ)'}. Propose up to ${n} of the strongest opportunities (skip uninteresting names).${lensBlock}\nStocks:\n${JSON.stringify(universe, null, 0)}`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
        max_tokens: 2200,
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await resp.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(content); } catch { return res.status(502).json({ error: 'Model returned invalid JSON' }); }
    return res.status(200).json({ opportunities: parsed.opportunities || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
