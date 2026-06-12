// Vercel Serverless Function — FILING INGESTION (P3.2b), narrative via map-reduce.
//
// Downloads a filing's primary document from EDGAR, strips it to text, splits it
// into canonical sections (TOC-aware), reads the highest-value narrative (MD&A →
// Risk Factors) under a hard 8-chunk cap, and runs a two-model map-reduce:
//   MAP  — per-chunk extraction on llama-3.1-8b-instant (cheap, sequential to
//          respect the free-tier TPM budget), JSON mode, "only what THIS text
//          states, no outside knowledge, quotes verbatim".
//   REDUCE — one llama-3.3-70b call merges chunk extractions into a Filing
//          Digest (schema in src/filings.js). Merge & dedupe only; invent nothing.
// The client normalises (src/filings.js normalizeDigest) and stores the digest
// keyed by accession — filings are immutable, so an accession is ingested once,
// ever. Numbers are never asked of the LLM here; those come from /api/facts.
//
// Requires vercel.json maxDuration: 60 — 8 sequential map calls + reduce ≈ 30-45s.

import { verifyUser } from './_auth.js';
import { enforce, tooMany } from './_ratelimit.js';
import { SEC_UA, cikFor, fetchSubmissions, isNonUS, NON_US_NOTE } from './_edgar.js';
import { stripFilingText, splitSections, planChunks } from '../src/filings.js';

const MAP_MODEL = 'llama-3.1-8b-instant';
const REDUCE_MODEL = 'llama-3.3-70b-versatile';

const MAP_SYSTEM = `You extract structured facts from ONE section of a SEC filing. Rules, absolute:
- Use ONLY what THIS text explicitly states. No outside knowledge, no inference, no arithmetic, no numbers you cannot see verbatim in the text.
- Every item is a short phrase. Quotes are VERBATIM substrings of the text, ≤200 chars.
- If the text says nothing for a field, return an empty array. Empty is correct and expected.
Respond ONLY with JSON:
{"guidance":[string],"risks":[string],"demand_signals":[string],"margin_commentary":[string],"competitive":[string],"segment_notes":[string],"quotes":[string]}`;

const REDUCE_SYSTEM = `You merge per-chunk extractions from ONE SEC filing into a single Filing Digest. Rules, absolute:
- MERGE and DEDUPE only. Add NOTHING that no chunk stated. No outside knowledge, no invented numbers.
- red_flags must each reference something a chunk actually surfaced (a risk, a quote, a margin note) — analyst judgement on the provided material, never speculation.
- quotes are verbatim, ≤200 chars, each tagged with the section it came from.
- summary ≤ 600 chars, neutral, only what the digest supports.
Respond ONLY with JSON matching:
{"summary":string,"guidance":[string],"revenue_drivers":[string],"margin_commentary":[string],"risk_changes":[string],"competitive":[string],"segment_notes":[string],"red_flags":[string],"quotes":[{"text":string,"section":string}],"evidence_note":string}`;

async function callGroq(key, model, system, user, maxTokens) {
  // One exponential-backoff retry on 429 (TPM) — map calls are already sequential.
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: maxTokens,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });
    if (resp.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 2500)); continue; }
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    let parsed; try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    return { parsed, usage: data.usage || null };
  }
  throw new Error('Groq rate limit — try again in a minute.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  // Ingestion is the most expensive call in the app — a filing is read once, ever.
  const rl = await enforce(`u:${user.id}`, [['ingest_burst', 2, 600], ['ingest_daily', 6, 86400]]);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  const ticker = String(req.body?.ticker || '').trim().toUpperCase();
  const accReq = String(req.body?.accession || '').replace(/[^0-9]/g, '');
  if (!/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return res.status(400).json({ error: 'Bad ticker' });
  if (accReq.length < 10) return res.status(400).json({ error: 'Bad accession' });
  if (isNonUS(ticker)) return res.status(400).json({ error: NON_US_NOTE });

  try {
    const reg = await cikFor(ticker);
    if (!reg) return res.status(400).json({ error: `No SEC registrant found for ${ticker}.` });

    // Find the filing by accession to get its primary document, form and date.
    const sub = await fetchSubmissions(reg.cik);
    const rec = sub?.filings?.recent || {};
    let idx = -1;
    for (let i = 0; i < (rec.accessionNumber || []).length; i++) {
      if (String(rec.accessionNumber[i]).replace(/-/g, '') === accReq) { idx = i; break; }
    }
    if (idx < 0) return res.status(404).json({ error: 'Filing not found in recent index for this ticker.' });

    const form = rec.form[idx] || '';
    const filed = rec.filingDate[idx] || '';
    const primaryDoc = rec.primaryDocument?.[idx] || '';
    if (!primaryDoc) return res.status(422).json({ error: 'Filing has no primary document to read.' });

    const url = `https://www.sec.gov/Archives/edgar/data/${reg.cik}/${accReq}/${primaryDoc}`;
    const docResp = await fetch(url, { headers: SEC_UA });
    if (!docResp.ok) throw new Error(`EDGAR document status ${docResp.status}`);
    const html = await docResp.text();
    if (html.length > 14_000_000) return res.status(413).json({ error: 'Filing too large to ingest.' });

    const text = stripFilingText(html);
    const sections = splitSections(text);
    const { chunks, manifest } = planChunks(sections);
    if (!chunks.length) return res.status(422).json({ error: 'No readable text extracted from this filing.' });

    // MAP — sequential per chunk (respect free-tier TPM on the 8b model).
    let tokensIn = 0, tokensOut = 0;
    const extractions = [];
    for (const ch of chunks) {
      const { parsed, usage } = await callGroq(GROQ_KEY, MAP_MODEL, MAP_SYSTEM,
        `SECTION: ${ch.section}\n\nTEXT:\n${ch.text}`, 1200);
      extractions.push({ section: ch.section, ...parsed });
      if (usage) { tokensIn += usage.prompt_tokens || 0; tokensOut += usage.completion_tokens || 0; }
    }

    // REDUCE — one 70b call merges everything into the Filing Digest.
    const reduceUser = [
      `FILING: ${ticker} ${form} filed ${filed}.`,
      `SECTIONS READ: ${manifest.ingested.map((s) => `${s.section} (${s.chars} chars)`).join(', ')}.`,
      manifest.skipped.length ? `SECTIONS NOT READ: ${manifest.skipped.join('; ')}.` : 'All recognised sections were read.',
      `PER-CHUNK EXTRACTIONS:\n${JSON.stringify(extractions)}`,
    ].join('\n\n');
    const { parsed: digest, usage: rUsage } = await callGroq(GROQ_KEY, REDUCE_MODEL, REDUCE_SYSTEM, reduceUser, 1600);
    if (rUsage) { tokensIn += rUsage.prompt_tokens || 0; tokensOut += rUsage.completion_tokens || 0; }

    // The skipped manifest travels into the digest so the client can store the
    // honest "not read" list even if the model forgot to populate not_ingested.
    if (!Array.isArray(digest.not_ingested) || !digest.not_ingested.length) digest.not_ingested = manifest.skipped;

    return res.status(200).json({
      digest,
      meta: { ticker, accession: accReq, form, filed, cik: reg.cik },
      sections_ingested: manifest,
      tokens_used: tokensIn + tokensOut,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
