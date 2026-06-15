// ─── PAPER AUTOPILOT VIEW ──────────────────────────────────────────────────────
// The demo account's command screen. Presentational only — all decisions/persistence
// live in App.jsx (runAutopilot / seedBacktest) over the pure engine in autopilot.js.
// Money is virtual; prices are real. Everything is badged PAPER · SIMULATION.
import { useState } from "react";
import { C, T } from "./theme.js";
import { Money, TickerID } from "./ui.jsx";
import { shortName, symbolFor } from "./stock.js";
import { pnlOf as paperPnl } from "./autopilot.js";

const Badge = ({ children, color = C.gold }) => (
  <span style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, background: color + "1a", border: `1px solid ${color}44`, borderRadius: 999, padding: "3px 9px" }}>{children}</span>
);

const Stat = ({ label, children }) => (
  <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
    <div style={{ fontSize: T.micro, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>{label}</div>
    <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 18 }}>{children}</div>
  </div>
);

const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return "—"; } };
const FEED_COLOR = { live: C.accent, scan: C.muted, discover: C.gold, pick: C.blue, research: C.blue, council: C.gold, decision: C.accent, entry: C.green, exit: C.red, wait: C.muted, error: C.red };
const relTime = (ts) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); if (s < 60) return `${s}s`; const m = Math.round(s / 60); return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`; };

export default function Autopilot({ account, trades = [], stats, busy, msg, priceOf = () => null, onRun, onCouncilRun, onSeed, onReset, live = false, feed = [], onToggleLive, councilReadyCount = 0 }) {
  const [openLog, setOpenLog] = useState({});
  const open = trades.filter((t) => t.status === "open");
  const closed = trades.filter((t) => t.status === "closed");
  const cur = account?.currency || "INR";
  const Btn = ({ children, onClick, color = C.accent, solid, title }) => (
    <button title={title} disabled={busy} onClick={onClick} style={{ background: solid ? color : color + "14", border: solid ? "none" : `1px solid ${color}44`, color: solid ? C.bg : color, fontFamily: C.display, fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", padding: "9px 14px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}>{children}</button>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
        <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 22 }}>🚀 Paper Autopilot</div>
        <Badge>Paper · Simulation</Badge>
        <Badge color={C.blue}>Council-gated</Badge>
        {live && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green }}><span className="live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block" }} />LIVE</span>}
        {account?.started_at && <span style={{ fontSize: T.caption, color: C.muted }}>running since {fmtDate(account.started_at)}</span>}
      </div>
      <div style={{ fontSize: T.caption, color: C.muted, marginBottom: 14, maxWidth: 720 }}>
        A simulated trader that executes the system's own <b style={{ color: C.text }}>council-approved</b> ideas — virtual money, real live prices, the PR-#17 lineage on every fill. It never invents anything: entries use the live price, the “why” is the real council verdict + thesis + R:R math.
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
        <Stat label="Equity"><Money value={stats?.equity ?? account?.cash ?? 0} currency={cur} decimals={0} size={18} /></Stat>
        <Stat label="Cash"><Money value={stats?.cash ?? 0} currency={cur} decimals={0} size={18} color={C.muted} /></Stat>
        <Stat label="Total return">{stats?.totalReturnPct == null ? <span style={{ color: C.muted }}>—</span> : <span style={{ color: stats.totalReturnPct >= 0 ? C.green : C.red }}>{stats.totalReturnPct >= 0 ? "+" : ""}{stats.totalReturnPct}%</span>}</Stat>
        <Stat label="Realized P&L"><Money value={stats?.realizedPnl ?? 0} currency={cur} decimals={0} size={18} signed code={false} /></Stat>
        <Stat label="Win rate">{stats?.winRate == null ? <span style={{ color: C.muted }}>—</span> : `${stats.winRate}%`}</Stat>
        <Stat label="Positions">{open.length} open · {closed.length} closed</Stat>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button onClick={onToggleLive} title="Run constantly: monitor prices + source ideas through Discovery → Research → Council → execution, narrated live (uses AI credits while on)" style={{ background: live ? C.red : C.green, border: "none", color: C.bg, fontFamily: C.display, fontWeight: 800, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>{live ? "⏸ Pause autopilot" : "▶ Go Live"}</button>
        <Btn onClick={onRun} title="One pass now (free) — trades only ideas the Council has already approved">▶ Run once</Btn>
        <Btn color={C.gold} onClick={onCouncilRun} title="Convenes the Council on top ideas first, then trades — uses AI credits">🏛️ Convene council + trade</Btn>
        <Btn color={C.blue} onClick={onSeed} title="Honest backtest: replays council-approved ideas over the last 7 trading days using real historical prices">⏪ Seed last week (backtest)</Btn>
        {(open.length || closed.length) ? <Btn color={C.red} onClick={onReset} title="Wipe the demo account back to starting cash">↺ Reset</Btn> : null}
        {busy && <span style={{ fontSize: T.caption, color: C.accent }}>working…</span>}
      </div>

      {msg && <div style={{ background: C.s2, border: `1px solid ${C.accent}3a`, borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: T.data, color: C.text, whiteSpace: "pre-wrap" }}>{msg}</div>}

      {/* Live activity feed — watch it use the whole app in real time */}
      {feed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
            <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>Live activity</div>
            {live && <span style={{ fontSize: T.micro, color: C.green }}>● streaming</span>}
          </div>
          <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 320, overflowY: "auto", padding: "6px 0" }}>
            {feed.map((e, i) => (
              <div key={e.at + "_" + i} style={{ display: "flex", gap: 10, padding: "6px 13px", borderLeft: `3px solid ${FEED_COLOR[e.phase] || C.muted}`, alignItems: "baseline" }}>
                <span style={{ fontFamily: C.mono, fontSize: T.micro, color: C.dim, minWidth: 34, textAlign: "right" }}>{relTime(e.at)}</span>
                <span style={{ fontSize: T.caption, color: C.text, lineHeight: 1.5 }}>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty / guidance */}
      {!open.length && !closed.length && (
        <div style={{ background: C.s1, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 22, textAlign: "center", color: C.muted, fontSize: T.data }}>
          {councilReadyCount > 0
            ? <>The autopilot has <b style={{ color: C.text }}>{councilReadyCount}</b> council-approved idea{councilReadyCount > 1 ? "s" : ""} to act on. Hit <b style={{ color: C.accent }}>Run now</b> or <b style={{ color: C.blue }}>Seed last week</b>.</>
            : <>No council-approved ideas yet — the autopilot only trades what the Council has cleared. Use <b style={{ color: C.gold }}>Convene council + trade</b>, or send opportunities through the Council tab first.</>}
        </div>
      )}

      {/* Open positions */}
      {open.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, margin: "4px 0 8px" }}>Open positions ({open.length})</div>
          <div style={{ display: "grid", gap: 8 }}>
            {open.map((t) => {
              const px = priceOf(t.ticker);
              const mk = px != null ? px : t.entry_price;
              const u = paperPnl({ ...t, exit_price: mk });
              const s = symbolFor(t.currency);
              return (
                <div key={t.id} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <TickerID symbol={shortName(t.ticker)} name={t.name} currency={t.currency} sector={t.decision_sector} size="card" />
                    <div style={{ textAlign: "right" }}>
                      <Money value={u} currency={t.currency} signed code={false} size={15} />
                      <div style={{ fontSize: T.caption, color: C.muted }}>{t.qty} sh · {s}{t.entry_price} → {s}{mk}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: T.caption, color: C.muted, marginTop: 6 }}>
                    stop {s}{t.stop} · target {s}{t.target}{t.thesis_type ? ` · ${t.thesis_type}` : ""}{t.council_verdict ? ` · council ${t.council_verdict} ${t.council_confidence ?? ""}%` : ""}
                  </div>
                  {t.reason_open && <div style={{ fontSize: T.caption, color: C.text, marginTop: 6, lineHeight: 1.5 }}>{t.reason_open}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Closed trades */}
      {closed.length > 0 && (
        <div>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, margin: "4px 0 8px" }}>Closed ({closed.length})</div>
          <div style={{ display: "grid", gap: 6 }}>
            {closed.map((t) => {
              const s = symbolFor(t.currency);
              const win = (Number(t.pnl) || 0) >= 0;
              const shown = openLog[t.id];
              return (
                <div key={t.id} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px" }}>
                  <div onClick={() => setOpenLog((p) => ({ ...p, [t.id]: !p[t.id] }))} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 13 }}>{shortName(t.ticker)}<span style={{ color: C.muted, fontWeight: 400, marginLeft: 8, fontSize: T.caption }}>{fmtDate(t.entry_at)}→{fmtDate(t.exit_at)} · {t.exit_reason}{t.is_backtest ? " · backtest" : ""}</span></span>
                    <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                      <span style={{ fontSize: T.caption, color: C.muted }}>{t.r_multiple != null ? `${t.r_multiple >= 0 ? "+" : ""}${t.r_multiple}R` : ""}</span>
                      <Money value={t.pnl} currency={t.currency} signed code={false} size={14} color={win ? C.green : C.red} />
                    </span>
                  </div>
                  {shown && <div style={{ fontSize: T.caption, color: C.muted, marginTop: 7, lineHeight: 1.5 }}>{s}{t.entry_price} → {s}{t.exit_price} · {t.reason_open}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
