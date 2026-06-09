// Vercel Serverless Function — Groq key stays SECRET on server.
// Requires a valid Supabase session (JWT) so only signed-in users can spend
// our Groq credits. Optional email allowlist via CHAT_EMAIL_ALLOWLIST.

import { verifyUser } from './_auth.js';
import { enforce, tooMany } from './_ratelimit.js';

const ALLOWLIST = (process.env.CHAT_EMAIL_ALLOWLIST || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Require a valid Supabase session ──
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  if (ALLOWLIST.length && !ALLOWLIST.includes((user.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'This account is not authorized' });
  }

  // ── Rate limit: 30 requests/hour with a 5/minute burst cap, per user ──
  // Stops infinite loops, accidental Groq bill spikes, and abuse if a token leaks.
  const rl = await enforce(`u:${user.id}`, [['chat_burst', 5, 60], ['chat_hourly', 30, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  // ── Validate input ──
  const { messages, systemPrompt } = req.body || {};
  if (!Array.isArray(messages) || !systemPrompt) return res.status(400).json({ error: 'Missing fields' });
  if (messages.length > 20) return res.status(400).json({ error: 'Too many messages' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 900,
        temperature: 0.6,
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json({ reply: data.choices?.[0]?.message?.content || 'No response' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
