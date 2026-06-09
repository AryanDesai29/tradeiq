// Vercel Serverless Function — Groq key stays SECRET on server.
// Requires a valid Supabase session (JWT) so only signed-in users can spend
// our Groq credits. Optional email allowlist via CHAT_EMAIL_ALLOWLIST.

const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ALLOWLIST = (process.env.CHAT_EMAIL_ALLOWLIST || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Best-effort per-user rate limit. In-memory, so it resets on cold start —
// fine as a light guard for a private 1-2 user app (the JWT gate is the real lock).
const hits = new Map();
function limited(key, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Require a valid Supabase session ──
  if (!SUPABASE_URL || !SUPABASE_ANON) return res.status(500).json({ error: 'Auth not configured' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in required' });

  let user;
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!ur.ok) return res.status(401).json({ error: 'Invalid session' });
    user = await ur.json();
  } catch {
    return res.status(401).json({ error: 'Auth check failed' });
  }
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });
  if (ALLOWLIST.length && !ALLOWLIST.includes((user.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'This account is not authorized' });
  }
  if (limited(user.id)) return res.status(429).json({ error: 'Slow down a moment and try again.' });

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
