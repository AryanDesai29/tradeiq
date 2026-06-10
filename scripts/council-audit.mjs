// Token-cost audit for THE INVESTMENT COUNCIL.
//
//   node scripts/council-audit.mjs [runs-per-config]
//
// Measures prompt tokens, completion tokens, latency and $ cost per session for:
//   v1-full  — the ORIGINAL architecture (verbose schema, 7000-char context)
//   v2-full  — redesigned Full Council (compact wire schema, trimmed prompt)
//   v2-quick — Quick Council (4-member panel, compressed context) ← new default
//
// With GROQ_API_KEY available (.env / env var) it makes real calls and reports
// measured usage + latency, and validates that v2 output survives
// normalizeSession. Without a key it falls back to a chars/3.6 static estimate
// of the prompt side and the schema-sized completion budgets.

import { readFileSync } from 'node:fs';
import { buildCouncilContext, normalizeSession } from '../src/council.js';
import { buildConveneMessages } from '../api/_council_prompts.js';

// ── Groq pricing, llama-3.3-70b-versatile ($/1M tokens) ──
const PRICE_IN = 0.59, PRICE_OUT = 0.79;

// ── Load GROQ_API_KEY without printing it ──
let KEY = process.env.GROQ_API_KEY || null;
if (!KEY) {
  for (const f of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^GROQ_API_KEY\s*=\s*"?([^"#\s]+)/);
        if (m) { KEY = m[1]; break; }
      }
    } catch {}
    if (KEY) break;
  }
}

// ── Representative account (mirrors a real active user) ──
const holdings = [
  { ticker: 'NVDA', shares: 2, avgCost: 105, price: 132, sector: 'Tech', currency: 'USD' },
  { ticker: 'AMD', shares: 3, avgCost: 140, price: 152, sector: 'Tech', currency: 'USD' },
  { ticker: 'RELIANCE.NS', shares: 4, avgCost: 2750, price: 2860, sector: 'Energy', currency: 'INR' },
  { ticker: 'HDFCBANK.NS', shares: 5, avgCost: 1500, price: 1580, sector: 'Finance', currency: 'INR' },
  { ticker: 'MSFT', shares: 1, avgCost: 410, price: 430, sector: 'Tech', currency: 'USD' },
];
const journal = [
  ...Array.from({ length: 9 }, (_, i) => ({ ticker: ['TSLA', 'META', 'INFY.NS'][i % 3], side: 'BUY', entry: '100', exit: i % 3 ? '108' : '94', stop: '95', shares: '1', closed: true, closedAt: '2026-05-01', strategy: i % 2 ? 'EMA Pullback' : 'Breakout Consolidation', thesisType: i % 2 ? 'Demand Acceleration' : 'Turnaround', sector: 'Tech', currency: 'USD', date: '2026-04-01' })),
  { ticker: 'PLTR', side: 'BUY', entry: '24', stop: '22', shares: '4', closed: false, thesisType: 'Market Share Gain', thesisConfidence: 62, currency: 'USD' },
];
const opportunities = [
  { ticker: 'NVDA', status: 'new', thesis_type: 'Demand Acceleration', confidence: 68, market_expectations: 'Consensus expects datacenter growth to decelerate next year', reality_hypothesis: 'Order momentum may still be accelerating into new product cycle' },
  { ticker: 'WIPRO.NS', status: 'watching', thesis_type: 'Turnaround', confidence: 44, market_expectations: 'Market prices continued stagnation', reality_hypothesis: 'New leadership could stabilize margins' },
];
const watchlist = [
  { ticker: 'NVDA', price: 132.4, chg: 1.8, rsi: 61, ema20: 128.9, ema200: 112.3, currency: 'USD' },
  { ticker: 'AMD', price: 152.1, chg: -0.6, rsi: 48, ema20: 153.2, ema200: 141.8, currency: 'USD' },
  { ticker: 'TSLA', price: 248.7, chg: 2.4, rsi: 67, ema20: 239.1, ema200: 215.5, currency: 'USD' },
  { ticker: 'META', price: 512.3, chg: 0.4, rsi: 55, ema20: 505.7, ema200: 468.2, currency: 'USD' },
  { ticker: 'RELIANCE.NS', price: 2861, chg: 0.7, rsi: 58, ema20: 2820, ema200: 2705, currency: 'INR' },
  { ticker: 'HDFCBANK.NS', price: 1581, chg: -0.2, rsi: 51, ema20: 1572, ema200: 1538, currency: 'INR' },
  { ticker: 'WIPRO.NS', price: 244, chg: 1.1, rsi: 43, ema20: 247, ema200: 251, currency: 'INR' },
];
const topic = { type: 'opportunity', ticker: 'NVDA', title: 'Debate the NVDA opportunity [Demand Acceleration]: market expects datacenter deceleration vs reality hypothesis of accelerating order momentum. Should capital be committed?' };
const account = { holdings, journal, reviews: [], opportunities, watchlist, topic };

// ── v1 baseline prompt (verbatim from the original api/council.js) ──
const V1_SYSTEM = `You are the Discussion Engine of THE INVESTMENT COUNCIL — an elite animated investment committee inside TradeIQ, the user's personal investing OS. You script ONE complete live committee session as JSON.

THE TEN MEMBERS (id — voice):
- chairman (Sterling 🦉, The Chairman): calm authority. Opens by framing the question, never piles on, weighs arguments, calls the vote, owns the verdict. Judges process over outcome.
- moderator (Vox 🎙️, The Moderator): brisk and procedural. Tracks claims, unresolved questions, evidence presented, and risks. Interjects mid-debate with a running scoreboard; summarizes open items before the vote.
- bull (Toro 🐂, The Bull): energetic optimist. Growth, catalysts, expansion, why this could work. Intellectually honest — concedes strong counterpoints.
- bear (Ursa 🐻, The Bear): dry, unhurried. Downside scenarios, capital preservation, the cost of being wrong, sizing.
- wizard (Veris 🧙, The Wizard): reality-vs-expectations analyst in the Joel Litman tradition. Asks what the market already prices in, where reported numbers distort true earning power, and where reality diverges from consensus.
- quant (Sigma 🤖, The Quant): terse and numeric. Base rates, expectancy, probabilities, sample size. CITES THE USER'S ACTUAL NUMBERS from context; flags small samples loudly.
- wolf (Fang 🐺, The Wolf): punchy technician. "Price pays, narrative doesn't." Trend vs EMAs, RSI, momentum, invalidation levels — only from the snapshot given.
- turtle (Atlas 🌍, The Turtle): slow, macro-machine thinker in the Ray Dalio tradition. Regime, cycles, liquidity, what environment we are in.
- detective (Marlowe 🕵️, The Detective): investigative researcher, noir tone. Missing information, contradictions, exactly what to verify next. POWER: "EVIDENCE MISSING" — may suspend the vote when critical information is absent.
- skeptic (Popper ⚖️, The Skeptic): precise devil's advocate. Attacks REASONING, never direction — weak assumptions, overconfidence, unfalsifiable claims. NOT a bear. POWER: "RED FLAG REVIEW" — may pause voting until a reasoning flaw is addressed.

DEBATE RULES:
1. transcript: 14-20 turns. Each turn = {"member": id, "text": 1-3 sentences (max ~45 words), "kind": "opening"|"argument"|"challenge"|"response"|"interjection"|"power"|"summary"}.
2. Sequence: chairman opens framing the exact topic → members debate → moderator interjects at least once mid-debate with unresolved items → moderator "summary" of open questions → chairman closes calling the vote.
3. This is a REAL CONVERSATION, not isolated opinions: at least 6 turns must directly reference a previous speaker by name ("Toro, what evidence proves that?"), agree, disagree, concede, or escalate. Skeptic challenges at least two members' reasoning. Detective lists concretely missing evidence.
4. PERSONALIZE: cite the user's actual numbers from CONTEXT (expectancy, win rate, personal edge/leak, concentration, thesis confidence) at least 3 times, verbatim. The quant owns the stats; the bear owns sizing vs the user's capital rules.
5. DATA HONESTY (highest priority): the ONLY hard data is the CONTEXT block. No invented fundamentals, figures, dates, news, or filings. Frame unverified claims as assumptions ("if demand is actually accelerating…"). "We don't have that data" is a correct, expected move — it is the Detective's whole job.
6. SPECIAL POWERS — use ONLY when genuinely warranted: if critical information is absent, detective raises evidence_hold (one "power" turn + {"raised":true,"demand":...}); if a reasoning flaw goes unresolved, skeptic raises red_flags (one "power" turn + {"raised":true,"flags":[...],"resolution": how the council addressed it}). Otherwise {"raised":false}. The vote still proceeds; unmet demands MUST appear in verdict.required_research.
7. votes: ALL TEN members vote, in character, consistent with what they argued: {"member","vote":"Strong Buy"|"Buy"|"Neutral"|"Avoid"|"Strong Avoid","confidence":0-100,"reason": max 22 words}. Disagreement is healthy — unanimous votes only when truly earned.
8. verdict (the Chairman's): {"recommendation": one of the five votes, "confidence":0-100, "bull_case":1-2 sentences, "bear_case":1-2 sentences, "key_risks":[2-4], "required_research":[1-4 concrete items], "next_action": one specific, doable step}.

Respond with ONLY a JSON object:
{"transcript":[...],"evidence_hold":{"raised":bool,"demand":string},"red_flags":{"raised":bool,"flags":[string],"resolution":string},"votes":[...],"verdict":{...}}`;

// ── Configs under audit ──
const fullCtx = buildCouncilContext(account);
const compactCtx = buildCouncilContext({ ...account, compact: true });
const v1User = `SESSION TYPE: ${topic.type} · TICKER: ${topic.ticker}\nTOPIC ON THE TABLE: ${topic.title}\n\nCONTEXT (the only hard data — cite it):\n${fullCtx}\n\nConvene the council.`;
const v2full = buildConveneMessages('full', topic, fullCtx);
const v2quick = buildConveneMessages('quick', topic, compactCtx);

const CONFIGS = [
  { id: 'v1-full (baseline)', messages: [{ role: 'system', content: V1_SYSTEM }, { role: 'user', content: v1User }], maxTokens: 3800, compactSchema: false, estOut: 1900 },
  { id: 'v2-full (redesign)', messages: v2full.messages, maxTokens: v2full.cfg.maxTokens, compactSchema: true, estOut: 1300, mode: 'full' },
  { id: 'v2-quick (default)', messages: v2quick.messages, maxTokens: v2quick.cfg.maxTokens, compactSchema: true, estOut: 480, mode: 'quick' },
];

const estTokens = (s) => Math.round(s.length / 3.6);
const cost = (pin, pout) => (pin * PRICE_IN + pout * PRICE_OUT) / 1e6;
const N = Math.max(1, Math.min(5, +process.argv[2] || 2));

async function liveRun(cfgObj) {
  const t0 = Date.now();
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: cfgObj.messages, max_tokens: cfgObj.maxTokens, temperature: 0.7, response_format: { type: 'json_object' } }),
  });
  const data = await resp.json();
  const wall = Date.now() - t0;
  if (data.error) throw new Error(data.error.message);
  const u = data.usage || {};
  let quality = '—';
  if (cfgObj.compactSchema) {
    try {
      const s = normalizeSession(JSON.parse(data.choices[0].message.content), cfgObj.mode);
      quality = s ? `OK (${s.transcript.length} turns, ${s.votes.length} votes, verdict ${s.verdict.recommendation})` : 'NORMALIZE FAILED';
    } catch { quality = 'INVALID JSON'; }
  } else {
    try { const p = JSON.parse(data.choices[0].message.content); quality = `OK (${(p.transcript || []).length} turns, ${(p.votes || []).length} votes)`; } catch { quality = 'INVALID JSON'; }
  }
  return { pin: u.prompt_tokens ?? 0, pout: u.completion_tokens ?? 0, wall, apiTime: u.total_time ? Math.round(u.total_time * 1000) : null, quality };
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n🏛️  INVESTMENT COUNCIL — TOKEN-COST AUDIT  (${KEY ? `LIVE, ${N} run(s)/config` : 'STATIC ESTIMATE — no GROQ_API_KEY found'})`);
console.log(`Model: llama-3.3-70b-versatile @ $${PRICE_IN}/M in, $${PRICE_OUT}/M out\n`);
console.log(pad('config', 22) + pad('prompt tok', 12) + pad('compl tok', 11) + pad('latency', 10) + pad('$/session', 11) + 'quality check');
console.log('-'.repeat(95));

const rows = [];
for (const cfg of CONFIGS) {
  const promptChars = cfg.messages.reduce((s, m) => s + m.content.length, 0);
  if (!KEY) {
    const pin = estTokens(String(promptChars > 0 ? cfg.messages.map((m) => m.content).join('') : ''));
    rows.push({ id: cfg.id, pin, pout: cfg.estOut, lat: '—', c: cost(pin, cfg.estOut), quality: 'not run (estimate)' });
  } else {
    const runs = [];
    for (let i = 0; i < N; i++) runs.push(await liveRun(cfg));
    const avg = (k) => Math.round(runs.reduce((s, x) => s + x[k], 0) / runs.length);
    rows.push({ id: cfg.id, pin: avg('pin'), pout: avg('pout'), lat: `${(avg('wall') / 1000).toFixed(1)}s`, c: cost(avg('pin'), avg('pout')), quality: runs[runs.length - 1].quality });
  }
  const r0 = rows[rows.length - 1];
  console.log(pad(r0.id, 22) + pad(r0.pin, 12) + pad(r0.pout, 11) + pad(r0.lat, 10) + pad('$' + r0.c.toFixed(6), 11) + r0.quality);
}

const base = rows[0], quick = rows[rows.length - 1], full2 = rows[1];
const save = (a, b) => (100 * (1 - (b.pin + b.pout) / (a.pin + a.pout))).toFixed(0);
console.log('-'.repeat(95));
console.log(`v2-full  vs v1: ${save(base, full2)}% fewer tokens · v2-quick vs v1: ${save(base, quick)}% fewer tokens`);
console.log(`Per 100 sessions: v1 $${(base.c * 100).toFixed(3)} → quick $${(quick.c * 100).toFixed(3)}  (cache hits: $0.000, served from localStorage/Supabase)`);
console.log(`Context bytes: full ${fullCtx.length} → compact ${compactCtx.length} chars\n`);
