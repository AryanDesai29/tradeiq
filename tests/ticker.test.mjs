// Tests for server-side ticker validation. Malformed-input checks are pure
// (no network); the "real symbol" checks hit Yahoo and self-skip when offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTicker } from '../api/_ticker.js';

async function yahooReachable() {
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v1/finance/search?q=AAPL&quotesCount=1&newsCount=0',
      { headers: { 'User-Agent': 'Mozilla/5.0' } });
    return r.ok;
  } catch { return false; }
}

test('resolveTicker: rejects malformed symbols with no network call', async () => {
  assert.equal(await resolveTicker(''), null);
  assert.equal(await resolveTicker('bad ticker!!'), null);   // space + punctuation
  assert.equal(await resolveTicker('A'.repeat(25)), null);   // too long
  assert.equal(await resolveTicker(null), null);
});

test('resolveTicker: real symbols resolve with correct currency [live]', async (t) => {
  if (!(await yahooReachable())) { t.skip('Yahoo not reachable from this environment'); return; }

  const aapl = await resolveTicker('AAPL');
  assert.ok(aapl, 'AAPL should resolve');
  assert.equal(aapl.symbol, 'AAPL');
  assert.equal(aapl.currency, 'USD');

  const rel = await resolveTicker('RELIANCE.NS');
  assert.ok(rel, 'RELIANCE.NS should resolve');
  assert.equal(rel.currency, 'INR');
  assert.match(rel.name, /Reliance/i);

  assert.equal(await resolveTicker('NOTAREAL999X'), null, 'junk symbol must not resolve');
});
