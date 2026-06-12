// ─── TRADEIQ VALIDATION LAB — historical workflow replay (NOT a backtest) ─────
//
// Replays frozen historical dates through the REAL engines (discovery prompt,
// research prompt, the production council prompt module) to grade DECISION
// QUALITY: selection skill vs the universe, confidence calibration, council
// discrimination, member predictiveness, power (Marlowe/Popper) value.
//
// DOCTRINE — what this is NOT: a P&L backtest. No hypothetical profits are
// computed or reported; outcomes enter only as excess-vs-baseline grading
// signals. Do not optimize the product around replay returns (hindsight bias).
//
// NO-LEAK GUARANTEES (each recorded per run in leakGuard):
//   · price data sliced ≤ as-of date (validation-lib sliceAsOf, tested)
//   · filings index reconstructed from EDGAR with filingDate ≤ as-of
//   · news omitted entirely (no historical news source exists — recorded)
//   · model = llama-3.3-70b (training cutoff 2023-12) < every replay date,
//     so weights cannot know the replayed future
//   · every prompt carries a TIME FREEZE preamble pinning "today"
//   · personal lens empty (grades the generic engine, no fake user history)
//
// SAFETY: touches NO database, changes NO production code. Reads production
// modules; the two serverless prompts are copied verbatim (drift-guarded by
// tests/validation-lab.test.mjs).
//
// Usage:
//   node scripts/validation-lab.mjs run                  # replay 1/3/6/12 months ago
//   node scripts/validation-lab.mjs run --dates 2025-12-12 --top 4
//   node scripts/validation-lab.mjs evaluate             # reveal outcomes → docs/VALIDATION-REPORT.md
// GROQ_API_KEY required for `run` (reads .env if present); without it `run`
// executes a dry harness pass (snapshots + filings + leak guard, no LLM).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  sliceAsOf, snapshotAt, forwardReturn, median, mean, excessOf,
  calibration, verdictDiscrimination, memberPredictiveness, powerAnalysis,
  signalAnalysis, classifyMiss, spearman,
} from "./validation-lib.mjs";
import { THESIS_TYPES } from "../src/thesis.js";
import { normalizeOpportunities } from "../src/opportunities.js";
import { defaultTasks, normalizeBrief, applyFindings } from "../src/analyst.js";
import { buildSources, sourcesBlock } from "../src/sources.js";
import { buildCouncilContext, normalizeSession, VOTE_SCORE } from "../src/council.js";
import { scoreOpportunity } from "../src/pipeline.js";
import { buildConveneMessages } from "../api/_council_prompts.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "validation-runs");
const REPORT = join(HERE, "..", "docs", "VALIDATION-REPORT.md");

// .env is gitignored; load GROQ_API_KEY from it when present.
try {
  for (const line of readFileSync(join(HERE, "..", ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}
const GROQ_KEY = process.env.GROQ_API_KEY || null;

const UA = { "User-Agent": "Mozilla/5.0" };
const SEC_UA = { "User-Agent": "TradeIQ personal research app (aryan.desai.viral@gmail.com)" };
const NAMES = {
  NVDA: "NVIDIA", TSLA: "Tesla", AAPL: "Apple", META: "Meta", GOOGL: "Alphabet", AMD: "AMD",
  MSFT: "Microsoft", PLTR: "Palantir", AMZN: "Amazon", NFLX: "Netflix", SPY: "S&P 500 ETF", QQQ: "Nasdaq ETF",
};
const UNIVERSE = Object.keys(NAMES); // the US watchlist exactly as api/prices.js ships it
const MODEL_CUTOFF = "2023-12";

// ── Prompts copied VERBATIM from the serverless functions (which export
// nothing). Provenance: api/opportunities.js + api/research.js @ acd6300.
// tests/validation-lab.test.mjs fails if production drifts from these copies.
const DISCOVERY_SYSTEM = `You are the Opportunity Discovery engine of a disciplined investing OS. From a list of stocks (with price and basic technicals), proactively propose the most interesting investable IDEAS, Litman-style: edge comes from REALITY diverging from what the MARKET EXPECTS.

Hard rules:
- You have NO fundamentals, filings, or news — only the technical snapshot given. So every "reality_hypothesis" is a HYPOTHESIS for the user to critique, never a stated fact. Phrase reality/evidence as possibilities ("may", "could", "if"). Do NOT fabricate specific numbers, guidance, or events.
- Only use tickers from the provided list. Never invent a ticker.
- Be selective and honest. A flat, uninteresting stock should be skipped, not forced into an idea. Prefer fewer strong ideas over filler.
- Ground each idea in the snapshot (trend vs EMA20/EMA200, RSI, recent change) plus general, non-fabricated market understanding.
- If a USER TRACK RECORD section is provided, personalize: prefer thesis types where the user has a PROVEN edge, and be noticeably more skeptical (lower confidence, sharper bear case) on thesis types that are proven leaks. Never invent a track record that isn't given.

For each opportunity:
- thesis_type: ONE of exactly: ${THESIS_TYPES.join(", ")}.
- market_expectations: what consensus likely believes now (1 sentence).
- reality_hypothesis: what might actually be true that diverges (1 sentence, hypothesis).
- evidence: what to check to confirm/deny it (concrete research pointers, not invented facts).
- bull_case / bear_case: 1 sentence each.
- invalidation: what observation would kill the idea.
- confidence: integer 0-100 (your conviction in the DIVERGENCE, given limited data — be modest).
- risk_level: "low" | "medium" | "high".

Respond with ONLY a JSON object: {"opportunities":[{"ticker":string,"thesis_type":string,"market_expectations":string,"reality_hypothesis":string,"evidence":string,"bull_case":string,"bear_case":string,"invalidation":string,"confidence":int,"risk_level":string}]}`;

const RESEARCH_SYSTEM = `You are the Research Analyst engine of a disciplined investing OS — a junior analyst who researches an investment thesis so the user only has to decide.

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

const freeze = (d) => `TIME FREEZE (validation replay): Today is ${d}. Analyze the market AS OF this date. Use ONLY information that existed on or before ${d}; never reference or assume any event after it.`;

// ── I/O helpers ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function groq(messages, { maxTokens = 2000, temperature = 0.5 } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ_KEY },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, max_tokens: maxTokens, temperature, response_format: { type: "json_object" } }),
    });
    if (r.status === 429) { const wait = +(r.headers.get("retry-after") || 25); console.log(`    429 — waiting ${wait}s`); await sleep(wait * 1000); continue; }
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return { json: JSON.parse(d.choices?.[0]?.message?.content || "{}"), usage: d.usage };
  }
  throw new Error("Groq rate limit persisted after retry");
}

async function candles3y(ticker) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3y`, { headers: UA });
  if (!r.ok) throw new Error(`Yahoo ${ticker} status ${r.status}`);
  const d = await r.json();
  const res = d.chart?.result?.[0];
  const ts = res?.timestamp || [], cl = res?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) if (Number.isFinite(cl[i])) out.push({ t: new Date(ts[i] * 1000).toISOString().slice(0, 10), c: cl[i] });
  return out;
}

let cikMap = null;
async function filingsAsOf(ticker, asOf) {
  try {
    if (!cikMap) {
      const r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_UA });
      const d = await r.json();
      cikMap = new Map(Object.values(d).map((x) => [String(x.ticker).toUpperCase(), x.cik_str]));
    }
    const cik = cikMap.get(ticker);
    if (!cik) return [];
    const r = await fetch(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`, { headers: SEC_UA });
    const rec = (await r.json())?.filings?.recent || {};
    const keep = new Set(["10-K", "10-Q", "8-K", "DEF 14A"]);
    const out = [];
    for (let i = 0; i < (rec.form || []).length && out.length < 8; i++) {
      if (!keep.has(rec.form[i])) continue;
      if (rec.filingDate[i] > asOf) continue; // ── the leak guard for filings
      out.push({ form: rec.form[i], filed: rec.filingDate[i], title: String(rec.primaryDocDescription?.[i] || "").slice(0, 120), link: "" });
    }
    return out;
  } catch { return []; }
}

// ── RUN: replay one frozen date through discovery → research → council ───────
async function runDate(asOf, allCandles, { top = 4, count = 8 } = {}) {
  console.log(`\n══ REPLAY ${asOf} ${GROQ_KEY ? "" : "(DRY — no GROQ_API_KEY, harness only)"} ══`);
  const usage = { prompt: 0, completion: 0 };
  const tally = (u) => { if (u) { usage.prompt += u.prompt_tokens || 0; usage.completion += u.completion_tokens || 0; } };

  // 1. Frozen watchlist snapshot — only candles ≤ asOf ever leave this block.
  const watch = UNIVERSE.map((tk) => {
    const s = snapshotAt(allCandles[tk] || [], asOf);
    return s && { ticker: tk, name: NAMES[tk], currency: "USD", ...s };
  }).filter(Boolean);
  const candlesMax = watch.reduce((m, w) => (w.date > m ? w.date : m), "");
  console.log(`  snapshot: ${watch.length}/${UNIVERSE.length} tickers, last candle ${candlesMax}`);

  const run = {
    asOf, generated_at: new Date().toISOString(), dry: !GROQ_KEY, universe: UNIVERSE,
    watch, opportunities: [], usage,
    leakGuard: { candlesMax, filingsMaxDate: asOf, news: "omitted — no point-in-time source", modelCutoff: MODEL_CUTOFF, lens: "empty — generic engine, no fake user history", timeFreezePrompts: true },
  };

  if (GROQ_KEY) {
    // 2. Discovery — verbatim production prompt + time freeze.
    const stocks = watch.map((w) => ({ ticker: w.ticker, name: w.name, currency: w.currency, price: w.price, chgPct: w.chg, rsi: w.rsi, ema20: w.ema20, ema200: w.ema200 }));
    const userMsg = `${freeze(asOf)}\nMarket: US (NYSE/NASDAQ). Propose up to ${count} of the strongest opportunities (skip uninteresting names).\nStocks:\n${JSON.stringify(stocks)}`;
    const disc = await groq([{ role: "system", content: DISCOVERY_SYSTEM }, { role: "user", content: userMsg }], { maxTokens: 2200, temperature: 0.5 });
    tally(disc.usage);
    const known = new Set(watch.map((w) => w.ticker));
    const opps = normalizeOpportunities(disc.json.opportunities || [], known, 10)
      .map((o) => ({ ...o, name: NAMES[o.ticker], snapshot: watch.find((w) => w.ticker === o.ticker) }));
    console.log(`  discovery: ${opps.length} ideas — ${opps.map((o) => `${o.ticker}(${o.confidence})`).join(", ")}`);

    // 3+4. Research then council for the top-K by confidence (cost control).
    for (const o of opps.slice(0, top)) {
      await sleep(2500);
      const tasks = defaultTasks(o, asOf);
      const sources = buildSources({ filings: await filingsAsOf(o.ticker, asOf), news: [] }, asOf);
      try {
        const r = await groq([
          { role: "system", content: RESEARCH_SYSTEM },
          { role: "user", content: [`${freeze(asOf)}`, `THESIS UNDER RESEARCH:\n${JSON.stringify({ ticker: o.ticker, name: o.name, thesis_type: o.thesis_type, market_expectations: o.market_expectations, reality_hypothesis: o.reality_hypothesis, evidence: o.evidence, bull_case: o.bull_case, bear_case: o.bear_case, invalidation: o.invalidation, confidence: o.confidence, risk_level: o.risk_level })}`, `SNAPSHOT (only live data you have): price ${o.snapshot.price}, chg ${o.snapshot.chg}%, RSI ${o.snapshot.rsi}, EMA20 ${o.snapshot.ema20}, EMA200 ${o.snapshot.ema200}`, sourcesBlock(sources), `RESEARCH TASKS (answer every id):\n${JSON.stringify(tasks.map(({ id, type, question }) => ({ id, type, question })))}`].filter(Boolean).join("\n\n") },
        ], { maxTokens: 2400, temperature: 0.4 });
        tally(r.usage);
        o.research_tasks = applyFindings(tasks, r.json.findings, asOf);
        o.research_brief = normalizeBrief(r.json.brief);
        o.research_sources = sources;
        console.log(`  research ${o.ticker}: evidence ${o.research_brief?.evidence_strength ?? "—"}, confidence ${o.research_brief?.research_confidence ?? "—"}, unknowns ${o.research_brief?.unknowns?.length ?? "—"}`);
      } catch (e) { console.log(`  research ${o.ticker} FAILED: ${e.message}`); }

      await sleep(2500);
      try {
        const topic = { type: "opportunity", ticker: o.ticker, title: `${o.ticker} ${o.thesis_type || "opportunity"}: ${(o.reality_hypothesis || "").slice(0, 140)}` };
        const ctx = freeze(asOf) + "\n" + buildCouncilContext({ holdings: [], journal: [], reviews: [], opportunities: [{ ...o, status: "new" }], watchlist: watch, topic, compact: true });
        const { cfg, messages } = buildConveneMessages("quick", topic, ctx); // the REAL production prompt module
        const c = await groq(messages, { maxTokens: cfg.maxTokens, temperature: 0.7 });
        tally(c.usage);
        o.council = normalizeSession(c.json, "quick");
        console.log(`  council  ${o.ticker}: ${o.council?.verdict?.recommendation ?? "unusable"} (${o.council?.verdict?.confidence ?? "—"}%)${o.council?.evidence_hold?.raised ? " · EVIDENCE MISSING" : ""}${o.council?.red_flags?.raised ? " · RED FLAGS" : ""}`);
      } catch (e) { console.log(`  council  ${o.ticker} FAILED: ${e.message}`); }
    }
    run.opportunities = opps;
  }

  mkdirSync(RUNS, { recursive: true });
  const file = join(RUNS, `${asOf}.json`);
  writeFileSync(file, JSON.stringify(run, null, 1));
  console.log(`  saved ${file} · tokens in/out ${usage.prompt}/${usage.completion}`);
  return run;
}

// ── EVALUATE: reveal the future, grade the decisions ─────────────────────────
async function evaluate() {
  if (!existsSync(RUNS)) { console.error("No runs found — execute `run` first."); process.exit(1); }
  const files = readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort();
  const runs = files.map((f) => JSON.parse(readFileSync(join(RUNS, f), "utf8")));
  if (!runs.length || runs.every((r) => r.dry)) { console.error("Only dry runs found — set GROQ_API_KEY and re-run."); process.exit(1); }

  console.log("Fetching outcome candles…");
  const allCandles = {};
  for (const tk of UNIVERSE) { allCandles[tk] = await candles3y(tk); await sleep(250); }
  const today = new Date().toISOString().slice(0, 10);

  const perDate = [], graded = [], voteRows = [], ehRows = [], rfRows = [];
  for (const run of runs.filter((r) => !r.dry)) {
    const horizon = Math.min(90, Math.max(7, Math.floor((Date.parse(today) - Date.parse(run.asOf)) / 864e5) - 1));
    const uniRets = UNIVERSE.map((tk) => forwardReturn(allCandles[tk], run.asOf, horizon)?.pct);
    const uniMedian = median(uniRets);
    const spy = forwardReturn(allCandles.SPY, run.asOf, horizon)?.pct ?? null;

    const items = run.opportunities.map((o) => {
      const fwd = forwardReturn(allCandles[o.ticker], run.asOf, horizon);
      const excess = excessOf(fwd?.pct, uniMedian);
      const verdict = o.council?.verdict?.recommendation ?? null;
      const item = {
        asOf: run.asOf, ticker: o.ticker, thesis_type: o.thesis_type, confidence: o.confidence,
        rsi: o.snapshot?.rsi, aboveEma200: o.snapshot?.ema200 ? o.snapshot.price > o.snapshot.ema200 : null,
        evidence_strength: o.research_brief?.evidence_strength ?? null,
        research_confidence: o.research_brief?.research_confidence ?? null,
        unknowns: o.research_brief?.unknowns?.length ?? null,
        verdict, council_confidence: o.council?.verdict?.confidence ?? null,
        composite: scoreOpportunity({ ...o, council_verdict: verdict, council_confidence: o.council?.verdict?.confidence }, null).composite,
        excess, excessVsSpy: excessOf(fwd?.pct, spy), horizon,
      };
      item.miss = classifyMiss(item);
      if (o.council) {
        for (const v of o.council.votes || []) voteRows.push({ member: v.member, voteScore: VOTE_SCORE[v.vote] ?? 0, excess });
        ehRows.push({ raised: !!o.council.evidence_hold?.raised, excess });
        rfRows.push({ raised: !!o.council.red_flags?.raised, excess });
      }
      return item;
    });
    graded.push(...items);
    perDate.push({ asOf: run.asOf, horizon, uniMedian, spy, n: items.length, beatUni: items.filter((x) => Number.isFinite(x.excess) && x.excess > 0).length, leakGuard: run.leakGuard, usage: run.usage });
  }

  const councilItems = graded.filter((x) => x.verdict != null);
  const fmtTbl = (rows, cols) => [`| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${cols.map((c) => r[c] ?? "—").join(" | ")} |`)].join("\n");
  const sig = signalAnalysis(graded);
  const cal = calibration(graded);
  const calCouncil = calibration(councilItems.map((x) => ({ confidence: x.council_confidence, excess: x.excess })));
  const disc = verdictDiscrimination(councilItems);
  const members = memberPredictiveness(voteRows);
  const eh = powerAnalysis(ehRows), rf = powerAnalysis(rfRows);
  const missCounts = {};
  for (const g of graded) if (g.miss) missCounts[g.miss] = (missCounts[g.miss] || 0) + 1;
  const rho = {
    modelConf: spearman(graded.map((x) => x.confidence), graded.map((x) => x.excess)),
    composite: spearman(graded.map((x) => x.composite), graded.map((x) => x.excess)),
    evidence: spearman(graded.map((x) => x.evidence_strength), graded.map((x) => x.excess)),
    researchConf: spearman(graded.map((x) => x.research_confidence), graded.map((x) => x.excess)),
    councilConf: spearman(councilItems.map((x) => x.council_confidence), councilItems.map((x) => x.excess)),
  };

  const md = `# TradeIQ Validation Report
Generated ${today} · replays: ${perDate.map((d) => d.asOf).join(", ")} · ${graded.length} graded ideas (${councilItems.length} with council sessions)

**Read this first.** This grades DECISION QUALITY, not P&L. "Excess" = forward return minus the universe median over the same horizon — a selection-skill signal, not a profit claim. Samples are tiny: every number below is directional evidence for a human read of the transcripts, never a statistic to optimize against. Do NOT tune prompts to maximize replay excess (that is overfitting to one historical path).

## Method & no-leak checklist
${perDate.map((d) => `- **${d.asOf}** (horizon ${d.horizon}d): candles ≤ ${d.leakGuard.candlesMax}; filings ≤ as-of; ${d.leakGuard.news}; model cutoff ${d.leakGuard.modelCutoff} predates the replay; lens: ${d.leakGuard.lens}. Universe median fwd ${d.uniMedian}% · SPY ${d.spy}% · tokens ${d.usage.prompt}/${d.usage.completion}`).join("\n")}

## 1 · Discovery quality (selection)
${fmtTbl(perDate.map((d) => ({ date: d.asOf, ideas: d.n, "beat universe": `${d.beatUni}/${d.n}`, "universe median %": d.uniMedian, "SPY %": d.spy })), ["date", "ideas", "beat universe", "universe median %", "SPY %"])}

Signal usefulness (avg excess by signal — most → least):
${fmtTbl(sig.byThesisType, ["key", "n", "avgExcess"])}
${fmtTbl([...sig.byRsi, ...sig.byTrend], ["key", "n", "avgExcess"])}

## 2 · Calibration
Model confidence buckets (does stated conviction track outcomes?):
${fmtTbl(cal, ["bucket", "n", "hitRate", "avgExcess"])}
Council confidence buckets:
${fmtTbl(calCouncil, ["bucket", "n", "hitRate", "avgExcess"])}
Rank correlations with excess (−1…+1; ~0 = uninformative): model confidence ${rho.modelConf} · composite score ${rho.composite} · evidence_strength ${rho.evidence} · research_confidence ${rho.researchConf} · council confidence ${rho.councilConf}

## 3 · Council quality
Verdict discrimination: Buy avg excess ${disc.buy.avgExcess} (n=${disc.buy.n}) vs Avoid ${disc.avoid.avgExcess} (n=${disc.avoid.n}) vs Neutral ${disc.neutral.avgExcess} (n=${disc.neutral.n}) → **spread ${disc.spread}** (>0 = council separates winners from losers)

Member predictiveness (vote direction × outcome, −1…+1):
${fmtTbl(members, ["member", "n", "score"])}

Powers: EVIDENCE MISSING (Marlowe) raised ${eh.raisedN}/${eh.n} — saved ${eh.savedN}, cost ${eh.costN}, quiet on big misses ${eh.quietMissN}. RED FLAGS (Popper) raised ${rf.raisedN}/${rf.n} — saved ${rf.savedN}, cost ${rf.costN}, quiet on big misses ${rf.quietMissN}.

## 4 · Bottleneck classification (deterministic taxonomy)
${Object.keys(missCounts).length ? fmtTbl(Object.entries(missCounts).map(([k, v]) => ({ cause: k, count: v })), ["cause", "count"]) : "No items outside the ±3% in-line band."}

## 5 · Graded ideas (full detail)
${fmtTbl(graded.map((g) => ({ date: g.asOf, ticker: g.ticker, thesis: g.thesis_type || "—", conf: g.confidence, verdict: g.verdict ?? "—", "council %": g.council_confidence ?? "—", comp: g.composite, "excess %": g.excess, miss: g.miss ?? "" })), ["date", "ticker", "thesis", "conf", "verdict", "council %", "comp", "excess %", "miss"])}

## 6 · Required human read (the lab cannot judge these)
The deterministic pass above says WHERE to look; these need you reading \`scripts/validation-runs/*.json\` transcripts:
- Did Marlowe's EVIDENCE MISSING demands name information that actually mattered later?
- Did Popper's red flags attack real reasoning flaws or boilerplate skepticism?
- Are research briefs' "unknowns" the RIGHT unknowns (the ones that decided the outcome)?
- Which research sections would you delete (never informative)?
- Where did context get lost between discovery → research → council?

## 7 · Architecture observations (data-driven candidates, not conclusions)
${[
  rho.modelConf != null && Math.abs(rho.modelConf) < 0.2 ? `- Model confidence is near-uninformative (ρ=${rho.modelConf}) — consider not surfacing raw confidence as a headline number.` : null,
  rho.composite != null ? `- Composite score ρ=${rho.composite} vs excess — ${rho.composite > 0.3 ? "ranking is doing real work" : "ranking adds little beyond noise at this sample"}.` : null,
  disc.spread != null && disc.spread < 0 ? `- Council verdicts INVERTED (spread ${disc.spread}) — read transcripts before trusting Buy/Avoid framing.` : null,
  members[0] ? `- Most predictive member: ${members[0].member} (${members[0].score}, n=${members[0].n}); least: ${members[members.length - 1].member} (${members[members.length - 1].score}).` : null,
  rf.costN > rf.savedN ? `- Popper's red flags cost more winners than they saved losers (${rf.costN} vs ${rf.savedN}) — possible excess pessimism.` : null,
  eh.quietMissN > 0 ? `- Marlowe stayed quiet on ${eh.quietMissN} big miss(es) — evidence demands may be missing the decisive gaps.` : null,
  (missCounts.weak_selection || 0) + (missCounts.overconfident_selection || 0) > graded.length / 3 ? `- Selection (discovery) is the dominant failure class — improving research/council won't fix idea sourcing.` : null,
].filter(Boolean).join("\n") || "- No threshold-crossing observations at this sample size."}

*Tiny-sample reminder: treat every observation as a hypothesis for the next replay batch, not a verdict.*
`;
  writeFileSync(REPORT, md);
  console.log(`\nReport → ${REPORT}`);
  console.log(`Headline: ${graded.length} ideas · beat-universe ${graded.filter((x) => x.excess > 0).length}/${graded.filter((x) => Number.isFinite(x.excess)).length} · council spread ${disc.spread} · composite ρ ${rho.composite}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const monthsAgo = (m) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };

if (cmd === "run") {
  const dates = (opt("dates", "") || [1, 3, 6, 12].map(monthsAgo).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const top = +opt("top", 4), count = +opt("count", 8);
  console.log(`Validation Lab — replaying ${dates.join(", ")} (top ${top} researched/debated per date)`);
  const allCandles = {};
  for (const tk of UNIVERSE) { allCandles[tk] = await candles3y(tk); await sleep(250); }
  for (const d of dates) { await runDate(d, allCandles, { top, count }); if (GROQ_KEY) await sleep(4000); }
  console.log("\nDone. Next: node scripts/validation-lab.mjs evaluate");
} else if (cmd === "evaluate") {
  await evaluate();
} else {
  console.log("Usage: node scripts/validation-lab.mjs run [--dates d1,d2] [--top 4] [--count 8] | evaluate");
}
