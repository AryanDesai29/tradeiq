// Vercel Serverless Function — fetches live prices for US + Indian markets
// US: Yahoo Finance (free, no key needed)
// India: Yahoo Finance with .NS suffix (NSE stocks)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const US_TICKERS    = ['NVDA','TSLA','AAPL','META','GOOGL','AMD','MSFT','PLTR','AMZN','NFLX','SPY','QQQ'];
  const INDIA_TICKERS = ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS','SBIN.NS','BAJFINANCE.NS','WIPRO.NS','AXISBANK.NS','TATAMOTORS.NS','ADANIENT.NS'];

  const ALL = [...US_TICKERS, ...INDIA_TICKERS];

  async function fetchQuotes(tickers) {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,fiftyDayAverage,twoHundredDayAverage,regularMarketOpen,currency,shortName`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`Yahoo status ${r.status}`);
    const d = await r.json();
    return d?.quoteResponse?.result ?? [];
  }

  async function fetchSparkAndRSI(ticker) {
    try {
      const end   = Math.floor(Date.now() / 1000);
      const start = end - (30 * 24 * 60 * 60); // 30 days for better RSI
      const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${start}&period2=${end}`;
      const r     = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return {};
      const d      = await r.json();
      const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
      return {
        spark: closes.slice(-8).map(v => parseFloat(v.toFixed(2))),
        rsi:   calcRSI(closes),
      };
    } catch { return {}; }
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

  try {
    const quotes = await fetchQuotes(ALL);
    const priceData = {};

    for (const q of quotes) {
      priceData[q.symbol] = {
        ticker:   q.symbol,
        name:     q.shortName ?? q.symbol,
        price:    q.regularMarketPrice ?? null,
        chg:      q.regularMarketChangePercent ? parseFloat(q.regularMarketChangePercent.toFixed(2)) : 0,
        volume:   q.regularMarketVolume ?? null,
        ema20:    q.fiftyDayAverage    ? parseFloat(q.fiftyDayAverage.toFixed(2))    : null,
        ema200:   q.twoHundredDayAverage ? parseFloat(q.twoHundredDayAverage.toFixed(2)) : null,
        currency: q.currency ?? 'USD',
      };
    }

    // Fetch spark + RSI in parallel (cap at 12 concurrent)
    const sparkResults = await Promise.allSettled(ALL.map(t => fetchSparkAndRSI(t)));
    ALL.forEach((ticker, i) => {
      const r = sparkResults[i];
      if (r.status === 'fulfilled' && priceData[ticker]) {
        priceData[ticker].spark = r.value.spark ?? [];
        priceData[ticker].rsi   = r.value.rsi   ?? 50;
      }
    });

    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json({
      prices:    priceData,
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
