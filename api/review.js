// Vercel Serverless Function — generates a STRUCTURED trade review when a trade
// closes. Returns JSON (Groq JSON mode), not prose. The client validates/clamps
// the result (src/reviews.js), so this endpoint just enforces auth + rate limit
// and shapes the prompt.

import { verifyUser } from './_auth.js';
import { enforce, tooMany } from './_ratelimit.js';

const TAGS = [
  'moved_stop', 'sold_winner_early', 'held_loser_too_long', 'oversized_position',
  'undersized_position', 'no_stop', 'wide_stop', 'chased_entry', 'fomo_entry',
  'against_regime', 'earnings_gamble', 'revenge_trade', 'ignored_plan',
  'no_thesis', 'premature_exit',
];

const SYSTEM = `You are the Trade Review engine of a disciplined investing OS. Review ONE closed trade and score PROCESS QUALITY, deliberately separate from the money outcome. The cardinal rule: a sound process with a losing result is a GOOD trade; a reckless process with a winning result is a BAD trade (luck). Judge the decision, not the dollars.

Be skeptical and honest. If the trade had no logged thesis, say so and score thesis low. If risk sizing or stop placement was off, say so. Do not flatter.

Score each 0-100:
- thesis_score: was there a clear, reasonable reason to take the trade?
- execution_score: did entry/exit follow a plan (vs chasing, fumbling)?
- risk_score: position sizing within ~2% risk, logical stop placement, sound R:R?
- regime_score: was this strategy appropriate for the market environment given?
- outcome_score: the realized result on its own (the only outcome-based score).

verdict ∈ ["good_process_good_outcome","good_process_bad_outcome","bad_process_good_outcome","bad_process_bad_outcome"].

tags: choose ZERO OR MORE ONLY from this exact list (omit if none apply): ${TAGS.join(', ')}.

lessons: concrete and specific to THIS trade.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"thesis_score":int,"execution_score":int,"risk_score":int,"regime_score":int,"outcome_score":int,"verdict":string,"review_text":"2-4 sentence honest assessment","strengths":["..."],"mistakes":["..."],"lessons":{"continue":["..."],"improve":["..."],"avoid":["..."]},"tags":["..."]}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  const rl = await enforce(`u:${user.id}`, [['review_burst', 5, 60], ['review_hourly', 30, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const { trade, context } = req.body || {};
  if (!trade || typeof trade !== 'object') return res.status(400).json({ error: 'Missing trade' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  const userMsg = `Closed trade:\n${JSON.stringify(trade, null, 0)}\n\nContext: ${String(context || '').slice(0, 500)}\n\nNote: money is in the trade's own currency; "realizedR" is the result in R-multiples (P&L ÷ initial risk). Use realizedR to judge the outcome, not raw money.`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
        max_tokens: 900,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await resp.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const content = data.choices?.[0]?.message?.content || '{}';
    let review;
    try { review = JSON.parse(content); } catch { return res.status(502).json({ error: 'Model returned invalid JSON' }); }
    return res.status(200).json({ review });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
