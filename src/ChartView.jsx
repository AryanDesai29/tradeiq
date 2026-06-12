import { useState, useEffect, useRef, useCallback } from "react";
import TickerSearch from "./TickerSearch.jsx";
import { symbolFor, decimalsFor, shortName } from "./stock.js";

const C = {
  bg:"#0a101e",s1:"#0e1628",s2:"#131d33",s3:"#1a2742",
  border:"#26354f",accent:"#f0b441",blue:"#5b9bff",
  gold:"#fb923c",green:"#3fe0a0",red:"#ff6b61",purple:"#c4a5f5",
  text:"#e9f0fc",muted:"#8298b8",dim:"#455a7d",
  mono:"'JetBrains Mono','Courier New',monospace",
  display:"'Syne',sans-serif",
};

const PERIODS = ["1mo","3mo","6mo","1y"];
const PERIOD_LABELS = {"1mo":"1M","3mo":"3M","6mo":"6M","1y":"1Y"};

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric"});
}
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Chart drawing functions ─────────────────────────────────────
function useChart(canvasRef, data, chartType, showIndicators, hoveredIdx) {
  const dims = useRef({ W:0, H:0, chartH:0, rsiH:0, macdH:0, volH:0, padL:68, padR:16, padT:16, padB:28 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.candles?.length) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const { padL, padR, padT, padB } = dims.current;

    // Panel heights
    const bottomPanelH = 70;
    const numBottomPanels = (showIndicators.rsi ? 1 : 0) + (showIndicators.macd ? 1 : 0);
    const volH = showIndicators.volume ? 45 : 0;
    const chartH = H - padT - padB - numBottomPanels * (bottomPanelH + 8) - volH;
    dims.current = { ...dims.current, W, H, chartH, rsiH: bottomPanelH, macdH: bottomPanelH, volH };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const candles = data.candles;
    const inds = data.indicators;
    const n = candles.length;
    const drawW = W - padL - padR;
    const candleW = Math.max(2, Math.floor(drawW / n) - 1);
    const spacing = drawW / n;

    // Price range
    const priceMax = Math.max(...candles.map(c => c.h));
    const priceMin = Math.min(...candles.map(c => c.l));
    const pricePad = (priceMax - priceMin) * 0.05;
    const pHi = priceMax + pricePad, pLo = priceMin - pricePad;

    function xOf(i) { return padL + i * spacing + spacing / 2; }
    function yOf(v, hi, lo, top, height) {
      return top + height - ((v - lo) / (hi - lo)) * height;
    }
    function yPrice(v) { return yOf(v, pHi, pLo, padT, chartH); }

    // Grid lines
    ctx.strokeStyle = C.border + "cc";
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (chartH / gridLines) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      const price = lerp(pHi, pLo, i / gridLines);
      ctx.fillStyle = C.muted;
      ctx.font = `11px ${C.mono}`;
      ctx.textAlign = "right";
      ctx.fillText(price.toFixed(decimalsFor(data.meta?.currency)), padL - 4, y + 3);
    }

    // EMA200 line
    if (showIndicators.ema && inds.ema200) {
      ctx.strokeStyle = C.gold + "90";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      let started = false;
      inds.ema200.forEach((v, i) => {
        if (!v) return;
        const x = xOf(i), y = yPrice(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // EMA20 line
    if (showIndicators.ema && inds.ema20) {
      ctx.strokeStyle = C.accent + "90";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      inds.ema20.forEach((v, i) => {
        if (!v) return;
        const x = xOf(i), y = yPrice(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Candles or line
    if (chartType === "candle") {
      candles.forEach((c, i) => {
        const x = xOf(i);
        const bull = c.c >= c.o;
        const color = bull ? C.green : C.red;
        ctx.strokeStyle = color;
        ctx.fillStyle = bull ? color + "cc" : color + "cc";
        ctx.lineWidth = 1;
        // Wick
        ctx.beginPath();
        ctx.moveTo(x, yPrice(c.h));
        ctx.lineTo(x, yPrice(c.l));
        ctx.stroke();
        // Body
        const yO = yPrice(c.o), yC = yPrice(c.c);
        const bodyY = Math.min(yO, yC);
        const bodyH = Math.max(1, Math.abs(yO - yC));
        ctx.fillRect(x - candleW / 2, bodyY, candleW, bodyH);
      });
    } else {
      // Line chart
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      candles.forEach((c, i) => {
        const x = xOf(i), y = yPrice(c.c);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Area fill
      const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
      grad.addColorStop(0, C.accent + "30");
      grad.addColorStop(1, C.accent + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      candles.forEach((c, i) => {
        const x = xOf(i), y = yPrice(c.c);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.lineTo(xOf(n - 1), padT + chartH);
      ctx.lineTo(xOf(0), padT + chartH);
      ctx.fill();
    }

    // Signals
    if (data.signals) {
      data.signals.forEach(sig => {
        const idx = candles.findIndex(c => c.t === sig.t);
        if (idx < 0) return;
        const x = xOf(idx);
        const candle = candles[idx];
        const y = sig.bull ? yPrice(candle.l) + 14 : yPrice(candle.h) - 14;
        ctx.fillStyle = sig.bull ? C.green : C.red;
        ctx.font = `bold 11px ${C.mono}`;
        ctx.textAlign = "center";
        // Arrow
        ctx.beginPath();
        if (sig.bull) {
          ctx.moveTo(x, y - 6); ctx.lineTo(x - 4, y); ctx.lineTo(x + 4, y);
        } else {
          ctx.moveTo(x, y + 6); ctx.lineTo(x - 4, y); ctx.lineTo(x + 4, y);
        }
        ctx.fill();
      });
    }

    // Hovered candle highlight
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
      const x = xOf(hoveredIdx);
      ctx.strokeStyle = C.accent + "40";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X axis dates — width-aware count so 11px labels never collide
    ctx.fillStyle = C.muted;
    ctx.font = `11px ${C.mono}`;
    ctx.textAlign = "center";
    const dateLabelCount = Math.max(2, Math.min(6, Math.floor(drawW / 90)));
    const dateStep = Math.max(1, Math.ceil(n / dateLabelCount));
    for (let i = 0; i < n; i += dateStep) {
      ctx.fillText(formatDate(candles[i].t), xOf(i), padT + chartH + padB - 4);
    }

    // ── Volume panel ────────────────────────────────────────────
    let panelTop = padT + chartH + 8;
    if (showIndicators.volume) {
      const volTop = panelTop;
      const volMax = Math.max(...candles.map(c => c.v ?? 0));
      ctx.fillStyle = C.muted + "30";
      ctx.fillRect(padL, volTop, drawW, volH - 4);
      candles.forEach((c, i) => {
        const v = c.v ?? 0;
        const h = ((v / volMax) * (volH - 8));
        const bull = c.c >= c.o;
        ctx.fillStyle = (bull ? C.green : C.red) + "80";
        ctx.fillRect(xOf(i) - candleW / 2, volTop + volH - 4 - h, candleW, h);
      });
      // Avg volume line
      if (inds.volAvg20) {
        ctx.strokeStyle = C.gold + "80";
        ctx.lineWidth = 1;
        ctx.beginPath();
        let s = false;
        inds.volAvg20.forEach((v, i) => {
          if (!v) return;
          const y = volTop + volH - 4 - ((v / volMax) * (volH - 8));
          s ? ctx.lineTo(xOf(i), y) : (ctx.moveTo(xOf(i), y), s = true);
        });
        ctx.stroke();
      }
      ctx.fillStyle = C.muted;
      ctx.font = `10px ${C.mono}`;
      ctx.textAlign = "right";
      ctx.fillText("VOL", padL - 4, volTop + 10);
      panelTop += volH + 8;
    }

    // ── RSI panel ────────────────────────────────────────────────
    if (showIndicators.rsi && inds.rsi) {
      const rsiTop = panelTop;
      ctx.fillStyle = C.s2;
      ctx.fillRect(padL, rsiTop, drawW, bottomPanelH);
      // OB/OS zones
      ctx.fillStyle = C.red + "15";
      ctx.fillRect(padL, rsiTop + (1 - 70 / 100) * bottomPanelH, drawW, (70 - 30) / 100 * 0);
      const y70 = rsiTop + (1 - 70 / 100) * bottomPanelH;
      const y30 = rsiTop + (1 - 30 / 100) * bottomPanelH;
      ctx.strokeStyle = C.red + "40";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(padL, y70); ctx.lineTo(W - padR, y70); ctx.stroke();
      ctx.strokeStyle = C.green + "40";
      ctx.beginPath(); ctx.moveTo(padL, y30); ctx.lineTo(W - padR, y30); ctx.stroke();
      ctx.setLineDash([]);
      // RSI line
      ctx.strokeStyle = C.purple;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let rsiStarted = false;
      inds.rsi.forEach((v, i) => {
        if (v == null) return;
        const x = xOf(i);
        const y = rsiTop + (1 - v / 100) * bottomPanelH;
        rsiStarted ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), rsiStarted = true);
      });
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.font = `10px ${C.mono}`;
      ctx.textAlign = "right";
      ctx.fillText("RSI", padL - 4, rsiTop + 10);
      ctx.fillStyle = C.red + "99";
      ctx.fillText("70", padL - 4, y70 + 3);
      ctx.fillStyle = C.green + "99";
      ctx.fillText("30", padL - 4, y30 + 3);
      panelTop += bottomPanelH + 8;
    }

    // ── MACD panel ────────────────────────────────────────────────
    if (showIndicators.macd && inds.macd) {
      const macdTop = panelTop;
      ctx.fillStyle = C.s2;
      ctx.fillRect(padL, macdTop, drawW, bottomPanelH);
      const macdVals = [...(inds.macd.macd.filter(Boolean)), ...(inds.macd.signal.filter(Boolean))];
      const macdMax = Math.max(...macdVals.map(Math.abs)) * 1.2 || 1;
      function yMacd(v) { return macdTop + bottomPanelH / 2 - (v / macdMax) * (bottomPanelH / 2); }
      // Zero line
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, macdTop + bottomPanelH / 2);
      ctx.lineTo(W - padR, macdTop + bottomPanelH / 2);
      ctx.stroke();
      // Histogram
      inds.macd.histogram.forEach((v, i) => {
        if (v == null) return;
        const x = xOf(i);
        const zeroY = macdTop + bottomPanelH / 2;
        const barH = Math.abs((v / macdMax) * (bottomPanelH / 2));
        ctx.fillStyle = v >= 0 ? C.green + "70" : C.red + "70";
        ctx.fillRect(x - candleW / 2, v >= 0 ? zeroY - barH : zeroY, Math.max(1, candleW), barH);
      });
      // MACD line
      ctx.strokeStyle = C.blue;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let ms = false;
      inds.macd.macd.forEach((v, i) => {
        if (!v) return;
        ms ? ctx.lineTo(xOf(i), yMacd(v)) : (ctx.moveTo(xOf(i), yMacd(v)), ms = true);
      });
      ctx.stroke();
      // Signal line
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let ss = false;
      inds.macd.signal.forEach((v, i) => {
        if (!v) return;
        ss ? ctx.lineTo(xOf(i), yMacd(v)) : (ctx.moveTo(xOf(i), yMacd(v)), ss = true);
      });
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.font = `10px ${C.mono}`;
      ctx.textAlign = "right";
      ctx.fillText("MACD", padL - 4, macdTop + 10);
    }
  }, [data, chartType, showIndicators, hoveredIdx]);

  return { draw, dims };
}

// ── Main ChartView component ────────────────────────────────────
export default function ChartView({ ticker: initialTicker, market = "us", onClose }) {
  const [ticker, setTicker]   = useState(initialTicker || (market === "india" ? "RELIANCE.NS" : "NVDA"));
  const [tickerInput, setTickerInput] = useState(initialTicker || "");
  const [period, setPeriod]   = useState("3mo");
  const [chartType, setChartType] = useState("candle");
  const [showInd, setShowInd] = useState({ ema: true, rsi: true, macd: true, volume: true });
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { draw, dims } = useChart(canvasRef, data, chartType, showInd, hoveredIdx);

  const fetchChart = useCallback(async (t, p) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/chart?ticker=${encodeURIComponent(t)}&period=${p}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchChart(ticker, period); }, [ticker, period]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const parent = c.parentElement;
      c.width  = parent.clientWidth;
      c.height = parent.clientHeight;
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, [data, draw]);

  const handleMouseMove = useCallback((e) => {
    if (!data?.candles?.length || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const { padL, padR, W } = dims.current;
    const drawW = canvasRef.current.width - padL - padR;
    const n = data.candles.length;
    const spacing = drawW / n;
    const i = Math.round((x - padL) / spacing);
    if (i >= 0 && i < n) {
      setHoveredIdx(i);
      setHoveredCandle(data.candles[i]);
    }
  }, [data, dims]);

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
    setHoveredCandle(null);
  }, []);

  const trendColor = data ? (
    data.trend?.includes("BULL") ? C.green :
    data.trend?.includes("BEAR") ? C.red : C.gold
  ) : C.muted;

  // Currency comes from the chart API (canonical, via api/_market.js) → symbolFor.
  const curr = symbolFor(data?.meta?.currency);
  const dp   = decimalsFor(data?.meta?.currency);

  return (
    <div style={{ background: C.bg, height: "100%", display: "flex", flexDirection: "column", fontFamily: C.mono, color: C.text }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:`1px solid ${C.border}`, background:C.s1, flexWrap:"wrap" }}>
        {/* Ticker search — selection-only, carries the canonical symbol */}
        <div style={{ width:190 }}>
          <TickerSearch theme={C} value={tickerInput} market={market}
            onChange={setTickerInput}
            onSelect={(r)=>{ setTicker(r.symbol); setTickerInput(r.symbol); }}
            placeholder={market === "india" ? "Search e.g. TCS" : "Search e.g. NVDA"} />
        </div>

        {/* Current ticker + price */}
        <div style={{ fontFamily:C.display, fontWeight:800, fontSize:16, color:C.text }}>{shortName(ticker)}</div>
        {data?.meta && (
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <span style={{ fontFamily:C.display, fontWeight:700, fontSize:16 }}>{curr}{data.meta.lastClose?.toFixed(dp)}</span>
            <span style={{ fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:4, background:trendColor+"18", color:trendColor, border:`1px solid ${trendColor}28` }}>
              {data.trend}
            </span>
          </div>
        )}

        {/* Period buttons */}
        <div style={{ display:"flex", gap:4, marginLeft:"auto", alignItems:"center" }}>
          <span style={{ fontSize:11, color:C.muted, marginRight:4 }}>daily candles</span>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ background:period===p?C.accent+"25":"none", border:`1px solid ${period===p?C.accent:C.border}`, borderRadius:4, color:period===p?C.accent:C.muted, fontFamily:C.display, fontWeight:700, fontSize:11, padding:"8px 12px", minHeight:36, cursor:"pointer" }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Chart type toggle */}
        <div style={{ display:"flex", gap:4 }}>
          {[["candle","🕯"],["line","📈"]].map(([type, icon]) => (
            <button key={type} onClick={() => setChartType(type)} style={{ background:chartType===type?C.s3:"none", border:`1px solid ${chartType===type?C.accent:C.border}`, borderRadius:4, color:chartType===type?C.accent:C.muted, fontSize:13, padding:"3px 8px", cursor:"pointer" }}>
              {icon}
            </button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div style={{ display:"flex", gap:4 }}>
          {[["ema","EMA",C.accent],["rsi","RSI",C.purple],["macd","MACD",C.blue],["volume","VOL",C.gold]].map(([key,label,col]) => (
            <button key={key} onClick={() => setShowInd(p => ({...p,[key]:!p[key]}))} style={{ background:showInd[key]?col+"20":"none", border:`1px solid ${showInd[key]?col:C.border}`, borderRadius:4, color:showInd[key]?col:C.muted, fontFamily:C.display, fontWeight:700, fontSize:11, padding:"8px 10px", minHeight:36, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em" }}>
              {label}
            </button>
          ))}
        </div>

        {onClose && (
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:4, color:C.muted, fontSize:13, padding:"3px 8px", cursor:"pointer", marginLeft:4 }}>✕</button>
        )}
      </div>

      {/* OHLCV hover bar */}
      <div style={{ height:28, background:C.s2, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:16, padding:"0 14px", fontSize:11 }}>
        {hoveredCandle ? (
          <>
            <span style={{ color:C.muted }}>{formatDate(hoveredCandle.t)}</span>
            <span>O <span style={{ color:C.text }}>{curr}{hoveredCandle.o?.toFixed(dp)}</span></span>
            <span>H <span style={{ color:C.green }}>{curr}{hoveredCandle.h?.toFixed(dp)}</span></span>
            <span>L <span style={{ color:C.red }}>{curr}{hoveredCandle.l?.toFixed(dp)}</span></span>
            <span>C <span style={{ color:hoveredCandle.c>=hoveredCandle.o?C.green:C.red }}>{curr}{hoveredCandle.c?.toFixed(dp)}</span></span>
            <span>V <span style={{ color:C.muted }}>{hoveredCandle.v?.toLocaleString()}</span></span>
            {data?.indicators?.rsi && <span>RSI <span style={{ color:C.purple }}>{data.indicators.rsi[data.candles.indexOf(hoveredCandle)]?.toFixed(1)}</span></span>}
          </>
        ) : (
          data?.meta && <>
            <span style={{ color:C.muted }}>Hover over chart to see OHLCV data</span>
            <span style={{ marginLeft:"auto" }}>EMA20 <span style={{ color:C.accent }}>{curr}{data.meta.lastEMA20?.toFixed(dp)}</span></span>
            <span>EMA200 <span style={{ color:C.gold }}>{curr}{data.meta.lastEMA200?.toFixed(dp)}</span></span>
            <span>RSI <span style={{ color:C.purple }}>{data.meta.lastRSI?.toFixed(1)}</span></span>
          </>
        )}
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} style={{ flex:1, position:"relative", overflow:"hidden" }}>
        {loading && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg+"cc", zIndex:10 }}>
            <div style={{ color:C.accent, fontFamily:C.display, fontWeight:700, fontSize:14 }}>Loading chart…</div>
          </div>
        )}
        {error && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10 }}>
            <div style={{ color:C.red, fontSize:13 }}>⚠️ {error}</div>
            <button onClick={() => fetchChart(ticker, period)} style={{ background:C.accent+"18", border:`1px solid ${C.accent}35`, borderRadius:5, color:C.accent, padding:"6px 16px", cursor:"pointer", fontFamily:C.display, fontWeight:700, fontSize:11 }}>Retry</button>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ width:"100%", height:"100%", display:"block", cursor:"crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      {/* Signal legend */}
      {data?.signals?.length > 0 && (
        <div style={{ padding:"6px 14px", borderTop:`1px solid ${C.border}`, background:C.s1, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:C.display, fontWeight:700 }}>Signals:</span>
          {data.signals.slice(-6).map((s, i) => (
            <span key={i} style={{ fontSize:11, color:s.bull?C.green:C.red, background:(s.bull?C.green:C.red)+"15", padding:"2px 7px", borderRadius:3, border:`1px solid ${s.bull?C.green:C.red}28` }}>
              {s.label} · {formatDate(s.t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
