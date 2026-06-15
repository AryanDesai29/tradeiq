import { test } from "node:test";
import assert from "node:assert/strict";
import { FX_INR, fxRate, toINR, positionValue, portfolioValue, weightOf, capitalIn } from "../src/valuation.js";

test("FX is a single INR-based source of truth", () => {
  assert.equal(FX_INR.INR, 1);
  assert.equal(FX_INR.USD, 84);
  assert.equal(fxRate("INR"), 1);
  assert.equal(fxRate("USD"), 84);
  assert.equal(fxRate("???"), 1); // unknown → treated as base, never NaN
});

test("toINR converts and exposes nothing fabricated", () => {
  assert.equal(toINR(100, "USD"), 8400);
  assert.equal(toINR(100, "INR"), 100);
});

test("positionValue returns the basis (local, currency, fxRate, inr)", () => {
  const p = positionValue({ ticker: "AAPL", shares: 10, price: 200, currency: "USD" });
  assert.equal(p.local, 2000);
  assert.equal(p.fxRate, 84);
  assert.equal(p.inr, 168000);
  assert.equal(p.currency, "USD");
});

test("portfolioValue normalizes a MIXED ₹+$ book to one honest INR total", () => {
  const holdings = [
    { ticker: "RELIANCE.NS", shares: 100, price: 1400, avgCost: 1200, currency: "INR" }, // ₹1,40,000
    { ticker: "AAPL", shares: 10, price: 200, avgCost: 150, currency: "USD" },            // $2,000 = ₹1,68,000
  ];
  const pf = portfolioValue(holdings);
  assert.equal(pf.totalINR, 140000 + 168000);          // 3,08,000 — NOT 1,40,000+2,000 mixed
  assert.equal(pf.costINR, 120000 + 150 * 10 * 84);     // ₹1,20,000 + ₹1,26,000
  assert.equal(pf.mixed, true);
  assert.deepEqual(pf.byCurrency, { INR: 140000, USD: 2000 }); // per-currency LOCAL, never summed
});

test("weightOf is geography-neutral (normalized)", () => {
  const holdings = [
    { ticker: "A", shares: 1, price: 100, currency: "INR" },  // ₹100
    { ticker: "B", shares: 1, price: 100, currency: "USD" },  // ₹8,400
  ];
  const wB = weightOf(holdings[1], holdings);
  assert.ok(wB > 0.98); // the $ position dominates once normalized — not 50/50
});

test("capitalIn sizes in the trade's currency from the normalized total", () => {
  const holdings = [{ ticker: "A", shares: 1, price: 8400, currency: "INR" }]; // ₹8,400 total
  assert.equal(capitalIn("INR", holdings), 8400);
  assert.equal(capitalIn("USD", holdings), 100); // ₹8,400 → $100, not ₹8,400 treated as dollars
});

test("empty portfolio is zero, never NaN", () => {
  const pf = portfolioValue([]);
  assert.equal(pf.totalINR, 0);
  assert.equal(pf.pnlPct, 0);
  assert.equal(capitalIn("USD", []), 0);
});
