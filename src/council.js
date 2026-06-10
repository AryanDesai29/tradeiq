// ─── THE INVESTMENT COUNCIL — domain logic (pure, testable) ──────────────────
//
// The Council is the orchestration layer: a 10-member animated committee that
// debates a topic (opportunity / trade idea / position / portfolio / thesis)
// using ONLY the user's real data — performance, personal alpha, portfolio
// intelligence, theses, reviews, live snapshot. The server (api/council.js)
// holds the debate prompt; this module holds the member identities the UI
// renders, the session normalizer (anti-hallucination clamps, same discipline
// as opportunities.js), and the context builder that personalizes the debate.
//
// Inspired by the Global Strategic Valuation coursework (Prof. Joel Litman):
// Bulls vs Bears structured debate, Investigative Investing (the Detective),
// and Reality-vs-Embedded-Expectations (the Wizard).

import { performance, byStrategy, rMultipleOf } from "./analytics.js";
import { personalAlpha, mistakeCost } from "./alpha.js";
import { thesisCalibration } from "./thesis.js";
import { concentration, themeExposure, portfolioRiskFlags, correlationClusters } from "./portfolio.js";
import { symbolFor } from "./stock.js";

// ── Members ──────────────────────────────────────────────────────────────────
// Seat order = order around the table (chairman at top, then clockwise).
export const COUNCIL = [
  { id: "chairman",  name: "Sterling", title: "The Chairman",  emoji: "🦉", color: "#ffab40",
    philosophy: "Decision quality over outcomes. A good process honestly followed beats a lucky win.",
    focus: "Opens the session, weighs every argument, calls the vote, delivers the verdict and action items.",
    questions: ["What would make you change the verdict?", "What is the single most important factor here?", "How would you size this?"] },
  { id: "moderator", name: "Vox",      title: "The Moderator", emoji: "🎙️", color: "#80cbc4",
    philosophy: "Clear thinking needs structure. Track every claim, question, and risk — let nothing slip.",
    focus: "Keeps order: tracks arguments, unresolved questions, evidence on the table, and open risks.",
    questions: ["What questions are still unresolved?", "Which argument carried the most weight?", "What evidence was actually presented?"] },
  { id: "bull",      name: "Toro",     title: "The Bull",      emoji: "🐂", color: "#69f0ae",
    philosophy: "Fortunes are made by seeing the upside before the crowd. Growth, catalysts, expansion.",
    focus: "Why this could work: positive catalysts, demand acceleration, room to run.",
    questions: ["What's the strongest version of the bull case?", "What catalyst are you watching?", "What would make you even more bullish?"] },
  { id: "wizard",    name: "Veris",    title: "The Wizard",    emoji: "🧙", color: "#ce93d8",
    philosophy: "Reality vs expectations — the only gap that pays. As-reported numbers distort; find true earning power.",
    focus: "What the market believes, what is actually happening, and where the divergence is.",
    questions: ["What is priced in right now?", "Where do reality and expectations diverge?", "What is the market getting wrong?"] },
  { id: "quant",     name: "Sigma",    title: "The Quant",     emoji: "🤖", color: "#00e5ff",
    philosophy: "Opinions are hypotheses; data decides. Base rates, expectancy, sample size — or it didn't happen.",
    focus: "Statistical edge, probabilities, the user's actual track record by strategy and thesis type.",
    questions: ["What does my track record say about this setup?", "What is the expectancy here?", "Is the sample size even meaningful?"] },
  { id: "wolf",      name: "Fang",     title: "The Wolf",      emoji: "🐺", color: "#2979ff",
    philosophy: "Price pays, narrative doesn't. Trend, momentum, and levels tell you when the story is working.",
    focus: "What price and momentum are saying right now — trend vs EMAs, RSI, structure.",
    questions: ["What is price telling you?", "Where is the invalidation level?", "Is momentum confirming or diverging?"] },
  { id: "turtle",    name: "Atlas",    title: "The Turtle",    emoji: "🌍", color: "#9ccc65",
    philosophy: "The machine runs in cycles. Know the regime — liquidity, growth, inflation — before the trade.",
    focus: "Macro environment, economic cycle, liquidity, and what regime we're actually in.",
    questions: ["What regime are we in?", "How does the macro backdrop change this?", "What happens to this idea if liquidity tightens?"] },
  { id: "bear",      name: "Ursa",     title: "The Bear",      emoji: "🐻", color: "#ff5252",
    philosophy: "Survive first, compound second. The cost of being wrong matters more than the joy of being right.",
    focus: "What can go wrong: downside scenarios, capital preservation, position sizing.",
    questions: ["Why are you bearish?", "What is the worst-case scenario?", "What would change your mind?"] },
  { id: "detective", name: "Marlowe",  title: "The Detective", emoji: "🕵️", color: "#ffd54f",
    power: "EVIDENCE MISSING — can suspend a vote when critical information is absent.",
    philosophy: "Investigative investing: follow the evidence, hunt contradictions, never act on a hunch alone.",
    focus: "Missing information, contradictions, and exactly what to investigate next.",
    questions: ["What evidence are we missing?", "What contradictions did you find?", "What would increase confidence most?"] },
  { id: "skeptic",   name: "Popper",   title: "The Skeptic",   emoji: "⚖️", color: "#f48fb1",
    power: "RED FLAG REVIEW — can pause voting until unresolved reasoning flaws are addressed.",
    philosophy: "A thesis you can't falsify is faith, not analysis. Attack the reasoning, never the conclusion.",
    focus: "Weak assumptions, overconfidence, confirmation bias, logical flaws. NOT bearish — anti-groupthink.",
    questions: ["What if we are wrong?", "Which assumption is unproven?", "What evidence would invalidate this?", "What is the strongest opposing argument?"] },
];
export const MEMBER_IDS = COUNCIL.map((m) => m.id);
export const memberById = (id) => COUNCIL.find((m) => m.id === id) || null;

// Quick Council panel (default, ~80% cheaper): Chairman + Wizard + Quant + Skeptic.
export const QUICK_IDS = ["chairman", "wizard", "quant", "skeptic"];
export const COUNCIL_MODES = [
  { id: "quick", label: "Quick Council", emoji: "⚡", hint: "4 voices · seconds · a fraction of the cost" },
  { id: "full",  label: "Full Council",  emoji: "🏛️", hint: "All 10 members · the complete war room" },
];

// Single-letter wire codes — the model emits these instead of full ids to save
// output tokens; presentation never sees them (toId maps back immediately).
const CODE2ID = { c: "chairman", m: "moderator", b: "bull", r: "bear", w: "wizard", q: "quant", f: "wolf", t: "turtle", d: "detective", s: "skeptic" };
const toId = (x) => (MEMBER_IDS.includes(x) ? x : CODE2ID[x] || null);

// ── Topics ───────────────────────────────────────────────────────────────────
export const TOPIC_TYPES = [
  { id: "opportunity", label: "Opportunity",    emoji: "💡", hint: "Analyze an opportunity before committing capital" },
  { id: "trade",       label: "Trade Idea",     emoji: "⚡", hint: "Debate a specific trade setup" },
  { id: "position",    label: "Open Position",  emoji: "📌", hint: "Review a position you're holding" },
  { id: "portfolio",   label: "Portfolio",      emoji: "🧺", hint: "Surface risks across the whole book" },
  { id: "thesis",      label: "Research Thesis",emoji: "🔬", hint: "Stress-test a research idea" },
];

// ── Votes ────────────────────────────────────────────────────────────────────
export const VOTE_OPTIONS = ["Strong Buy", "Buy", "Neutral", "Avoid", "Strong Avoid"];
export const VOTE_SCORE = { "Strong Buy": 2, "Buy": 1, "Neutral": 0, "Avoid": -1, "Strong Avoid": -2 };
export const VOTE_COLOR = { "Strong Buy": "#69f0ae", "Buy": "#9ccc65", "Neutral": "#ffab40", "Avoid": "#ff8a65", "Strong Avoid": "#ff5252" };

export function voteTally(votes = []) {
  const counts = Object.fromEntries(VOTE_OPTIONS.map((v) => [v, 0]));
  let score = 0, n = 0;
  for (const v of votes) {
    if (!v || !(v.vote in VOTE_SCORE)) continue;
    counts[v.vote] += 1; score += VOTE_SCORE[v.vote]; n += 1;
  }
  const avg = n ? score / n : 0;
  const consensus =
    avg >= 1.2 ? "Strong conviction — act" :
    avg >= 0.5 ? "Leaning favorable" :
    avg > -0.5 ? "Divided — no edge identified" :
    avg > -1.2 ? "Leaning against" : "Strong conviction — stay away";
  return { counts, n, avg: +avg.toFixed(2), consensus };
}

// ── Session normalization (the model's JSON is never trusted raw) ───────────
const TURN_KINDS = ["opening", "argument", "challenge", "response", "interjection", "power", "summary"];
const str = (v, max = 420) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clamp01 = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const strArr = (a, max = 6, len = 200) => (Array.isArray(a) ? a.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);

// Accepts BOTH shapes: the legacy verbose schema ({transcript,votes,verdict,…},
// kept so cached/stored sessions keep replaying) and the compact wire schema
// ({d,eh,rf,rfr,v,x} with single-letter codes) the redesigned API emits.
// In quick mode, turns/votes from members outside the 4-seat panel are dropped.
export function normalizeSession(raw, mode = "full") {
  if (!raw || typeof raw !== "object") return null;
  const panel = new Set(mode === "quick" ? QUICK_IDS : MEMBER_IDS);

  const turnsRaw = Array.isArray(raw.transcript)
    ? raw.transcript.map((t) => (t && typeof t === "object" ? { m: t.member, text: t.text, kind: t.kind } : null))
    : Array.isArray(raw.d)
      ? raw.d.map((t) => (Array.isArray(t) ? { m: t[0], text: t[1] } : t && typeof t === "object" ? { m: t.m ?? t.member, text: t.t ?? t.text } : null))
      : [];
  const transcript = turnsRaw
    .map((t) => {
      if (!t) return null;
      const member = toId(t.m), text = str(t.text);
      if (!member || !text || !panel.has(member)) return null;
      return { member, text, kind: TURN_KINDS.includes(t.kind) ? t.kind : null };
    })
    .filter(Boolean)
    .slice(0, 30);
  if (transcript.length < 3) return null;

  const votesRaw = Array.isArray(raw.votes)
    ? raw.votes.map((v) => (v && typeof v === "object" ? v : null))
    : Array.isArray(raw.v)
      ? raw.v.map((v) => (Array.isArray(v) ? { member: v[0], vote: v[1], confidence: v[2], reason: v[3] } : v && typeof v === "object" ? v : null))
      : [];
  const seen = new Set();
  const votes = votesRaw
    .map((v) => {
      if (!v) return null;
      const member = toId(v.member ?? v.m);
      if (!member || !panel.has(member) || seen.has(member)) return null;
      seen.add(member);
      return { member, vote: VOTE_OPTIONS.includes(v.vote) ? v.vote : "Neutral", confidence: clamp01(v.confidence), reason: str(v.reason, 200) };
    })
    .filter(Boolean);

  const rv = raw.verdict && typeof raw.verdict === "object" ? raw.verdict
           : raw.x && typeof raw.x === "object"
             ? { recommendation: raw.x.r, confidence: raw.x.c, bull_case: raw.x.bull, bear_case: raw.x.bear, key_risks: raw.x.risks, required_research: raw.x.research, next_action: raw.x.act }
             : {};
  const verdict = {
    recommendation: VOTE_OPTIONS.includes(rv.recommendation) ? rv.recommendation : "Neutral",
    confidence: clamp01(rv.confidence),
    bull_case: str(rv.bull_case, 300),
    bear_case: str(rv.bear_case, 300),
    key_risks: strArr(rv.key_risks),
    required_research: strArr(rv.required_research),
    next_action: str(rv.next_action, 240),
  };

  const ehL = raw.evidence_hold && typeof raw.evidence_hold === "object" ? raw.evidence_hold : null;
  const ehC = typeof raw.eh === "string" ? raw.eh.trim() : "";
  const rfL = raw.red_flags && typeof raw.red_flags === "object" ? raw.red_flags : null;
  const rfC = Array.isArray(raw.rf) ? raw.rf : null;
  const evidence_hold = ehL ? { raised: !!ehL.raised, demand: str(ehL.demand, 280) } : { raised: !!ehC, demand: str(ehC, 280) };
  const red_flags = rfL
    ? { raised: !!rfL.raised, flags: strArr(rfL.flags, 4, 180), resolution: str(rfL.resolution, 240) }
    : { raised: !!(rfC && rfC.length), flags: strArr(rfC, 4, 180), resolution: str(raw.rfr, 240) };
  if (mode === "quick") evidence_hold.raised = false; // no Detective on the quick panel
  return { mode, transcript, votes, verdict, evidence_hold, red_flags };
}

// Presentation-only: turn "kinds" (OPENS/CHALLENGES/…) are DERIVED client-side
// instead of spending output tokens on them. Legacy sessions keep their stored kind.
export function kindOf(turn, i, all = []) {
  if (turn.kind) return turn.kind;
  if (i === 0 && turn.member === "chairman") return "opening";
  if (turn.member === "moderator") return "interjection";
  if (i === all.length - 1 && turn.member === "chairman") return "summary";
  if (/\?/.test(turn.text)) return "challenge";
  if (all[i - 1] && /\?\s*$/.test(all[i - 1].text)) return "response";
  return "argument";
}

// ── Session cache — identical discussions are never regenerated ─────────────
// Key = djb2 hash of mode|type|ticker|normalized-title. Entries expire after
// 24h (prices and context move; a verdict should not outlive its data) and the
// map is LRU-capped. `store` is injectable (localStorage in the app, a plain
// object wrapper in tests).
export function hashTopic({ mode = "quick", type = "", ticker = "", title = "" } = {}) {
  const s = `${mode}|${type}|${(ticker || "").trim().toUpperCase()}|${(title || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
export const COUNCIL_CACHE_TTL = 24 * 60 * 60 * 1000;
export function cacheGet(store, key, hash, now = Date.now()) {
  try { const e = (JSON.parse(store.getItem(key)) || {})[hash]; if (e && now - e.at < COUNCIL_CACHE_TTL) return e; } catch {}
  return null;
}
export function cachePut(store, key, hash, rec, max = 12) {
  try {
    const m = JSON.parse(store.getItem(key)) || {};
    m[hash] = { ...rec, at: rec.at ?? Date.now() };
    const ks = Object.keys(m);
    if (ks.length > max) ks.sort((a, b) => m[a].at - m[b].at).slice(0, ks.length - max).forEach((k) => delete m[k]);
    store.setItem(key, JSON.stringify(m));
  } catch {}
}

// ── Personalized context (client-built, sent to the server like systemPrompt) ─
// Only REAL account data goes in — the same honesty rule as the rest of the app.
const FX = { USD: 1, INR: 1 / 84 };
const r = (v) => `${v >= 0 ? "+" : ""}${(+v).toFixed(2)}R`;

export function buildCouncilContext({ holdings = [], journal = [], reviews = [], opportunities = [], watchlist = [], topic = null, compact = false } = {}) {
  // ── COMPACT (Quick Council): ~4-6 dense lines, ≤1600 chars — only what four
  // specialists need. ~70% fewer prompt tokens than the full block below.
  if (compact) {
    const out = [];
    if (holdings.length) {
      const items = holdings.map((h) => ({ ticker: h.ticker, sector: h.sector, value: (+h.shares || 0) * (+h.price || 0) * (FX[h.currency] || 1) }));
      const con = concentration(items);
      const theme = themeExposure(items)[0];
      out.push(`PF: ${holdings.slice(0, 6).map((h) => `${h.ticker} ${h.shares}sh ${symbolFor(h.currency)}${h.price}`).join(", ")}${holdings.length > 6 ? ` +${holdings.length - 6}` : ""} | top1 ${con.largest ? `${con.largest.ticker} ${(con.top1Pct * 100).toFixed(0)}%` : "—"}, top3 ${(con.top3Pct * 100).toFixed(0)}%${theme ? `, ${theme.key} ${(theme.pct * 100).toFixed(0)}%` : ""}`);
    } else out.push("PF: empty");
    const perf = performance(journal);
    if (perf.trades > 0) {
      const alpha = personalAlpha(journal);
      out.push(`RECORD: ${perf.trades} closed, win ${(perf.winRate * 100).toFixed(0)}%, expectancy ${r(perf.expectancyR)}, maxDD ${perf.maxDrawdownR.toFixed(1)}R${alpha.bestEdge ? ` | edge: ${alpha.bestEdge.key} ${r(alpha.bestEdge.expectancyR)} (${alpha.bestEdge.withRisk}t)` : ""}${alpha.worstLeak ? ` | leak: ${alpha.worstLeak.key} ${r(alpha.worstLeak.expectancyR)} (${alpha.worstLeak.withRisk}t)` : ""}`);
    } else out.push("RECORD: no closed trades yet — small/no sample.");
    const open = journal.filter((t) => !t.closed);
    if (open.length) out.push(`OPEN: ${open.slice(0, 5).map((t) => `${t.ticker} ${t.side} @${t.entry}${t.stop ? `/${t.stop}` : ""}`).join(", ")}`);
    const tk = topic?.ticker ? topic.ticker.toUpperCase() : null;
    const opp = tk ? opportunities.find((o) => o.ticker === tk && o.status !== "dismissed") : null;
    if (opp) out.push(`THESIS ${opp.ticker} [${opp.thesis_type || "?"}, ${opp.confidence}%]: expects "${(opp.market_expectations || "").slice(0, 80)}" vs "${(opp.reality_hypothesis || "").slice(0, 80)}"`);
    const w = tk ? watchlist.find((x) => x.ticker === tk && x.price != null) : null;
    if (w) out.push(`SNAP ${w.ticker}: ${symbolFor(w.currency)}${w.price} ${w.chg >= 0 ? "+" : ""}${w.chg}%, RSI ${w.rsi}${w.ema20 ? `, EMA20 ${w.ema20}` : ""}${w.ema200 ? `, EMA200 ${w.ema200}` : ""}`);
    return out.join("\n").slice(0, 1600);
  }

  const out = [];

  // Portfolio + intelligence
  if (holdings.length) {
    const items = holdings.map((h) => ({ ticker: h.ticker, sector: h.sector, value: (+h.shares || 0) * (+h.price || 0) * (FX[h.currency] || 1) }));
    const con = concentration(items);
    const themes = themeExposure(items).slice(0, 4).map((t) => `${t.key} ${(t.pct * 100).toFixed(0)}%`).join(", ");
    const flags = portfolioRiskFlags(items).map((f) => f.text);
    const clusters = correlationClusters(items).map((c) => `${c.tickers.join("+")} = one ${c.theme} bet (${(c.pct * 100).toFixed(0)}%)`);
    out.push(`PORTFOLIO (${holdings.length} positions): ${holdings.map((h) => `${h.ticker} ${h.shares}sh @${symbolFor(h.currency)}${h.avgCost}→${symbolFor(h.currency)}${h.price} (${h.sector})`).join(" · ")}`);
    out.push(`CONCENTRATION: largest ${con.largest ? `${con.largest.ticker} ${(con.top1Pct * 100).toFixed(0)}%` : "—"}, top3 ${(con.top3Pct * 100).toFixed(0)}%, effective bets ${con.effectiveN ? con.effectiveN.toFixed(1) : "—"}. Themes: ${themes || "—"}.`);
    if (flags.length) out.push(`PORTFOLIO RISK FLAGS: ${flags.join(" | ")}`);
    if (clusters.length) out.push(`CORRELATION: ${clusters.join(" | ")}`);
  } else out.push("PORTFOLIO: empty.");

  // Open positions from the journal
  const open = journal.filter((t) => !t.closed);
  if (open.length) out.push(`OPEN TRADES: ${open.slice(0, 8).map((t) => `${t.ticker} ${t.side} @${t.entry}${t.stop ? ` stop ${t.stop}` : ""}${t.thesisType ? ` [${t.thesisType}, conf ${t.thesisConfidence ?? "?"}%]` : ""}`).join(" · ")}`);

  // Track record — the heart of personalization
  const perf = performance(journal);
  if (perf.trades > 0) {
    out.push(`TRACK RECORD (${perf.trades} closed): win ${(perf.winRate * 100).toFixed(0)}%, expectancy ${r(perf.expectancyR)}/trade, profit factor ${perf.profitFactor === Infinity ? "∞" : perf.profitFactor.toFixed(2)}, max drawdown ${perf.maxDrawdownR.toFixed(2)}R.`);
    const strat = byStrategy(journal).map((s) => `${s.strategy}: ${(s.winRate * 100).toFixed(0)}% win, ${r(s.expectancyR)} (${s.trades} trades)`).join(" · ");
    if (strat) out.push(`BY STRATEGY: ${strat}`);
    const alpha = personalAlpha(journal);
    if (alpha.bestEdge) out.push(`PERSONAL EDGE: ${alpha.bestEdge.dimension} "${alpha.bestEdge.key}" → ${r(alpha.bestEdge.expectancyR)} over ${alpha.bestEdge.withRisk} trades.`);
    if (alpha.worstLeak) out.push(`PERSONAL LEAK: ${alpha.worstLeak.dimension} "${alpha.worstLeak.key}" → ${r(alpha.worstLeak.expectancyR)} over ${alpha.worstLeak.withRisk} trades — the user historically underperforms here.`);
  } else out.push("TRACK RECORD: no closed trades yet — insufficient history for personal-alpha conclusions.");

  // Lessons from AI trade reviews
  const revs = (Array.isArray(reviews) ? reviews : Object.values(reviews || {})).filter((x) => x && !x.error);
  if (revs.length) {
    const lessons = revs.flatMap((x) => Array.isArray(x.lessons) ? x.lessons : []).slice(-5);
    if (lessons.length) out.push(`LESSONS FROM PAST REVIEWS: ${lessons.join(" | ")}`);
  }

  // Active theses / opportunities
  const opps = opportunities.filter((o) => o.status !== "dismissed").slice(0, 5);
  if (opps.length) out.push(`ACTIVE THESES: ${opps.map((o) => `${o.ticker} [${o.thesis_type || "?"}, conf ${o.confidence}%] expects "${(o.market_expectations || "").slice(0, 90)}" vs reality "${(o.reality_hypothesis || "").slice(0, 90)}"`).join(" · ")}`);

  // Live snapshot — topic ticker first, else a small slice of the watchlist
  const snap = (w) => `${w.ticker} ${symbolFor(w.currency)}${w.price}${w.chg != null ? ` (${w.chg >= 0 ? "+" : ""}${w.chg}%)` : ""} RSI ${w.rsi}${w.ema20 ? ` EMA20 ${w.ema20}` : ""}${w.ema200 ? ` EMA200 ${w.ema200}` : ""}`;
  const live = watchlist.filter((w) => w.price != null);
  const focus = topic?.ticker ? live.find((w) => w.ticker === topic.ticker.toUpperCase()) : null;
  if (focus) out.push(`LIVE SNAPSHOT (topic): ${snap(focus)}`);
  if (live.length) out.push(`WATCHLIST SNAPSHOT: ${live.slice(0, 10).map(snap).join(" · ")}`);

  return out.join("\n").slice(0, 6000);
}

// ── COUNCIL MEMORY — each member's evolving read on the user ────────────────
// Derived deterministically from REAL account data (zero tokens, recomputed
// live, so it evolves as the journal/reviews/theses grow). Injected into the
// debate context as private notes, shown in the dossier, and fed to the "ask"
// endpoint so members reference their opinion of the user naturally. When the
// sample is thin, members say so — same honesty rule as everything else.
export function memberMemories({ journal = [], reviews = [], opportunities = [] } = {}) {
  const revs = (Array.isArray(reviews) ? reviews : Object.values(reviews || {})).filter((x) => x && !x.error);
  const closed = journal.filter((t) => t.closed);
  const alpha = personalAlpha(journal);
  const mem = {};

  // Sigma 🤖 — statistical edge & leak
  mem.quant = alpha.bestEdge || alpha.worstLeak
    ? [alpha.bestEdge && `You perform best on ${alpha.bestEdge.key}: ${r(alpha.bestEdge.expectancyR)} over ${alpha.bestEdge.withRisk} trades`,
       alpha.worstLeak && `you bleed on ${alpha.worstLeak.key}: ${r(alpha.worstLeak.expectancyR)} over ${alpha.worstLeak.withRisk}`].filter(Boolean).join("; ") + "."
    : `Only ${closed.length} closed trades — I'm still building your statistical profile.`;

  // Popper ⚖️ — calibration (overconfidence is his hunting ground)
  const cal = thesisCalibration(journal, revs);
  mem.skeptic = cal.n >= 3
    ? cal.label === "Overconfident"
      ? `You state ${(cal.avgConfidence * 100).toFixed(0)}% confidence but land ${(cal.actualAccuracy * 100).toFixed(0)}% — you run overconfident. I discount your conviction accordingly.`
      : cal.label === "Underconfident"
        ? `You're better than you claim: ${(cal.actualAccuracy * 100).toFixed(0)}% accuracy vs ${(cal.avgConfidence * 100).toFixed(0)}% stated confidence. Trust your process more.`
        : `Your stated confidence tracks reality (${cal.n} judged theses) — rare, and noted.`
    : "Not enough judged theses to test your calibration yet. I'm watching.";

  // Veris 🧙 — does the user find real expectation gaps?
  const ec = revs.filter((x) => typeof x.expectations_changed === "boolean");
  const gaps = ec.filter((x) => x.expectations_changed).length;
  mem.wizard = ec.length >= 3
    ? gaps / ec.length >= 0.5
      ? `Reality diverged from consensus in ${gaps} of your ${ec.length} judged theses — you genuinely find expectation gaps.`
      : `Consensus was right in ${ec.length - gaps} of your ${ec.length} judged theses — I push you for harder divergence evidence.`
    : "I can't yet tell whether you find true expectation gaps or follow the crowd.";

  // Marlowe 🕵️ — evidence habits
  const withThesis = journal.filter((t) => t.thesisType);
  const noEv = withThesis.filter((t) => !String(t.evidence || "").trim());
  mem.detective = withThesis.length >= 3
    ? noEv.length / withThesis.length > 0.5
      ? `${noEv.length} of your ${withThesis.length} theses were filed with no evidence attached — you tend to enter before the facts arrive.`
      : `You attached evidence on ${withThesis.length - noEv.length} of ${withThesis.length} theses — respectable investigative habits.`
    : "Your evidence trail is too short to profile. I reserve judgment.";

  // Toro 🐂 — conviction sizing
  const sized = closed.filter((t) => Number.isFinite(+t.thesisConfidence) && +t.shares > 0 && +t.entry > 0);
  const hi = sized.filter((t) => +t.thesisConfidence >= 70), lo = sized.filter((t) => +t.thesisConfidence < 70);
  const avgNotional = (a) => a.reduce((s, t) => s + (+t.shares) * (+t.entry), 0) / a.length;
  mem.bull = hi.length >= 2 && lo.length >= 2
    ? avgNotional(hi) <= avgNotional(lo)
      ? "You under-size your highest-conviction ideas — your ≥70% confidence trades carry no more capital than the rest."
      : "You do size up when conviction is high — good. Conviction should cost something."
    : "I don't yet know if you back your best ideas with real size.";

  // Ursa 🐻 — stop discipline & drawdown
  const perf = performance(journal);
  const noStop = closed.filter((t) => rMultipleOf(t) == null).length;
  mem.bear = closed.length
    ? noStop > 0
      ? `${noStop} of your ${closed.length} closed trades had no usable stop — that is how accounts die. Max drawdown so far: ${perf.maxDrawdownR.toFixed(1)}R.`
      : `Every closed trade carried a stop — discipline noted. Max drawdown ${perf.maxDrawdownR.toFixed(1)}R.`
    : "No closed trades yet — your risk discipline is unproven to me.";

  // Fang 🐺 — setup quality
  const strats = byStrategy(journal).filter((s) => s.trades >= 2);
  mem.wolf = strats.length
    ? `${strats[0].strategy} is your best setup (${(strats[0].winRate * 100).toFixed(0)}% win, ${r(strats[0].expectancyR)})${strats.length > 1 ? `; ${strats[strats.length - 1].strategy} is your weakest (${r(strats[strats.length - 1].expectancyR)})` : ""}.`
    : "No setup has enough trades for me to call it yours yet.";

  // Atlas 🌍 — market/regime split
  const mkt = (alpha.dims.find((d) => d.id === "market")?.groups || []).filter((g) => g.withRisk >= 2);
  mem.turtle = mkt.length >= 2
    ? `Environment matters for you: ${mkt[0].key} ${r(mkt[0].expectancyR)} vs ${mkt[mkt.length - 1].key} ${r(mkt[mkt.length - 1].expectancyR)}.`
    : mkt.length === 1
      ? `Nearly all your evidence comes from ${mkt[0].key} (${r(mkt[0].expectancyR)}) — you haven't been tested across regimes.`
      : "I haven't seen you trade across enough environments to map you yet.";

  // Vox 🎙️ — the recurring open item, costed in R
  const mc = mistakeCost(revs, journal);
  mem.moderator = mc.length
    ? `Standing item on my ledger: "${mc[0].label}" — flagged ${mc[0].count}×${mc[0].totalR < 0 ? `, ${mc[0].totalR}R of damage` : ""}.`
    : "My ledger has no recurring open items against you yet.";

  // Sterling 🦉 — process over outcome
  const verdicts = revs.map((x) => x.verdict).filter(Boolean);
  const goodProc = verdicts.filter((v) => String(v).startsWith("good_process")).length;
  mem.chairman = verdicts.length >= 3
    ? `Across ${verdicts.length} reviewed trades you ran a good process ${Math.round((goodProc / verdicts.length) * 100)}% of the time. I judge you on that, not P&L.`
    : "Too few reviewed trades to judge your process yet — and process is all I judge.";

  return mem;
}

// Render the panel's private notes for the debate context (token-budgeted).
export function memoriesBlock(mem, ids, perLine = 130) {
  const lines = ids.map((id) => { const m = memberById(id), s = mem[id]; return m && s ? `${m.name}: ${s.slice(0, perLine)}` : null; }).filter(Boolean);
  return lines.length ? `COUNCIL NOTES ON THE USER (each member's private read — reference yours naturally):\n${lines.join("\n")}` : "";
}

// ── Coalitions — who stands with whom, computed from ballots ────────────────
export function coalitions(votes = []) {
  const g = { for: [], neutral: [], against: [] };
  for (const v of votes) {
    if (!(v?.vote in VOTE_SCORE)) continue;
    const n = memberById(v.member)?.name || v.member;
    (VOTE_SCORE[v.vote] > 0 ? g.for : VOTE_SCORE[v.vote] < 0 ? g.against : g.neutral).push(n);
  }
  return g;
}

// ── Visual reactions — deterministic by turn index (replays identically, no
// randomness in render). Members named in the speech react with ❗; otherwise a
// seeded pick of listeners gets a thinking/watching emote.
const REACTS = ["🤔", "👀", "✍️", "💭", "🤨"];
export function pickReactors(turn, i, ids = []) {
  const others = ids.filter((id) => id !== turn.member);
  if (!others.length) return [];
  const txt = turn.text.toLowerCase();
  const named = others.filter((id) => { const m = memberById(id); return m && txt.includes(m.name.toLowerCase()); });
  if (named.length) return named.slice(0, 2).map((id) => ({ id, emoji: "❗" }));
  const out = [{ id: others[(i * 7) % others.length], emoji: REACTS[i % REACTS.length] }];
  const b = others[(i * 13 + 3) % others.length];
  if (i % 2 && b !== out[0].id) out.push({ id: b, emoji: REACTS[(i * 3 + 2) % REACTS.length] });
  return out;
}

// ── COUNCIL TREASURY — themed usage ledger (real Groq usage when available) ──
// Health is RELATIVE to the user's own trailing pattern, never a hardcoded
// provider limit: today's spend vs the average of recent active days.
const TREASURY_DAYS = 30, TREASURY_MAX_EVENTS = 400;
export function treasuryRecord(store, userId, ev, now = Date.now()) {
  try {
    const key = `tradeiq_council_treasury_${userId}`;
    const m = JSON.parse(store.getItem(key)) || { events: [] };
    m.events.push({ t: now, mode: ev.mode || "quick", cache: ev.cache === "hit" ? "hit" : "miss", pin: Math.max(0, Math.round(+ev.pin || 0)), pout: Math.max(0, Math.round(+ev.pout || 0)) });
    m.events = m.events.filter((e) => now - e.t < TREASURY_DAYS * 864e5).slice(-TREASURY_MAX_EVENTS);
    store.setItem(key, JSON.stringify(m));
  } catch {}
}
export function treasuryStats(store, userId, now = Date.now()) {
  let events = [];
  try { events = (JSON.parse(store.getItem(`tradeiq_council_treasury_${userId}`)) || {}).events || []; } catch {}
  events = events.filter((e) => now - e.t < TREASURY_DAYS * 864e5);
  const day = (t) => Math.floor(t / 864e5);
  const today = day(now);
  const sum = (a, f) => a.reduce((s, e) => s + f(e), 0);
  const sessions = events.filter((e) => e.mode === "quick" || e.mode === "full");
  const byDay = {};
  for (const e of events) byDay[day(e.t)] = (byDay[day(e.t)] || 0) + e.pin + e.pout;
  return {
    quick: sessions.filter((e) => e.mode === "quick").length,
    full: sessions.filter((e) => e.mode === "full").length,
    asks: events.filter((e) => e.mode === "ask").length,
    hits: events.filter((e) => e.cache === "hit").length,
    misses: events.filter((e) => e.cache === "miss").length,
    pin: sum(events, (e) => e.pin),
    pout: sum(events, (e) => e.pout),
    total: sum(events, (e) => e.pin + e.pout),
    today: byDay[today] || 0,
    pastDays: Object.entries(byDay).filter(([d]) => +d !== today).map(([, v]) => v),
  };
}
export function treasuryHealth(stats) {
  const hitRate = stats.hits + stats.misses ? stats.hits / (stats.hits + stats.misses) : 0;
  if (!stats.pastDays.length || stats.today === 0) return { level: "green", label: "Healthy", ratio: 0, hitRate };
  const avg = stats.pastDays.reduce((s, x) => s + x, 0) / stats.pastDays.length;
  const ratio = avg > 0 ? stats.today / avg : 1;
  const level = ratio <= 1.5 ? "green" : ratio <= 3 ? "yellow" : "red";
  return { level, label: level === "green" ? "Healthy" : level === "yellow" ? "Moderate Usage" : "Approaching Limits", ratio: +ratio.toFixed(2), hitRate };
}

// Compact summary the "ask a member" endpoint needs to stay in character.
export function sessionBrief(topic, session) {
  if (!session) return "";
  const lines = session.votes.map((x) => `${x.member}: ${x.vote} (${x.confidence}%) — ${x.reason}`).join("\n");
  return `TOPIC: ${topic?.title || "—"}\nVERDICT: ${session.verdict.recommendation} (${session.verdict.confidence}%) — next: ${session.verdict.next_action}\nVOTES:\n${lines}`.slice(0, 2200);
}
