// Shared Supabase JWT verification for the serverless API.
//
// verifyUser(req) returns the authenticated user ({ id, email, ... }) or null.
// Endpoints decide whether null is fatal: /api/chat requires a user (it spends
// Groq credits); /api/prices and /api/search accept null and fall back to an
// IP-based rate-limit key so the app still works without a configured session.

const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export async function verifyUser(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export const AUTH_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON);
