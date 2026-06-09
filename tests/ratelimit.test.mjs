// Unit tests for the per-user rate limiter (in-memory path — no Upstash env
// vars set during tests, so the fallback is exercised deterministically).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforce, callerKey } from '../api/_ratelimit.js';

test('enforce: allows up to the burst limit, then returns a 429-worthy block', async () => {
  const key = 'u:test-burst-' + process.pid;
  const rules = [['burst', 5, 60], ['hourly', 30, 3600]]; // mirrors /api/chat
  for (let i = 1; i <= 5; i++) {
    const r = await enforce(key, rules);
    assert.equal(r.ok, true, `call ${i} should be allowed`);
  }
  const sixth = await enforce(key, rules);
  assert.equal(sixth.ok, false, '6th call must be blocked');
  assert.equal(sixth.rule, 'burst');
  assert.equal(sixth.retryAfter, 60);
});

test('enforce: hourly cap blocks after N when the burst window is generous', async () => {
  const key = 'u:test-hourly-' + process.pid;
  const rules = [['burst', 1000, 60], ['hourly', 10, 3600]];
  for (let i = 1; i <= 10; i++) {
    assert.equal((await enforce(key, rules)).ok, true, `call ${i} allowed`);
  }
  const r = await enforce(key, rules);
  assert.equal(r.ok, false);
  assert.equal(r.rule, 'hourly');
});

test('enforce: separate caller keys are independent buckets', async () => {
  const rules = [['x', 1, 60]];
  assert.equal((await enforce('u:a-' + process.pid, rules)).ok, true);
  // Different key: still allowed even though key "a" just used its single slot.
  assert.equal((await enforce('u:b-' + process.pid, rules)).ok, true);
  // Same key "a" again: now blocked.
  assert.equal((await enforce('u:a-' + process.pid, rules)).ok, false);
});

test('callerKey: prefers user id, then X-Forwarded-For, then anon', () => {
  assert.equal(callerKey({ headers: {} }, 'user-123'), 'u:user-123');
  assert.equal(callerKey({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } }), 'ip:203.0.113.7');
  assert.equal(callerKey({ headers: {}, socket: {} }), 'ip:anon');
});
