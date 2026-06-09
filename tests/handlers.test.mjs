// End-to-end checks that the auth gate and rate-limit middleware are actually
// WIRED INTO the handlers (not just correct in isolation). Driven with mock
// req/res — no browser, no Supabase env, and no network for these paths:
//   • chat   → 401 when unauthenticated (verifyUser short-circuits with no env)
//   • search → 429 after the hourly cap (q<2 early-returns, so Yahoo isn't hit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import chat from '../api/chat.js';
import search from '../api/search.js';

function mockRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

test('chat handler rejects unauthenticated callers with 401', async () => {
  const res = mockRes();
  await chat({ method: 'POST', headers: {}, body: { messages: [], systemPrompt: 'x' } }, res);
  assert.equal(res.statusCode, 401);
});

test('chat handler rejects non-POST with 405', async () => {
  const res = mockRes();
  await chat({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('search handler returns 429 once the hourly cap is exceeded', async () => {
  const ip = '198.51.100.42'; // unique caller so this bucket is isolated
  const call = () => {
    const res = mockRes();
    return search({ method: 'GET', headers: { 'x-forwarded-for': ip }, query: { q: '' } }, res).then(() => res);
  };
  // 300 allowed (q<2 → early 200, but the limiter still counts each one)…
  for (let i = 1; i <= 300; i++) {
    const res = await call();
    assert.equal(res.statusCode, 200, `request ${i} should pass the limiter`);
  }
  // …the 301st trips search_hourly (300/hour).
  const blocked = await call();
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['Retry-After'], 'sets Retry-After header');
});
