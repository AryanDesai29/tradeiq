// Server-side ticker validation. The frontend only lets users pick from search
// results, but we never trust the client alone — every custom ticker that
// reaches the price API is confirmed to be a real, tradable symbol on Yahoo
// before we act on it.

const isIndia = (sym = '', exch = '') => /\.(NS|BO)$/i.test(sym) || /^(NSI|BSE)$/i.test(exch);

// Returns canonical metadata for an EXACT symbol match, or null if it doesn't
// resolve to a real equity/ETF. Cheap: one Yahoo search call.
export async function resolveTicker(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(sym)) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=10&newsCount=0`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const d = await r.json();
    const hit = (d.quotes || []).find(
      x => (x.symbol || '').toUpperCase() === sym && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF')
    );
    if (!hit) return null;
    return {
      symbol:   hit.symbol,
      name:     hit.shortname || hit.longname || hit.symbol,
      exchange: hit.exchDisp || hit.exchange || '',
      currency: isIndia(hit.symbol, hit.exchange) ? 'INR' : 'USD',
    };
  } catch {
    return null;
  }
}
