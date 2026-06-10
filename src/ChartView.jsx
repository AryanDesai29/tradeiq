import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import TickerSearch from "./TickerSearch.jsx";
import { symbolFor, decimalsFor, shortName } from "./stock.js";
import { emaArr, vwapArr, FIB_LEVELS } from "./chartIndicators.js";

const C = {
  bg:"#06090f",s1:"#0b1119",s2:"#0f1824",s3:"#142030",
  border:"#1c2d3d",accent:"#00e5ff",blue:"#2979ff",
  gold:"#ffab40",green:"#69f0ae",red:"#ff5252",purple:"#ce93d8",
  pink:"#ff80ab",
  text:"#dde8f5",muted:"#3d5a73",dim:"#1e3347",
  mono:"'JetBrains Mono','Courier New',monospace",
  display:"'Syne',sans-serif",
};

const PERIODS = ["1mo","3mo","6mo","1y"];
const PERIOD_LABELS = {"1mo":"1M","3mo":"3M","6mo":"6M","1y":"1Y"};

// Drawing tools — a DECISION workspace, not an indicator dump. Four deliberate tools.
const TOOLS = [
  { id:"cursor", icon:"⌖",  label:"Cursor" },
  { id:"trend",  icon:"╱",  label:"Trend line" },
  { id:"hline",  icon:"─",  label:"Support / Resistance" },
  { id:"rect",   icon:"▭",  label:"Zone" },
  { id:"fib",    icon:"⋔",  label:"Fibonacci" },
  { id:"erase",  icon:"⌫",  label:"Erase" },
];

function formatDate(ts) { return new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Chart drawing ───────────────────────────────────────────────────────────
function useChart(canvasRef, data, chartType, ind, clientInd, hoveredIdx, drawings, draft, viewRef, replayCut) {
  const dims = useRef({ padL:60, padR:16, padT:16, padB:28 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.candles?.length) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const { padL, padR, padT, padB } = dims.current;

    const bottomPanelH = 70;
    const numBottomPanels = (ind.rsi ? 1 : 0) + (ind.macd ? 1 : 0);
    const volH = ind.volume ? 45 : 0;
    const chartH = H - padT - padB - numBottomPanels * (bottomPanelH + 8) - volH;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const allCandles = data.candles;
    // Replay: hide "future" candles past the cut, but keep the same x/price scale
    // as the full window so the drawing doesn't jump around as you scrub.
    const n = allCandles.length;
    const visN = replayCut == null ? n : Math.min(n, replayCut + 1);
    const inds = data.indicators;
    const drawW = W - padL - padR;
    const candleW = Math.max(2, Math.floor(drawW / n) - 1);
    const spacing = drawW / n;

    const priceMax = Math.max(...allCandles.map(c => c.h));
    const priceMin = Math.min(...allCandles.map(c => c.l));
    const pricePad = (priceMax - priceMin) * 0.05;
    const pHi = priceMax + pricePad, pLo = priceMin - pricePad;

    const xOf = (i) => padL + i * spacing + spacing / 2;
    const yPrice = (v) => padT + chartH - ((v - pLo) / (pHi - pLo)) * chartH;
    // Expose transforms for hit-testing / pixel→data conversion outside the closure.
    viewRef.current = { padL, padR, padT, chartH, spacing, pHi, pLo, n, W, yPrice:(v)=>padT+chartH-((v-pLo)/(pHi-pLo))*chartH, xOf:(i)=>padL+i*spacing+spacing/2 };

    // Grid + price axis
    ctx.strokeStyle = C.border + "80"; ctx.lineWidth = 0.5;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (chartH / gridLines) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = `10px ${C.mono}`; ctx.textAlign = "right";
      ctx.fillText(lerp(pHi, pLo, i / gridLines).toFixed(decimalsFor(data.meta?.currency)), padL - 4, y + 3);
    }

    // Overlay lines (EMA200, EMA50, EMA20, VWAP) — clipped to the chart area.
    const overlay = (arr, color, width, dash) => {
      if (!arr) return;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath(); let started = false;
      arr.forEach((v, i) => { if (v == null || i >= visN) return; const x = xOf(i), y = yPrice(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    if (ind.ema200) overlay(inds.ema200, C.gold + "90", 1.5, [4, 3]);
    if (ind.ema50)  overlay(clientInd.ema50, C.pink + "cc", 1.3);
    if (ind.ema20)  overlay(inds.ema20, C.accent + "90", 1.5);
    if (ind.vwap)   overlay(clientInd.vwap, C.blue + "cc", 1.3, [2, 2]);

    // Candles / line (only up to the replay cut)
    if (chartType === "candle") {
      for (let i = 0; i < visN; i++) {
        const c = allCandles[i], x = xOf(i), bull = c.c >= c.o, color = bull ? C.green : C.red;
        ctx.strokeStyle = color; ctx.fillStyle = color + "cc"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, yPrice(c.h)); ctx.lineTo(x, yPrice(c.l)); ctx.stroke();
        const yO = yPrice(c.o), yC = yPrice(c.c);
        ctx.fillRect(x - candleW / 2, Math.min(yO, yC), candleW, Math.max(1, Math.abs(yO - yC)));
      }
    } else {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < visN; i++) { const x = xOf(i), y = yPrice(allCandles[i].c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }

    // ── USER DRAWINGS (data-coord → pixel) ──
    const renderDrawing = (d, isDraft) => {
      const alpha = isDraft ? "aa" : "ff";
      if (d.type === "hline") {
        const y = yPrice(d.a.price);
        ctx.strokeStyle = C.gold + alpha; ctx.lineWidth = 1.2; ctx.setLineDash(isDraft ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.gold; ctx.font = `9px ${C.mono}`; ctx.textAlign = "left";
        ctx.fillText(d.a.price.toFixed(decimalsFor(data.meta?.currency)), padL + 3, y - 3);
      } else if (d.type === "trend") {
        ctx.strokeStyle = C.accent + alpha; ctx.lineWidth = 1.5; ctx.setLineDash(isDraft ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(xOf(d.a.i), yPrice(d.a.price)); ctx.lineTo(xOf(d.b.i), yPrice(d.b.price)); ctx.stroke(); ctx.setLineDash([]);
      } else if (d.type === "rect") {
        const x1 = xOf(d.a.i), x2 = xOf(d.b.i), y1 = yPrice(d.a.price), y2 = yPrice(d.b.price);
        ctx.fillStyle = C.purple + "18"; ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.strokeStyle = C.purple + alpha; ctx.lineWidth = 1; ctx.setLineDash(isDraft ? [5, 4] : []);
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]);
      } else if (d.type === "fib") {
        const hiP = Math.max(d.a.price, d.b.price), loP = Math.min(d.a.price, d.b.price);
        const x1 = Math.min(xOf(d.a.i), xOf(d.b.i)), x2 = Math.max(xOf(d.a.i), xOf(d.b.i));
        FIB_LEVELS.forEach((L) => {
          const price = hiP - (hiP - loP) * L, y = yPrice(price);
          ctx.strokeStyle = C.blue + (isDraft ? "66" : "99"); ctx.lineWidth = 0.8; ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(Math.max(x2, x1 + 40), y); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = C.blue; ctx.font = `8px ${C.mono}`; ctx.textAlign = "left";
          ctx.fillText(`${(L * 100).toFixed(1)}%  ${price.toFixed(decimalsFor(data.meta?.currency))}`, x1 + 2, y - 2);
        });
      }
    };
    (drawings || []).forEach((d) => renderDrawing(d, false));
    if (draft) renderDrawing(draft, true);

    // Hover crosshair
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
      const x = xOf(hoveredIdx);
      ctx.strokeStyle = C.accent + "40"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + chartH); ctx.stroke(); ctx.setLineDash([]);
    }

    // X axis dates
    ctx.fillStyle = C.muted; ctx.font = `9px ${C.mono}`; ctx.textAlign = "center";
    const dateStep = Math.ceil(n / 6);
    for (let i = 0; i < n; i += dateStep) ctx.fillText(formatDate(allCandles[i].t), xOf(i), padT + chartH + padB - 4);

    // ── Volume panel ──
    let panelTop = padT + chartH + 8;
    if (ind.volume) {
      const volTop = panelTop, volMax = Math.max(...allCandles.map(c => c.v ?? 0));
      ctx.fillStyle = C.muted + "30"; ctx.fillRect(padL, volTop, drawW, volH - 4);
      for (let i = 0; i < visN; i++) { const c = allCandles[i], v = c.v ?? 0, h = (v / volMax) * (volH - 8);
        ctx.fillStyle = (c.c >= c.o ? C.green : C.red) + "80"; ctx.fillRect(xOf(i) - candleW / 2, volTop + volH - 4 - h, candleW, h); }
      ctx.fillStyle = C.muted; ctx.font = `9px ${C.mono}`; ctx.textAlign = "right"; ctx.fillText("VOL", padL - 4, volTop + 10);
      panelTop += volH + 8;
    }

    // ── RSI panel ──
    if (ind.rsi && inds.rsi) {
      const rsiTop = panelTop;
      ctx.fillStyle = C.s2; ctx.fillRect(padL, rsiTop, drawW, bottomPanelH);
      const y70 = rsiTop + (1 - 70 / 100) * bottomPanelH, y30 = rsiTop + (1 - 30 / 100) * bottomPanelH;
      ctx.strokeStyle = C.red + "40"; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(padL, y70); ctx.lineTo(W - padR, y70); ctx.stroke();
      ctx.strokeStyle = C.green + "40"; ctx.beginPath(); ctx.moveTo(padL, y30); ctx.lineTo(W - padR, y30); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C.purple; ctx.lineWidth = 1.5; ctx.beginPath(); let s = false;
      inds.rsi.forEach((v, i) => { if (v == null || i >= visN) return; const x = xOf(i), y = rsiTop + (1 - v / 100) * bottomPanelH; s ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), s = true); });
      ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = `9px ${C.mono}`; ctx.textAlign = "right"; ctx.fillText("RSI", padL - 4, rsiTop + 10);
      ctx.fillStyle = C.red + "99"; ctx.fillText("70", padL - 4, y70 + 3); ctx.fillStyle = C.green + "99"; ctx.fillText("30", padL - 4, y30 + 3);
      panelTop += bottomPanelH + 8;
    }

    // ── MACD panel ──
    if (ind.macd && inds.macd) {
      const macdTop = panelTop;
      ctx.fillStyle = C.s2; ctx.fillRect(padL, macdTop, drawW, bottomPanelH);
      const macdVals = [...inds.macd.macd.filter(Boolean), ...inds.macd.signal.filter(Boolean)];
      const macdMax = Math.max(...macdVals.map(Math.abs)) * 1.2 || 1;
      const yMacd = (v) => macdTop + bottomPanelH / 2 - (v / macdMax) * (bottomPanelH / 2);
      ctx.strokeStyle = C.border; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(padL, macdTop + bottomPanelH / 2); ctx.lineTo(W - padR, macdTop + bottomPanelH / 2); ctx.stroke();
      inds.macd.histogram.forEach((v, i) => { if (v == null || i >= visN) return; const x = xOf(i), zeroY = macdTop + bottomPanelH / 2, barH = Math.abs((v / macdMax) * (bottomPanelH / 2));
        ctx.fillStyle = v >= 0 ? C.green + "70" : C.red + "70"; ctx.fillRect(x - candleW / 2, v >= 0 ? zeroY - barH : zeroY, Math.max(1, candleW), barH); });
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1.5; ctx.beginPath(); let ms = false;
      inds.macd.macd.forEach((v, i) => { if (!v || i >= visN) return; ms ? ctx.lineTo(xOf(i), yMacd(v)) : (ctx.moveTo(xOf(i), yMacd(v)), ms = true); }); ctx.stroke();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.beginPath(); let ss = false;
      inds.macd.signal.forEach((v, i) => { if (!v || i >= visN) return; ss ? ctx.lineTo(xOf(i), yMacd(v)) : (ctx.moveTo(xOf(i), yMacd(v)), ss = true); }); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = `9px ${C.mono}`; ctx.textAlign = "right"; ctx.fillText("MACD", padL - 4, macdTop + 10);
    }
  }, [data, chartType, ind, clientInd, hoveredIdx, drawings, draft, replayCut]);

  return { draw, dims };
}

// ── Main ChartView ────────────────────────────────────────────────────────────
const DEFAULT_IND = { ema20:true, ema50:true, ema200:true, vwap:false, rsi:true, volume:true, macd:false };

export default function ChartView({ ticker: initialTicker, market = "us", onClose, userId = "anon" }) {
  const [ticker, setTicker]   = useState(initialTicker || (market === "india" ? "RELIANCE.NS" : "NVDA"));
  const [tickerInput, setTickerInput] = useState(initialTicker || "");
  const [period, setPeriod]   = useState("3mo");
  const [chartType, setChartType] = useState("candle");
  const [ind, setInd] = useState(() => {
    try { const s = localStorage.getItem(`tiq_chart_ind_${userId}`); return s ? { ...DEFAULT_IND, ...JSON.parse(s) } : DEFAULT_IND; } catch { return DEFAULT_IND; }
  });
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [tool, setTool] = useState("cursor");
  const [drawings, setDrawings] = useState([]);
  const [draft, setDraft] = useState(null);
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef(null);

  // Client indicators (EMA50, VWAP) from candles — memoised.
  const clientInd = useMemo(() => {
    if (!data?.candles?.length) return { ema50: null, vwap: null };
    const closes = data.candles.map(c => c.c);
    return { ema50: emaArr(closes, 50), vwap: vwapArr(data.candles) };
  }, [data]);

  const { draw, dims } = useChart(canvasRef, data, chartType, ind, clientInd, hoveredIdx, drawings, draft, viewRef, null);

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

  // Persist indicator toggles per user.
  useEffect(() => { try { localStorage.setItem(`tiq_chart_ind_${userId}`, JSON.stringify(ind)); } catch {} }, [ind, userId]);

  // Load / save drawings per user + ticker (drawings are price-specific to a symbol).
  useEffect(() => {
    try { const s = localStorage.getItem(`tiq_chart_draw_${userId}_${ticker}`); setDrawings(s ? JSON.parse(s) : []); }
    catch { setDrawings([]); }
    setDraft(null);
  }, [ticker, userId]);
  useEffect(() => { try { localStorage.setItem(`tiq_chart_draw_${userId}_${ticker}`, JSON.stringify(drawings)); } catch {} }, [drawings, ticker, userId]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const resize = () => { const c = canvasRef.current; if (!c) return; const parent = c.parentElement; c.width = parent.clientWidth; c.height = parent.clientHeight; draw(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, [data, draw]);

  // Pixel → data coordinate (candle index + price) via the exposed transforms.
  const pxToData = useCallback((clientX, clientY) => {
    const v = viewRef.current, canvas = canvasRef.current; if (!v || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const px = (clientX - rect.left) * sx, py = (clientY - rect.top) * sy;
    const i = Math.round((px - v.padL) / v.spacing - 0.5);
    const price = v.pHi - ((py - v.padT) / v.chartH) * (v.pHi - v.pLo);
    return { i: Math.max(0, Math.min(v.n - 1, i)), price, px, py };
  }, []);

  // Distance from a click to a drawing (px) — for the eraser.
  const hitTest = useCallback((d, px, py) => {
    const v = viewRef.current; if (!v) return 1e9;
    if (d.type === "hline") return Math.abs(py - v.yPrice(d.a.price));
    if (d.type === "trend") {
      const x1 = v.xOf(d.a.i), y1 = v.yPrice(d.a.price), x2 = v.xOf(d.b.i), y2 = v.yPrice(d.b.price);
      const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1; let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / L2; t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }
    if (d.type === "rect" || d.type === "fib") {
      const x1 = Math.min(v.xOf(d.a.i), v.xOf(d.b.i)), x2 = Math.max(v.xOf(d.a.i), v.xOf(d.b.i));
      const y1 = Math.min(v.yPrice(d.a.price), v.yPrice(d.b.price)), y2 = Math.max(v.yPrice(d.a.price), v.yPrice(d.b.price));
      return px >= x1 - 6 && px <= x2 + 6 && py >= y1 - 6 && py <= y2 + 6 ? 0 : 1e9;
    }
    return 1e9;
  }, []);

  const onDown = useCallback((e) => {
    if (tool === "cursor") return;
    const p = pxToData(e.clientX, e.clientY); if (!p) return;
    if (tool === "erase") {
      let best = null, bestD = 8;
      drawings.forEach((d) => { const dist = hitTest(d, p.px, p.py); if (dist < bestD) { bestD = dist; best = d.id; } });
      if (best) setDrawings((ds) => ds.filter((d) => d.id !== best));
      return;
    }
    dragRef.current = { a: { i: p.i, price: p.price } };
    setDraft({ type: tool, a: { i: p.i, price: p.price }, b: { i: p.i, price: p.price } });
  }, [tool, pxToData, hitTest, drawings]);

  const onMove = useCallback((e) => {
    const p = pxToData(e.clientX, e.clientY);
    if (p && p.i >= 0 && data?.candles?.[p.i]) { setHoveredIdx(p.i); setHoveredCandle(data.candles[p.i]); }
    if (dragRef.current && p) setDraft((d) => d ? { ...d, b: { i: p.i, price: p.price } } : d);
  }, [pxToData, data]);

  const onUp = useCallback(() => {
    if (dragRef.current && draft) {
      // Ignore zero-size accidental clicks (except hline, which only needs a price).
      const moved = draft.type === "hline" || Math.abs(draft.a.i - draft.b.i) > 0 || Math.abs(draft.a.price - draft.b.price) > 1e-9;
      if (moved) setDrawings((ds) => [...ds, { ...draft, id: `${draft.type}_${ds.length}_${Math.round(draft.a.price * 100)}` }]);
    }
    dragRef.current = null; setDraft(null);
  }, [draft]);

  const onLeave = useCallback(() => { setHoveredIdx(null); setHoveredCandle(null); if (dragRef.current) { dragRef.current = null; setDraft(null); } }, []);

  const trendColor = data ? (data.trend?.includes("BULL") ? C.green : data.trend?.includes("BEAR") ? C.red : C.gold) : C.muted;
  const curr = symbolFor(data?.meta?.currency);
  const dp = decimalsFor(data?.meta?.currency);

  const IND_TOGGLES = [
    ["ema20","EMA20",C.accent],["ema50","EMA50",C.pink],["ema200","EMA200",C.gold],
    ["vwap","VWAP",C.blue],["rsi","RSI",C.purple],["volume","VOL",C.muted],["macd","MACD",C.blue],
  ];

  return (
    <div style={{ background: C.bg, height: "100%", display: "flex", flexDirection: "column", fontFamily: C.mono, color: C.text }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:`1px solid ${C.border}`, background:C.s1, flexWrap:"wrap" }}>
        <div style={{ width:190 }}>
          <TickerSearch theme={C} value={tickerInput} market={market} onChange={setTickerInput}
            onSelect={(r)=>{ setTicker(r.symbol); setTickerInput(r.symbol); }}
            placeholder={market === "india" ? "Search e.g. TCS" : "Search e.g. NVDA"} />
        </div>
        <div style={{ fontFamily:C.display, fontWeight:800, fontSize:16, color:C.text }}>{shortName(ticker)}</div>
        {data?.meta && (
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <span style={{ fontFamily:C.display, fontWeight:700, fontSize:16 }}>{curr}{data.meta.lastClose?.toFixed(dp)}</span>
            <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:4, background:trendColor+"18", color:trendColor, border:`1px solid ${trendColor}28` }}>{data.trend}</span>
          </div>
        )}
        <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ background:period===p?C.accent+"25":"none", border:`1px solid ${period===p?C.accent:C.border}`, borderRadius:4, color:period===p?C.accent:C.muted, fontFamily:C.display, fontWeight:700, fontSize:10, padding:"4px 9px", cursor:"pointer" }}>{PERIOD_LABELS[p]}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[["candle","🕯"],["line","📈"]].map(([type, icon]) => (
            <button key={type} onClick={() => setChartType(type)} style={{ background:chartType===type?C.s3:"none", border:`1px solid ${chartType===type?C.accent:C.border}`, borderRadius:4, color:chartType===type?C.accent:C.muted, fontSize:13, padding:"3px 8px", cursor:"pointer" }}>{icon}</button>
          ))}
        </div>
        {onClose && <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:4, color:C.muted, fontSize:13, padding:"3px 8px", cursor:"pointer", marginLeft:4 }}>✕</button>}
      </div>

      {/* Indicator toggles row — the deliberate set (no indicator dump) */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 14px", borderBottom:`1px solid ${C.border}`, background:C.s1, flexWrap:"wrap" }}>
        <span style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:C.display, fontWeight:700, marginRight:2 }}>Indicators</span>
        {IND_TOGGLES.map(([key,label,col]) => (
          <button key={key} onClick={() => setInd(p => ({...p,[key]:!p[key]}))} style={{ background:ind[key]?col+"20":"none", border:`1px solid ${ind[key]?col:C.border}`, borderRadius:4, color:ind[key]?col:C.muted, fontFamily:C.display, fontWeight:700, fontSize:9, padding:"3px 7px", cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</button>
        ))}
      </div>

      {/* OHLCV hover bar */}
      <div style={{ height:28, background:C.s2, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:16, padding:"0 14px", fontSize:10 }}>
        {hoveredCandle ? (
          <>
            <span style={{ color:C.muted }}>{formatDate(hoveredCandle.t)}</span>
            <span>O <span style={{ color:C.text }}>{curr}{hoveredCandle.o?.toFixed(dp)}</span></span>
            <span>H <span style={{ color:C.green }}>{curr}{hoveredCandle.h?.toFixed(dp)}</span></span>
            <span>L <span style={{ color:C.red }}>{curr}{hoveredCandle.l?.toFixed(dp)}</span></span>
            <span>C <span style={{ color:hoveredCandle.c>=hoveredCandle.o?C.green:C.red }}>{curr}{hoveredCandle.c?.toFixed(dp)}</span></span>
            <span>V <span style={{ color:C.muted }}>{hoveredCandle.v?.toLocaleString()}</span></span>
          </>
        ) : ( data?.meta && <span style={{ color:C.muted }}>Pick a tool on the left, or hover for OHLCV</span> )}
      </div>

      {/* Chart canvas + left tools rail */}
      <div style={{ flex:1, position:"relative", overflow:"hidden", display:"flex" }}>
        {/* Tools panel */}
        <div style={{ width:40, background:C.s1, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 0", zIndex:5 }}>
          {TOOLS.map(t => (
            <button key={t.id} title={t.label} onClick={() => setTool(t.id)} style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:tool===t.id?C.accent+"22":"none", border:`1px solid ${tool===t.id?C.accent:C.border}`, borderRadius:5, color:tool===t.id?C.accent:C.muted, fontSize:15, cursor:"pointer" }}>{t.icon}</button>
          ))}
          <div style={{ flex:1 }} />
          {drawings.length > 0 && (
            <button title="Clear all drawings" onClick={() => setDrawings([])} style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:`1px solid ${C.red}40`, borderRadius:5, color:C.red, fontSize:13, cursor:"pointer" }}>🗑</button>
          )}
        </div>

        <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
          {loading && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg+"cc", zIndex:10 }}><div style={{ color:C.accent, fontFamily:C.display, fontWeight:700, fontSize:14 }}>Loading chart…</div></div>}
          {error && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10 }}><div style={{ color:C.red, fontSize:13 }}>⚠️ {error}</div><button onClick={() => fetchChart(ticker, period)} style={{ background:C.accent+"18", border:`1px solid ${C.accent}35`, borderRadius:5, color:C.accent, padding:"6px 16px", cursor:"pointer", fontFamily:C.display, fontWeight:700, fontSize:11 }}>Retry</button></div>}
          {tool !== "cursor" && <div style={{ position:"absolute", top:8, left:8, zIndex:6, fontSize:9, color:C.accent, background:C.s1+"dd", border:`1px solid ${C.accent}40`, borderRadius:4, padding:"3px 8px", pointerEvents:"none" }}>{TOOLS.find(t=>t.id===tool)?.label}{tool==="erase"?" — click a drawing":" — drag on chart"}</div>}
          <canvas ref={canvasRef}
            style={{ width:"100%", height:"100%", display:"block", cursor: tool === "cursor" ? "crosshair" : tool === "erase" ? "pointer" : "copy" }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave} />
        </div>
      </div>

      {/* Signal legend */}
      {data?.signals?.length > 0 && (
        <div style={{ padding:"6px 14px", borderTop:`1px solid ${C.border}`, background:C.s1, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:C.display, fontWeight:700 }}>Signals:</span>
          {data.signals.slice(-6).map((s, i) => (
            <span key={i} style={{ fontSize:10, color:s.bull?C.green:C.red, background:(s.bull?C.green:C.red)+"15", padding:"2px 7px", borderRadius:3, border:`1px solid ${s.bull?C.green:C.red}28` }}>{s.label} · {formatDate(s.t)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
