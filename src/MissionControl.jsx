// ─── MISSION CONTROL — the Dashboard's command center ────────────
// Answers, in order: what's happening · what should I do · biggest
// opportunity · biggest risk · am I improving · what does the Council think.
// All data is derived client-side in mission.js (zero tokens, always live).
// Holdings/watchlist MANAGEMENT stays in App.jsx below this component.

import { useEffect, useMemo, useState } from "react";
import { C, T } from "./theme.js";
import { TickerID, Money, Term } from "./ui.jsx";
import { coalitions } from "./council.js";
import { track, usageSummary, filingImpactReport } from "./telemetry.js";
import {
  openPositions, thesisHealth, HEALTH_LABEL, actionQueue, featuredOpportunity,
  biggestRisk, missionBriefing, iqSnapshot, alphaSnapshot, learningLoop,
  lastCouncil, commandStats, researchPipeline,
} from "./mission.js";

const HEALTH_COLOR = { intact: C.green, weakening: C.gold, broken: C.red, unknown: C.dim };
const SEV_COLOR = { 3: C.red, 2: C.gold, 1: C.blue };
const pct = (x, d = 0) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);

// Command-center panel: flat, bordered, eyebrow header — deliberately NOT the
// hover-lift Card. Sections read as one console, not floating tiles.
const Panel = ({ title, right, tone, children, style = {} }) => (
  <section style={{ background: C.s1, border: `1px solid ${tone ? tone + "45" : C.border}`, borderTop: `2px solid ${tone || C.border}`, borderRadius: 10, padding: 14, minWidth: 0, display: "flex", flexDirection: "column", ...style }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
      <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: T.micro, letterSpacing: "0.16em", textTransform: "uppercase", color: tone || C.muted }}>{title}</div>
      {right}
    </div>
    {children}
  </section>
);
const Empty = ({ children }) => <div style={{ fontSize: T.caption, color: C.dim, lineHeight: 1.6 }}>{children}</div>;
const GoBtn = ({ onClick, color = C.accent, children }) => (
  <button className="tiq-btn" onClick={onClick} style={{ background: color + "14", border: `1px solid ${color}3a`, borderRadius: 7, color, fontFamily: C.display, fontWeight: 700, fontSize: T.caption, letterSpacing: "0.06em", textTransform: "uppercase", padding: "8px 13px", whiteSpace: "nowrap" }}>{children}</button>
);
const Kv = ({ label, children, color = C.text }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 3 }}>{label}</div>
    <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 16, color, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
  </div>
);

export default function MissionControl({ holdings = [], journal = [], reviewsMap = {}, opportunities = [], liveData = {}, userId, fx = { USD: 1, INR: 1 / 84 }, goTab, onOpenResearch, onLogTrade }) {
  const [showExposure, setShowExposure] = useState(false);
  // Local-only usage instrumentation (see telemetry.js). `hit` then act.
  const hit = (key) => track(localStorage, userId, key);
  const go = (key, tab) => { hit(key); goTab(tab); };
  useEffect(() => {
    window.tiqUsage = () => usageSummary(localStorage, userId);
    window.tiqFilings = () => filingImpactReport(localStorage, userId); // Filing Intelligence Report (P3.2)
    return () => { delete window.tiqUsage; delete window.tiqFilings; };
  }, [userId]);
  const reviews = useMemo(() => Object.values(reviewsMap), [reviewsMap]);
  const liveOf = (tk) => liveData[tk]?.price ?? null;
  const pfItems = useMemo(() => holdings.map((h) => ({ ticker: h.ticker, sector: h.sector, value: (+h.shares || 0) * (+h.price || 0) * (fx[h.currency] || 1) })), [holdings, fx]);
  const totalUsd = pfItems.reduce((s, i) => s + i.value, 0);

  const council = useMemo(() => lastCouncil(localStorage, userId), [userId]);
  const stats = useMemo(() => commandStats(pfItems, holdings, journal), [pfItems, holdings, journal]);
  const queue = useMemo(() => actionQueue({ journal, reviews, opportunities, liveOf, council }), [journal, reviews, opportunities, liveData, council]);
  const brief = useMemo(() => missionBriefing({ pfItems, journal, reviews, opportunities, liveOf }), [pfItems, journal, reviews, opportunities, liveData]);
  const risk = useMemo(() => biggestRisk({ pfItems, journal, reviews, liveOf }), [pfItems, journal, reviews, liveData]);
  const opp = useMemo(() => featuredOpportunity(opportunities), [opportunities]);
  const iq = useMemo(() => iqSnapshot(journal, reviews), [journal, reviews]);
  const alpha = useMemo(() => alphaSnapshot(journal), [journal]);
  const loop = useMemo(() => learningLoop(journal, reviews), [journal, reviews]);
  const pipe = useMemo(() => researchPipeline(opportunities, journal), [opportunities, journal]);
  const open = openPositions(journal);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
      <style>{`
        .mc-b{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px;}
        .mc-c{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:14px;}
        .mc-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}
        .mc-pos{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;}
        .mc-loop{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}
        @media(max-width:880px){.mc-b,.mc-c,.mc-3{grid-template-columns:1fr;}.mc-loop{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media(max-width:480px){.mc-loop{grid-template-columns:1fr;}}
      `}</style>

      {/* ── MISSION BRIEFING ─────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(180deg,${C.s2}66,transparent 64px),${C.s1}`, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: T.micro, letterSpacing: "0.18em", textTransform: "uppercase", color: C.accent }}>Mission Briefing</div>
          <div style={{ fontSize: T.caption, color: C.dim, fontFamily: C.mono }}>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · derived from your live data</div>
        </div>
        {brief.map((line, i) => (
          <div key={i} style={{ fontFamily: C.mono, fontSize: T.body, color: C.text, lineHeight: 1.75 }}>
            <span style={{ color: C.accent, marginRight: 8 }}>▸</span>{line}
          </div>
        ))}
      </section>

      {/* ── ROW B: COMMAND CENTER + BIGGEST RISK ─────────────────── */}
      <div className="mc-b">
        <Panel title="Portfolio Command Center" right={holdings.length > 0 && <button onClick={() => setShowExposure((s) => { if (!s) hit("command.exposure"); return !s; })} style={{ background: "none", border: "none", color: C.muted, fontSize: T.caption, cursor: "pointer", fontFamily: C.mono }}>{showExposure ? "hide exposure ▴" : "exposure detail ▾"}</button>}>
          {holdings.length === 0 ? <Empty>No holdings yet — add positions in the Manage section below to power the command center.</Empty> : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <Money value={totalUsd} currency="USD" decimals={0} size={26} />
                <span style={{ fontSize: T.caption, color: C.muted }}>≈ <Money value={totalUsd / (fx.INR || 1)} currency="INR" decimals={0} size={T.caption} /> @ ₹{Math.round(1 / (fx.INR || 1))}/$</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 10 }}>
                <Kv label="Positions">{stats.positions}</Kv>
                <Kv label="Open trades">{stats.openTrades}</Kv>
                <Kv label="Largest position" color={stats.largest && stats.largest.pct > 0.25 ? C.red : C.text}>{stats.largest ? `${stats.largest.ticker} ${pct(stats.largest.pct)}` : "—"}</Kv>
                <Kv label="Top theme" color={stats.topTheme && stats.topTheme.pct > 0.4 ? C.red : C.text}>{stats.topTheme ? `${stats.topTheme.key} ${pct(stats.topTheme.pct)}` : "—"}</Kv>
                <Kv label={<Term k="effectiveBets">Effective bets</Term>} color={stats.effectiveN && stats.effectiveN < 3 ? C.red : C.green}>{stats.effectiveN ? stats.effectiveN.toFixed(1) : "—"}</Kv>
              </div>
              {showExposure && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  {stats.flags.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>{stats.flags.map((fl, i) => (
                    <div key={i} style={{ fontSize: T.caption, color: fl.level === "high" ? C.red : C.gold, background: (fl.level === "high" ? C.red : C.gold) + "12", border: `1px solid ${(fl.level === "high" ? C.red : C.gold)}30`, borderRadius: 5, padding: "5px 9px", lineHeight: 1.4 }}>⚠ {fl.text}</div>
                  ))}</div>}
                  {stats.themes.slice(0, 6).map((t) => (
                    <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 150, fontSize: T.caption, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.key}{t.count > 1 && <span style={{ color: C.muted }}> ×{t.count}</span>}</div>
                      <div style={{ flex: 1, height: 6, background: C.dim, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${Math.min(100, (t.pct / Math.max(stats.themes[0].pct, 0.01)) * 100)}%`, height: "100%", background: t.pct > 0.4 ? C.red : t.pct > 0.25 ? C.gold : C.accent }} /></div>
                      <div style={{ width: 40, textAlign: "right", fontSize: T.caption, fontWeight: 700 }}>{pct(t.pct)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Biggest Risk" tone={risk ? (risk.severity >= 3 ? C.red : C.gold) : undefined}>
          {!risk ? <Empty>No standout risk detected. That changes fast — check back after adding positions or closing trades.</Empty> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 19, lineHeight: 1.25, color: risk.severity >= 3 ? C.red : C.gold }}>{risk.headline}</div>
              <div style={{ fontSize: T.data, color: C.muted, lineHeight: 1.55, flex: 1 }}>{risk.detail}</div>
              <div><GoBtn color={risk.severity >= 3 ? C.red : C.gold} onClick={() => go("risk.inspect", risk.tab)}>Inspect →</GoBtn></div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── ROW C: ACTION REQUIRED + BEST OPPORTUNITY ────────────── */}
      <div className="mc-c">
        <Panel title="Action Required" tone={queue.some((i) => i.severity === 3) ? C.red : undefined} right={<span style={{ fontSize: T.caption, color: C.dim }}>{queue.length} item{queue.length === 1 ? "" : "s"}</span>}>
          {queue.length === 0 ? <Empty>Queue clear. Nothing is waiting on you.</Empty> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {queue.slice(0, 5).map((it) => (
                <button key={it.id} className="tiq-btn" onClick={() => go(`action.${it.id}`, it.tab)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: C.s2, border: `1px solid ${SEV_COLOR[it.severity]}30`, borderLeft: `3px solid ${SEV_COLOR[it.severity]}`, borderRadius: 7, padding: "9px 12px", cursor: "pointer", color: C.text }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: T.data, fontWeight: 700, lineHeight: 1.3 }}>{it.label}</div>
                    {it.detail && <div style={{ fontSize: T.caption, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.detail}</div>}
                  </div>
                  <span style={{ color: SEV_COLOR[it.severity], fontSize: T.data }}>→</span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Best Opportunity" tone={opp ? C.accent : undefined} right={opp && <span style={{ fontSize: T.caption, color: C.dim }}>highest conviction in pipeline</span>}>
          {!opp ? <Empty>No live opportunities. Generate ideas from the Opportunities tab.</Empty> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <TickerID size="card" symbol={opp.ticker} name={opp.name} currency={opp.currency} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>Confidence</div>
                  <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 22, color: (opp.confidence || 0) >= 70 ? C.green : (opp.confidence || 0) >= 50 ? C.gold : C.muted }}>{opp.confidence ?? "—"}%</div>
                </div>
              </div>
              {opp.thesis_type && <div style={{ fontSize: T.caption, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>{opp.thesis_type}{opp.risk_level ? ` · ${opp.risk_level} risk` : ""}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green, marginBottom: 3 }}>Bull case</div><div style={{ fontSize: T.data, color: C.text, lineHeight: 1.5 }}>{opp.bull_case || "—"}</div></div>
                <div><div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.red, marginBottom: 3 }}>Bear case</div><div style={{ fontSize: T.data, color: C.text, lineHeight: 1.5 }}>{opp.bear_case || "—"}</div></div>
              </div>
              {opp.invalidation && <div style={{ fontSize: T.caption, color: C.red, lineHeight: 1.5 }}><b>Kills it:</b> {opp.invalidation}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                <GoBtn color={C.accent} onClick={() => go("opp.openCouncil", "council")}>Open Council</GoBtn>
                <GoBtn color={C.purple} onClick={() => { hit("opp.openResearch"); onOpenResearch(opp); }}>Open Research</GoBtn>
                <GoBtn color={C.green} onClick={() => { hit("opp.logTrade"); onLogTrade(opp); }}>Log Trade →</GoBtn>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── ROW C2: RESEARCH PIPELINE — the AI analyst's desk ────── */}
      <Panel title="Research Pipeline" tone={pipe.ready.length ? C.green : pipe.researching.length ? C.purple : undefined}
        right={<GoBtn color={C.purple} onClick={() => go("pipeline.open", "opps")}>Open Pipeline</GoBtn>}>
        {pipe.discovered + pipe.researching.length + pipe.councilReady + pipe.ready.length + pipe.logged === 0
          ? <Empty>No ideas in the pipeline. The engine auto-discovers daily, or hit Discover in the Opportunities tab.</Empty>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 10 }}>
                <Kv label="Discovered" color={C.blue}>{pipe.discovered}</Kv>
                <Kv label="Researching" color={C.purple}>{pipe.researching.length}</Kv>
                <Kv label="Council queue" color={C.gold}>{pipe.councilReady}</Kv>
                <Kv label="Ready to decide" color={pipe.ready.length ? C.green : C.text}>{pipe.ready.length}</Kv>
              </div>
              {pipe.researching.slice(0, 3).map((r) => (
                <div key={r.ticker} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 90, fontSize: T.caption, color: C.text, fontFamily: C.mono }}>{r.ticker}</span>
                  <div style={{ flex: 1, height: 5, background: C.dim, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${r.progress.pct * 100}%`, height: "100%", background: C.purple }} /></div>
                  <span style={{ fontSize: T.caption, color: C.muted, whiteSpace: "nowrap" }}>{r.progress.done}/{r.progress.total} tasks</span>
                </div>
              ))}
              {pipe.reconvene > 0 && <div style={{ fontSize: T.caption, color: C.gold, lineHeight: 1.5 }}>⚖ {pipe.reconvene} idea{pipe.reconvene > 1 ? "s" : ""} finished the Council's required research — reconvene for an updated verdict.</div>}
              {pipe.ready.slice(0, 3).map((r) => (
                <div key={r.ticker} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: T.caption }}>
                  <span style={{ color: C.green }}>●</span>
                  <span style={{ color: C.text, fontFamily: C.mono }}>{r.ticker}</span>
                  {r.verdict && <span style={{ color: r.verdict.includes("Buy") ? C.green : r.verdict.includes("Avoid") ? C.red : C.gold }}>{r.verdict}</span>}
                  <span style={{ marginLeft: "auto", color: C.muted }}>score {r.composite}</span>
                </div>
              ))}
            </div>
          )}
      </Panel>

      {/* ── ROW D: OPEN POSITIONS — decision cards ───────────────── */}
      <Panel title="Open Positions" right={<span style={{ fontSize: T.caption, color: C.dim }}>thesis health = price progress toward your stop</span>}>
        {open.length === 0 ? <Empty>No open trades. Log a trade from an opportunity to see it here with live thesis health.</Empty> : (
          <div className="mc-pos">
            {open.map((t) => {
              const live = liveOf(t.ticker);
              const h = thesisHealth(t, live);
              const entry = parseFloat(t.entry), shares = parseFloat(t.shares) || 0;
              const dir = t.side === "SELL" ? -1 : 1;
              const upnl = live != null && Number.isFinite(entry) ? (live - entry) * shares * dir : null;
              const hc = HEALTH_COLOR[h.status];
              return (
                <div key={t.id} style={{ background: C.s2, border: `1px solid ${hc}35`, borderLeft: `3px solid ${hc}`, borderRadius: 8, padding: 12, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <TickerID size="row" symbol={t.ticker} name={t.name} currency={t.currency} sector={t.sector} nameMax={80} />
                    <span style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: hc, background: hc + "16", border: `1px solid ${hc}30`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{HEALTH_LABEL[h.status]}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 8 }}>
                    <div><div style={{ fontSize: T.micro, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Entry</div><Money value={t.entry} currency={t.currency} code={false} bold={false} /></div>
                    <div><div style={{ fontSize: T.micro, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Now</div>{live != null ? <Money value={live} currency={t.currency} code={false} /> : <span style={{ color: C.dim }}>—</span>}</div>
                    <div><div style={{ fontSize: T.micro, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Unrealized</div>{upnl != null ? <Money value={upnl} currency={t.currency} signed code={false} /> : <span style={{ color: C.dim }}>—</span>}</div>
                  </div>
                  <div style={{ fontSize: T.caption, color: C.muted, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span>{t.thesisType || "No thesis"}{t.thesisConfidence != null ? ` · ${t.thesisConfidence}%` : ""}</span>
                    <span>{t.side} · stop {t.stop ? <Money value={t.stop} currency={t.currency} code={false} bold={false} size={T.caption} /> : "—"}</span>
                  </div>
                  {h.progress != null && h.status !== "unknown" && (
                    <div style={{ marginTop: 8, height: 4, background: C.dim, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${Math.min(100, h.progress * 100)}%`, height: "100%", background: hc }} /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── ROW E: IQ + ALPHA + COUNCIL ──────────────────────────── */}
      <div className="mc-3">
        <Panel title={<Term k="investorIq">Investor IQ</Term>} right={<button onClick={() => go("iq.drill", "perf")} style={{ background: "none", border: "none", color: C.muted, fontSize: T.caption, cursor: "pointer", fontFamily: C.mono }}>full analytics →</button>}>
          {iq.n === 0 ? <Empty>Builds after your first reviewed trade. Close a trade, generate its AI review, and your IQ profile starts here.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Kv label={<Term k="thesisAccuracy">Thesis accuracy</Term>} color={iq.thesisAccuracy >= 0.6 ? C.green : iq.thesisAccuracy >= 0.4 ? C.gold : C.red}>{pct(iq.thesisAccuracy)}</Kv>
              <Kv label={<Term k="process">Process score</Term>} color={iq.processAvg >= 70 ? C.green : iq.processAvg >= 50 ? C.gold : C.red}>{iq.processAvg != null ? Math.round(iq.processAvg) : "—"}</Kv>
              <Kv label={<Term k="calibration">Calibration</Term>} color={iq.calibration.label === "Good" ? C.green : iq.calibration.label === "Fair" ? C.gold : C.red}>{iq.calibration.n ? iq.calibration.label : "—"}</Kv>
              <Kv label="Good process rate" color={iq.goodProcessRate >= 0.6 ? C.green : C.gold}>{pct(iq.goodProcessRate)}</Kv>
            </div>
          )}
        </Panel>

        <Panel title="Personal Alpha" right={<button onClick={() => go("alpha.drill", "perf")} style={{ background: "none", border: "none", color: C.muted, fontSize: T.caption, cursor: "pointer", fontFamily: C.mono }}>full breakdown →</button>}>
          {!alpha.bestEdge && !alpha.worstLeak ? <Empty>Needs ≥5 closed trades per condition. Your edges and leaks will surface here as the sample builds ({alpha.closed} closed so far).</Empty> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alpha.bestEdge && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><span style={{ fontSize: T.data, color: C.text }}>Best edge · <b>{alpha.bestEdge.key}</b></span><span style={{ fontFamily: C.mono, fontWeight: 700, color: C.green }}>+{alpha.bestEdge.expectancyR.toFixed(2)}R</span></div>}
              {alpha.worstLeak && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><span style={{ fontSize: T.data, color: C.text }}>Worst leak · <b>{alpha.worstLeak.key}</b></span><span style={{ fontFamily: C.mono, fontWeight: 700, color: C.red }}>{alpha.worstLeak.expectancyR.toFixed(2)}R</span></div>}
              {alpha.bestSector && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><span style={{ fontSize: T.caption, color: C.muted }}>Best sector · {alpha.bestSector.key}</span><span style={{ fontFamily: C.mono, fontSize: T.caption, color: C.green }}>+{alpha.bestSector.expectancyR.toFixed(2)}R</span></div>}
              {alpha.worstSector && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><span style={{ fontSize: T.caption, color: C.muted }}>Worst sector · {alpha.worstSector.key}</span><span style={{ fontFamily: C.mono, fontSize: T.caption, color: C.red }}>{alpha.worstSector.expectancyR.toFixed(2)}R</span></div>}
              {alpha.bestThesisType && <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><span style={{ fontSize: T.caption, color: C.muted }}>Best thesis type · {alpha.bestThesisType.key}</span><span style={{ fontFamily: C.mono, fontSize: T.caption, color: C.green }}>+{alpha.bestThesisType.expectancyR.toFixed(2)}R</span></div>}
            </div>
          )}
        </Panel>

        <Panel title="Council Briefing" right={<GoBtn onClick={() => go("council.open", "council")}>Open Council</GoBtn>}>
          {!council ? <Empty>No council session yet. Convene the council on any ticker or portfolio question.</Empty> : (() => {
            const v = council.session.verdict; const co = coalitions(council.session.votes || []);
            const vc = v.recommendation?.includes("Buy") ? C.green : v.recommendation?.includes("Avoid") ? C.red : C.gold;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: C.serif, fontWeight: 900, fontSize: 22, color: vc }}>{v.recommendation}</span>
                  <span style={{ fontSize: T.data, color: C.muted }}>{v.confidence}% · {council.topic?.ticker || council.topic?.title || ""}</span>
                </div>
                <div style={{ fontSize: T.caption, color: C.muted }}>
                  {co.for.length > 0 && <span style={{ color: C.green }}>FOR {co.for.length}</span>}{co.neutral.length > 0 && <span> · <span style={{ color: C.gold }}>HOLD {co.neutral.length}</span></span>}{co.against.length > 0 && <span> · <span style={{ color: C.red }}>AGAINST {co.against.length}</span></span>}
                  <span style={{ color: C.dim }}> · {new Date(council.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
                {v.bull_case && <div style={{ fontSize: T.caption, lineHeight: 1.5 }}><b style={{ color: C.green }}>Bull:</b> <span style={{ color: C.text }}>{v.bull_case}</span></div>}
                {v.bear_case && <div style={{ fontSize: T.caption, lineHeight: 1.5 }}><b style={{ color: C.red }}>Bear:</b> <span style={{ color: C.text }}>{v.bear_case}</span></div>}
              </div>
            );
          })()}
        </Panel>
      </div>

      {/* ── ROW F: LEARNING LOOP ─────────────────────────────────── */}
      <Panel title="Learning Loop" right={<span style={{ fontSize: T.caption, color: C.dim }}>idea → thesis → trade → review → learning</span>}>
        {!loop.lastVerdict && !loop.commonMistake ? <Empty>The loop starts turning after your first AI review.</Empty> : (
          <div className="mc-loop">
            <div><div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.blue, marginBottom: 4 }}>Recent lesson</div><div style={{ fontSize: T.data, color: C.text, lineHeight: 1.5 }}>{loop.recentLesson || "—"}</div></div>
            <div><div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.red, marginBottom: 4 }}>Most common mistake</div><div style={{ fontSize: T.data, color: C.text, lineHeight: 1.5 }}>{loop.commonMistake ? `${loop.commonMistake.label} (×${loop.commonMistake.count})` : "—"}</div></div>
            <div><div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 4 }}>Last review verdict</div><div style={{ fontSize: T.data, color: C.text, lineHeight: 1.5 }}>{loop.lastVerdict ? `${loop.lastVerdict.ticker ? loop.lastVerdict.ticker + " — " : ""}${loop.lastVerdict.label}` : "—"}</div></div>
            <div><div style={{ fontSize: T.micro, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green, marginBottom: 4 }}>Process trend</div><div style={{ fontSize: T.data, color: loop.processTrend == null ? C.dim : loop.processTrend >= 0 ? C.green : C.red, lineHeight: 1.5 }}>{loop.processTrend == null ? "Needs 4+ reviews" : loop.processTrend >= 0 ? `↗ improving (+${loop.processTrend.toFixed(0)} pts)` : `↘ declining (${loop.processTrend.toFixed(0)} pts)`}</div></div>
          </div>
        )}
      </Panel>
    </div>
  );
}
