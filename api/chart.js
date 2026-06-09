// Vercel Serverless Function — fetches OHLCV history for charting
// Returns 90 days of daily candles + calculated indicators

import { currencyFor } from './_market.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { ticker, period = '3mo', interval = '1d' } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const end   = Math.floor(Date.now() / 1000);
    const days  = period === '1mo' ? 35 : period === '6mo' ? 185 : period === '1y' ? 370 : 95;
    const start = end - days * 24 * 60 * 60;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${start}&period2=${end}`;
    const r   = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`Yahoo status ${r.status}`);

    const d      = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) throw new Error('No chart data');

    const timestamps = result.timestamp ?? [];
    const q          = result.indicators?.quote?.[0] ?? {};
    const opens      = q.open   ?? [];
    const highs      = q.high   ?? [];
    const lows       = q.low    ?? [];
    const closes     = q.close  ?? [];
    const volumes    = q.volume ?? [];
    const currency   = currencyFor(ticker, result.meta?.currency, result.meta?.exchangeName);

    // Build OHLCV array, filter nulls
    const candles = timestamps.map((t, i) => ({
      t: t * 1000,
      o: opens[i], h: highs[i], l: lows[i], c: closes[i], v: volumes[i],
    })).filter(c => c.o && c.h && c.l && c.c);

    const closesClean = candles.map(c => c.c);

    // ── Indicator calculations ───────────────────────────────────
    function calcEMA(data, period) {
      const k = 2 / (period + 1);
      const ema = new Array(data.length).fill(null);
      let seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      ema[period - 1] = seed;
      for (let i = period; i < data.length; i++) {
        ema[i] = data[i] * k + ema[i - 1] * (1 - k);
      }
      return ema.map(v => v ? parseFloat(v.toFixed(4)) : null);
    }

    function calcRSI(data, period = 14) {
      const rsi = new Array(data.length).fill(null);
      let avgGain = 0, avgLoss = 0;
      for (let i = 1; i <= period; i++) {
        const d = data[i] - data[i - 1];
        if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
      }
      avgGain /= period; avgLoss /= period;
      rsi[period] = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
      for (let i = period + 1; i < data.length; i++) {
        const d = data[i] - data[i - 1];
        avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
        rsi[i] = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
      }
      return rsi;
    }

    function calcMACD(data, fast = 12, slow = 26, signal = 9) {
      const emaFast   = calcEMA(data, fast);
      const emaSlow   = calcEMA(data, slow);
      const macdLine  = data.map((_, i) =>
        emaFast[i] != null && emaSlow[i] != null
          ? parseFloat((emaFast[i] - emaSlow[i]).toFixed(4)) : null);
      const signalLine = calcEMA(macdLine.filter(v => v != null), signal);
      // Align signal back
      const signalAligned = new Array(data.length).fill(null);
      let si = 0;
      for (let i = 0; i < data.length; i++) {
        if (macdLine[i] != null) { signalAligned[i] = signalLine[si] ?? null; si++; }
      }
      const histogram = data.map((_, i) =>
        macdLine[i] != null && signalAligned[i] != null
          ? parseFloat((macdLine[i] - signalAligned[i]).toFixed(4)) : null);
      return { macd: macdLine, signal: signalAligned, histogram };
    }

    // Volume moving average
    const vols       = candles.map(c => c.v ?? 0);
    const volAvg20   = vols.map((_, i) => {
      if (i < 19) return null;
      return Math.round(vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20);
    });

    const ema20  = calcEMA(closesClean, 20);
    const ema200 = calcEMA(closesClean, 200);
    const rsi    = calcRSI(closesClean, 14);
    const macdData = calcMACD(closesClean);

    // ── Pattern / signal detection ────────────────────────────────
    const signals = [];
    for (let i = 2; i < candles.length; i++) {
      const prev = candles[i - 1], curr = candles[i];
      const rsiVal = rsi[i];
      const e20 = ema20[i], e200 = ema200[i];

      // Golden cross
      if (ema20[i - 1] && ema200[i - 1] &&
          ema20[i - 1] < ema200[i - 1] && e20 > e200) {
        signals.push({ t: curr.t, type: 'golden_cross', label: 'Golden Cross', bull: true });
      }
      // Death cross
      if (ema20[i - 1] && ema200[i - 1] &&
          ema20[i - 1] > ema200[i - 1] && e20 < e200) {
        signals.push({ t: curr.t, type: 'death_cross', label: 'Death Cross', bull: false });
      }
      // RSI oversold bounce
      if (rsi[i - 1] < 32 && rsiVal > 35 && curr.c > curr.o) {
        signals.push({ t: curr.t, type: 'rsi_bounce', label: 'RSI Bounce ↑', bull: true });
      }
      // RSI overbought drop
      if (rsi[i - 1] > 70 && rsiVal < 68 && curr.c < curr.o) {
        signals.push({ t: curr.t, type: 'rsi_drop', label: 'RSI Drop ↓', bull: false });
      }
      // Bullish engulfing
      if (prev.c < prev.o && curr.c > curr.o &&
          curr.c > prev.o && curr.o < prev.c) {
        signals.push({ t: curr.t, type: 'bull_engulf', label: '🕯 Bull Engulf', bull: true });
      }
      // Bearish engulfing
      if (prev.c > prev.o && curr.c < curr.o &&
          curr.c < prev.o && curr.o > prev.c) {
        signals.push({ t: curr.t, type: 'bear_engulf', label: '🕯 Bear Engulf', bull: false });
      }
      // MACD bullish cross
      if (macdData.macd[i - 1] != null && macdData.signal[i - 1] != null &&
          macdData.macd[i - 1] < macdData.signal[i - 1] &&
          macdData.macd[i] > macdData.signal[i]) {
        signals.push({ t: curr.t, type: 'macd_bull', label: 'MACD ↑', bull: true });
      }
      // MACD bearish cross
      if (macdData.macd[i - 1] != null && macdData.signal[i - 1] != null &&
          macdData.macd[i - 1] > macdData.signal[i - 1] &&
          macdData.macd[i] < macdData.signal[i]) {
        signals.push({ t: curr.t, type: 'macd_bear', label: 'MACD ↓', bull: false });
      }
    }

    // Overall trend assessment
    const last = candles[candles.length - 1];
    const lastE20 = ema20[ema20.length - 1];
    const lastE200 = ema200.filter(Boolean).pop();
    const lastRSI = rsi.filter(Boolean).pop();
    const recentCandles = candles.slice(-5);
    const recentGreen = recentCandles.filter(c => c.c > c.o).length;

    let trend = 'NEUTRAL';
    let trendScore = 0;
    if (last.c > lastE20) trendScore++; else trendScore--;
    if (last.c > lastE200) trendScore += 2; else trendScore -= 2;
    if (lastRSI > 55) trendScore++; else if (lastRSI < 45) trendScore--;
    if (recentGreen >= 3) trendScore++; else if (recentGreen <= 1) trendScore--;
    if (trendScore >= 3) trend = 'STRONG BULLISH';
    else if (trendScore >= 1) trend = 'BULLISH';
    else if (trendScore <= -3) trend = 'STRONG BEARISH';
    else if (trendScore <= -1) trend = 'BEARISH';

    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json({
      ticker, currency, candles,
      indicators: {
        ema20: ema20.map(v => v ? parseFloat(v.toFixed(4)) : null),
        ema200: ema200.map(v => v ? parseFloat(v.toFixed(4)) : null),
        rsi,
        macd: macdData,
        volAvg20,
      },
      signals,
      trend,
      trendScore,
      meta: {
        lastClose: last.c,
        lastRSI,
        lastEMA20: lastE20,
        lastEMA200: lastE200,
        currency,
      }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
