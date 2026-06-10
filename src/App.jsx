import { useState, useEffect, useRef, useCallback } from "react";
import ChartView from "./ChartView.jsx";
import Login from "./Login.jsx";
import TickerSearch from "./TickerSearch.jsx";
import Performance from "./Performance.jsx";
import TradeReview from "./TradeReview.jsx";
import { symbolFor, decimalsFor, shortName, withCurrency, inferCurrency } from "./stock.js";
import { performance, byCurrency, byStrategy, rMultipleOf, pnlOf } from "./analytics.js";
import { normalizeReview } from "./reviews.js";
import { THESIS_TYPES, THESIS_FIELD_MAX, thesisComplete, missingThesisFields } from "./thesis.js";
import { createClient } from "@supabase/supabase-js";
// Currency/exchange logic lives ONLY in ./stock.js (client) and ./api/_market.js
// (server). Components read stock.currency — they never parse tickers.

// ─── SUPABASE — public anon key is safe in frontend ───────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If env vars are missing (e.g. not configured on Vercel), fall back to a
// no-op client so the UI still renders instead of crashing at module load
// with "supabaseUrl is required". Every query resolves to {data:null,error}.
function makeOfflineDb() {
  const result = { data: null, error: { message: "Supabase not configured" } };
  const chain = new Proxy(() => {}, {
    get: (_t, prop) => (prop === "then" ? (resolve) => resolve(result) : () => chain),
    apply: () => chain,
  });
  return { from: () => chain };
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[TradeIQ] Supabase env vars missing — running without cloud sync. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables.");
}

const SUPABASE_READY = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const db = SUPABASE_READY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : makeOfflineDb();

// ─── THEME ────────────────────────────────────────────────────────
const C = {
  bg:"#06090f",s1:"#0b1119",s2:"#0f1824",s3:"#142030",
  border:"#1c2d3d",accent:"#00e5ff",blue:"#2979ff",
  gold:"#ffab40",green:"#69f0ae",red:"#ff5252",purple:"#ce93d8",
  text:"#dde8f5",muted:"#3d5a73",dim:"#1e3347",
  mono:"'JetBrains Mono','Courier New',monospace",
  display:"'Syne',sans-serif",
};

const GS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:${C.s1};}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
  body{background:${C.bg};}
  .tiq-input:focus{border-color:${C.accent}60!important;outline:none;}
  .tiq-btn{transition:all 0.15s ease;cursor:pointer;}
  .tiq-btn:hover{opacity:0.82;transform:translateY(-1px);}
  .tiq-row:hover{background:${C.s3}!important;}
  .tiq-card:hover{border-color:${C.accent}22!important;}
  .qbtn:hover{background:${C.accent}22!important;}
  @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  .msg-in{animation:fadeUp 0.2s ease;}
  .d1{animation:pulse 1.1s 0s infinite}.d2{animation:pulse 1.1s 0.18s infinite}.d3{animation:pulse 1.1s 0.36s infinite}
  .spin{animation:spin 1s linear infinite}
`;

// ─── REUSABLE COMPONENTS ─────────────────────────────────────────
const Tag=({c,children})=>(<span style={{display:"inline-block",fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",padding:"2px 7px",borderRadius:3,background:c+"18",color:c,border:`1px solid ${c}28`,marginRight:4,whiteSpace:"nowrap"}}>{children}</span>);
const Card=({children,style={},glow})=>(<div className="tiq-card" style={{background:C.s1,border:`1px solid ${glow?C.accent+"35":C.border}`,borderRadius:8,padding:16,marginBottom:14,...style}}>{children}</div>);
const CT=({children})=>(<div style={{fontFamily:C.display,fontWeight:700,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:C.muted,marginBottom:12}}>{children}</div>);
const Btn=({children,onClick,color=C.accent,solid,small,style={}})=>(<button className="tiq-btn" onClick={onClick} style={{background:solid?color:color+"18",border:solid?"none":`1px solid ${color}35`,borderRadius:5,color:solid?C.bg:color,fontFamily:C.display,fontWeight:700,fontSize:small?9:11,letterSpacing:"0.08em",textTransform:"uppercase",padding:small?"4px 9px":"8px 16px",whiteSpace:"nowrap",...style}}>{children}</button>);
const Inp=({label,value,onChange,placeholder,type="text",style={}})=>(<div>{label&&<div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</div>}<input className="tiq-input" type={type} value={value} onChange={onChange} placeholder={placeholder} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:5,padding:"7px 11px",color:C.text,fontFamily:C.mono,fontSize:11,width:"100%",...style}}/></div>);
const Sel=({label,value,onChange,options})=>(<div>{label&&<div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</div>}<select className="tiq-input" value={value} onChange={onChange} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:5,padding:"7px 11px",color:C.text,fontFamily:C.mono,fontSize:11,width:"100%"}}>{options.map(o=><option key={o}>{o}</option>)}</select></div>);
const StatCard=({label,value,sub,color=C.accent})=>(<div style={{background:C.s2,border:`1px solid ${C.border}`,borderLeft:`3px solid ${color}`,borderRadius:7,padding:14}}><div style={{fontSize:9,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:C.muted,marginBottom:5}}>{label}</div><div style={{fontFamily:C.display,fontSize:20,fontWeight:800,color,lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>{sub}</div>}</div>);
const Sparkline=({data=[],color=C.accent,w=80,h=28})=>{if(data.length<2)return null;const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/rng)*(h-4)-2}`).join(" ");const last=pts.split(" ").pop().split(",");return(<svg width={w} height={h} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round"/><circle cx={last[0]} cy={last[1]} r={2.5} fill={color}/></svg>);};
const RSIMeter=({value=50})=>{const v=Math.min(100,Math.max(0,value));const col=v<35?C.red:v>65?C.gold:C.green;return(<div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:50,height:5,background:C.dim,borderRadius:3,overflow:"hidden"}}><div style={{width:`${v}%`,height:"100%",background:col,borderRadius:3}}/></div><span style={{fontSize:10,fontWeight:700,color:col,fontFamily:C.display}}>{v}</span></div>);};
const Dots=()=>(<div style={{display:"flex",gap:5,padding:"4px 0",alignItems:"center"}}>{[1,2,3].map(i=><div key={i} className={`d${i}`} style={{width:6,height:6,borderRadius:"50%",background:C.accent}}/>)}<span style={{fontSize:10,color:C.muted,marginLeft:4}}>Thinking…</span></div>);
const Spinner=()=><div className="spin" style={{width:14,height:14,border:`2px solid ${C.accent}30`,borderTop:`2px solid ${C.accent}`,borderRadius:"50%",display:"inline-block"}}/>;

// ─── WATCHLIST BASE DATA ─────────────────────────────────────────
const US_BASE=[
  {ticker:"NVDA",name:"NVIDIA"},{ticker:"TSLA",name:"Tesla"},{ticker:"AAPL",name:"Apple"},
  {ticker:"META",name:"Meta"},{ticker:"GOOGL",name:"Alphabet"},{ticker:"AMD",name:"AMD"},
  {ticker:"MSFT",name:"Microsoft"},{ticker:"PLTR",name:"Palantir"},
  {ticker:"AMZN",name:"Amazon"},{ticker:"NFLX",name:"Netflix"},
  {ticker:"SPY",name:"S&P 500 ETF"},{ticker:"QQQ",name:"Nasdaq ETF"},
];
const INDIA_BASE=[
  {ticker:"RELIANCE.NS",name:"Reliance"},{ticker:"TCS.NS",name:"TCS"},
  {ticker:"HDFCBANK.NS",name:"HDFC Bank"},{ticker:"INFY.NS",name:"Infosys"},
  {ticker:"ICICIBANK.NS",name:"ICICI Bank"},{ticker:"HINDUNILVR.NS",name:"HUL"},
  {ticker:"SBIN.NS",name:"SBI"},{ticker:"BAJFINANCE.NS",name:"Bajaj Finance"},
  {ticker:"WIPRO.NS",name:"Wipro"},{ticker:"AXISBANK.NS",name:"Axis Bank"},
  {ticker:"TATAMOTORS.NS",name:"Tata Motors"},{ticker:"ADANIENT.NS",name:"Adani Ent"},
];
const STRATEGIES=[
  {id:"ema",name:"EMA Pullback",type:"Swing",winRate:68,rr:"1:2.5",color:C.accent,rules:"Price above 200 EMA. Pullback to 20 EMA zone. RSI 40–58. Bullish reversal candle. Stop below swing low. Target: previous high."},
  {id:"bo",name:"Breakout Consolidation",type:"Momentum",winRate:55,rr:"1:3",color:C.gold,rules:"15+ days sideways, range under 10%. Breakout volume 50%+ above 20-day avg. Sector ETF in uptrend. Entry: breakout candle close."},
  {id:"dca",name:"DCA Index ETF",type:"Long-term",winRate:88,rr:"1:5+",color:C.green,rules:"Buy fixed ₹ of Nifty BeES / SPY weekly. No stop-loss. Hold 12+ months. Reinvest dividends. Never time the market."},
];


// ─── MARKET HEADER ───────────────────────────────────────────────
function MarketHeader({marketTab,setMarketTab,priceStatus,fetchPrices,lastUpdated}){
  const [,setT]=useState(0);
  useEffect(()=>{const iv=setInterval(()=>setT(p=>p+1),1000);return()=>clearInterval(iv);},[]);
  const C2={accent:"#00e5ff",blue:"#2979ff",gold:"#ffab40",green:"#69f0ae",red:"#ff5252",text:"#dde8f5",muted:"#3d5a73",s1:"#0b1119",s2:"#0f1824",border:"#1c2d3d",display:"'Syne',sans-serif",mono:"'JetBrains Mono',monospace"};
  const fmt=(tz)=>new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true,timeZone:tz});
  const fmtD=(tz)=>new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:tz});
  const isUSOpen=()=>{const n=new Date(),ny=new Date(n.toLocaleString("en-US",{timeZone:"America/New_York"})),d=ny.getDay(),m=ny.getHours()*60+ny.getMinutes();return d>=1&&d<=5&&m>=570&&m<960;};
  const isINOpen=()=>{const n=new Date(),ist=new Date(n.toLocaleString("en-US",{timeZone:"Asia/Kolkata"})),d=ist.getDay(),m=ist.getHours()*60+ist.getMinutes();return d>=1&&d<=5&&m>=555&&m<930;};
  const mkts=[{id:"us",flag:"🇺🇸",label:"US Markets",tz:"America/New_York",open:isUSOpen(),hours:"9:30AM–4PM ET",col:C2.blue},{id:"india",flag:"🇮🇳",label:"India NSE",tz:"Asia/Kolkata",open:isINOpen(),hours:"9:15AM–3:30PM IST",col:C2.gold}];
  return(<div style={{marginBottom:14}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
      {mkts.map(m=>(<div key={m.id} onClick={()=>setMarketTab(m.id)} style={{background:marketTab===m.id?C2.s2:C2.s1,border:`1px solid ${marketTab===m.id?m.col+"50":C2.border}`,borderRadius:7,padding:"10px 12px",cursor:"pointer",transition:"all 0.15s"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontFamily:C2.display,fontWeight:700,fontSize:11,color:marketTab===m.id?m.col:C2.muted}}>{m.flag} {m.label}</span>
          <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,background:m.open?C2.green+"18":C2.red+"18",color:m.open?C2.green:C2.red}}>{m.open?"● OPEN":"● CLOSED"}</span>
        </div>
        <div style={{fontFamily:C2.mono,fontSize:15,fontWeight:700,color:marketTab===m.id?C2.text:C2.muted,letterSpacing:"0.04em"}}>{fmt(m.tz)}</div>
        <div style={{fontSize:9,color:C2.muted,marginTop:2}}>{fmtD(m.tz)} · {m.hours}</div>
      </div>))}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontFamily:C2.display,fontWeight:700,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:C2.muted}}>
        {marketTab==="us"?"US Watchlist":"Indian Watchlist"} — {priceStatus==="live"?"● Live":priceStatus==="loading"?"Fetching…":"Cached"}
        {lastUpdated&&<span style={{marginLeft:6,fontWeight:400}}>· {lastUpdated.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
      </div>
      <button onClick={fetchPrices} disabled={priceStatus==="loading"} style={{fontSize:10,color:priceStatus==="loading"?C2.muted:C2.accent,background:"none",border:`1px solid ${priceStatus==="loading"?C2.muted:C2.accent}35`,borderRadius:4,padding:"3px 9px",cursor:priceStatus==="loading"?"not-allowed":"pointer",fontFamily:C2.display,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>{priceStatus==="loading"?"…":"↻"}</button>
    </div>
  </div>);
}

// ─── LOCAL BACKUP — keeps data even if Supabase is offline ───────
const LS = {
  load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

// ─── MAIN APP ─────────────────────────────────────────────────────
function TradeIQ({ session }) {
  const userId = session?.user?.id || "local";
  const authToken = session?.access_token || null; // sent to /api/prices + /api/search for per-user rate limiting
  const [tab,setTab]           = useState("perf");
  const [holdings,setHoldings] = useState(()=>LS.load(`tradeiq_holdings_backup_${userId}`,[]).map(withCurrency));
  const [journal,setJournal]   = useState(()=>LS.load(`tradeiq_journal_backup_${userId}`,[]).map(withCurrency));
  const [syncStatus,setSS]     = useState("idle");
  const [msgs,setMsgs]         = useState([{role:"assistant",content:"👋 Welcome to TradeIQ!\n\nYour data syncs across all devices automatically.\n\n📌 Getting started:\n1. Add your Vested holdings in Dashboard\n2. Ask the AI anything in the AI Advisor tab\n3. Log your trades in the Journal\n\nEverything saves instantly — phone, laptop, any browser. 🚀"}]);
  const [chatInput,setChatInput]   = useState("");
  const [aiLoading,setAiLoading]   = useState(false);
  // Trade reviews keyed by trade_id; seeded from localStorage so they survive a
  // Supabase outage (or a not-yet-created tradeiq_reviews table). `reviewing`
  // holds the trade_id currently being graded by the AI.
  const [reviews,setReviews]       = useState(()=>LS.load(`tradeiq_reviews_backup_${userId}`,{}));
  const [reviewing,setReviewing]   = useState(null);
  const [showAddH,setShowAddH]     = useState(false);
  const [showAddT,setShowAddT]     = useState(false);
  // `meta` holds the chosen search result {symbol,name,exchange,currency}. A
  // holding/trade can only be saved when meta.symbol matches the ticker field —
  // i.e. the user picked from autocomplete rather than free-typing.
  const [newH,setNewH] = useState({ticker:"",name:"",shares:"",avgCost:"",price:"",sector:"Tech",meta:null});
  const [newT,setNewT] = useState({ticker:"",side:"BUY",entry:"",stop:"",target:"",shares:"",strategy:"EMA Pullback",notes:"",date:new Date().toISOString().split("T")[0],meta:null,thesisType:"",expectations:"",reality:"",evidence:"",bearCase:"",invalidation:"",confidence:60});
  const [calcE,setCalcE]=useState(""); const [calcS,setCalcS]=useState(""); const [calcR,setCalcR]=useState("2"); const [calcRes,setCalcRes]=useState(null);
  const [marketTab,setMarketTab]=useState("us");
  const [customUS,setCustomUS]=useState([]);
  const [customIndia,setCustomIndia]=useState([]);
  const [addTickerInput,setAddTickerInput]=useState("");
  const [showAddTicker,setShowAddTicker]=useState(false);
  const [chartTicker,setChartTicker]=useState(null);
  const [liveData,setLiveData]=useState({});
  const [priceStatus,setPriceStatus]=useState("loading");
  const [lastUpdated,setLastUpdated]=useState(null);
  const chatEnd = useRef(null);

  // ── Live price fetch ──
  const fetchPrices = async() => {
    setPriceStatus("loading");
    try {
      const extra = [...customUS, ...customIndia].join(",");
      const res = await fetch(`/api/prices${extra ? `?extra=${encodeURIComponent(extra)}` : ""}`, authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined);
      if(res.status===429){ setPriceStatus("error"); return; }
      const data = await res.json();
      if(data.prices) {
        setLiveData(data.prices);
        setLastUpdated(new Date(data.updatedAt));
        setPriceStatus("live");
      } else { setPriceStatus("error"); }
    } catch(e) { setPriceStatus("error"); }
  };

  useEffect(()=>{ loadAll(); fetchPrices(); },[]);
  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[msgs]);

  // Auto-refresh prices every 5 minutes
  useEffect(()=>{
    const interval = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  },[]);

  // Refetch whenever the custom watchlist changes. This runs AFTER the state
  // commit, so fetchPrices reads the up-to-date custom tickers — fixing the
  // bug where a freshly added stock never got a price (stale closure) and was
  // filtered out of the watchlist. A mount guard avoids a duplicate first call.
  const tickersMounted = useRef(false);
  useEffect(()=>{
    if(!tickersMounted.current){ tickersMounted.current = true; return; }
    fetchPrices();
  },[customUS,customIndia]);

  // Mirror holdings/journal to localStorage so data survives a Supabase outage
  useEffect(()=>{ LS.save(`tradeiq_holdings_backup_${userId}`, holdings); },[holdings,userId]);
  useEffect(()=>{ LS.save(`tradeiq_journal_backup_${userId}`, journal); },[journal,userId]);
  useEffect(()=>{ LS.save(`tradeiq_reviews_backup_${userId}`, reviews); },[reviews,userId]);

  // Custom tickers come FIRST (so a freshly added stock is always visible at
  // the top, even within the dashboard's 8-row slice) and stay visible even
  // before their price arrives — base stocks are hidden until priced. Dedupe by
  // ticker so adding a stock that's already in the base list doesn't double it.
  const mergeList=(base,customArr)=>{
    const customSet=new Set(customArr);
    const seen=new Set();
    return [...customArr.map(t=>({ticker:t,name:t})),...base]
      .filter(w=>{if(seen.has(w.ticker))return false;seen.add(w.ticker);return true;})
      .map(w=>{const live=liveData[w.ticker];const custom=customSet.has(w.ticker);return{...w,price:live?.price??null,chg:live?.chg??0,rsi:live?.rsi??50,ema20:live?.ema20??null,ema200:live?.ema200??null,spark:live?.spark??[],currency:live?.currency??inferCurrency(w.ticker),custom};})
      .filter(w=>w.price!==null||w.custom);
  };
  const US_WATCHLIST=mergeList(US_BASE,customUS);
  const INDIA_WATCHLIST=mergeList(INDIA_BASE,customIndia);
  const WATCHLIST=marketTab==="us"?US_WATCHLIST:INDIA_WATCHLIST;
  // Selection-only: takes a chosen search result {symbol,currency,…} — never raw
  // text — and buckets by the symbol's own market so picking "RELIANCE.NS"
  // always lands in the Indian list regardless of the current tab.
  const addCustomTicker=(r)=>{const sym=(r?.symbol||"").trim().toUpperCase();if(!sym)return;const currency=r?.currency||inferCurrency(sym);if(currency==="INR")setCustomIndia(p=>[...new Set([...p,sym])]);else setCustomUS(p=>[...new Set([...p,sym])]);setAddTickerInput("");setShowAddTicker(false);/* refetch is handled by the effect on customUS/customIndia */};
  const removeCustomTicker=(ticker)=>{setCustomUS(p=>p.filter(t=>t!==ticker));setCustomIndia(p=>p.filter(t=>t!==ticker));};

  const loadAll = async()=>{
    setSS("syncing");
    // Ensure a preferences row exists for this user (best-effort, non-blocking)
    if (SUPABASE_READY && session) {
      db.from("tradeiq_profiles").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    }
    try {
      const [{data:h},{data:j}] = await Promise.all([
        db.from("tradeiq_holdings").select("*").order("created_at",{ascending:true}),
        db.from("tradeiq_journal").select("*").order("created_at",{ascending:false}),
      ]);
      // withCurrency backfills currency for any legacy row created before the
      // currency column existed — the one place inference is allowed.
      if(h) setHoldings(h.map(r=>withCurrency({id:r.id,ticker:r.ticker,name:r.name,exchange:r.exchange,currency:r.currency,shares:+r.shares,avgCost:+r.avg_cost,price:+r.price,sector:r.sector})));
      if(j) setJournal(j.map(r=>withCurrency({id:r.id,ticker:r.ticker,name:r.name,exchange:r.exchange,currency:r.currency,sector:r.sector,industry:r.industry,side:r.side,entry:String(r.entry_price||""),exit:r.exit_price?String(r.exit_price):null,shares:String(r.shares||""),stop:String(r.stop_loss||""),target:String(r.target||""),strategy:r.strategy,notes:r.notes,date:r.trade_date,closed:r.closed,closedAt:r.closed_at,thesisType:r.thesis_type,expectations:r.thesis_expectations,reality:r.thesis_reality,evidence:r.thesis_evidence,bearCase:r.thesis_bear_case,invalidation:r.thesis_invalidation,thesisConfidence:r.thesis_confidence})));
      setSS("synced");
    } catch(e){ setSS("error"); }
    // Reviews load SEPARATELY and non-blocking: the tradeiq_reviews table may not
    // exist yet (run the migration), and a failure here must not break holdings/journal.
    try {
      const { data:rv } = await db.from("tradeiq_reviews").select("*");
      if (rv && rv.length) setReviews(prev=>{ const merged={...prev}; rv.forEach(r=>{merged[r.trade_id]=r;}); return merged; });
    } catch {}
  };

  const f=(n,d=2)=>Number(n).toFixed(d);
  const pc=v=>v>=0?C.green:C.red;
  const ps=v=>v>=0?"+":"";
  // A ticker is "valid" only if it came from a selected search result.
  const hValid=!!(newH.meta&&newH.meta.symbol===newH.ticker&&newH.avgCost);
  const tValid=!!(newT.meta&&newT.meta.symbol===newT.ticker&&newT.entry&&thesisComplete(newT));
  const totalVal  = holdings.reduce((s,h)=>s+h.shares*h.price,0);
  const totalCost = holdings.reduce((s,h)=>s+h.shares*h.avgCost,0);
  const totalPnL  = totalVal-totalCost;
  const pnlPct    = totalCost>0?(totalPnL/totalCost)*100:0;

  // ── DB ops ──
  const addHolding = async()=>{
    if(!hValid) return; setSS("syncing"); // hValid ⇒ ticker came from a selected search result
    const m=newH.meta;
    const {data,error}=await db.from("tradeiq_holdings").insert({user_id:userId,ticker:m.symbol,name:newH.name||m.name,exchange:m.exchange,currency:m.currency,shares:+newH.shares||0,avg_cost:+newH.avgCost,price:+(newH.price||newH.avgCost),sector:newH.sector}).select().single();
    if(!error&&data){setHoldings(p=>[...p,{id:data.id,ticker:data.ticker,name:data.name,exchange:data.exchange,currency:data.currency,shares:+data.shares,avgCost:+data.avg_cost,price:+data.price,sector:data.sector}]);setNewH({ticker:"",name:"",shares:"",avgCost:"",price:"",sector:"Tech",meta:null});setShowAddH(false);}
    setSS(error?"error":"synced");
  };
  const deleteHolding=async(id)=>{setSS("syncing");await db.from("tradeiq_holdings").delete().eq("id",id);setHoldings(p=>p.filter(h=>h.id!==id));setSS("synced");};
  const updatePrice=async(id,price)=>{const p=parseFloat(price);if(isNaN(p))return;setSS("syncing");await db.from("tradeiq_holdings").update({price:p,updated_at:new Date().toISOString()}).eq("id",id);setHoldings(prev=>prev.map(h=>h.id===id?{...h,price:p}:h));setSS("synced");};
  const addTrade=async()=>{
    if(!tValid)return;setSS("syncing"); // tValid ⇒ ticker came from a selected search result
    const m=newT.meta;
    const {data,error}=await db.from("tradeiq_journal").insert({user_id:userId,ticker:m.symbol,name:m.name,exchange:m.exchange,currency:m.currency,sector:m.sector||null,industry:m.industry||null,side:newT.side,entry_price:+newT.entry||null,shares:+newT.shares||null,stop_loss:+newT.stop||null,target:+newT.target||null,strategy:newT.strategy,notes:newT.notes,trade_date:newT.date,closed:false,thesis_type:newT.thesisType,thesis_expectations:newT.expectations.trim(),thesis_reality:newT.reality.trim(),thesis_evidence:newT.evidence.trim()||null,thesis_bear_case:newT.bearCase.trim(),thesis_invalidation:newT.invalidation.trim(),thesis_confidence:+newT.confidence}).select().single();
    if(!error&&data){setJournal(p=>[{id:data.id,ticker:data.ticker,name:data.name,exchange:data.exchange,currency:data.currency,sector:data.sector,industry:data.industry,side:data.side,entry:String(data.entry_price||""),exit:null,shares:String(data.shares||""),stop:String(data.stop_loss||""),target:String(data.target||""),strategy:data.strategy,notes:data.notes,date:data.trade_date,closed:false,closedAt:null,thesisType:data.thesis_type,expectations:data.thesis_expectations,reality:data.thesis_reality,evidence:data.thesis_evidence,bearCase:data.thesis_bear_case,invalidation:data.thesis_invalidation,thesisConfidence:data.thesis_confidence},...p]);setNewT({ticker:"",side:"BUY",entry:"",stop:"",target:"",shares:"",strategy:"EMA Pullback",notes:"",date:new Date().toISOString().split("T")[0],meta:null,thesisType:"",expectations:"",reality:"",evidence:"",bearCase:"",invalidation:"",confidence:60});setShowAddT(false);}
    setSS(error?"error":"synced");
  };
  const closeTrade=async(id,exitPrice)=>{const ep=parseFloat(exitPrice);if(isNaN(ep))return;setSS("syncing");const closedAt=new Date().toISOString();await db.from("tradeiq_journal").update({exit_price:ep,closed:true,closed_at:closedAt}).eq("id",id);setJournal(p=>p.map(t=>t.id===id?{...t,exit:String(ep),closed:true,closedAt}:t));setSS("synced");};

  // Generate a structured AI review for a closed trade, persist it (Supabase with
  // localStorage fallback), and attach it by trade_id. The highest-value learning
  // moment in the system → a permanent artifact, not a throwaway summary.
  const reviewTrade=async(t)=>{
    if(!t||reviewing)return; setReviewing(t.id);
    try{
      const realizedR=rMultipleOf(t);
      const payload={ticker:t.ticker,name:t.name,currency:t.currency,sector:t.sector||null,side:t.side,entry:+t.entry||null,exit:+t.exit||null,stop:+t.stop||null,target:+t.target||null,shares:+t.shares||null,strategy:t.strategy,thesis_type:t.thesisType||null,market_expectations:t.expectations||null,reality:t.reality||null,evidence:t.evidence||null,bear_case:t.bearCase||null,invalidation:t.invalidation||null,confidence:t.thesisConfidence??null,notes:t.notes||"(none logged)",date:t.date,realizedR:realizedR==null?null:+realizedR.toFixed(2),pnl:+pnlOf(t).toFixed(2)};
      let token=null; if(SUPABASE_READY){try{const {data}=await db.auth.getSession();token=data.session?.access_token??null;}catch{}}
      const res=await fetch("/api/review",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({trade:payload,context:`Capital ₹5,000, max 2% risk/trade, min 1:2 R:R. Market view: ${marketTab==="us"?"US (NYSE/NASDAQ)":"India NSE"}.`})});
      const data=await res.json();
      if(data.error)throw new Error(data.error);
      const norm=normalizeReview(data.review, realizedR);
      const row={trade_id:t.id,user_id:userId,thesis_score:norm.thesis_score,execution_score:norm.execution_score,risk_score:norm.risk_score,regime_score:norm.regime_score,outcome_score:norm.outcome_score,overall_grade:norm.overall_grade,verdict:norm.verdict,review_text:norm.review_text,strengths:norm.strengths,mistakes:norm.mistakes,lessons:norm.lessons,tags:norm.tags,ai_thesis_verdict:norm.ai_thesis_verdict,user_thesis_verdict:null,expectations_changed:norm.expectations_changed,bear_case_realized:norm.bear_case_realized,thesis_reason:norm.thesis_reason};
      let stored=row;
      try{ const {data:saved,error}=await db.from("tradeiq_reviews").upsert(row,{onConflict:"trade_id"}).select().single(); if(!error&&saved)stored=saved; }catch{}
      setReviews(p=>({...p,[t.id]:stored}));
    }catch(e){ setReviews(p=>({...p,[t.id]:{error:e.message}})); }
    setReviewing(null);
  };
  // User confirms or overrides the AI's thesis verdict (P2.75). final = user > AI.
  const setThesisVerdict=async(tradeId,verdict)=>{
    setReviews(p=>{const cur=p[tradeId];if(!cur||cur.error)return p;return {...p,[tradeId]:{...cur,user_thesis_verdict:verdict}};});
    try{ await db.from("tradeiq_reviews").update({user_thesis_verdict:verdict}).eq("trade_id",tradeId); }catch{}
  };
  const deleteTrade=async(id)=>{setSS("syncing");await db.from("tradeiq_journal").delete().eq("id",id);setJournal(p=>p.filter(t=>t.id!==id));setSS("synced");};

  // ── AI — calls /api/chat (Groq key stays secret on Vercel) ──
  const systemPrompt=useCallback(()=>{
    const liveOf=(t)=>liveData[t]?.price;
    const holdLines=holdings.length===0?"Empty":holdings.map(h=>{
      const sym=symbolFor(h.currency);const live=liveOf(h.ticker);const now=live??h.price;
      const pnl=(now-h.avgCost)*h.shares;
      return `  ${h.ticker}: ${h.shares} sh · avg ${sym}${h.avgCost} · now ${sym}${f(now)}${live?" (live)":""} · P&L ${ps(pnl)}${sym}${f(Math.abs(pnl))}`;
    }).join("\n");
    const wl=(list)=>list.filter(w=>w.price!=null).slice(0,8).map(w=>{const s=symbolFor(w.currency);return `${shortName(w.ticker)} ${s}${w.price?.toFixed(decimalsFor(w.currency))} RSI:${w.rsi}${w.ema20?` EMA20:${s}${w.ema20}`:""}`;}).join(", ");
    // Real performance from the journal (R-multiple based) — never fabricated.
    const perf=performance(journal);
    const r=(v)=>`${v>=0?"+":""}${v.toFixed(2)}R`;
    const pf=(v)=>v===Infinity?"∞":v.toFixed(2);
    const perfLine=perf.trades===0?"No closed trades yet — insufficient history for Personal-Alpha conclusions.":`${perf.trades} closed · win ${(perf.winRate*100).toFixed(0)}% · expectancy ${r(perf.expectancyR)}/trade · profit factor ${pf(perf.profitFactor)} · payoff ${perf.payoff.toFixed(2)}× · max DD ${perf.maxDrawdownR.toFixed(2)}R (${perf.withRisk}/${perf.trades} had a stop)`;
    const moneyLine=byCurrency(journal).map(b=>`${b.symbol}${b.net.toFixed(0)} net (avg win ${b.symbol}${b.avgWin.toFixed(0)}, avg loss ${b.symbol}${b.avgLoss.toFixed(0)}, ${b.wins}W/${b.losses}L)`).join(" · ")||"—";
    const stratLine=byStrategy(journal).map(s=>`${s.strategy}: ${(s.winRate*100).toFixed(0)}% win ${r(s.expectancyR)} (${s.trades})`).join(" · ")||"—";
    const secCount={};holdings.forEach(h=>{secCount[h.sector]=(secCount[h.sector]||0)+1;});
    const conc=Object.entries(secCount).filter(([,n])=>n>=2).map(([s,n])=>`${s}×${n}`).join(", ");
    return `You are TradeIQ — the intelligence layer of the user's personal investing & decision OS. Operate as a hybrid of Joel Litman, Charlie Munger, Warren Buffett, Howard Marks, Michael Mauboussin and Ray Dalio: evidence-driven, probabilistic, skeptical, intellectually honest. You optimize for COMPOUNDING and decision quality — not activity, confidence, or excitement.

REASONING ORDER — never start from price: Reality → Expectations → Business Quality → Market Regime → Price. The edge is the gap where Market Expectations ≠ Reality; size opportunity by the size of that gap.

DATA HONESTY (highest priority): The ONLY hard data you have is the live prices/RSI/EMA, portfolio and journal stats below. You do NOT have live SEC filings, earnings calls, guidance, insider/hiring/freight/app/alt-data, or news. NEVER invent specific figures, dates, growth rates or quotes. If a claim needs data you don't hold, label it ASSUMPTION or SPECULATION, or tell the user to supply the primary source. "I don't have that data" and "this is unknowable right now" are correct, expected answers.

LABEL EVERY CLAIM, never blended: [FACT] verified · [ASSUMPTION] reasonable but unverified · [OPINION] interpretation · [SPECULATION] low-confidence.

THESIS (when assessing any stock): Thesis (1 sentence) · Why it could work · Why it could fail · Evidence for · Evidence against · Critical assumptions · Invalidating conditions · Confidence 0-100% · Evidence strength 0-100% · Status: Strengthening/Stable/Weakening/Broken. Quote confidence honestly; low confidence is a valid output.

RISK: every idea ⇒ worst-case scenario + rough probability + impact. Flag hidden concentration (e.g. NVDA+AMD+TSM+SMCI = ONE AI/semis bet). Capital ₹5,000; ≤2% risk/trade; always a stop; min 1:2 R:R; no leverage/options; position = (capital×2%)÷(entry−stop).

CURRENCY: quote each stock in its OWN symbol (₹ Indian listings, $ US). NEVER add or compare ₹ and $ as one number. Performance is in R-multiples (currency-agnostic); money figures stay per-currency.

PROCESS > OUTCOME: judge trades on thesis/execution/risk/regime quality, not P&L. Distinguish good-trade/bad-outcome from bad-trade/good-outcome. Challenge the user's assumptions; do not seek agreement; do not inflate confidence. Truth>Comfort, Evidence>Narrative, Probability>Certainty, Process>Outcome, Compounding>Activity.

=== LIVE ACCOUNT DATA (the only ground truth you have) ===
PORTFOLIO (${holdings.length} holdings):
${holdLines}${conc?`\nCONCENTRATION: ${conc} — treat same-sector/theme positions as a single correlated bet.`:""}

LIVE PRICES (use these EXACT prices for any entry/stop/target; if a stock isn't here, ask for its price):
US ($): ${wl(US_WATCHLIST)||"loading"}
INDIA (₹): ${wl(INDIA_WATCHLIST)||"loading"}

PERFORMANCE (closed trades, R-multiple based — this is the user's real track record):
${perfLine}
Money by currency: ${moneyLine}
By strategy: ${stratLine}

Currently viewing: ${marketTab==="us"?"US NYSE/NASDAQ":"India NSE"}. Be specific, show the math, stay concise.`;
  },[holdings,journal,totalVal,liveData,marketTab]);

  const sendMsg=async()=>{
    if(!chatInput.trim()||aiLoading)return;
    const userMsg={role:"user",content:chatInput.trim()};
    setMsgs(p=>[...p,userMsg]);setChatInput("");setAiLoading(true);
    try{
      // Attach the Supabase session token so /api/chat can verify the caller
      let token=null;
      if(SUPABASE_READY){ try{ const {data}=await db.auth.getSession(); token=data.session?.access_token??null; }catch{} }
      // Calls Vercel serverless function — Groq key never leaves server
      const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({messages:[...msgs,userMsg].slice(-12).map(m=>({role:m.role,content:m.content})),systemPrompt:systemPrompt()})});
      const data=await res.json();
      if(data.error)throw new Error(data.error);
      setMsgs(p=>[...p,{role:"assistant",content:data.reply}]);
    }catch(e){setMsgs(p=>[...p,{role:"assistant",content:`⚠️ ${e.message}`}]);}
    setAiLoading(false);
  };

  const quickAsk=(q)=>{setChatInput(q);setTab("ai");setTimeout(()=>document.getElementById("tiq-in")?.focus(),150);};

  // stopPrice/targetPrice are kept NUMERIC (no currency symbol baked in) so the
  // "Log" button can feed them straight into the journal's number fields. The
  // currency symbol (curr) is applied only at display time.
  const scanResults=WATCHLIST.filter(w=>w.price&&w.ema20&&w.ema200).map(w=>{const nearEma=Math.abs(w.price-w.ema20)/w.ema20<0.03;const sig=(nearEma&&w.price>w.ema200&&w.rsi>=38&&w.rsi<=62)?"EMA PULLBACK":(w.price>w.ema200&&w.rsi>60&&w.rsi<75)?"BREAKOUT WATCH":"WAIT";const sigC=sig==="EMA PULLBACK"?C.green:sig==="BREAKOUT WATCH"?C.gold:C.muted;const curr=symbolFor(w.currency);const dp=decimalsFor(w.currency);const cap=w.currency==="INR"?(totalVal||59)*84:(totalVal||59);return{...w,signal:sig,sigColor:sigC,curr,posSize:f(cap*0.02/(w.price*0.025),3),stopPrice:f(w.price*0.975,dp),targetPrice:f(w.price*1.06,dp)};}).sort((a,b)=>(b.signal==="EMA PULLBACK"?1:0)-(a.signal==="EMA PULLBACK"?1:0));

  const syncLabel={idle:"",syncing:"⟳ Syncing",synced:"✓ Synced",error:"⚠ Error"};
  const syncColor={idle:C.muted,syncing:C.gold,synced:C.green,error:C.red};
  const TABS=[{id:"perf",l:"🏆 Performance"},{id:"dash",l:"📊 Dashboard"},{id:"ai",l:"🤖 AI Advisor"},{id:"scanner",l:"🔍 Scanner"},{id:"chart",l:"📈 Charts"},{id:"strategies",l:"⚡ Strategies"},{id:"journal",l:"📓 Journal"},{id:"learn",l:"📚 Learn"}];

  // ── DASHBOARD ──
  const Dashboard=()=>(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:14}}>
        <StatCard label="Portfolio Value" value={holdings.length===0?"₹0":`$${f(totalVal)}`} sub={holdings.length===0?"Add holdings below":`₹${f(totalVal*84,0)}`} color={C.accent}/>
        <StatCard label="Total P&L" value={holdings.length===0?"—":`${ps(totalPnL)}$${f(Math.abs(totalPnL))}`} sub={holdings.length===0?"No positions yet":`${ps(pnlPct)}${f(pnlPct)}%`} color={holdings.length===0?C.muted:pc(totalPnL)}/>
        <StatCard label="Max Risk/Trade" value="₹100" sub="2% of ₹5,000" color={C.gold}/>
        <StatCard label="Trades Logged" value={journal.length} sub={`${journal.filter(t=>t.closed).length} closed`} color={C.purple}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <CT>Holdings</CT><Btn small color={C.accent} onClick={()=>setShowAddH(p=>!p)}>+ Add</Btn>
          </div>
          {showAddH&&(<div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:6,padding:12,marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <TickerSearch theme={C} token={authToken} label="Ticker" value={newH.ticker} market={marketTab} onChange={(t)=>setNewH(p=>({...p,ticker:t,meta:p.meta&&p.meta.symbol===t?p.meta:null}))} onSelect={(r)=>setNewH(p=>({...p,ticker:r.symbol,name:r.name||p.name,meta:r}))} placeholder="Search NVIDIA, Reliance…"/>
              <Inp label="Name" value={newH.name} onChange={e=>setNewH(p=>({...p,name:e.target.value}))} placeholder="NVIDIA Corp"/>
              <Inp label="Shares" type="number" value={newH.shares} onChange={e=>setNewH(p=>({...p,shares:e.target.value}))} placeholder="0.5"/>
              <Inp label={`Avg Cost ${symbolFor(newH.meta?.currency)}`} type="number" value={newH.avgCost} onChange={e=>setNewH(p=>({...p,avgCost:e.target.value}))} placeholder={newH.meta?.currency==="INR"?"2750.00":"205.50"}/>
              <Inp label={`Current Price ${symbolFor(newH.meta?.currency)}`} type="number" value={newH.price} onChange={e=>setNewH(p=>({...p,price:e.target.value}))} placeholder={newH.meta?.currency==="INR"?"2785.00":"207.10"}/>
              <Sel label="Sector" value={newH.sector} onChange={e=>setNewH(p=>({...p,sector:e.target.value}))} options={["Tech","Finance","Healthcare","Energy","Consumer","Industrial"]}/>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}><Btn solid color={hValid?C.accent:C.muted} onClick={addHolding}>{syncStatus==="syncing"?<Spinner/>:"Save"}</Btn><Btn small color={C.muted} onClick={()=>{setShowAddH(false);setNewH(p=>({...p,meta:null}));}}>Cancel</Btn>{newH.ticker&&!newH.meta&&<span style={{fontSize:9,color:C.gold}}>↑ Pick a ticker from the dropdown</span>}{newH.meta&&<span style={{fontSize:9,color:C.muted}}>{newH.meta.name} · {newH.meta.exchange} · {newH.meta.currency}</span>}</div>
          </div>)}
          {holdings.length===0?(<div style={{textAlign:"center",padding:"28px 10px",color:C.muted}}><div style={{fontSize:26,marginBottom:8}}>📂</div><div style={{fontFamily:C.display,fontWeight:700,color:C.text,marginBottom:5}}>No holdings yet</div><div style={{fontSize:11,lineHeight:1.6}}>Add what you own on Vested.<br/>Syncs to all your devices instantly.</div></div>):(
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{["Ticker","Shares","Avg","Now","P&L","Update",""].map(h=>(<th key={h} style={{textAlign:"left",padding:"6px 5px",fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.muted,borderBottom:`1px solid ${C.border}`}}>{h}</th>))}</tr></thead>
          <tbody>{holdings.map(h=>{const pnl=(h.price-h.avgCost)*h.shares;const pp=((h.price-h.avgCost)/h.avgCost)*100;const sp=WATCHLIST.find(w=>w.ticker===h.ticker)?.spark;const sym=symbolFor(h.currency);return(
            <tr key={h.id} className="tiq-row" style={{cursor:"pointer"}} onClick={()=>quickAsk(`Analyse my ${h.ticker}: ${h.shares} shares avg ${sym}${h.avgCost} now ${sym}${h.price}. Hold, add, or sell?`)}>
              <td style={{padding:"8px 5px"}}><div style={{fontFamily:C.display,fontWeight:700}}>{h.ticker}</div><div style={{fontSize:9,color:C.muted}}>{h.sector}</div></td>
              <td style={{padding:"8px 5px"}}>{h.shares}</td>
              <td style={{padding:"8px 5px",color:C.muted}}>{sym}{f(h.avgCost)}</td>
              <td style={{padding:"8px 5px"}}>{sym}{f(h.price)}</td>
              <td style={{padding:"8px 5px"}}><div style={{color:pc(pnl),fontWeight:600}}>{ps(pnl)}{sym}{f(Math.abs(pnl))}</div><div style={{fontSize:9,color:pc(pp)}}>{ps(pp)}{f(pp)}%</div></td>
              <td style={{padding:"8px 5px"}} onClick={e=>e.stopPropagation()}><input className="tiq-input" type="number" defaultValue={h.price} style={{background:C.s3,border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 6px",color:C.text,fontFamily:C.mono,fontSize:10,width:75}} onBlur={e=>updatePrice(h.id,e.target.value)} onKeyDown={e=>e.key==="Enter"&&updatePrice(h.id,e.target.value)}/></td>
              <td style={{padding:"8px 5px"}} onClick={e=>{e.stopPropagation();deleteHolding(h.id)}}><span style={{color:C.red,cursor:"pointer"}}>✕</span></td>
            </tr>);})}</tbody></table>)}
          <div style={{fontSize:9,color:C.muted,marginTop:8}}>↑ Click row → AI. Update price field → saves everywhere.</div>
        </Card>
        <Card>
          <MarketHeader marketTab={marketTab} setMarketTab={setMarketTab} priceStatus={priceStatus} fetchPrices={fetchPrices} lastUpdated={lastUpdated}/>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{["Stock","Price","RSI","Signal",""].map(h=>(<th key={h} style={{textAlign:"left",padding:"6px 5px",fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.muted,borderBottom:`1px solid ${C.border}`}}>{h}</th>))}</tr></thead>
          <tbody>{WATCHLIST.slice(0,8).map(w=>{const sc=scanResults.find(s=>s.ticker===w.ticker);const sym=shortName(w.ticker);const curr=symbolFor(w.currency);const dp=decimalsFor(w.currency);const pending=w.price==null;return(
            <tr key={w.ticker} className="tiq-row" style={{cursor:"pointer"}} onClick={()=>{if(!pending){setChartTicker(w.ticker);setTab('chart');}}}>
              <td style={{padding:"7px 5px"}}><div style={{fontFamily:C.display,fontWeight:700,fontSize:12}}>{sym}{w.custom&&<span style={{fontSize:8,color:C.accent,marginLeft:4,verticalAlign:"middle"}}>★</span>}</div><div style={{fontSize:9,color:w.chg>=0?C.green:C.red}}>{pending?"":`${ps(w.chg)}${w.chg}%`}</div></td>
              <td style={{padding:"7px 5px",fontWeight:600}}>{pending?<span style={{color:C.muted,fontSize:9}}>fetching…</span>:`${curr}${w.price.toFixed(dp)}`}</td>
              <td style={{padding:"7px 5px"}}>{pending?<span style={{color:C.muted}}>—</span>:<RSIMeter value={w.rsi}/>}</td>
              <td style={{padding:"7px 5px"}}><Tag c={sc?.sigColor||C.muted}>{sc?.signal||"WAIT"}</Tag></td>
              <td style={{padding:"7px 5px"}} onClick={w.custom?(e=>{e.stopPropagation();removeCustomTicker(w.ticker);}):undefined}>{w.custom?<span title="Remove" style={{color:C.red,cursor:"pointer",fontSize:12}}>✕</span>:<Sparkline data={w.spark} color={w.chg>=0?C.green:C.red} w={55} h={22}/>}</td>
            </tr>);})}</tbody></table>
          <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>{showAddTicker?(<div><div style={{display:"flex",gap:8,alignItems:"flex-start"}}><div style={{flex:1}}><TickerSearch theme={C} token={authToken} value={addTickerInput} market={marketTab} onChange={setAddTickerInput} onSelect={(r)=>addCustomTicker(r)} placeholder={marketTab==="india"?"Search e.g. Reliance, Wipro…":"Search e.g. Coinbase, COIN…"}/></div><Btn small color={C.muted} onClick={()=>{setShowAddTicker(false);setAddTickerInput("");}}>✕</Btn></div><div style={{fontSize:9,color:C.muted,marginTop:5}}>Search a name or symbol, then pick from the list to add it.</div></div>):(<button onClick={()=>setShowAddTicker(true)} style={{fontSize:10,color:C.muted,background:"none",border:"none",cursor:"pointer",fontFamily:C.mono}}>+ Add {marketTab==="india"?"Indian":"US"} stock</button>)}</div>
        </Card>
      </div>
      <Card><CT>Quick AI Actions</CT><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{[["Analyse my full portfolio and give me a risk report",C.accent],["Best trade setup from my watchlist today?",C.accent],["How do I grow ₹5,000 to ₹8,000 safely in 3 months?",C.green],["Position size: TSLA entry $248 stop $238",C.gold],["Build a new strategy for volatile tech stocks",C.purple],["Should I buy NVDA now or wait for a pullback?",C.blue]].map(([q,col])=>(<button key={q} className="qbtn tiq-btn" onClick={()=>quickAsk(q)} style={{background:col+"12",border:`1px solid ${col}25`,borderRadius:5,color:col,fontFamily:C.mono,fontSize:10,padding:"6px 11px"}}>{q}</button>))}</div></Card>
    </div>
  );

  // ── AI CHAT ──
  const AIChat=()=>(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 175px)",minHeight:400}}>
      <div style={{background:C.green+"12",border:`1px solid ${C.green}25`,borderRadius:6,padding:"9px 14px",marginBottom:12,fontSize:11,color:C.green}}>
        🔒 AI is powered by Groq (Llama 3.3 70B) · Your API key is stored securely on the server — never visible in your browser
      </div>
      <div style={{flex:1,overflowY:"auto",paddingRight:4,marginBottom:10}}>
        {msgs.map((m,i)=>(<div key={i} className="msg-in" style={{display:"flex",gap:10,marginBottom:12,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}>
          <div style={{width:27,height:27,borderRadius:6,background:m.role==="user"?C.blue+"25":C.accent+"18",border:`1px solid ${m.role==="user"?C.blue:C.accent}30`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.display,fontWeight:700,fontSize:11,color:m.role==="user"?C.blue:C.accent,flexShrink:0}}>{m.role==="user"?"U":"AI"}</div>
          <div style={{background:m.role==="user"?C.blue+"18":C.s2,border:`1px solid ${m.role==="user"?C.blue+"30":C.border}`,borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"10px 14px",maxWidth:"80%",fontSize:12,lineHeight:1.7,color:C.text,whiteSpace:"pre-wrap",fontFamily:C.mono}}>{m.content}</div>
        </div>))}
        {aiLoading&&(<div style={{display:"flex",gap:10,alignItems:"flex-start"}}><div style={{width:27,height:27,borderRadius:6,background:C.accent+"18",border:`1px solid ${C.accent}30`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.display,fontWeight:700,fontSize:11,color:C.accent}}>AI</div><div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:"12px 12px 12px 4px",padding:"12px 14px"}}><Dots/></div></div>)}
        <div ref={chatEnd}/>
      </div>
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <textarea
            id="tiq-in"
            placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
            value={chatInput}
            onChange={e=>{
              setChatInput(e.target.value);
              e.target.style.height="auto";
              e.target.style.height=Math.min(e.target.scrollHeight,160)+"px";
            }}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();}}}
            autoComplete="off"
            spellCheck={false}
            rows={1}
            style={{
              flex:1,background:C.s2,border:`1px solid ${C.border}`,
              borderRadius:6,padding:"10px 13px",color:C.text,
              fontFamily:C.mono,fontSize:13,lineHeight:1.6,
              resize:"none",outline:"none",minHeight:44,maxHeight:160,
              overflowY:"auto",boxSizing:"border-box",display:"block",
              width:"100%",transition:"border-color 0.15s",
            }}
            onFocus={e=>{e.target.style.borderColor=C.accent+"80";}}
            onBlur={e=>{e.target.style.borderColor=C.border;}}
          />
          <button
            onClick={sendMsg}
            disabled={aiLoading||!chatInput.trim()}
            style={{
              flexShrink:0,height:44,padding:"0 18px",
              background:aiLoading||!chatInput.trim()?C.muted+"30":C.accent,
              border:"none",borderRadius:6,
              color:aiLoading||!chatInput.trim()?C.muted:C.bg,
              fontFamily:C.display,fontWeight:800,fontSize:12,
              letterSpacing:"0.06em",textTransform:"uppercase",
              cursor:aiLoading||!chatInput.trim()?"not-allowed":"pointer",
              transition:"all 0.15s",
            }}
          >{aiLoading?<Spinner/>:"Send"}</button>
        </div>
        <div style={{fontSize:9,color:C.muted,marginTop:5,display:"flex",justifyContent:"space-between"}}>
          <span>↵ Enter to send &nbsp;·&nbsp; Shift+↵ new line</span>
          <span>Llama 3.3 70B · Not financial advice</span>
        </div>
      </div>
    </div>
  );

  // ── SCANNER ──
  const Scanner=()=>(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontFamily:C.display,fontWeight:700,fontSize:15,marginBottom:2}}>Strategy Scanner</div><div style={{fontSize:11,color:C.muted}}>Screening {marketTab==="us"?"US (NYSE/NASDAQ)":"Indian (NSE)"} — {WATCHLIST.length} stocks</div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Btn small color={marketTab==="us"?C.blue:C.muted} onClick={()=>setMarketTab("us")}>🇺🇸 US</Btn>
        <Btn small color={marketTab==="india"?C.gold:C.muted} onClick={()=>setMarketTab("india")}>🇮🇳 India</Btn>
        <Btn color={C.gold} onClick={()=>quickAsk(`Scan ${marketTab==="india"?"Indian NSE":"US"} watchlist: ${WATCHLIST.map(w=>`${shortName(w.ticker)} ${symbolFor(w.currency)}${w.price} RSI:${w.rsi}`).join(", ")}. Best strategy, entry, stop, target, position size for ₹5,000 each.`)}>AI Deep Scan →</Btn>
      </div>
    </div>
    <Card><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{["Stock","Price","EMA20","EMA200","RSI","Signal","Stop","Target","Pos Size"].map(h=>(<th key={h} style={{textAlign:"left",padding:"7px 6px",fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.muted,borderBottom:`1px solid ${C.border}`}}>{h}</th>))}</tr></thead>
    <tbody>{scanResults.map(w=>(<tr key={w.ticker} className="tiq-row" style={{cursor:"pointer"}} onClick={()=>quickAsk(`Full analysis: ${w.ticker} ${w.curr}${w.price} RSI ${w.rsi} EMA20 ${w.curr}${w.ema20} EMA200 ${w.curr}${w.ema200}. Signal: ${w.signal}. Exact entry, stop, target, shares ${w.currency==="INR"?"for ₹5,000":"in $ (capital ₹5,000 ≈ $60)"}.`)}>
      <td style={{padding:"9px 6px"}}><div style={{fontFamily:C.display,fontWeight:700}}>{w.ticker}</div><div style={{fontSize:9,color:C.muted}}>{w.name}</div></td>
      <td style={{padding:"9px 6px"}}><div style={{fontWeight:600}}>{w.curr}{w.price}</div><div style={{fontSize:9,color:w.chg>=0?C.green:C.red}}>{ps(w.chg)}{w.chg}%</div></td>
      <td style={{padding:"9px 6px"}}><div>{w.curr}{w.ema20}</div><div style={{fontSize:9,color:Math.abs(w.price-w.ema20)/w.ema20<0.025?C.green:C.muted}}>{Math.abs(w.price-w.ema20)/w.ema20<0.025?"Near ✓":`${f(((w.price-w.ema20)/w.ema20)*100)}%`}</div></td>
      <td style={{padding:"9px 6px"}}><div>{w.curr}{w.ema200}</div><div style={{fontSize:9,color:w.price>w.ema200?C.green:C.red}}>{w.price>w.ema200?"Above ✓":"Below ✗"}</div></td>
      <td style={{padding:"9px 6px"}}><RSIMeter value={w.rsi}/></td>
      <td style={{padding:"9px 6px"}}><Tag c={w.sigColor}>{w.signal}</Tag></td>
      <td style={{padding:"9px 6px",color:C.red,fontSize:10}}>{w.curr}{w.stopPrice}</td>
      <td style={{padding:"9px 6px",color:C.green,fontSize:10}}>{w.curr}{w.targetPrice}</td>
      <td style={{padding:"9px 6px"}}>{w.signal!=="WAIT"?(<div><div style={{color:C.accent,fontSize:10,fontWeight:600,marginBottom:3}}>{w.posSize} sh</div><Btn small color={C.accent} onClick={e=>{e.stopPropagation();setNewT(p=>({...p,ticker:w.ticker,entry:String(w.price),stop:w.stopPrice,target:w.targetPrice}));setTab("journal");setShowAddT(true);}}>Log</Btn></div>):<span style={{color:C.muted,fontSize:10}}>—</span>}</td>
    </tr>))}</tbody></table></Card>
    <Card><CT>Position Size Calculator</CT>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div style={{width:130}}><Inp label="Entry $" type="number" value={calcE} onChange={e=>setCalcE(e.target.value)} placeholder="205.50"/></div>
        <div style={{width:130}}><Inp label="Stop-Loss $" type="number" value={calcS} onChange={e=>setCalcS(e.target.value)} placeholder="198.00"/></div>
        <div style={{width:90}}><Inp label="Risk %" type="number" value={calcR} onChange={e=>setCalcR(e.target.value)} placeholder="2"/></div>
        <Btn solid color={C.accent} onClick={()=>{const e=+calcE,s=+calcS,r=+calcR/100||0.02;if(!e||!s||e<=s){setCalcRes(null);return;}const cap=totalVal||59;const rps=e-s;const dr=cap*r;const sh=dr/rps;setCalcRes({shares:f(sh,3),cost:f(sh*e),loss:f(dr),rps:f(rps),t2:f(e+rps*2),t3:f(e+rps*3)});}}>Calculate</Btn>
      </div>
      {calcRes&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginTop:14}}>{[["Shares",calcRes.shares,C.accent],["Cost",`$${calcRes.cost}`,C.text],["Max Loss",`$${calcRes.loss}`,C.red],["Risk/Share",`$${calcRes.rps}`,C.muted],["Target 1:2",`$${calcRes.t2}`,C.green],["Target 1:3",`$${calcRes.t3}`,C.green]].map(([l,v,c])=>(<div key={l} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:5,padding:10}}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3}}>{l}</div><div style={{fontFamily:C.display,fontWeight:700,color:c,fontSize:14}}>{v}</div></div>))}</div>)}
    </Card>
  </div>);

  // ── STRATEGIES ──
  const StrategiesTab=()=>(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:11,color:C.muted}}>Click any strategy for an AI deep-dive.</div>
      <Btn color={C.gold} onClick={()=>quickAsk("Design a new trading strategy for US tech stocks June 2026. Give: name, type, exact entry/exit rules, stop method, win rate estimate, best market conditions, and 3 example setups.")}>+ Build New Strategy</Btn>
    </div>
    {STRATEGIES.map(s=>(<Card key={s.id} style={{borderLeft:`3px solid ${s.color}`,cursor:"pointer"}} onClick={()=>quickAsk(`Deep dive on ${s.name}: exact entry/exit rules, best market conditions, common mistakes, 3 current stock examples, improvement tips for a ₹5,000 beginner.`)}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><span style={{fontFamily:C.display,fontWeight:800,fontSize:15}}>{s.name}</span><Tag c={s.color}>{s.type}</Tag></div><div style={{fontSize:11,color:C.muted,lineHeight:1.6,maxWidth:500}}>{s.rules}</div></div>
        <div style={{display:"flex",gap:16}}>{[["Win Rate",`${s.winRate}%`,s.color],["R:R",s.rr,C.text]].map(([l,v,c])=>(<div key={l} style={{textAlign:"center"}}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3}}>{l}</div><div style={{fontFamily:C.display,fontWeight:700,color:c,fontSize:15}}>{v}</div></div>))}</div>
      </div>
      <div style={{marginTop:10,height:3,background:C.dim,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${s.winRate}%`,background:s.color,borderRadius:2}}/></div>
    </Card>))}
    <Card><CT>EMA Pullback — Algorithm Logic</CT>
      <pre style={{fontSize:10,color:C.green,lineHeight:1.8,overflowX:"auto",background:C.s2,padding:14,borderRadius:6}}>{`FUNCTION ema_pullback_scan(ticker, data, capital=5000):
  price    = data.close[-1]
  ema_20   = calc_ema(data.close, 20)
  ema_200  = calc_ema(data.close, 200)
  rsi      = calc_rsi(data.close, 14)

  IF price < ema_200:                      RETURN "NO TRADE — downtrend"
  IF abs(price-ema_20)/ema_20 > 0.025:    RETURN "NO TRADE — far from EMA"
  IF NOT (38 <= rsi <= 60):               RETURN "NO TRADE — RSI out of range"
  IF data.close[-1] <= data.open[-1]:     RETURN "WAIT — need bullish candle"

  stop     = min(data.low[-3:])
  risk     = price - stop
  target   = price + (risk * 2.5)         # 1:2.5 R:R
  shares   = (capital * 0.02) / risk      # 2% risk rule

  RETURN { signal:"BUY", entry:price, stop, target, shares }`}</pre>
    </Card>
  </div>);

  // ── JOURNAL ──
  const JournalTab=()=>(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div><div style={{fontFamily:C.display,fontWeight:700,fontSize:15}}>Trade Journal</div><div style={{fontSize:11,color:C.muted}}>Every trade logged & synced across all devices.</div></div>
      <Btn solid color={C.accent} onClick={()=>setShowAddT(p=>!p)}>{showAddT?"✕ Cancel":"+ Log Trade"}</Btn>
    </div>
    {showAddT&&(<Card glow>
      <CT>New Trade Entry</CT>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:10}}>
        <TickerSearch theme={C} token={authToken} label="Ticker" value={newT.ticker} market={marketTab} onChange={(t)=>setNewT(p=>({...p,ticker:t,meta:p.meta&&p.meta.symbol===t?p.meta:null}))} onSelect={(r)=>setNewT(p=>({...p,ticker:r.symbol,meta:r}))} placeholder="Search NVIDIA, Reliance…"/>
        <Sel label="Side" value={newT.side} onChange={e=>setNewT(p=>({...p,side:e.target.value}))} options={["BUY","SELL"]}/>
        <Inp label={`Entry ${symbolFor(newT.meta?.currency)}`} type="number" value={newT.entry} onChange={e=>setNewT(p=>({...p,entry:e.target.value}))} placeholder={newT.meta?.currency==="INR"?"2750.00":"205.50"}/>
        <Inp label="Shares" type="number" value={newT.shares} onChange={e=>setNewT(p=>({...p,shares:e.target.value}))} placeholder="0.25"/>
        <Inp label={`Stop-Loss ${symbolFor(newT.meta?.currency)}`} type="number" value={newT.stop} onChange={e=>setNewT(p=>({...p,stop:e.target.value}))} placeholder={newT.meta?.currency==="INR"?"2680.00":"198.00"}/>
        <Inp label={`Target ${symbolFor(newT.meta?.currency)}`} type="number" value={newT.target} onChange={e=>setNewT(p=>({...p,target:e.target.value}))} placeholder={newT.meta?.currency==="INR"?"2900.00":"219.00"}/>
        <Sel label="Strategy" value={newT.strategy} onChange={e=>setNewT(p=>({...p,strategy:e.target.value}))} options={STRATEGIES.map(s=>s.name)}/>
        <Inp label="Date" type="date" value={newT.date} onChange={e=>setNewT(p=>({...p,date:e.target.value}))}/>
      </div>
      <div style={{marginBottom:10}}><div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}>Notes / Reason</div>
        <textarea className="tiq-input" style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:5,padding:"8px 11px",color:C.text,fontFamily:C.mono,fontSize:11,width:"100%",height:55,resize:"vertical"}} placeholder="Why am I taking this trade?" value={newT.notes} onChange={e=>setNewT(p=>({...p,notes:e.target.value}))}/>
      </div>
      {/* THESIS (P2.75) — required. Litman: explicit market-expectation vs reality is the edge. */}
      <div style={{marginBottom:10,background:C.s2,border:`1px solid ${C.border}`,borderRadius:6,padding:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
          <div style={{fontSize:10,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:"0.1em"}}>Thesis · required</div>
          <div style={{fontSize:9,color:C.muted}}>Edge = reality diverging from what the market expects</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:8}}>
          <div>
            <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}>Thesis Type</div>
            <select className="tiq-input" value={newT.thesisType} onChange={e=>setNewT(p=>({...p,thesisType:e.target.value}))} style={{background:C.s1,border:`1px solid ${newT.thesisType?C.border:C.gold+"66"}`,borderRadius:5,padding:"8px 10px",color:newT.thesisType?C.text:C.muted,fontFamily:C.mono,fontSize:11,width:"100%"}}>
              <option value="">Select type…</option>
              {THESIS_TYPES.map(tt=><option key={tt} value={tt} style={{color:"#000"}}>{tt}</option>)}
            </select>
          </div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}><span>Confidence</span><span style={{color:C.accent,fontWeight:700}}>{newT.confidence}%</span></div>
            <input type="range" min="0" max="100" value={newT.confidence} onChange={e=>setNewT(p=>({...p,confidence:+e.target.value}))} style={{width:"100%",accentColor:C.accent,marginTop:10}}/>
          </div>
        </div>
        {[["expectations","Market Expects","e.g. AI demand is slowing"],["reality","Reality — your view","e.g. Cloud capex still accelerating"],["bearCase","Bear Case — why you might be wrong","e.g. Enterprise AI spend pauses"],["invalidation","Invalidation — what kills the thesis","e.g. NVDA guides below consensus"]].map(([k,label,ph])=>(
          <div key={k} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}><span>{label}</span><span style={{color:C.dim}}>{(newT[k]||"").length}/{THESIS_FIELD_MAX}</span></div>
            <textarea className="tiq-input" maxLength={THESIS_FIELD_MAX} value={newT[k]} onChange={e=>setNewT(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={{background:C.s1,border:`1px solid ${newT[k]&&newT[k].trim()?C.border:C.gold+"44"}`,borderRadius:5,padding:"7px 10px",color:C.text,fontFamily:C.mono,fontSize:11,width:"100%",height:36,resize:"vertical"}}/>
          </div>
        ))}
        <div>
          <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}>Evidence <span style={{color:C.dim}}>· optional, encouraged</span></div>
          <textarea className="tiq-input" value={newT.evidence} onChange={e=>setNewT(p=>({...p,evidence:e.target.value}))} placeholder="TSMC guidance, cloud capex, supplier commentary…" style={{background:C.s1,border:`1px solid ${C.border}`,borderRadius:5,padding:"7px 10px",color:C.text,fontFamily:C.mono,fontSize:11,width:"100%",height:34,resize:"vertical"}}/>
        </div>
      </div>
      {newT.entry&&newT.stop&&+newT.entry>+newT.stop&&(()=>{const tCur=newT.meta?.currency;const tSym=symbolFor(tCur);const cap=tCur==="INR"?5000:(totalVal||59);const rps=+newT.entry-+newT.stop;return(<div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:6,padding:12,marginBottom:10}}>
        <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Trade Math · capital {tSym}{f(cap,0)}</div>
        <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>{[["Risk/share",`${tSym}${f(rps)}`,C.red],["Max loss",`${tSym}${f(cap*0.02)}`,C.red],["Ideal shares",`${f(cap*0.02/rps,3)}`,C.accent],["R:R",newT.target?`1:${f((+newT.target-+newT.entry)/rps)}`:"-",(+newT.target-+newT.entry)/rps>=2?C.green:C.red]].map(([l,v,c])=>(<div key={l}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{l}</div><div style={{fontFamily:C.display,fontWeight:700,color:c,fontSize:14}}>{v}</div></div>))}</div>
      </div>);})()}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <Btn solid color={tValid?C.green:C.muted} onClick={addTrade}>{syncStatus==="syncing"?<Spinner/>:"✓ Save Trade"}</Btn>
        <Btn color={C.accent} onClick={()=>{const s=symbolFor(newT.meta?.currency);quickAsk(`Review before I trade: ${newT.ticker} ${newT.side} entry ${s}${newT.entry} stop ${s}${newT.stop} target ${s}${newT.target}. Valid setup? Risk correct for ${newT.meta?.currency==="INR"?"₹5,000":"my capital (~$60 / ₹5,000)"}?`);}}>AI Review First</Btn>
        {newT.ticker&&!newT.meta&&<span style={{fontSize:9,color:C.gold}}>↑ Pick a ticker from the dropdown</span>}
        {newT.meta&&newT.entry&&!thesisComplete(newT)&&(()=>{const L={thesisType:"thesis type",expectations:"market expects",reality:"reality",bearCase:"bear case",invalidation:"invalidation",confidence:"confidence"};return <span style={{fontSize:9,color:C.gold}}>↑ Complete the thesis: {missingThesisFields(newT).map(k=>L[k]||k).join(", ")}</span>;})()}
        {newT.meta&&<span style={{fontSize:9,color:C.muted}}>{newT.meta.name} · {newT.meta.exchange} · {newT.meta.currency}</span>}
      </div>
    </Card>)}
    {journal.length===0?(<Card style={{textAlign:"center",padding:48}}><div style={{fontSize:34,marginBottom:10}}>📓</div><div style={{fontFamily:C.display,fontWeight:700,fontSize:15,marginBottom:6}}>No trades yet</div><div style={{color:C.muted,fontSize:12,maxWidth:360,margin:"0 auto",lineHeight:1.6}}>Log every trade. Syncs across phone and laptop automatically.</div></Card>):
    journal.map(t=>{const isOpen=!t.closed;const pnl=t.closed?(+t.exit-+t.entry)*+t.shares:null;const pp=t.closed?((+t.exit-+t.entry)/+t.entry)*100:null;const sym=symbolFor(t.currency);return(
      <Card key={t.id} style={{borderLeft:`3px solid ${isOpen?C.accent:pnl>=0?C.green:C.red}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
          <div><span style={{fontFamily:C.display,fontWeight:800,fontSize:15,marginRight:8}}>{t.ticker}</span><Tag c={t.side==="BUY"?C.green:C.red}>{t.side}</Tag><Tag c={C.purple}>{t.strategy}</Tag><Tag c={t.currency==="INR"?C.gold:C.blue}>{t.currency==="INR"?"₹ INR":"$ USD"}</Tag>{isOpen&&<Tag c={C.accent}>OPEN</Tag>}</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {!isOpen&&pnl!==null&&<span style={{fontFamily:C.display,fontWeight:700,color:pc(pnl),fontSize:14}}>{ps(pnl)}{sym}{f(Math.abs(pnl))} ({ps(pp)}{f(pp)}%)</span>}
            {isOpen&&<Btn small color={C.gold} onClick={async()=>{const ep=prompt(`Exit price (${sym}):`);if(ep&&!isNaN(ep)){await closeTrade(t.id,ep);reviewTrade({...t,exit:String(ep),closed:true});}}}>Close</Btn>}
            <Btn small color={C.red} onClick={()=>deleteTrade(t.id)}>✕</Btn>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6,marginTop:10}}>{[["Date",t.date],["Entry",`${sym}${t.entry}`],["Stop",`${sym}${t.stop}`],["Target",`${sym}${t.target}`],["Shares",t.shares],["Exit",t.closed?`${sym}${t.exit}`:"Open"]].map(([l,v])=>(<div key={l}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{l}</div><div style={{fontSize:11,fontWeight:600,color:C.text}}>{v||"—"}</div></div>))}</div>
        {t.notes&&<div style={{marginTop:8,fontSize:10,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:8,lineHeight:1.5}}>{t.notes}</div>}
        {t.thesisType&&<div style={{marginTop:8,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}><Tag c={C.accent}>{t.thesisType}</Tag>{Number.isFinite(+t.thesisConfidence)&&<span style={{fontSize:9,color:C.muted}}>conviction {t.thesisConfidence}%</span>}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
            <div><div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>Market expects</div><div style={{fontSize:10,color:C.text,lineHeight:1.45}}>{t.expectations||"—"}</div></div>
            <div><div style={{fontSize:8,color:C.green,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>Reality · your view</div><div style={{fontSize:10,color:C.text,lineHeight:1.45}}>{t.reality||"—"}</div></div>
          </div>
        </div>}
        {!isOpen&&(reviewing===t.id
          ? <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8,fontSize:11,color:C.muted}}><Spinner/> Reviewing trade…</div>
          : reviews[t.id]
            ? <TradeReview review={reviews[t.id]} trade={t} theme={C} onRegenerate={()=>reviewTrade(t)} onVerdict={(v)=>setThesisVerdict(t.id,v)}/>
            : <div style={{marginTop:10}}><Btn small color={C.accent} onClick={()=>reviewTrade(t)}>✨ Generate AI Review</Btn></div>)}
      </Card>);})}
  </div>);

  // ── LEARN ──
  const Learn=()=>(<div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>
      {[["RSI",C.accent,"Momentum indicator 0–100. Under 30 = oversold. Over 70 = overbought. Entry sweet spot: 40–58.","Explain RSI in depth with real examples. How to use with EMA Pullback?"],["Support & Resistance",C.gold,"Price levels where buyers/sellers repeatedly appear. The most fundamental TA skill.","Teach support and resistance from scratch with 3 real chart examples."],["Candlestick Patterns",C.purple,"Each candle tells a story. Hammer, Engulfing, Doji — your confirmation signals.","5 most important candlestick patterns for swing trading? Which are most reliable?"],["Risk Management",C.green,"The 2% rule: never risk more than 2% per trade. This alone keeps you in the game.","Deep dive risk management for ₹5,000. 2% rule, position sizing, top 5 beginner mistakes."],["MACD",C.blue,"Momentum indicator comparing two EMAs. Crossovers signal trend changes.","Explain MACD for a beginner. How to use with EMA Pullback strategy?"],["Trading Psychology",C.red,"FOMO, revenge trading, panic selling — destroy more accounts than bad strategies.","5 biggest psychological mistakes beginner traders make and how to avoid them?"]].map(([title,color,desc,q])=>(<Card key={title} style={{borderTop:`3px solid ${color}`,cursor:"pointer"}} onClick={()=>quickAsk(q)}><div style={{fontFamily:C.display,fontWeight:700,fontSize:14,color,marginBottom:6}}>{title}</div><div style={{fontSize:11,color:C.muted,lineHeight:1.6,marginBottom:10}}>{desc}</div><div style={{fontSize:10,color}}>Click to learn with AI →</div></Card>))}
    </div>
    <Card style={{background:C.s2}}><CT>Free Resources</CT>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8}}>{[["📚 Zerodha Varsity","Best free trading course","https://zerodha.com/varsity/"],["📊 TradingView","Charts, alerts, paper trading","https://www.tradingview.com/"],["🔑 Groq Console","Free AI API key","https://console.groq.com/"],["📱 Vested","US stocks from India","https://vestedfinance.com/"],["🎓 Investopedia","Every concept explained","https://www.investopedia.com/"],["📺 CA Rachana Ranade","Best Hindi trading YouTube","https://www.youtube.com/@CARachanaRanade"]].map(([n,d,u])=>(<a key={n} href={u} target="_blank" rel="noopener noreferrer" className="tiq-card" style={{display:"block",textDecoration:"none",background:C.s1,border:`1px solid ${C.border}`,borderRadius:6,padding:10,cursor:"pointer"}}><div style={{fontFamily:C.display,fontWeight:700,fontSize:12,marginBottom:3,color:C.text}}>{n}</div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{d}</div><div style={{fontSize:9,color:C.accent}}>{u.replace(/^https?:\/\//,"").replace(/\/$/,"")} ↗</div></a>))}</div>
    </Card>
  </div>);

  return(
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:C.mono,fontSize:12}}>
      <style>{GS}</style>
      <div style={{borderBottom:`1px solid ${C.border}`,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",background:C.s1,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontFamily:C.display,fontWeight:800,fontSize:17,background:`linear-gradient(90deg,${C.accent},${C.blue})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>TradeIQ</span>
          <Tag c={C.green}>Free</Tag>
          <Tag c={C.accent}>AI Active</Tag>
          <Tag c={priceStatus==="live"?C.green:priceStatus==="loading"?C.gold:C.red}>
            {priceStatus==="live"?"● Live":priceStatus==="loading"?"● Fetching":"● Offline"}
          </Tag>
          <span style={{fontSize:9,color:syncColor[syncStatus],marginLeft:4}}>{syncLabel[syncStatus]}</span>
          {lastUpdated&&<span style={{fontSize:9,color:C.muted,marginLeft:4}}>Updated {lastUpdated.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{textAlign:"right"}}><div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>Portfolio</div><div style={{fontFamily:C.display,fontWeight:700,color:C.accent,fontSize:14}}>{holdings.length===0?"₹0":`$${f(totalVal)}`}{holdings.length>0&&<span style={{fontSize:9,color:C.muted}}> / ₹{f(totalVal*84,0)}</span>}</div></div>
          {holdings.length>0&&<div style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:4,background:pc(totalPnL)+"18",color:pc(totalPnL),border:`1px solid ${pc(totalPnL)}28`}}>{ps(totalPnL)}${f(Math.abs(totalPnL))} ({ps(pnlPct)}{f(pnlPct)}%)</div>}
          <Btn small color={C.muted} onClick={loadAll}>{syncStatus==="syncing"?<Spinner/>:"⟳"}</Btn>
          {SUPABASE_READY&&session&&<Btn small color={C.muted} onClick={()=>db.auth.signOut()}>Sign out</Btn>}
        </div>
      </div>
      <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,background:C.s1,overflowX:"auto"}}>
        {TABS.map(t=>(<button key={t.id} className="tiq-btn" onClick={()=>setTab(t.id)} style={{padding:"10px 14px",fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:C.display,background:"none",border:"none",borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",color:tab===t.id?C.accent:C.muted,whiteSpace:"nowrap"}}>{t.l}</button>))}
      </div>
      <div style={{padding:18,maxWidth:1200,margin:"0 auto"}}>
        {tab==="perf"&&<Performance journal={journal} reviews={Object.values(reviews)} theme={C}/>}{tab==="dash"&&Dashboard()}{tab==="ai"&&AIChat()}{tab==="scanner"&&Scanner()}{tab==="chart"&&<div style={{height:"calc(100vh - 140px)",margin:-18}}><ChartView ticker={chartTicker} market={marketTab} userId={userId} onClose={null}/></div>}{tab==="strategies"&&StrategiesTab()}{tab==="journal"&&JournalTab()}{tab==="learn"&&Learn()}
      </div>
    </div>
  );
}

// ─── AUTH GATE ────────────────────────────────────────────────────
function Splash({ label = "Loading…" }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.muted, fontFamily: C.mono, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: C.display, fontWeight: 700, fontSize: 13 }}>{label}</span>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!SUPABASE_READY) { setAuthLoading(false); return; }
    db.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // No Supabase configured → local-only mode (localStorage, no login required)
  if (!SUPABASE_READY) return <TradeIQ session={null} />;
  if (authLoading) return <Splash />;
  if (!session) return <Login onSignIn={() => db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })} />;
  return <TradeIQ session={session} />;
}
