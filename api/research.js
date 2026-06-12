// Vercel Serverless Function — RESEARCH ANALYST ENGINE (P3).
//
// Executes queued research tasks for one opportunity and returns a structured
// research brief. The model has NO filings, news or fundamentals — only the
// technical snapshot plus general, stable knowledge — so the prompt enforces
// the hardest anti-fabrication contract in the app: every claim labeled, and
// UNKNOWN (with where to verify) is a first-class, expected answer. The client
// normalizes the result (src/analyst.js) before anything is stored.

import { verifyUser } from './_auth.js';
import { enforce, tooMany } from './_ratelimit.js';

const SYSTEM = `You are the Research Analyst engine of a disciplined investing OS — a junior analyst who researches an investment thesis so the user only has to decide.

ABSOLUTE DATA HONESTY (highest priority): Your only current data is the technical snapshot plus, when provided, a VERIFIED SOURCES section (real dated news headlines and a real SEC filings index, fetched moments ago). Beyond that you have only general, stable knowledge (what a company does, who it competes with, how its industry structurally works). Therefore:
- Label EVERY claim inline: [FACT] stable general knowledge or a cited source · [ASSUMPTION] reasonable but unverified · [OPINION] interpretation · [SPECULATION] low-confidence guess.
- VERIFIED SOURCES rules: a headline's text, publisher and date are FACTS — cite them as (Publisher, date). A filing's existence, form and date are FACTS — cite as (10-Q, date). But you have NOT read the articles or filings: anything about their CONTENTS beyond the headline is ASSUMPTION at best, and the right move is to direct the user to that specific filing/article in "missing_evidence".
- Anything still requiring unprovided current data (recent quarters' numbers, today's valuation/multiples, guidance, market share figures) is UNKNOWN: say so explicitly, put it in "unknowns", and point to where the user can verify. NEVER invent numbers, dates, quotes or "recent" events. NEVER fabricate market expectations.
- "This is unknowable from here" is a CORRECT answer, never a failure. Be selective and honest over complete-looking.

TASKS: answer each research task in 2-4 labeled sentences keyed by its exact id. If a task cannot be answered without current data, the summary must say exactly that plus where to verify.

BRIEF: after the tasks, synthesize one research brief. facts/assumptions/opinions/speculation/unknowns are SEPARATE lists — never blend them. evidence_strength = how solid the available evidence actually is (0-100; with no sources provided it is rarely above 55, and even with sources judge by their strength, recency and relevance — be harsh). research_confidence = your overall confidence in this brief (0-100, modest).

If a USER TRACK RECORD section is provided, research through that lens: scrutinize ideas matching their proven leaks harder, and note when an idea fits their proven edge.

Respond ONLY with JSON:
{"findings":[{"id":string,"summary":string}],"brief":{"executive_summary":string,"key_findings":[string],"bull_case":string,"bear_case":string,"reality_vs_expectations":string,"facts":[string],"assumptions":[string],"opinions":[string],"speculation":[string],"unknowns":[string],"risks":[string],"missing_evidence":[string],"next_questions":[string],"council_questions":[string],"evidence_strength":int,"research_confidence":int}}`;

const s = (v, max = 240) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  // A research run is the most expensive call after full council → tight caps.
  const rl = await enforce(`u:${user.id}`, [['research_burst', 2, 60], ['research_hourly', 8, 3600]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const { opportunity, tasks, snapshot, lens, sourcesText } = req.body || {};
  if (!opportunity || typeof opportunity !== 'object' || !s(opportunity.ticker, 20)) {
    return res.status(400).json({ error: 'Missing opportunity' });
  }
  if (!Array.isArray(tasks) || tasks.length === 0) return res.status(400).json({ error: 'No research tasks queued' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  const opp = {
    ticker: s(opportunity.ticker, 20).toUpperCase(), name: s(opportunity.name, 80),
    thesis_type: s(opportunity.thesis_type, 40), market_expectations: s(opportunity.market_expectations),
    reality_hypothesis: s(opportunity.reality_hypothesis), evidence: s(opportunity.evidence),
    bull_case: s(opportunity.bull_case), bear_case: s(opportunity.bear_case),
    invalidation: s(opportunity.invalidation), confidence: +opportunity.confidence || 0,
    risk_level: s(opportunity.risk_level, 10),
  };
  const taskList = tasks.slice(0, 10).map((t) => ({ id: s(t?.id, 16), type: s(t?.type, 30), question: s(t?.question) })).filter((t) => t.id && t.question);
  if (!taskList.length) return res.status(400).json({ error: 'No usable research tasks' });

  const snap = snapshot && typeof snapshot === 'object'
    ? `SNAPSHOT (only live data you have): price ${+snapshot.price || '?'}, chg ${snapshot.chg ?? '?'}%, RSI ${snapshot.rsi ?? '?'}${snapshot.ema20 ? `, EMA20 ${snapshot.ema20}` : ''}${snapshot.ema200 ? `, EMA200 ${snapshot.ema200}` : ''}`
    : 'SNAPSHOT: none available.';

  const userMsg = [
    `THESIS UNDER RESEARCH:\n${JSON.stringify(opp)}`,
    snap,
    s(sourcesText, 1900), // pre-formatted by src/sources.js sourcesBlock; '' when nothing real to cite
    s(lens, 700) ? `USER TRACK RECORD (real, from their journal):\n${s(lens, 700)}` : '',
    `RESEARCH TASKS (answer every id):\n${JSON.stringify(taskList)}`,
  ].filter(Boolean).join('\n\n');

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
        max_tokens: 2400,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await resp.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(content); } catch { return res.status(502).json({ error: 'Model returned invalid JSON' }); }
    return res.status(200).json({
      findings: parsed.findings || [],
      brief: parsed.brief || null,
      usage: data.usage ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
