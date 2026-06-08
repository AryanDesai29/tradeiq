import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const C = {
  bg:"#06090f",s7º"#0b1119",s2:"#0f1824",s3:"#142030",
  border:"#1c2d3d",accent:"#00e5ff",blue:"#2979ff",
  gold:"#ffab40",green:"#69f0ae",red:"#ff5252",purple:"#ce93d8",
  text:"#dde8f5",muted:"#3d5a73",dim:"#1e3347",
  mono:"'JetBrains Mono','Courier New',monospace",
  display:"'Syne',sans-serif",
};

export default function TradeIQ() {
  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:C.mono,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
      <div>
        <div style={{fontFamily:C.display,fontWeight:800,fontSize:32,background:`linear-gradient(90deg,${C.accent},${C.blue})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:16}}>TradeIQ</div>
        <div style={{color:C.muted}}>The full app is in the repo. Clone and run npm install && npm run dev</div>
      </div>
    </div>
  );
}
