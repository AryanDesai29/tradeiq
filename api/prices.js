// Vercel Serverless Function — fetches live stock prices + indicators
// Called by TradeIQ frontend on load and every 5 minutes
// Uses Yahoo Finance (free, no API key needed)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const TICKERS = ['NVDA','TSLA','AAPL','META','GOOGL','AMD','MSFT','PLTR'];

  // Yahoo Finance quote endpoint — free, no auth needed
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${TICKERS.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,fiftyDayAverage,twoHundredDayAverage,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    });

    if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);

    const data = await response.json();
    const results = data?.quoteResponse?.result;
    if (!results) throw new Error('No data returned from Yahoo Finance');

    // Also fetch 1-month daily history for sparklines + RSI calculation
    const priceData = {};

    for (const q of results) {
      priceData[q.symbol] = {
        ticker: q.symbol,
        price: q.regularMarketPrice ?? null,
        chg: q.regularMarketChangePercent ? parseFloat(q.regularMarketChangePercent.toFixed(2)) : 0,
        volume: q.regularMarketVolume ?? null,
        ema20: q.fiftyDayAverage ?? null,   // 50d as proxy for 20d EMA
        ema200: q.twoHundredDayAverage ?? null,
        open: q.regularMarketOpen ?? null,
        high: q.regularMarketDayHigh ?? null,
        low: q.regularMarketDayLow ?? null,
      };
    }

    // Fetch sparkline data (7-day) for each ticker
    const sparkPromises = TICKERS.map(async (ticker) => {
      try {
        const end = Math.floor(Date.now() / 1000);
        const start = end - (8 * 24 * 60 * 60); // 8 days ago
        const sparkUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${start}&period2=${end}`;
        const r = await fetch(sparkUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!r.ok) return;
        const d = await r.json();
        const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (closes && priceData[ticker]) {
          priceData[ticker].spark = closes.filter(Boolean).map(v => parseFloat(v.toFixed(2)));
          // Calculate simple RSI(14) from closes
          priceData[ticker].rsi = calcRSI(closes.filter(Boolean));
        }
      } catch(e) { /* skip spark on error */ }
    });

    await Promise.allSettled(sparkPromises);

    res.setHeader('Cache-Control', 's-maxage=300'); // cache 5 mins on Vercel edge
    return res.status(200).json({
      prices: priceData,
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// RSI calculation from array of closing prices
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}
