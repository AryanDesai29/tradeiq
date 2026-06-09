// Lightweight per-user rate limiting for a private 1–2 user app.
//
// Storage: Upstash Redis (REST) when configured, else an in-memory fallback.
// Upstash is OPTIONAL — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// on Vercel to make limits durable across cold starts and multiple instances.
// Without them it still works (per-instance memory), which is enough to stop
// infinite loops and accidental bill spikes for a 1–2 user app.
//
// No npm dependency: Upstash is called over its REST API with plain fetch.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis    = !!(REDIS_URL && REDIS_TOKEN);

// key -> array of hit timestamps (ms). Per-instance, resets on cold start.
const mem = new Map();

async function redisCmd(...parts) {
  const r = await fetch(`${REDIS_URL}/${parts.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  return (await r.json()).result;
}

// One fixed-window check: at most `limit` events per `windowSec` for `key`.
async function check(key, limit, windowSec) {
  const now = Date.now();
  if (useRedis) {
    try {
      const bucket = `rl:${key}:${Math.floor(now / 1000 / windowSec)}`;
      const count = await redisCmd('INCR', bucket);
      if (count === 1) await redisCmd('EXPIRE', bucket, String(windowSec));
      return count <= limit;
    } catch {
      // Upstash hiccup → fall through to in-memory so we never hard-fail open-loop.
    }
  }
  const arr = (mem.get(key) || []).filter(t => now - t < windowSec * 1000);
  arr.push(now);
  mem.set(key, arr);
  // Opportunistic cleanup so the Map can't grow unbounded on a long-lived instance.
  if (mem.size > 5000) for (const [k, v] of mem) if (!v.some(t => now - t < 3600_000)) mem.delete(k);
  return arr.length <= limit;
}

// Enforce a set of rules; the FIRST exceeded rule wins.
// rules: array of [name, limit, windowSec]. Returns { ok, rule, retryAfter }.
export async function enforce(key, rules) {
  for (const [name, limit, windowSec] of rules) {
    const ok = await check(`${key}:${name}`, limit, windowSec);
    if (!ok) return { ok: false, rule: name, retryAfter: windowSec };
  }
  return { ok: true };
}

// Build a stable per-caller key: the authenticated user id if we have one,
// otherwise the best-effort client IP (so anonymous callers are still bounded).
export function callerKey(req, userId) {
  if (userId) return `u:${userId}`;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress || 'anon';
  return `ip:${ip}`;
}

// Standard 429 helper.
export function tooMany(res, retryAfter) {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ error: 'Rate limit reached — please slow down and try again shortly.' });
}
