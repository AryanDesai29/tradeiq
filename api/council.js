// Vercel Serverless Function — THE INVESTMENT COUNCIL debate engine.
//
// mode "convene": topic + personalized context (built client-side, like
//   /api/chat's systemPrompt) → ONE Groq JSON-mode call that scripts the whole
//   session in the COMPACT wire schema (api/_council_prompts.js). Two tiers:
//   council "quick" (default — 4-member panel, compressed context, ~900 max
//   output tokens) and "full" (all ten members, opt-in). All animation, pacing,
//   speech bubbles and interruption theatrics are rendered client-side from the
//   compact data — zero output tokens are spent on presentation. The client
//   also caches sessions by topic hash, so identical debates never reach here.
// mode "ask": question one member, who answers in character (single persona in
//   the prompt, not the whole roster).

import { verifyUser } from './_auth.js';
import { enforce, tooMany } from './_ratelimit.js';
import { MODES, buildConveneMessages, buildAskSystem, MEMBER_CODE } from './_council_prompts.js';

const MEMBER_IDS = Object.values(MEMBER_CODE);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  const { mode } = req.body || {};

  if (mode === 'ask') {
    const rl = await enforce(`u:${user.id}`, [['council_ask_burst', 4, 60], ['council_ask_hourly', 20, 3600]]);
    if (!rl.ok) return tooMany(res, rl.retryAfter);

    const { member, question, brief, context } = req.body || {};
    if (!MEMBER_IDS.includes(member) || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Missing member or question' });
    }
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: buildAskSystem(member, context, brief) }, { role: 'user', content: question.trim().slice(0, 500) }],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      const data = await resp.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.status(200).json({ reply: data.choices?.[0]?.message?.content || 'No response', usage: data.usage ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens } : null });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Convene a session. Quick is cheap; full is the expensive opt-in. ──
  const council = MODES[req.body?.council] ? req.body.council : 'quick';
  const rl = await enforce(`u:${user.id}`, council === 'full'
    ? [['council_burst', 2, 60], ['council_full_hourly', 4, 3600]]
    : [['council_burst', 2, 60], ['council_hourly', 10, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const { topic, context } = req.body || {};
  if (!topic || typeof topic !== 'object' || typeof topic.title !== 'string' || !topic.title.trim()) {
    return res.status(400).json({ error: 'Missing topic' });
  }

  const { cfg, messages } = buildConveneMessages(council, topic, context);
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: cfg.maxTokens,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await resp.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(content); } catch { return res.status(502).json({ error: 'Model returned invalid JSON' }); }
    return res.status(200).json({ session: parsed, council, usage: data.usage ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens } : null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
