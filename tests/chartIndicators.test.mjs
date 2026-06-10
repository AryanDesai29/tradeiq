import { test } from "node:test";
import assert from "node:assert/strict";
import { emaArr, vwapArr, fibLevels, FIB_LEVELS } from "../src/chartIndicators.js";

test("emaArr seeds at the period with an SMA, nulls before, tracks after", () => {
  const closes = [1, 2, 3, 4, 5, 6];
  const e = emaArr(closes, 3);
  assert.equal(e[0], null);
  assert.equal(e[1], null);
  assert.equal(e[2], 2);                       // SMA of [1,2,3]
  // k = 2/4 = 0.5 → e[3] = 4*0.5 + 2*0.5 = 3
  assert.equal(e[3], 3);
  assert.equal(e[4], 4);
  assert.equal(e[5], 5);
});

test("emaArr returns all-null when fewer closes than the period", () => {
  assert.deepEqual(emaArr([1, 2], 5), [null, null]);
  assert.deepEqual(emaArr([], 50), []);
});

test("vwapArr is cumulative typical×volume / volume, robust to zero volume", () => {
  const candles = [
    { h: 11, l: 9, c: 10, v: 100 },   // tp=10
    { h: 22, l: 18, c: 20, v: 100 },  // tp=20 → cum (10*100+20*100)/200 = 15
    { h: 30, l: 30, c: 30, v: 0 },    // zero vol → VWAP unchanged at 15
  ];
  const w = vwapArr(candles);
  assert.equal(w[0], 10);
  assert.equal(w[1], 15);
  assert.equal(w[2], 15);
  assert.equal(vwapArr([{ h: 5, l: 5, c: 5, v: 0 }])[0], null); // no volume at all → null
});

test("fibLevels are order-independent and span both swing prices", () => {
  const a = fibLevels(100, 200), b = fibLevels(200, 100);
  assert.deepEqual(a, b);                       // order doesn't matter
  assert.equal(a.length, FIB_LEVELS.length);
  assert.equal(a[0].price, 200);                // 0% = high
  assert.equal(a[a.length - 1].price, 100);     // 100% = low
  assert.equal(a.find((x) => x.level === 0.5).price, 150);
});
