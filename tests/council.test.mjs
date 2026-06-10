import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNCIL, MEMBER_IDS, memberById, VOTE_OPTIONS, QUICK_IDS,
  normalizeSession, voteTally, buildCouncilContext, sessionBrief,
  kindOf, hashTopic, cacheGet, cachePut, COUNCIL_CACHE_TTL,
  memberMemories, memoriesBlock, coalitions, pickReactors,
  treasuryRecord, treasuryStats, treasuryHealth,
} from "../src/council.js";
import { MODES, buildConveneMessages, buildAskSystem, QUICK_PANEL, MEMBER_CODE } from "../api/_council_prompts.js";

// ── Member roster ─────────────────────────────────────────────────────────────
test("council has ten unique members with required identity fields", () => {
  assert.equal(COUNCIL.length, 10);
  assert.equal(new Set(MEMBER_IDS).size, 10);
  for (const m of COUNCIL) {
    for (const k of ["id", "name", "title", "emoji", "color", "philosophy", "focus", "questions"]) {
      assert.ok(m[k], `${m.id} missing ${k}`);
    }
    assert.ok(m.questions.length >= 3, `${m.id} needs suggested questions`);
  }
  // Special powers belong to detective + skeptic only
  assert.ok(memberById("detective").power.includes("EVIDENCE MISSING"));
  assert.ok(memberById("skeptic").power.includes("RED FLAG REVIEW"));
  assert.ok(!memberById("bull").power);
});

// ── Session normalization ─────────────────────────────────────────────────────
const goodSession = {
  transcript: [
    { member: "chairman", text: "We convene on NVDA.", kind: "opening" },
    { member: "bull", text: "Demand is accelerating.", kind: "argument" },
    { member: "skeptic", text: "What evidence proves that?", kind: "challenge" },
    { member: "hacker", text: "I should not exist.", kind: "argument" }, // invalid member
    { member: "bear", text: 42, kind: "argument" },                      // invalid text
  ],
  evidence_hold: { raised: true, demand: "No supplier data yet." },
  red_flags: { raised: false },
  votes: [
    { member: "bull", vote: "Strong Buy", confidence: 180, reason: "Upside." },
    { member: "bear", vote: "Dump it all", confidence: -5, reason: "x" }, // invalid vote → Neutral
    { member: "bull", vote: "Buy", confidence: 50, reason: "dupe" },      // duplicate → dropped
    { member: "ghost", vote: "Buy", confidence: 50, reason: "no" },       // invalid member
  ],
  verdict: { recommendation: "Buy", confidence: 68, bull_case: "b", bear_case: "r", key_risks: ["k1", "", 3], required_research: ["r1"], next_action: "Wait for supplier data." },
};

test("normalizeSession keeps only valid members/turns and clamps votes", () => {
  const s = normalizeSession(goodSession);
  assert.ok(s);
  assert.equal(s.transcript.length, 3); // invalid member + non-string text dropped
  assert.ok(s.transcript.every((t) => MEMBER_IDS.includes(t.member)));
  assert.equal(s.votes.length, 2); // dupe + unknown dropped
  assert.equal(s.votes[0].confidence, 100); // clamped
  assert.equal(s.votes[1].vote, "Neutral"); // invalid option coerced
  assert.equal(s.votes[1].confidence, 0);
  assert.equal(s.verdict.recommendation, "Buy");
  assert.deepEqual(s.verdict.key_risks, ["k1"]);
  assert.equal(s.evidence_hold.raised, true);
  assert.equal(s.red_flags.raised, false);
});

test("normalizeSession rejects garbage and too-short sessions", () => {
  assert.equal(normalizeSession(null), null);
  assert.equal(normalizeSession("nope"), null);
  assert.equal(normalizeSession({ transcript: [], votes: [], verdict: {} }), null);
  assert.equal(normalizeSession({ transcript: [{ member: "bull", text: "hi" }], verdict: {} }), null); // < 3 turns
});

test("normalizeSession coerces a missing verdict to safe Neutral defaults", () => {
  const s = normalizeSession({ transcript: goodSession.transcript, votes: [], verdict: { recommendation: "YOLO" } });
  assert.equal(s.verdict.recommendation, "Neutral");
  assert.equal(s.verdict.confidence, 0);
  assert.deepEqual(s.verdict.key_risks, []);
});

// ── Vote tally ────────────────────────────────────────────────────────────────
test("voteTally scores and labels consensus", () => {
  const t = voteTally([
    { vote: "Strong Buy" }, { vote: "Strong Buy" }, { vote: "Buy" },
    { vote: "Neutral" }, { vote: "garbage" },
  ]);
  assert.equal(t.n, 4);
  assert.equal(t.counts["Strong Buy"], 2);
  assert.equal(t.avg, 1.25);
  assert.equal(t.consensus, "Strong conviction — act");
  assert.equal(voteTally([]).n, 0);
  assert.equal(voteTally([{ vote: "Strong Avoid" }, { vote: "Avoid" }]).consensus, "Strong conviction — stay away");
  assert.ok(VOTE_OPTIONS.every((v) => v in t.counts));
});

// ── Context builder ───────────────────────────────────────────────────────────
test("buildCouncilContext handles empty accounts without throwing", () => {
  const ctx = buildCouncilContext({});
  assert.ok(ctx.includes("PORTFOLIO: empty."));
  assert.ok(ctx.includes("no closed trades yet"));
});

test("buildCouncilContext includes real portfolio, trades, theses and snapshot", () => {
  const ctx = buildCouncilContext({
    holdings: [{ ticker: "NVDA", shares: 2, avgCost: 100, price: 120, sector: "Tech", currency: "USD" }],
    journal: [
      { ticker: "TSLA", side: "BUY", entry: "100", exit: "110", stop: "95", shares: "1", closed: true, strategy: "EMA Pullback", currency: "USD" },
      { ticker: "AMD", side: "BUY", entry: "90", stop: "85", shares: "1", closed: false, thesisType: "Turnaround", thesisConfidence: 55, currency: "USD" },
    ],
    opportunities: [{ ticker: "META", status: "new", thesis_type: "Margin Expansion", confidence: 64, market_expectations: "flat margins", reality_hypothesis: "cost cuts landing" }],
    watchlist: [{ ticker: "NVDA", price: 120, chg: 1.2, rsi: 55, ema20: 118, ema200: 100, currency: "USD" }],
    topic: { ticker: "NVDA" },
  });
  assert.ok(ctx.includes("NVDA 2sh"));
  assert.ok(ctx.includes("OPEN TRADES: AMD BUY"));
  assert.ok(ctx.includes("TRACK RECORD (1 closed)"));
  assert.ok(ctx.includes("ACTIVE THESES: META"));
  assert.ok(ctx.includes("LIVE SNAPSHOT (topic): NVDA"));
  assert.ok(ctx.length <= 6000);
});

// ── Compact wire schema (v2 cost redesign) ───────────────────────────────────
const compactSession = {
  d: [["c", "We convene on NVDA."], ["w", "The price embeds deceleration."], ["s", "Veris, what would falsify that?"], ["q", "Expectancy +0.4R over 9 trades — small sample."], ["b", "Bull should be dropped in quick mode."], ["zz", "bad code"]],
  eh: "",
  rf: ["Acceleration claim rests on one unverified assumption"],
  rfr: "Logged as required research.",
  v: [["w", "Buy", 70, "Divergence favors upside."], ["s", "Neutral", 55, "Unfalsified."], ["q", "Buy", 60, "Edge positive, sample small."], ["c", "Buy", 65, "Process held."], ["b", "Strong Buy", 90, "off-panel"]],
  x: { r: "Buy", c: 64, bull: "Expectations look beatable.", bear: "Sample is thin.", risks: ["Small sample"], research: ["Verify order momentum"], act: "Paper-size the entry." },
};

test("normalizeSession accepts the compact wire schema with member codes", () => {
  const s = normalizeSession(compactSession, "quick");
  assert.ok(s);
  assert.equal(s.mode, "quick");
  // off-panel (bull) + unknown code turns/votes dropped in quick mode
  assert.equal(s.transcript.length, 4);
  assert.deepEqual(s.transcript.map((t) => t.member), ["chairman", "wizard", "skeptic", "quant"]);
  assert.equal(s.votes.length, 4);
  assert.ok(s.votes.every((v) => QUICK_IDS.includes(v.member)));
  assert.equal(s.verdict.recommendation, "Buy");
  assert.equal(s.verdict.next_action, "Paper-size the entry.");
  assert.equal(s.red_flags.raised, true);
  assert.equal(s.red_flags.resolution, "Logged as required research.");
  assert.equal(s.evidence_hold.raised, false); // no Detective on the quick panel
});

test("compact schema in full mode keeps all valid members", () => {
  const s = normalizeSession(compactSession, "full");
  assert.equal(s.transcript.length, 5); // bull allowed, unknown code still dropped
  assert.equal(s.votes.length, 5);
});

test("kindOf derives presentation kinds client-side", () => {
  const tr = [
    { member: "chairman", text: "We convene." },
    { member: "skeptic", text: "What proves that?" },
    { member: "quant", text: "The base rate says otherwise." },
    { member: "moderator", text: "Two questions remain open." },
    { member: "chairman", text: "I call the vote." },
  ];
  assert.equal(kindOf(tr[0], 0, tr), "opening");
  assert.equal(kindOf(tr[1], 1, tr), "challenge");
  assert.equal(kindOf(tr[2], 2, tr), "response"); // follows a question
  assert.equal(kindOf(tr[3], 3, tr), "interjection");
  assert.equal(kindOf(tr[4], 4, tr), "summary");
  assert.equal(kindOf({ member: "bull", text: "Upside.", kind: "argument" }, 2, tr), "argument"); // stored kind wins
});

// ── Cache: hash + TTL ─────────────────────────────────────────────────────────
test("hashTopic is stable, normalized, and mode/ticker sensitive", () => {
  const a = hashTopic({ mode: "quick", type: "trade", ticker: "nvda", title: "  Buy   the dip? " });
  const b = hashTopic({ mode: "quick", type: "trade", ticker: "NVDA", title: "buy the dip?" });
  assert.equal(a, b); // case/whitespace normalized
  assert.notEqual(a, hashTopic({ mode: "full", type: "trade", ticker: "NVDA", title: "buy the dip?" }));
  assert.notEqual(a, hashTopic({ mode: "quick", type: "trade", ticker: "AMD", title: "buy the dip?" }));
  assert.match(a, /^[0-9a-f]{8}$/);
});

const memStore = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

test("cacheGet/cachePut: hit within TTL, miss after expiry, LRU eviction", () => {
  const store = memStore();
  const now = 1_000_000_000;
  cachePut(store, "k", "h1", { topic: { title: "t" }, session: { ok: 1 }, at: now });
  assert.ok(cacheGet(store, "k", "h1", now + 1000));
  assert.equal(cacheGet(store, "k", "h1", now + COUNCIL_CACHE_TTL + 1), null); // expired
  assert.equal(cacheGet(store, "k", "missing", now), null);
  for (let i = 0; i < 15; i++) cachePut(store, "k", `x${i}`, { at: now + i }, 12);
  assert.equal(cacheGet(store, "k", "x0", now + 20), null);            // evicted (oldest)
  assert.ok(cacheGet(store, "k", "x14", now + 20));                    // newest kept
});

// ── Prompt/config invariants ──────────────────────────────────────────────────
test("quick mode is materially cheaper than full by construction", () => {
  assert.deepEqual(QUICK_PANEL.sort(), [...QUICK_IDS].sort());
  assert.ok(MODES.quick.system.length < MODES.full.system.length * 0.75, "quick system prompt must be much smaller");
  assert.ok(MODES.quick.maxTokens <= 1000 && MODES.full.maxTokens <= 2600);
  assert.ok(MODES.quick.contextCap <= 2000);
  const q = buildConveneMessages("quick", { type: "trade", ticker: "NVDA", title: "Buy the dip?" }, "CTX");
  assert.equal(q.messages.length, 2);
  assert.ok(q.messages[0].content.includes("Popper"));
  assert.ok(!q.messages[0].content.includes("Marlowe")); // no Detective in quick prompt
  assert.ok(buildAskSystem("wizard", "ctx", "brief").includes("Veris"));
  assert.equal(Object.keys(MEMBER_CODE).length, 10);
});

test("compact context is a fraction of the full context", () => {
  const account = {
    holdings: [{ ticker: "NVDA", shares: 2, avgCost: 100, price: 120, sector: "Tech", currency: "USD" }],
    journal: [{ ticker: "TSLA", side: "BUY", entry: "100", exit: "110", stop: "95", shares: "1", closed: true, strategy: "EMA Pullback", currency: "USD" }],
    opportunities: [{ ticker: "NVDA", status: "new", thesis_type: "Demand Acceleration", confidence: 68, market_expectations: "slowdown", reality_hypothesis: "acceleration" }],
    watchlist: [{ ticker: "NVDA", price: 120, chg: 1.2, rsi: 55, ema20: 118, ema200: 100, currency: "USD" }],
    topic: { ticker: "NVDA" },
  };
  const full = buildCouncilContext(account);
  const compact = buildCouncilContext({ ...account, compact: true });
  assert.ok(compact.length < full.length * 0.7, `compact ${compact.length} should be well under full ${full.length}`);
  assert.ok(compact.length <= 1600);
  assert.ok(compact.includes("THESIS NVDA"));   // topic thesis survives compression
  assert.ok(compact.includes("SNAP NVDA"));     // topic snapshot survives compression
  assert.ok(compact.includes("RECORD:"));       // track record survives compression
});

// ── V2: Council Memory ────────────────────────────────────────────────────────
test("memberMemories gives every member a humble default on an empty account", () => {
  const mem = memberMemories({});
  for (const id of MEMBER_IDS) assert.ok(mem[id] && typeof mem[id] === "string", `${id} missing memory`);
  assert.match(mem.quant, /still building/i);
  assert.match(mem.skeptic, /watching/i);
  assert.match(mem.bear, /unproven/i);
});

test("memberMemories derives real opinions from real data", () => {
  // 6 closed Turnaround losers with stops → a confident leak for Sigma
  const journal = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: i + 1, ticker: "T" + i, side: "BUY", entry: "100", exit: "94", stop: "95", shares: "2", closed: true, strategy: "Breakout Consolidation", thesisType: "Turnaround", thesisConfidence: 85, evidence: "", currency: "USD" })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, ticker: "W" + i, side: "BUY", entry: "100", exit: "112", stop: "96", shares: "2", closed: true, strategy: "EMA Pullback", thesisType: "Demand Acceleration", thesisConfidence: 60, evidence: "checked filings", currency: "USD" })),
  ];
  // reviews: high stated confidence (85) on the 6 losers judged incorrect → overconfident
  const reviews = journal.slice(0, 6).map((t) => ({ trade_id: t.id, ai_thesis_verdict: "incorrect", verdict: "bad_process_bad_outcome", tags: ["chased_entry"] }));
  const mem = memberMemories({ journal, reviews });
  assert.match(mem.quant, /Demand Acceleration/);        // best edge cited
  assert.match(mem.quant, /Turnaround/);                 // worst leak cited
  assert.match(mem.skeptic, /overconfident/i);           // calibration gap detected
  assert.match(mem.detective, /no evidence|facts arrive/i); // 6 of 11 theses without evidence
  assert.match(mem.bear, /Every closed trade carried a stop/);
  assert.match(mem.moderator, /chased/i);                // recurring mistake on the ledger
});

test("memoriesBlock renders only the requested panel, token-budgeted", () => {
  const mem = memberMemories({});
  const block = memoriesBlock(mem, QUICK_IDS, 60);
  assert.ok(block.includes("Sigma:") && block.includes("Popper:") && block.includes("Sterling:") && block.includes("Veris:"));
  assert.ok(!block.includes("Toro:") && !block.includes("Marlowe:"));
  assert.equal(memoriesBlock(mem, []), "");
});

// ── V2: coalitions + reactions ────────────────────────────────────────────────
test("coalitions groups ballots by stance with member names", () => {
  const co = coalitions([
    { member: "bull", vote: "Strong Buy" }, { member: "wizard", vote: "Buy" },
    { member: "quant", vote: "Neutral" },
    { member: "bear", vote: "Avoid" }, { member: "skeptic", vote: "Avoid" },
  ]);
  assert.deepEqual(co.for, ["Toro", "Veris"]);
  assert.deepEqual(co.neutral, ["Sigma"]);
  assert.deepEqual(co.against, ["Ursa", "Popper"]);
});

test("pickReactors is deterministic, excludes the speaker, prioritizes named members", () => {
  const turn = { member: "bull", text: "Sigma, your own numbers prove demand is accelerating." };
  const r1 = pickReactors(turn, 4, QUICK_IDS.concat("bull"));
  assert.deepEqual(r1, pickReactors(turn, 4, QUICK_IDS.concat("bull"))); // deterministic
  assert.equal(r1[0].id, "quant"); assert.equal(r1[0].emoji, "❗");        // named → exclaims
  const r2 = pickReactors({ member: "bull", text: "Upside is huge." }, 3, QUICK_IDS.concat("bull"));
  assert.ok(r2.length >= 1 && r2.every((x) => x.id !== "bull"));
  assert.deepEqual(pickReactors(turn, 1, ["bull"]), []);                   // nobody else seated
});

// ── V2: Council Treasury ──────────────────────────────────────────────────────
test("treasury records real usage, aggregates 30d stats, and rates health relatively", () => {
  const store = memStore();
  const day = 864e5, now = 50 * day;
  // 4 quiet prior days ~1200 tokens each
  for (let d = 4; d >= 1; d--) treasuryRecord(store, "u1", { mode: "quick", cache: "miss", pin: 720, pout: 480 }, now - d * day);
  treasuryRecord(store, "u1", { mode: "quick", cache: "hit" }, now);                       // cache hit = 0 tokens
  treasuryRecord(store, "u1", { mode: "full", cache: "miss", pin: 1280, pout: 1300 }, now);
  treasuryRecord(store, "u1", { mode: "ask", cache: "miss", pin: 900, pout: 120 }, now);
  const s = treasuryStats(store, "u1", now);
  assert.equal(s.quick, 5); assert.equal(s.full, 1); assert.equal(s.asks, 1);
  assert.equal(s.hits, 1); assert.equal(s.misses, 6);
  assert.equal(s.total, 4 * 1200 + 2580 + 1020);
  assert.equal(s.today, 2580 + 1020);
  const h = treasuryHealth(s);
  assert.equal(h.level, "yellow"); // today = 3× usual but ≤ 3 → moderate
  assert.ok(h.hitRate > 0 && h.hitRate < 1);
  // no history at all → green
  assert.equal(treasuryHealth(treasuryStats(memStore(), "u2", now)).level, "green");
  // a runaway day → red
  treasuryRecord(store, "u1", { mode: "full", cache: "miss", pin: 9000, pout: 9000 }, now);
  assert.equal(treasuryHealth(treasuryStats(store, "u1", now)).level, "red");
});

test("sessionBrief summarizes verdict and votes for follow-up questions", () => {
  const s = normalizeSession(goodSession);
  const brief = sessionBrief({ title: "NVDA debate" }, s);
  assert.ok(brief.includes("TOPIC: NVDA debate"));
  assert.ok(brief.includes("VERDICT: Buy (68%)"));
  assert.ok(brief.includes("bull: Strong Buy (100%)"));
  assert.equal(sessionBrief(null, null), "");
});
