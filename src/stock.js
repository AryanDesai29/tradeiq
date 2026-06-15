// ─── CANONICAL STOCK METADATA — the ONLY place currency logic lives ──────────
//
// A stock is { ticker, name, exchange, currency } where currency ∈ {INR, USD}.
// Currency is DATA: it is decided once at the data boundary (the API returns it;
// selecting a search result persists it) and read everywhere via symbolFor().
//
// Components must NEVER parse a ticker to decide currency. The only fallback —
// inferCurrency — exists solely to backfill legacy records that predate the
// currency column, and is applied at the data-loading boundary (withCurrency),
// never at display time.

export const SYM = { INR: "₹", USD: "$" };

// Display symbol for a record's stored currency. This is the single source for
// "₹" vs "$" in the whole UI.
export const symbolFor = (currency) => SYM[currency] || SYM.INR;

// Decimal places for a price in the given currency (centralised for future
// per-currency tuning; both are 2 today).
export const decimalsFor = (_currency) => 2;

// Strip the exchange suffix for a compact display label (e.g. RELIANCE.NS →
// RELIANCE). This is a LABEL helper only — it must never drive currency.
export const shortName = (ticker = "") => String(ticker).replace(/\.(NS|BO)$/i, "");

// CONTROLLED FALLBACK — used ONLY at the data-loading boundary for records with
// no persisted currency (created before the currency column existed). New rows
// always carry a currency from the selected search result, so this is legacy-only.
export const inferCurrency = (ticker = "") => (/\.(NS|BO)$/i.test(ticker) ? "INR" : "USD");

// Ensure a record has a currency, inferring from the ticker only if missing.
// Apply once when loading from storage — not in render code.
export const withCurrency = (rec) => ({ ...rec, currency: rec?.currency || inferCurrency(rec?.ticker) });
