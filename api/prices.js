// Vercel Serverless Function — fetches live prices for US + Indian markets
// Uses Yahoo's v8 chart endpoint (no auth required). The old v7 quote
// endpoint now returns 401 Unauthorized, so we derive price, % change,
// EMA20/EMA200, RSI and the sparkline from one year of daily candles.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const US_TICKERS    = ['NVDA','TSLA','AAPL','META','GOOGL','AMD','MSFT','PLTR','AMZN','NFLX','SPY','QQQ'];
  const INDIA_TICKERS = ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS','SBIN.NS','BAJFINANCE.NS','WIPRO.NS','AXISBANK.NS','TATAMOTORS.NS','ADANIENT.NS'];

  const ALL = [...US_TICKERS, ...INDIA_TICKERS];

  // ── Indicator helpers ───────────────────────────────────────────
  function ema(values, period) {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
    return parseFloat(e.toFixed(2));
  }

  function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff; else losses += Math.abs(diff);
    }
    const rs = (gains / period) / ((losses / period) || 0.0001);
    return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
  }

  // ── Fetch one ticker's daily candles + derive everything ─────────
  async function fetchTicker(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`Yahoo status ${r.status}`);
    const d = await r.json();

    const result = d?.chart?.result?.[0];
    if (!result) throw new Error('No chart data');

    const meta   = result.meta ?? {};
    const quote  = result.indicators?.quote?.[0] ?? {};
    const closes = (quote.close ?? []).filter(v => v != null);
    const vols   = (quote.volume ?? []).filter(v => v != null);
    if (closes.length === 0) throw new Error('No closes');

    // Daily % change = last candle vs the prior day's close. meta.chartPreviousClose
    // is the close from the START of the 1y range, so it must NOT be used here.
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2] ?? lastClose;
    const price     = meta.regularMarketPrice ?? lastClose;
    const chg       = prevClose ? parseFloat((((price - prevClose) / prevClose) * 100).toFixed(2)) : 0;

    return {
      ticker,
      name:     meta.symbol ?? ticker,
      price:    parseFloat(Number(price).toFixed(2)),
      chg,
      volume:   vols[vols.length - 1] ?? null,
      ema20:    ema(closes, 20),
      ema200:   ema(closes, 200),
      rsi:      calcRSI(closes),
      spark:    closes.slice(-8).map(v => parseFloat(v.toFixed(2))),
      currency: meta.currency ?? (ticker.endsWith('.NS') ? 'INR' : 'USD'),
    };
  }

  try {
    const settled = await Promise.allSettled(ALL.map(t => fetchTicker(t)));
    const priceData = {};
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) priceData[s.value.ticker] = s.value;
    }

    if (Object.keys(priceData).length === 0) {
      return res.status(502).json({ error: 'All upstream price requests failed' });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      prices:    priceData,
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
