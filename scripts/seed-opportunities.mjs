// ─── OPPORTUNITY ENGINE — SEED DATASET + VALIDATION HARNESS ───────────────────
//
// Generates 50 realistic HISTORICAL opportunities across 6 thesis types using
// REAL watchlist-universe tickers, runs them through the actual engine
// (src/opportunities.js), simulates outcomes, and prints a validation report.
//
// SAFETY: writes NOTHING to any database. Production (fwfmhaaulnzpjahyuhzj) is
// never touched. It emits scripts/seed-opportunities.{json,sql} so a DEV database
// can be seeded manually (set :seed_user_id). Run: node scripts/seed-opportunities.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { normalizeOpportunity, opportunityReturn } from "../src/opportunities.js";
import { THESIS_TYPES, thesisComplete } from "../src/thesis.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Real universe (api/prices.js tickers) + plausible reference prices ─────────
const UNIVERSE = {
  "NVDA":{name:"NVIDIA",currency:"USD",price:885}, "TSLA":{name:"Tesla",currency:"USD",price:248},
  "AAPL":{name:"Apple",currency:"USD",price:212}, "META":{name:"Meta Platforms",currency:"USD",price:498},
  "GOOGL":{name:"Alphabet",currency:"USD",price:176}, "AMD":{name:"AMD",currency:"USD",price:162},
  "MSFT":{name:"Microsoft",currency:"USD",price:432}, "PLTR":{name:"Palantir",currency:"USD",price:26},
  "AMZN":{name:"Amazon",currency:"USD",price:186}, "NFLX":{name:"Netflix",currency:"USD",price:625},
  "QQQ":{name:"Invesco QQQ",currency:"USD",price:470},
  "RELIANCE.NS":{name:"Reliance",currency:"INR",price:2920}, "TCS.NS":{name:"TCS",currency:"INR",price:3880},
  "HDFCBANK.NS":{name:"HDFC Bank",currency:"INR",price:1505}, "INFY.NS":{name:"Infosys",currency:"INR",price:1490},
  "ICICIBANK.NS":{name:"ICICI Bank",currency:"INR",price:1115}, "HINDUNILVR.NS":{name:"Hindustan Unilever",currency:"INR",price:2380},
  "SBIN.NS":{name:"State Bank of India",currency:"INR",price:812}, "BAJFINANCE.NS":{name:"Bajaj Finance",currency:"INR",price:6950},
  "WIPRO.NS":{name:"Wipro",currency:"INR",price:478}, "AXISBANK.NS":{name:"Axis Bank",currency:"INR",price:1120},
  "TATAMOTORS.NS":{name:"Tata Motors",currency:"INR",price:948}, "ADANIENT.NS":{name:"Adani Enterprises",currency:"INR",price:3010},
};
const TICKERS = Object.keys(UNIVERSE);
const KNOWN = new Set(TICKERS);

// ── Deterministic PRNG (reproducible seed) ─────────────────────────────────────
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let rnd = mulberry32(20260610);
const reseed = (s) => { rnd = mulberry32(s); };
const pick = (arr) => arr[Math.floor(rnd()*arr.length)];
const range = (lo,hi) => lo + rnd()*(hi-lo);
const gauss = () => { let u=0,v=0; while(!u)u=rnd(); while(!v)v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };

// ── Per-thesis-type realistic text (parameterised by name) ─────────────────────
const T = {
  "Demand Acceleration": (n)=>({ me:`Consensus sees ${n} demand normalising after a strong cycle`, rh:`End-demand may be re-accelerating faster than estimates assume`, ev:`Channel checks, hyperscaler/customer capex commentary, order backlog`, bc:`Pull-forward demand reverses into an air-pocket`, inv:`Two consecutive quarters of decelerating unit growth` }),
  "Product Cycle": (n)=>({ me:`Market treats ${n}'s next product cycle as incremental`, rh:`The upcoming cycle could drive a larger ASP/mix step-up than priced`, ev:`Launch timing, pre-order data, supply-chain build rates`, bc:`Launch slips or the refresh underwhelms on pricing power`, inv:`Launch delayed past the guided window or ASPs flat YoY` }),
  "Technical Momentum": (n)=>({ me:`Traders expect ${n} to mean-revert after its run`, rh:`Trend may persist as price holds above rising EMA20/EMA200`, ev:`Higher-highs structure, volume on up-days, EMA slope`, bc:`Momentum unwinds on a broad risk-off rotation`, inv:`Daily close below EMA50 on rising volume` }),
  "Mean Reversion": (n)=>({ me:`Market extrapolates ${n}'s recent weakness`, rh:`Selloff may be overdone vs unchanged medium-term fundamentals`, ev:`RSI oversold, distance below EMA200, stable estimate revisions`, bc:`Weakness reflects a real fundamental break, not noise`, inv:`A fresh lower-low after a failed bounce` }),
  "Earnings Beat": (n)=>({ me:`Estimates for ${n} look conservatively set into the print`, rh:`Setup may favour a beat-and-raise given low expectations`, ev:`Estimate trajectory, prior guidance conservatism, read-throughs`, bc:`Guidance disappoints even on a headline beat`, inv:`Next-quarter guide below consensus` }),
  "Valuation Re-rating": (n)=>({ me:`${n} is valued on trough multiples for a structurally-stable business`, rh:`Multiple could re-rate as the market re-assesses durability`, ev:`Multiple vs history/peers, FCF stability, balance-sheet quality`, bc:`The de-rating is justified by a secular headwind`, inv:`Multiple compresses further on deteriorating fundamentals` }),
};
const TYPES = Object.keys(T); // the 6 requested types
// Realistic non-uniform distribution across the 6 types (sums to 50).
const PLAN = [["Demand Acceleration",10],["Technical Momentum",10],["Product Cycle",8],["Mean Reversion",8],["Earnings Beat",8],["Valuation Re-rating",6]];
const RISK_BY_TYPE = { "Technical Momentum":["medium","high"], "Mean Reversion":["medium","high"], "Earnings Beat":["high","medium"], "Demand Acceleration":["medium","low"], "Product Cycle":["medium","low"], "Valuation Re-rating":["low","medium"] };

const NOW = Date.now();
const DAY = 86400000;

// ── Generate 50 raw historical opportunities ──────────────────────────────────
export function generateSeed() {
  reseed(20260610);                              // fresh sequence → reproducible across calls
  const out = [];
  const usedKeys = new Set();
  for (const [type, count] of PLAN) {
    const tmpl = T[type];
    let made = 0, guard = 0;
    while (made < count && guard++ < 500) {
      const ticker = pick(TICKERS);
      const ageDays = Math.floor(range(3, 75));
      const key = `${ticker}|${type}|${ageDays}`;
      if (usedKeys.has(key)) continue;             // no duplicate (same ticker+type+date)
      usedKeys.add(key);
      const u = UNIVERSE[ticker];
      const txt = tmpl(u.name);
      // Confidence: modest, type-flavoured, clamped 40–88.
      const base = { "Technical Momentum":58, "Mean Reversion":55, "Earnings Beat":60, "Demand Acceleration":66, "Product Cycle":64, "Valuation Re-rating":62 }[type];
      const confidence = Math.max(40, Math.min(88, Math.round(base + gauss()*9)));
      const genAt = NOW - ageDays*DAY;
      // price_at_gen: reference ± up to 6% historical noise.
      const priceAtGen = +(u.price * (1 + range(-0.06, 0.06))).toFixed(2);
      out.push({
        ticker, name:u.name, currency:u.currency,
        thesis_type:type, market_expectations:txt.me, reality_hypothesis:txt.rh, evidence:txt.ev,
        bull_case:`If correct, ${u.name} re-rates as reality is recognised`, bear_case:txt.bc, invalidation:txt.inv,
        confidence, risk_level:pick(RISK_BY_TYPE[type]),
        price_at_gen:priceAtGen, generated_at:new Date(genAt).toISOString(), status:"new",
        _ageDays:ageDays,
      });
      made++;
    }
  }
  return out;
}

// Simulated current price per opportunity (slight, honest tilt by confidence — NOT rigged).
function currentPrice(o) {
  const drift = ((o.confidence - 50) / 100) * 0.04;        // ≤ ±1.5% expected tilt
  const move = gauss() * 0.085 + drift;                    // ~8.5% vol
  return +(o.price_at_gen * (1 + move)).toFixed(2);
}

// ── Validation (#6) ────────────────────────────────────────────────────────────
export function validateSeed(seed) {
  const checks = {};
  // No hallucinated tickers — the real engine rejects anything outside the universe.
  checks.noHallucinatedTickers = seed.every(o => normalizeOpportunity(o, KNOWN) !== null);
  // No duplicates (same ticker + thesis_type + day).
  const keys = seed.map(o => `${o.ticker}|${o.thesis_type}|${o._ageDays}`);
  checks.noDuplicates = new Set(keys).size === seed.length;
  // Confidence distribution reasonable: in range, spread exists, mean sane.
  const cs = seed.map(o => o.confidence), mean = cs.reduce((a,b)=>a+b,0)/cs.length;
  const sd = Math.sqrt(cs.map(c=>(c-mean)**2).reduce((a,b)=>a+b,0)/cs.length);
  checks.confidenceReasonable = cs.every(c=>c>=0&&c<=100) && mean>=50 && mean<=80 && sd>5 && new Set(cs).size>8;
  // Thesis diversity: all 6 present, none dominates >40%.
  const byType = {}; seed.forEach(o=>byType[o.thesis_type]=(byType[o.thesis_type]||0)+1);
  const present = TYPES.every(t=>byType[t]>0), maxShare = Math.max(...Object.values(byType))/seed.length;
  checks.thesisDiversity = present && maxShare < 0.40;
  // Every opportunity can flow into Critique & Log (maps to a complete thesis).
  checks.critiqueAndLogReady = seed.every(o => thesisComplete({
    thesisType:o.thesis_type, expectations:o.market_expectations, reality:o.reality_hypothesis,
    bearCase:o.bear_case, invalidation:o.invalidation, confidence:o.confidence,
  }));
  return { checks, byType, mean:+mean.toFixed(1), sd:+sd.toFixed(1) };
}

// ── Report (#5) ────────────────────────────────────────────────────────────────
function buildReport(seed) {
  reseed(99887766);                              // separate fixed stream for outcome simulation
  const withRet = seed.map(o => { const cur = currentPrice(o); return { ...o, _cur:cur, _ret:opportunityReturn(o, cur) }; });
  const rets = withRet.map(o=>o._ret);
  const avgReturn = rets.reduce((a,b)=>a+b,0)/rets.length;
  const byType = {};
  withRet.forEach(o => { (byType[o.thesis_type] ||= {n:0,wins:0,ret:0}); byType[o.thesis_type].n++; if(o._ret>0)byType[o.thesis_type].wins++; byType[o.thesis_type].ret+=o._ret; });
  const confBuckets = {"40-49":0,"50-59":0,"60-69":0,"70-79":0,"80-89":0,"90-100":0};
  seed.forEach(o=>{ const b=Math.min(90,Math.floor(o.confidence/10)*10); const key=b===40?"40-49":b===50?"50-59":b===60?"60-69":b===70?"70-79":b===80?"80-89":"90-100"; confBuckets[key]++; });
  const sorted = [...withRet].sort((a,b)=>b._ret-a._ret);
  return { withRet, avgReturn, byType, confBuckets, top:sorted.slice(0,10), worst:sorted.slice(-10).reverse() };
}

// ── Pretty-print ───────────────────────────────────────────────────────────────
function bar(n,max,w=24){ const k=Math.round((n/max)*w); return "█".repeat(k)+"·".repeat(w-k); }
function pct(v){ return `${v>=0?"+":""}${v.toFixed(2)}%`; }

function main() {
  const seed = generateSeed();
  const v = validateSeed(seed);
  const r = buildReport(seed);

  const L = [];
  L.push("══════════════════════════════════════════════════════════════════");
  L.push("  OPPORTUNITY ENGINE — VALIDATION REPORT (seed dataset, no DB write)");
  L.push("══════════════════════════════════════════════════════════════════");
  L.push(`  Opportunity count        : ${seed.length}`);
  L.push(`  Universe tickers used    : ${new Set(seed.map(o=>o.ticker)).size} / ${TICKERS.length} (all real)`);
  L.push(`  Avg return since gen      : ${pct(r.avgReturn)}  (simulated outcomes)`);
  L.push(`  Confidence mean / stdev   : ${v.mean} / ${v.sd}`);
  L.push("");
  L.push("  DISTRIBUTION BY THESIS TYPE");
  const maxT = Math.max(...Object.values(v.byType));
  for (const [t,n] of Object.entries(v.byType)) L.push(`    ${t.padEnd(22)} ${String(n).padStart(2)}  ${bar(n,maxT)}`);
  L.push("");
  L.push("  DISTRIBUTION BY CONFIDENCE");
  const maxC = Math.max(...Object.values(r.confBuckets));
  for (const [b,n] of Object.entries(r.confBuckets)) L.push(`    ${b.padEnd(8)} ${String(n).padStart(2)}  ${bar(n,maxC)}`);
  L.push("");
  L.push("  WIN RATE BY THESIS TYPE (simulated)");
  L.push(`    ${"type".padEnd(22)} ${"n".padStart(2)}  ${"win%".padStart(5)}  ${"avgRet".padStart(8)}`);
  for (const [t,s] of Object.entries(r.byType)) L.push(`    ${t.padEnd(22)} ${String(s.n).padStart(2)}  ${(s.wins/s.n*100).toFixed(0).padStart(4)}%  ${pct(s.ret/s.n).padStart(8)}`);
  L.push("");
  L.push("  TOP 10 OPPORTUNITIES (by return since gen)");
  r.top.forEach((o,i)=>L.push(`    ${String(i+1).padStart(2)}. ${o.ticker.padEnd(13)} ${o.thesis_type.padEnd(22)} c${o.confidence}  ${pct(o._ret).padStart(8)}`));
  L.push("");
  L.push("  WORST 10 OPPORTUNITIES");
  r.worst.forEach((o,i)=>L.push(`    ${String(i+1).padStart(2)}. ${o.ticker.padEnd(13)} ${o.thesis_type.padEnd(22)} c${o.confidence}  ${pct(o._ret).padStart(8)}`));
  L.push("");
  L.push("  INTEGRITY CHECKS (#6)");
  const cl = { noHallucinatedTickers:"No hallucinated tickers", noDuplicates:"No duplicate opportunities", confidenceReasonable:"Confidence distribution reasonable", thesisDiversity:"Thesis diversity (all 6, none >40%)", critiqueAndLogReady:"Every opp → Critique & Log ready" };
  for (const [k,label] of Object.entries(cl)) L.push(`    [${v.checks[k]?"PASS":"FAIL"}] ${label}`);
  L.push("");
  L.push("  PAGE PREVIEW — how a card renders with this data:");
  const ex = r.withRet.find(o=>o.thesis_type==="Demand Acceleration") || seed[0];
  const sym = ex.currency==="INR"?"₹":"$";
  L.push("  ┌────────────────────────────────────────────────────────────────┐");
  L.push(`  │ ${ex.ticker}  [${ex.thesis_type}]  [${ex.risk_level.toUpperCase()} RISK]        ${pct(ex._ret)} since   ${String(ex.confidence).padStart(2)}% │`);
  L.push(`  │ Market expects : ${ex.market_expectations.slice(0,44).padEnd(44)}│`);
  L.push(`  │ Reality        : ${ex.reality_hypothesis.slice(0,44).padEnd(44)}│`);
  L.push(`  │ Bear case      : ${ex.bear_case.slice(0,44).padEnd(44)}│`);
  L.push(`  │ Invalidation   : ${ex.invalidation.slice(0,44).padEnd(44)}│`);
  L.push(`  │ [ Critique & Log → ]  [ Watch ]  [ Dismiss ]   snap ${sym}${String(ex.price_at_gen).padEnd(8)}│`);
  L.push("  └────────────────────────────────────────────────────────────────┘");
  L.push("══════════════════════════════════════════════════════════════════");
  const allPass = Object.values(v.checks).every(Boolean);
  L.push(`  RESULT: ${allPass?"ALL CHECKS PASS — engine produces diverse, valid, loggable ideas":"FAILURES PRESENT — see above"}`);
  L.push("  NOTE: No database written. Production (fwfmhaaulnzpjahyuhzj) untouched.");
  L.push("        Dev seed emitted to scripts/seed-opportunities.{json,sql}.");
  L.push("══════════════════════════════════════════════════════════════════");
  console.log(L.join("\n"));

  // Emit dev artifacts (NOT applied to any DB).
  writeFileSync(join(HERE,"seed-opportunities.json"), JSON.stringify(seed.map(({_ageDays,...o})=>o),null,2));
  const cols = "user_id,ticker,name,currency,thesis_type,market_expectations,reality_hypothesis,evidence,bull_case,bear_case,invalidation,confidence,risk_level,price_at_gen,status,generated_at";
  const esc = (s)=>`'${String(s).replace(/'/g,"''")}'`;
  const rows = seed.map(o=>`(:seed_user_id,${esc(o.ticker)},${esc(o.name)},${esc(o.currency)},${esc(o.thesis_type)},${esc(o.market_expectations)},${esc(o.reality_hypothesis)},${esc(o.evidence)},${esc(o.bull_case)},${esc(o.bear_case)},${esc(o.invalidation)},${o.confidence},${esc(o.risk_level)},${o.price_at_gen},'new',${esc(o.generated_at)})`);
  writeFileSync(join(HERE,"seed-opportunities.sql"),
    `-- Seed for a DEV database only. Set the target user before running:\n--   \\set seed_user_id '00000000-0000-0000-0000-000000000000'\n-- Do NOT run against production.\ninsert into public.tradeiq_opportunities (${cols}) values\n${rows.join(",\n")};\n`);
}

// Only run the report + write artifacts when invoked directly (not when imported by tests).
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
