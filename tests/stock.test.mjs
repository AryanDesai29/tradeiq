// Canonical stock-metadata tests (Phase 5) + a regression guard that fails if
// scattered currency/ticker-parsing logic ever creeps back into components.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symbolFor, decimalsFor, shortName, inferCurrency, withCurrency, SYM } from '../src/stock.js';

const US    = ['AAPL', 'NVDA', 'SPY'];
const INDIA = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS'];

test('symbolFor reads currency, not tickers', () => {
  assert.equal(symbolFor('USD'), '$');
  assert.equal(symbolFor('INR'), '₹');
  assert.equal(symbolFor(undefined), '₹'); // India-first default when currency is absent
});

test('inferCurrency (boundary fallback only) maps the required tickers', () => {
  for (const t of US)    assert.equal(inferCurrency(t), 'USD', `${t} → USD`);
  for (const t of INDIA) assert.equal(inferCurrency(t), 'INR', `${t} → INR`);
  assert.equal(inferCurrency('TCS.BO'), 'INR'); // BSE suffix too
});

test('full currency + symbol matrix for the spec tickers', () => {
  const expect = (ticker, code, sym) => {
    const rec = withCurrency({ ticker });           // as if loaded from storage w/o currency
    assert.equal(rec.currency, code, `${ticker} currency`);
    assert.equal(symbolFor(rec.currency), sym, `${ticker} symbol`);
  };
  US.forEach(t => expect(t, 'USD', '$'));
  INDIA.forEach(t => expect(t, 'INR', '₹'));
});

test('withCurrency never overrides a persisted currency', () => {
  // Persisted value wins even if it disagrees with the suffix (source of truth).
  assert.equal(withCurrency({ ticker: 'AAPL', currency: 'INR' }).currency, 'INR');
  assert.equal(withCurrency({ ticker: 'TCS.NS', currency: 'USD' }).currency, 'USD');
});

test('shortName strips only the exchange suffix', () => {
  assert.equal(shortName('RELIANCE.NS'), 'RELIANCE');
  assert.equal(shortName('TCS.BO'), 'TCS');
  assert.equal(shortName('AAPL'), 'AAPL');
});

test('decimalsFor and SYM are stable', () => {
  assert.equal(decimalsFor('INR'), 2);
  assert.equal(decimalsFor('USD'), 2);
  assert.deepEqual(SYM, { INR: '₹', USD: '$' });
});

// ── Regression guard: single source of truth must stay single ──────────────
test('no scattered currency/ticker-parsing helpers in components', () => {
  const FORBIDDEN = [
    /\bcurSym\s*\(/, /\bcurCode\s*\(/, /\bcurDp\s*\(/, /\bisINR\s*\(/, /\bsymOf\s*\(/,
    /\bformatPrice\s*\(/, /\.endsWith\(["']\.NS["']\)/, /\.replace\(["']\.NS["']/,
  ];
  const files = ['../src/App.jsx', '../src/ChartView.jsx', '../src/TickerSearch.jsx'];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const re of FORBIDDEN) {
      assert.equal(re.test(src), false, `${f} must not contain ${re}`);
    }
  }
});
