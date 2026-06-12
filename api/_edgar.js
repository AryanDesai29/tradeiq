// Shared SEC EDGAR access — the ticker→CIK resolver and submissions/companyfacts
// fetchers used by api/filings.js (filings index), api/facts.js (XBRL facts) and
// api/ingest.js (filing text). SEC fair-access policy requires a declared
// User-Agent with a contact; the ticker map is ~1MB so it is cached per warm
// lambda (24h TTL) rather than refetched per request.

export const SEC_UA = { 'User-Agent': 'TradeIQ personal research app (aryan.desai.viral@gmail.com)' };

// ticker → { cik, name }, cached per warm instance.
let cikCache = { map: null, at: 0 };

export async function cikFor(ticker) {
  const now = Date.now();
  if (!cikCache.map || now - cikCache.at > 24 * 3600 * 1000) {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: SEC_UA });
    if (!r.ok) throw new Error(`SEC tickers status ${r.status}`);
    const d = await r.json();
    const map = new Map();
    for (const k of Object.keys(d)) map.set(String(d[k].ticker).toUpperCase(), { cik: d[k].cik_str, name: d[k].title });
    cikCache = { map, at: now };
  }
  return cikCache.map.get(ticker) || null;
}

// True for listings EDGAR does not cover (Indian NSE/BSE). Callers return the
// honest "files with NSE/BSE" note instead of a misleading empty result.
export const isNonUS = (ticker) => ticker.endsWith('.NS') || ticker.endsWith('.BO');

export const NON_US_NOTE = 'Indian listings file with NSE/BSE, not the SEC — check the exchange announcements page directly.';

// 10-digit zero-padded CIK, the form data.sec.gov path segments expect.
export const cik10 = (cik) => String(cik).padStart(10, '0');

// Recent filings index for a registrant (the submissions endpoint).
export async function fetchSubmissions(cik) {
  const r = await fetch(`https://data.sec.gov/submissions/CIK${cik10(cik)}.json`, { headers: SEC_UA });
  if (!r.ok) throw new Error(`SEC submissions status ${r.status}`);
  return r.json();
}

// Full XBRL companyfacts blob for a registrant (~3-4MB; never sent to client —
// api/facts.js reduces it to ~2KB before responding).
export async function fetchCompanyFacts(cik) {
  const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(cik)}.json`, { headers: SEC_UA });
  if (r.status === 404) return null; // registrant exists but files no XBRL (rare; ETFs, some foreign issuers)
  if (!r.ok) throw new Error(`SEC companyfacts status ${r.status}`);
  return r.json();
}
