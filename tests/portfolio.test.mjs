import { test } from "node:test";
import assert from "node:assert/strict";
import { themeOf, sectorExposure, themeExposure, concentration, correlationClusters, portfolioRiskFlags } from "../src/portfolio.js";

// "Same AI bet four times" — the canonical case the engine must catch.
const aiBook = [
  { ticker: "NVDA", sector: "Tech", value: 30 },
  { ticker: "AMD",  sector: "Tech", value: 25 },
  { ticker: "TSM",  sector: "Tech", value: 20 },
  { ticker: "SMCI", sector: "Tech", value: 15 },
  { ticker: "HDFCBANK.NS", sector: "Finance", value: 10 },
];

test("themeOf maps known tickers, falls back to sector", () => {
  assert.equal(themeOf("NVDA", "Tech"), "AI & Semiconductors");
  assert.equal(themeOf("HDFCBANK.NS"), "Indian Banks");
  assert.equal(themeOf("XYZ", "Healthcare"), "Healthcare");
  assert.equal(themeOf("XYZ", ""), "Uncategorised");
});

test("themeExposure collapses the 4 AI names into one bet", () => {
  const te = themeExposure(aiBook);
  const ai = te.find((t) => t.key === "AI & Semiconductors");
  assert.equal(ai.count, 4);
  assert.equal(ai.value, 90);
  assert.ok(Math.abs(ai.pct - 0.9) < 1e-9);     // 90 / 100
  assert.equal(te[0].key, "AI & Semiconductors"); // largest first
});

test("sectorExposure sums by sector with correct %", () => {
  const se = sectorExposure(aiBook);
  assert.equal(se.find((s) => s.key === "Tech").pct, 0.9);
  assert.equal(se.find((s) => s.key === "Finance").pct, 0.1);
});

test("concentration: largest, top3, HHI, effective bets", () => {
  const c = concentration(aiBook);
  assert.equal(c.largest.ticker, "NVDA");
  assert.ok(Math.abs(c.top1Pct - 0.30) < 1e-9);
  assert.ok(Math.abs(c.top3Pct - 0.75) < 1e-9);  // 30+25+20
  // HHI = .3²+.25²+.2²+.15²+.1² = .09+.0625+.04+.0225+.01 = .225 → effN ≈ 4.44
  assert.ok(Math.abs(c.hhi - 0.225) < 1e-9);
  assert.ok(Math.abs(c.effectiveN - 1 / 0.225) < 1e-6);
  assert.deepEqual(concentration([]), { totalValue: 0, largest: null, top1Pct: 0, top3Pct: 0, hhi: 0, effectiveN: 0 });
});

test("correlationClusters returns multi-name themes only", () => {
  const cl = correlationClusters(aiBook);
  assert.equal(cl.length, 1);                    // only AI cluster has >1 name
  assert.equal(cl[0].theme, "AI & Semiconductors");
  assert.equal(cl[0].count, 4);
});

test("portfolioRiskFlags catches single-name + correlated-theme concentration", () => {
  const flags = portfolioRiskFlags(aiBook);
  const texts = flags.map((f) => f.text).join(" | ");
  assert.match(texts, /NVDA is 30% of the book/);
  assert.match(texts, /4 names in "AI & Semiconductors" = 90%/);
  assert.ok(flags.some((f) => f.level === "high"));
  assert.deepEqual(portfolioRiskFlags([]), []);  // empty-safe
});
