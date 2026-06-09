// ─── CANONICAL MARKET METADATA (server) — single source for currency/exchange ─
//
// Every API that touches a symbol (search, prices, chart, validation) derives
// currency/exchange through these helpers so there is exactly one rule. The
// authoritative input is Yahoo's own currency/exchange; the suffix heuristic is
// only the fallback when Yahoo omits it.

export const isIndianListing = (symbol = '', exchange = '') =>
  /\.(NS|BO)$/i.test(symbol) || /^(NSI|BSE)$/i.test(exchange);

// Prefer Yahoo's reported currency; fall back to the listing heuristic.
export const currencyFor = (symbol, yahooCurrency, exchange) =>
  yahooCurrency || (isIndianListing(symbol, exchange) ? 'INR' : 'USD');

// Prefer Yahoo's display exchange; else derive a human label from the suffix.
export const exchangeFor = (symbol = '', exchDisp, exchange) =>
  exchDisp || (/\.NS$/i.test(symbol) ? 'NSE' : /\.BO$/i.test(symbol) ? 'BSE' : (exchange || ''));
