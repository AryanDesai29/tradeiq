import { useState, useEffect, useRef } from "react";
import { symbolFor } from "./stock.js";

// ─── TICKER SEARCH — type a few letters, pick the correct symbol ──────
// Solves two problems at once:
//  1. Beginners don't know exact tickers ("reliance" → RELIANCE.NS).
//  2. Picking the real symbol carries the exchange suffix, so the rest of
//     the app can infer the right currency (₹ for .NS/.BO, $ otherwise).
//
// Props:
//   value       current text in the box (controlled)
//   onChange(t) raw text changes (keeps manual entry working)
//   onSelect(r) a suggestion was chosen → { symbol, name, currency }
//   market      "us" | "india" — biases suggestions to that exchange
//   label, placeholder, theme
export default function TickerSearch({ value, onChange, onSelect, market = "us", label, placeholder, theme, token }) {
  const C = theme;
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(-1);          // highlighted index for keyboard nav
  const boxRef = useRef(null);
  const justPicked = useRef(false);

  // Debounced search whenever the typed value changes.
  useEffect(() => {
    const q = (value || "").trim();
    if (justPicked.current) { justPicked.current = false; return; }
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&market=${market}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
        if (r.status === 429) { setResults([]); setOpen(false); setLoading(false); return; }
        const d = await r.json();
        setResults(d.results || []);
        setOpen((d.results || []).length > 0);
        setHi(-1);
      } catch { setResults([]); }
      setLoading(false);
    }, 260);
    return () => clearTimeout(id);
  }, [value, market]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (r) => {
    justPicked.current = true;
    onChange(r.symbol);
    onSelect && onSelect(r);
    setResults([]);
    setOpen(false);
    setHi(-1);
  };

  const onKey = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(p => Math.min(p + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(p => Math.max(p - 1, 0)); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); choose(results[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      {label && <div style={{ fontSize: 12, color: C.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>}
      <input
        className="tiq-input"
        value={value}
        onChange={e => onChange(e.target.value.toUpperCase())}
        onKeyDown={onKey}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder || "Search name or ticker…"}
        autoComplete="off"
        spellCheck={false}
        style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", color: C.text, fontFamily: C.mono, fontSize: 13, width: "100%" }}
      />
      {loading && <div style={{ position: "absolute", right: 9, top: label ? 29 : 9, fontSize: 12, color: C.muted }}>…</div>}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, zIndex: 50, maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
          {results.map((r, i) => (
            <div
              key={r.symbol}
              onMouseDown={(e) => { e.preventDefault(); choose(r); }}
              onMouseEnter={() => setHi(i)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer", background: hi === i ? C.s3 : "transparent", borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : "none" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 14, color: C.text }}>
                  {r.symbol} <span style={{ fontSize: 12, color: r.currency === "INR" ? C.gold : C.blue, marginLeft: 4 }}>{symbolFor(r.currency)} {r.exchange || (r.currency === "INR" ? "NSE" : "US")}</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
              </div>
              <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{r.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
