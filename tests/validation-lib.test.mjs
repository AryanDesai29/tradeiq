import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  sliceAsOf, idxAsOf, snapshotAt, forwardReturn, median, excessOf,
  calibration, verdictDiscrimination, memberPredictiveness, powerAnalysis,
  signalAnalysis, classifyMiss, spearman, ema, calcRSI,
} from "../scripts/validation-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const candles = (n, start = 100, step = 1) =>
  Array.from({ length: n }, (_, i) => ({ t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), c: start + i * step }));

// ── THE LEAK GUARD — the lab's core safety property ──────────────────────────
test("sliceAsOf never returns a candle after the freeze date", () => {
  const cs = candles(30);
  const cut = sliceAsOf(cs, "2026-01-10");
  assert.equal(cut.length, 10);
  assert.ok(cut.every((c) => c.t <= "2026-01-10"));
  assert.equal(sliceAsOf(cs, "2025-12-31").length, 0); // before all data → nothing
  assert.equal(idxAsOf(cs, "2026-01-05"), 4);
});

test("snapshotAt computes from past-only data; null when insufficient", () => {
  const cs = candles(250);
  const s = snapshotAt(cs, "2026-08-01"); // 213 candles ≤ as-of → EMA200 computable
  assert.ok(s.price > 0 && s.ema20 != null && s.ema200 != null);
  assert.ok(s.date <= "2026-08-01");
  assert.equal(snapshotAt(cs, "2025-01-01"), null);
  // EMA200 honestly null when history is short (matches api/prices.js).
  assert.equal(snapshotAt(candles(50), "2026-12-31").ema200, null);
});

test("forwardReturn measures strictly AFTER the as-of close", () => {
  const cs = candles(100, 100, 1); // +1/day from 100
  const f = forwardReturn(cs, "2026-01-10", 10);
  assert.ok(f.from === "2026-01-10" && f.to === "2026-01-20");
  assert.equal(f.pct, +(((119 - 109) / 109) * 100).toFixed(2));
  // Horizon truncates at available data; with NO future candle at all → null.
  assert.equal(forwardReturn(cs, "2026-04-10", 30), null);
  assert.equal(forwardReturn(cs, "2026-04-09", 30).to, "2026-04-10"); // truncated, never extrapolated
});

test("median / excessOf basics", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(excessOf(10, 4), 6);
  assert.equal(excessOf(null, 4), null);
});

// ── Grading math ──────────────────────────────────────────────────────────────
test("calibration buckets by stated confidence", () => {
  const cal = calibration([
    { confidence: 80, excess: 5 }, { confidence: 75, excess: -2 },
    { confidence: 55, excess: 1 }, { confidence: 30, excess: -8 },
  ]);
  const hi = cal.find((b) => b.bucket === "70+");
  assert.equal(hi.n, 2);
  assert.equal(hi.hitRate, 0.5);
});

test("verdictDiscrimination: spread > 0 means the council separates", () => {
  const d = verdictDiscrimination([
    { verdict: "Strong Buy", excess: 6 }, { verdict: "Buy", excess: 2 },
    { verdict: "Avoid", excess: -4 }, { verdict: "Neutral", excess: 0.5 },
  ]);
  assert.equal(d.buy.n, 2);
  assert.equal(d.spread, 4 - -4);
});

test("memberPredictiveness rewards conviction in the right direction", () => {
  const m = memberPredictiveness([
    { member: "quant", voteScore: 2, excess: 5 },   // strongly right → +1
    { member: "quant", voteScore: -2, excess: -5 }, // strongly right → +1
    { member: "bull", voteScore: 2, excess: -5 },   // strongly wrong → −1
    { member: "bull", voteScore: 2, excess: 5 },
  ]);
  assert.equal(m[0].member, "quant");
  assert.equal(m[0].score, 1);
  assert.equal(m.find((x) => x.member === "bull").score, 0);
});

test("powerAnalysis: saved vs cost vs quiet-on-big-miss", () => {
  const p = powerAnalysis([
    { raised: true, excess: -8 },   // saved
    { raised: true, excess: 6 },    // cost
    { raised: false, excess: -15 }, // quiet miss
    { raised: false, excess: 2 },
  ]);
  assert.deepEqual(p, { raisedN: 2, savedN: 1, costN: 1, quietMissN: 1, n: 4 });
});

test("signalAnalysis groups excess by thesis type / RSI zone / trend", () => {
  const s = signalAnalysis([
    { thesis_type: "Technical Momentum", rsi: 70, aboveEma200: true, excess: -5 },
    { thesis_type: "Mean Reversion", rsi: 32, aboveEma200: false, excess: 4 },
  ]);
  assert.equal(s.byThesisType[0].key, "Mean Reversion");
  assert.equal(s.byRsi.find((x) => x.key === "RSI>60").avgExcess, -5);
  assert.equal(s.byTrend.find((x) => x.key === "below EMA200").avgExcess, 4);
});

test("classifyMiss taxonomy", () => {
  assert.equal(classifyMiss({ excess: -10, verdict: "Buy", confidence: 60 }), "council_endorsed_miss");
  assert.equal(classifyMiss({ excess: -10, verdict: null, confidence: 80 }), "overconfident_selection");
  assert.equal(classifyMiss({ excess: -10, verdict: null, confidence: 50 }), "weak_selection");
  assert.equal(classifyMiss({ excess: 10, verdict: "Strong Avoid", confidence: 60 }), "council_blocked_winner");
  assert.equal(classifyMiss({ excess: 10, verdict: null, confidence: 40 }), "underconfident_winner");
  assert.equal(classifyMiss({ excess: 1, verdict: "Buy", confidence: 90 }), null); // in line
  assert.equal(classifyMiss({ excess: null }), null);
});

test("spearman rank correlation", () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.equal(spearman([1, 2], [2, 1]), null); // too small
});

// ── DRIFT GUARDS — the lab's copies must stay in sync with production ────────
test("indicator math matches api/prices.js verbatim", () => {
  const src = readFileSync(join(HERE, "..", "api", "prices.js"), "utf8");
  assert.ok(src.includes("const k = 2 / (period + 1);"), "ema drifted");
  assert.ok(src.includes("const rs = (gains / period) / ((losses / period) || 0.0001);"), "rsi drifted");
  // and behaves identically on a known series
  assert.equal(ema([1, 2, 3, 4, 5], 10), null);
  assert.equal(calcRSI([1, 2], 14), 50);
});

test("copied prompts still match production (discovery + research)", () => {
  const lab = readFileSync(join(HERE, "..", "scripts", "validation-lab.mjs"), "utf8");
  const oppSrc = readFileSync(join(HERE, "..", "api", "opportunities.js"), "utf8");
  const resSrc = readFileSync(join(HERE, "..", "api", "research.js"), "utf8");
  // Distinctive production sentences must appear in BOTH files; if production
  // edits its prompt, this fails and the lab copy must be re-synced.
  for (const line of [
    "proactively propose the most interesting investable IDEAS, Litman-style",
    "A flat, uninteresting stock should be skipped, not forced into an idea",
  ]) { assert.ok(oppSrc.includes(line), `prod lost: ${line}`); assert.ok(lab.includes(line), `lab lost: ${line}`); }
  for (const line of [
    "a junior analyst who researches an investment thesis so the user only has to decide",
    '"This is unknowable from here" is a CORRECT answer, never a failure',
  ]) { assert.ok(resSrc.includes(line), `prod lost: ${line}`); assert.ok(lab.includes(line), `lab lost: ${line}`); }
});
