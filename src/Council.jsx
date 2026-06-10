// ─── 🏛️ THE INVESTMENT COUNCIL — animated committee chamber ──────────────────
// Full-screen war room: ten members seated around an elliptical table debate the
// topic live (typewriter speech bubbles, speaking spotlight, idle float), then
// special powers may interrupt, votes reveal seat-by-seat, and the Chairman
// delivers the verdict. One Groq call scripts the session (api/council.js);
// this component is pure playback + interaction. Click any member for their
// dossier and keep questioning them in character.
import { useState, useEffect, useRef, useMemo } from "react";
import {
  COUNCIL, MEMBER_IDS, memberById, TOPIC_TYPES, VOTE_COLOR, voteTally,
  normalizeSession, buildCouncilContext, sessionBrief,
  QUICK_IDS, COUNCIL_MODES, kindOf, hashTopic, cacheGet, cachePut, COUNCIL_CACHE_TTL,
  memberMemories, memoriesBlock, coalitions, pickReactors,
  treasuryRecord, treasuryStats, treasuryHealth,
} from "./council.js";

const GS2 = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&display=swap');
  @keyframes cBob{0%,100%{transform:translateY(0) scale(1,1)}40%{transform:translateY(-6px) scale(0.985,1.025)}55%{transform:translateY(-7px) scale(1,1)}90%{transform:translateY(0) scale(1.02,0.975)}}
  @keyframes cTalk{0%,100%{transform:translateY(0) scale(1) rotate(0)}25%{transform:translateY(-4px) scale(1.05,0.96) rotate(-2deg)}75%{transform:translateY(-2px) scale(0.96,1.05) rotate(2deg)}}
  @keyframes cNod{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
  @keyframes cRing{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes cBubble{from{opacity:0;transform:translateY(14px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes cVote{0%{opacity:0;transform:scale(0.3) rotate(-12deg)}70%{transform:scale(1.15) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
  @keyframes cGavel{0%,100%{transform:rotate(0)}15%{transform:rotate(-14deg)}30%{transform:rotate(8deg)}45%{transform:rotate(-5deg)}60%{transform:rotate(2deg)}}
  @keyframes cPower{0%{opacity:0;transform:scale(0.85)}60%{transform:scale(1.04)}100%{opacity:1;transform:scale(1)}}
  @keyframes cDust{0%,100%{opacity:0.12;transform:translateY(0)}50%{opacity:0.5;transform:translateY(-14px)}}
  @keyframes cBlink{0%,49%{opacity:1}50%,100%{opacity:0}}
  @keyframes cSteam{0%{opacity:0.45;transform:translateY(0) scaleX(1)}100%{opacity:0;transform:translateY(-9px) scaleX(1.7)}}
  @keyframes cReact{0%{opacity:0;transform:translateY(6px) scale(0.5)}25%{opacity:1;transform:translateY(-3px) scale(1.15)}45%{transform:translateY(-5px) scale(1)}100%{opacity:0;transform:translateY(-15px) scale(0.9)}}
  @keyframes cSlam{0%{opacity:0;transform:translate(-50%,-160%) rotate(-50deg) scale(1.6)}45%{opacity:1;transform:translate(-50%,-50%) rotate(8deg) scale(1)}55%{transform:translate(-50%,-50%) rotate(-6deg)}70%{transform:translate(-50%,-50%) rotate(3deg)}100%{opacity:0;transform:translate(-50%,-50%) rotate(0) scale(1.25)}}
  .c-seat{transition:transform 0.35s ease,opacity 0.35s ease,filter 0.35s ease;cursor:pointer;}
  .c-seat:hover{transform:translate(-50%,-50%) scale(1.1)!important;opacity:1!important;filter:none!important;z-index:7!important;}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;}
  }
`;

// Seats ring the upper two-thirds of the chamber; the bottom band is reserved
// for the dialogue box / verdict / composer so no overlay ever hides a member.
const SEAT_POS = COUNCIL.map((_, i) => {
  const a = -Math.PI / 2 + (i / COUNCIL.length) * Math.PI * 2;
  return { left: 50 + 40 * Math.cos(a), top: 40 + 24 * Math.sin(a) };
});

const KIND_TAG = { opening: "OPENS", challenge: "CHALLENGES", response: "RESPONDS", interjection: "INTERJECTS", power: "⚡ POWER", summary: "SUMMARY" };
const powerQueue = (s) => [
  ...(s?.evidence_hold?.raised ? [{ kind: "evidence", emoji: "🕵️", title: "EVIDENCE MISSING", color: "#ffd54f", text: s.evidence_hold.demand, sub: "The Detective has suspended the vote pending investigation" }] : []),
  ...(s?.red_flags?.raised ? [{ kind: "redflag", emoji: "⚖️", title: "RED FLAG REVIEW", color: "#f48fb1", text: (s.red_flags.flags || []).join(" · "), sub: s.red_flags.resolution || "The Skeptic demands the reasoning flaws be addressed" }] : []),
];

export default function Council({ theme: C, db, supabaseReady, userId, holdings, journal, reviews, opportunities, watchlist }) {
  const serif = "'Fraunces',serif";
  const [phase, setPhase]         = useState("idle"); // idle|convening|debate|powers|voting|verdict
  const [topic, setTopic]         = useState(null);
  const [session, setSession]     = useState(null);
  const [turnIdx, setTurnIdx]     = useState(0);
  const [typed, setTyped]         = useState("");
  const [powerIdx, setPowerIdx]   = useState(0);
  const [votesShown, setVotesShown] = useState(0);
  const [dossier, setDossier]     = useState(null);   // member id
  const [askQ, setAskQ]           = useState("");
  const [askBusy, setAskBusy]     = useState(false);
  const [threads, setThreads]     = useState({});     // memberId -> [{q,a}]
  const [err, setErr]             = useState(null);
  const [tType, setTType]         = useState("opportunity");
  const [tText, setTText]         = useState("");
  const [tTicker, setTTicker]     = useState("");
  const [cMode, setCMode]         = useState("quick"); // quick (default) | full (opt-in)
  const [source, setSource]       = useState("live");  // live | cache | cloud
  const [gavel, setGavel]         = useState(false);   // chairman's gavel strike on verdict
  const [showTreasury, setShowTreasury] = useState(false);
  const [treasuryTick, setTreasuryTick] = useState(0); // bump after each recorded event
  const feedEnd  = useRef(null);
  const savedRef = useRef(null);
  const lsKey = `tradeiq_council_last_${userId}`;
  const cacheKey = `tradeiq_council_cache_${userId}`;
  const [lastSaved, setLastSaved] = useState(() => { try { return JSON.parse(localStorage.getItem(lsKey)); } catch { return null; } });

  const getToken = async () => { if (!supabaseReady) return null; try { const { data } = await db.auth.getSession(); return data.session?.access_token ?? null; } catch { return null; } };

  // Council Memory — each member's read on the user, derived from real data
  // (zero tokens). Fed to debates/asks and shown in the dossier.
  const memories = useMemo(() => memberMemories({ journal, reviews, opportunities }), [journal, reviews, opportunities]);
  const ctxWithNotes = (t, mode) => {
    const base = buildCouncilContext({ holdings, journal, reviews, opportunities, watchlist, topic: t, compact: mode === "quick" });
    const notes = memoriesBlock(memories, mode === "quick" ? QUICK_IDS : MEMBER_IDS, mode === "quick" ? 110 : 130);
    return notes ? `${base}\n${notes}` : base;
  };
  const record = (ev) => { treasuryRecord(localStorage, userId, ev); setTreasuryTick((x) => x + 1); };

  // ── Playback: debate turns with typewriter ──
  useEffect(() => {
    if (phase !== "debate" || !session) return;
    const t = session.transcript[turnIdx];
    if (!t) { setPowerIdx(0); setPhase(powerQueue(session).length ? "powers" : "voting"); return; }
    setTyped("");
    let i = 0;
    const step = Math.max(1, Math.round(t.text.length / 60));
    const iv = setInterval(() => { i += step; setTyped(t.text.slice(0, i)); if (i >= t.text.length) clearInterval(iv); }, 24);
    const to = setTimeout(() => setTurnIdx((x) => x + 1), 24 * Math.ceil(t.text.length / step) + 1400 + Math.min(2200, t.text.length * 9));
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [phase, turnIdx, session]);

  // ── Special-power interruptions ──
  useEffect(() => {
    if (phase !== "powers" || !session) return;
    if (powerIdx >= powerQueue(session).length) { setPhase("voting"); return; }
    const to = setTimeout(() => setPowerIdx((x) => x + 1), 4600);
    return () => clearTimeout(to);
  }, [phase, powerIdx, session]);

  // ── Vote reveal, seat by seat ──
  useEffect(() => {
    if (phase !== "voting" || !session) return;
    const to = votesShown >= session.votes.length
      ? setTimeout(() => setPhase("verdict"), 1000)
      : setTimeout(() => setVotesShown((x) => x + 1), 500);
    return () => clearTimeout(to);
  }, [phase, votesShown, session]);

  // ── Persist completed sessions (localStorage + best-effort Supabase) ──
  useEffect(() => {
    if (phase !== "verdict" || !session || !topic || savedRef.current === session) return;
    savedRef.current = session;
    const mode = session.mode || "full";
    const h = hashTopic({ mode, type: topic.type, ticker: topic.ticker, title: topic.title });
    const rec = { topic, session, mode, at: Date.now() };
    try { localStorage.setItem(lsKey, JSON.stringify(rec)); setLastSaved(rec); } catch {}
    cachePut(localStorage, cacheKey, h, rec);
    if (supabaseReady) { try { db.from("tradeiq_council_sessions").insert({ user_id: userId, topic_type: topic.type, topic_title: topic.title, ticker: topic.ticker || null, topic_hash: h, mode, session }).then(() => {}); } catch {} }
  }, [phase, session, topic]);

  useEffect(() => { feedEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [turnIdx, votesShown, phase]);

  // Sterling's gavel strikes when the verdict lands.
  useEffect(() => {
    if (phase !== "verdict") return;
    setGavel(true);
    const to = setTimeout(() => setGavel(false), 1300);
    return () => clearTimeout(to);
  }, [phase]);

  const playSession = (t, sess, src, preSaved) => {
    savedRef.current = preSaved ? sess : null;
    setTopic(t); setSession(sess); setSource(src); setTurnIdx(0); setVotesShown(0); setPowerIdx(0); setErr(null); setDossier(null); setPhase("debate");
  };

  // Cache-first convening: identical topic+mode within 24h is NEVER regenerated —
  // localStorage first (free, instant), then Supabase history, then the API.
  const convene = async (t, { force = false, mode = cMode } = {}) => {
    setErr(null); setDossier(null); setThreads({});
    const h = hashTopic({ mode, type: t.type, ticker: t.ticker, title: t.title });
    if (!force) {
      const hit = cacheGet(localStorage, cacheKey, h);
      if (hit?.session) { record({ mode, cache: "hit" }); playSession(t, hit.session, "cache", true); return; }
      if (supabaseReady) {
        try {
          const since = new Date(Date.now() - COUNCIL_CACHE_TTL).toISOString();
          const { data: rows } = await db.from("tradeiq_council_sessions").select("session").eq("topic_hash", h).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
          const cloud = rows?.[0]?.session && normalizeSession(rows[0].session, mode);
          if (cloud) { record({ mode, cache: "hit" }); cachePut(localStorage, cacheKey, h, { topic: t, session: cloud, mode }); playSession(t, cloud, "cloud", true); return; }
        } catch {}
      }
    }
    setPhase("convening");
    try {
      const token = await getToken();
      const res = await fetch("/api/council", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ mode: "convene", council: mode, topic: t, context: ctxWithNotes(t, mode) }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const norm = normalizeSession(data.session, mode);
      if (!norm) throw new Error("The council returned an unusable session — convene again.");
      record({ mode, cache: "miss", pin: data.usage?.prompt, pout: data.usage?.completion });
      playSession(t, norm, "live", false);
    } catch (e) { setErr(e.message); setPhase("idle"); }
  };

  const replay = (rec) => { if (!rec?.session) return; setSource("cache"); savedRef.current = rec.session; setTopic(rec.topic); setSession(rec.session); setTurnIdx(0); setVotesShown(0); setPowerIdx(0); setErr(null); setPhase("debate"); };
  const skip = () => { if (phase === "debate") setTurnIdx(session.transcript.length); else if (phase === "powers") setPowerIdx(99); else if (phase === "voting") setVotesShown(session.votes.length); };

  const ask = async (memberId, q) => {
    if (!q.trim() || askBusy) return; setAskBusy(true); setAskQ("");
    setThreads((p) => ({ ...p, [memberId]: [...(p[memberId] || []), { q: q.trim(), a: null }] }));
    try {
      const token = await getToken();
      const myNote = memories[memberId] ? `\nYOUR PRIVATE READ ON THE USER: ${memories[memberId]}` : "";
      const res = await fetch("/api/council", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ mode: "ask", member: memberId, question: q.trim(), brief: sessionBrief(topic, session), context: buildCouncilContext({ holdings, journal, reviews, opportunities, watchlist, topic, compact: true }) + myNote }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      record({ mode: "ask", cache: "miss", pin: data.usage?.prompt, pout: data.usage?.completion });
      setThreads((p) => ({ ...p, [memberId]: p[memberId].map((x, i, a) => (i === a.length - 1 ? { ...x, a: data.reply } : x)) }));
    } catch (e) {
      setThreads((p) => ({ ...p, [memberId]: p[memberId].map((x, i, a) => (i === a.length - 1 ? { ...x, a: `⚠️ ${e.message}` } : x)) }));
    }
    setAskBusy(false);
  };

  // ── Derived ──
  const speakingTurn = phase === "debate" ? session?.transcript[turnIdx] : null;
  const speakerId = speakingTurn?.member || (phase === "voting" && votesShown > 0 ? session?.votes[votesShown - 1]?.member : null);
  const shownVotes = session ? session.votes.slice(0, phase === "verdict" ? session.votes.length : phase === "voting" ? votesShown : 0) : [];
  const voteOf = Object.fromEntries(shownVotes.map((v) => [v.member, v]));
  const tally = voteTally(shownVotes);
  const playedTurns = session ? session.transcript.slice(0, phase === "debate" ? turnIdx : session.transcript.length) : [];
  const activePower = phase === "powers" ? powerQueue(session)[powerIdx] : null;
  const busy = phase === "convening";
  // Listener reactions — deterministic per turn, purely client-side
  const panelIds = session ? (session.mode === "quick" ? QUICK_IDS : MEMBER_IDS) : [];
  const reactionOf = speakingTurn ? Object.fromEntries(pickReactors(speakingTurn, turnIdx, panelIds).map((x) => [x.id, x.emoji])) : {};
  const treasury = useMemo(() => { const s = treasuryStats(localStorage, userId); return { s, h: treasuryHealth(s) }; }, [treasuryTick, showTreasury, userId]);
  const healthColor = { green: C.green, yellow: C.gold, red: C.red }[treasury.h.level];

  // Quick topic suggestions from real data
  const openTrades = journal.filter((t) => !t.closed);
  const topOpp = opportunities.filter((o) => o.status === "new" || o.status === "watching")[0];
  const suggestions = [
    holdings.length && { e: "🧺", l: "Full portfolio risk review", t: { type: "portfolio", ticker: "", title: "Review my full portfolio: exposures, concentration, correlated bets, hidden risks, and what to change." } },
    ...openTrades.slice(0, 2).map((t) => ({ e: "📌", l: `Review my ${t.ticker} ${t.side === "BUY" ? "long" : "short"}`, t: { type: "position", ticker: t.ticker, title: `Review my open ${t.ticker} ${t.side} from ${t.entry}${t.stop ? ` (stop ${t.stop})` : ""}${t.thesisType ? ` — thesis: ${t.thesisType}` : ""}. Hold, add, trim, or exit?` } })),
    topOpp && { e: "💡", l: `Debate: ${topOpp.ticker} ${topOpp.thesis_type || "opportunity"}`, t: { type: "opportunity", ticker: topOpp.ticker, title: `Debate the ${topOpp.ticker} opportunity [${topOpp.thesis_type || "thesis"}]: market expects "${topOpp.market_expectations}" vs reality hypothesis "${topOpp.reality_hypothesis}". Should capital be committed?` } },
  ].filter(Boolean);

  const MChip = ({ id }) => { const m = memberById(id); return <span style={{ color: m.color, fontWeight: 700 }}>{m.emoji} {m.name}</span>; };

  // ── Seat — a pure emoji character: big emoji with a colored glow halo,
  // nameplate, role, and vote badge. The emoji IS the member — no chair/body.
  // In Quick sessions, off-panel members sit greyed-out as silent observers.
  const Seat = (m, i) => {
    const speaking = speakerId === m.id;
    const sessMode = session ? session.mode || "full" : phase === "idle" ? cMode : "full";
    const observer = sessMode === "quick" && !QUICK_IDS.includes(m.id);
    const dimmed = !!speakerId && !speaking && phase !== "verdict";
    const v = voteOf[m.id];
    const size = m.id === "chairman" ? 56 : 46;
    return (
      <div key={m.id} className="c-seat" onClick={() => setDossier(m.id)} title={observer ? `${m.name} — observing this session` : `${m.name} — ${m.title}`}
        style={{ position: "absolute", left: `${SEAT_POS[i].left}%`, top: `${SEAT_POS[i].top}%`, transform: `translate(-50%,-50%) scale(${speaking ? 1.22 : 1})`, opacity: observer ? 0.32 : dimmed ? 0.55 : 1, filter: observer ? "grayscale(0.75)" : dimmed ? "saturate(0.55)" : "none", zIndex: speaking ? 6 : 3, textAlign: "center" }}>
        <div style={{ position: "relative", animation: speaking ? "cTalk 0.65s ease-in-out infinite" : observer ? "none" : `cBob ${3.2 + (i % 4) * 0.5}s ease-in-out ${i * 0.37}s infinite`, transformOrigin: "50% 100%" }}>
          {/* glow halo behind the emoji */}
          <div style={{ position: "absolute", left: "50%", top: size / 2, transform: "translate(-50%,-50%)", width: size + 38, height: size + 38, borderRadius: "50%", background: `radial-gradient(circle, ${m.color}${speaking ? "5c" : "28"} 0%, transparent 70%)`, zIndex: 0, transition: "background 0.3s ease" }} />
          {speaking && <div style={{ position: "absolute", left: "50%", top: size / 2, transform: "translate(-50%,-50%)", width: size + 46, height: size + 46, borderRadius: "50%", border: `2px dashed ${m.color}66`, animation: "cRing 6s linear infinite", zIndex: 0 }} />}
          {/* the emoji IS the member */}
          <div style={{ position: "relative", zIndex: 2, fontSize: size, lineHeight: 1.1, filter: `drop-shadow(0 6px 10px #000c) drop-shadow(0 0 16px ${m.color}45)`, transformOrigin: "50% 92%", animation: speaking ? "cNod 0.8s ease-in-out infinite" : "none" }}>{m.emoji}</div>
          {/* nameplate */}
          <div style={{ margin: "3px auto 0", width: "max-content", padding: "2.5px 11px", borderRadius: 8, background: "#0d1726e6", border: `1.5px solid ${speaking ? m.color + "75" : C.border}`, boxShadow: "0 3px 8px #0009" }}>
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 13, color: speaking ? m.color : C.text }}>{m.name}</span>
          </div>
          <div style={{ marginTop: 2.5, fontSize: 9, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: observer ? C.muted : m.color + "bb" }}>{observer ? "observing" : m.title.replace("The ", "")}</div>
          {phase === "debate" && !speaking && reactionOf[m.id] && <div key={turnIdx} style={{ position: "absolute", right: -16, top: -20, fontSize: 20, animation: "cReact 2.8s ease forwards", pointerEvents: "none", zIndex: 8, filter: "drop-shadow(0 2px 4px #000)" }}>{reactionOf[m.id]}</div>}
          {v && <div style={{ marginTop: 3, display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", padding: "2.5px 9px", borderRadius: 9, background: VOTE_COLOR[v.vote] + "26", color: VOTE_COLOR[v.vote], border: `1.5px solid ${VOTE_COLOR[v.vote]}66`, animation: "cVote 0.45s ease", fontFamily: C.display, textShadow: "0 1px 4px #000" }}>{v.vote.toUpperCase()}</div>}
        </div>
      </div>
    );
  };

  // ── Dialogue zone — a fixed band along the BOTTOM of the chamber (strategy-
  // game dialogue box). Speech, voting status, and the verdict all live here so
  // the table and all ten members stay fully visible at every phase.
  const zone = { position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", width: "min(680px,96%)", zIndex: 8 };
  const CenterStage = () => {
    if (activePower) return null;
    if (phase === "verdict" && session) {
      const vd = session.verdict;
      return (
        <div style={{ ...zone, animation: "cBubble 0.5s ease" }}>
          <div style={{ background: `linear-gradient(165deg,${C.s2}fa,${C.s1}fa)`, border: `1px solid ${VOTE_COLOR[vd.recommendation]}55`, borderRadius: 16, padding: 20, boxShadow: `0 24px 70px #000c, 0 0 50px ${VOTE_COLOR[vd.recommendation]}18`, maxHeight: "46vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 32, display: "inline-block", animation: "cGavel 1.6s ease 1" }}>🦉</span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: C.muted }}>THE CHAIRMAN'S VERDICT</div>
                <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 28, color: VOTE_COLOR[vd.recommendation], lineHeight: 1.1 }}>{vd.recommendation} <span style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>· {vd.confidence}% confidence</span></div>
              </div>
            </div>
            <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden", marginBottom: 10, border: `1px solid ${C.border}` }}>
              {session.votes.map((v) => <div key={v.member} style={{ flex: 1, background: VOTE_COLOR[v.vote] }} title={`${memberById(v.member).name}: ${v.vote}`} />)}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{tally.consensus} · council score {tally.avg >= 0 ? "+" : ""}{tally.avg}</div>
            {(() => { const co = coalitions(session.votes); return (
              <div style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.7 }}>
                {co.for.length > 0 && <span style={{ color: "#69f0ae" }}>FOR: <b>{co.for.join(" + ")}</b></span>}
                {co.neutral.length > 0 && <span style={{ color: C.gold }}>{co.for.length > 0 ? "  ·  " : ""}HOLD: <b>{co.neutral.join(" + ")}</b></span>}
                {co.against.length > 0 && <span style={{ color: "#ff5252" }}>{co.for.length + co.neutral.length > 0 ? "  ·  " : ""}AGAINST: <b>{co.against.join(" + ")}</b></span>}
              </div>); })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: "#69f0ae", marginBottom: 4 }}>🐂 BULL CASE</div><div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.text }}>{vd.bull_case}</div></div>
              <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: "#ff5252", marginBottom: 4 }}>🐻 BEAR CASE</div><div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.text }}>{vd.bear_case}</div></div>
            </div>
            {vd.key_risks.length > 0 && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: C.gold, marginBottom: 4 }}>KEY RISKS</div>{vd.key_risks.map((x, i) => <div key={i} style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>⚠ {x}</div>)}</div>}
            {vd.required_research.length > 0 && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: "#ffd54f", marginBottom: 4 }}>🕵️ REQUIRED RESEARCH</div>{vd.required_research.map((x, i) => <div key={i} style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>☐ {x}</div>)}</div>}
            <div style={{ background: C.accent + "10", border: `1px solid ${C.accent}30`, borderRadius: 8, padding: "10px 13px", marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: C.accent }}>NEXT ACTION → </span>
              <span style={{ fontSize: 12.5, color: C.text }}>{vd.next_action}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="tiq-btn" onClick={() => { setPhase("idle"); setSession(null); setTopic(null); }} style={{ background: C.accent, border: "none", borderRadius: 8, color: C.bg, fontFamily: C.display, fontWeight: 800, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", padding: "10px 16px" }}>⚖ New Session</button>
              {source !== "live" && <button className="tiq-btn" onClick={() => convene(topic, { force: true, mode: session.mode || "quick" })} style={{ background: "none", border: `1px solid ${C.gold}50`, borderRadius: 8, color: C.gold, fontFamily: C.display, fontWeight: 800, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", padding: "9px 14px" }}>↻ Convene Fresh</button>}
              {source === "live" && session.mode === "quick" && <button className="tiq-btn" onClick={() => convene(topic, { force: true, mode: "full" })} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontFamily: C.display, fontWeight: 800, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", padding: "9px 14px" }}>🏛️ Escalate to Full Council</button>}
              <span style={{ fontSize: 11, color: C.muted }}>Click any member to question their vote</span>
            </div>
          </div>
        </div>
      );
    }
    if (speakingTurn) {
      const m = memberById(speakingTurn.member);
      const kd = KIND_TAG[kindOf(speakingTurn, turnIdx, session.transcript)];
      return (
        <div key={turnIdx} style={{ ...zone, animation: "cBubble 0.35s ease" }}>
          <div style={{ background: `linear-gradient(170deg,${C.s2}f7,${C.s1}f7)`, border: `1.5px solid ${m.color}55`, borderRadius: 16, padding: "15px 19px", boxShadow: `0 18px 50px #000a, 0 0 36px ${m.color}16` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{m.emoji}</span>
              <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: m.color }}>{m.name}</span>
              <span style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase" }}>{m.title}</span>
              {kd && <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", color: m.color + "bb", border: `1px solid ${m.color}40`, borderRadius: 4, padding: "2px 8px" }}>{kd}</span>}
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.7, color: C.text, fontFamily: C.mono, minHeight: 48 }}>
              {typed}<span style={{ animation: "cBlink 0.9s infinite", color: m.color }}>▌</span>
            </div>
          </div>
        </div>
      );
    }
    if (phase === "voting") return (
      <div style={{ ...zone, textAlign: "center", animation: "cBubble 0.4s ease" }}>
        <div style={{ display: "inline-block", background: `linear-gradient(170deg,${C.s2}f0,${C.s1}f0)`, border: `1px solid ${C.gold}40`, borderRadius: 14, padding: "14px 34px", boxShadow: "0 16px 44px #000a" }}>
          <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 25, color: C.gold, textShadow: `0 0 30px ${C.gold}55` }}>THE COUNCIL VOTES</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{votesShown} / {session?.votes.length ?? 10} ballots in</div>
        </div>
      </div>
    );
    return null;
  };

  // ── Layout ──
  return (
    <div style={{ display: "flex", height: "100%", minHeight: 480, background: `radial-gradient(120% 90% at 50% 0%, #0c1426 0%, ${C.bg} 55%, #04060a 100%)`, position: "relative", overflow: "hidden" }}>
      <style>{GS2}</style>

      {/* ── CHAMBER ── */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        {/* cartoon boardroom: paneled wall seams, ceiling spotlight cone, wall seal, floor */}
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(45% 38% at 50% 44%, ${C.gold}10, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, #ffffff06 0 2px, transparent 2px 110px), linear-gradient(180deg, #0d1626 0%, transparent 42%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: "50%", top: -30, transform: "translateX(-50%)", width: "130%", height: "80%", background: `conic-gradient(from 180deg at 50% 0%, transparent 43.5%, ${C.gold}0e 50%, transparent 56.5%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "34%", background: "linear-gradient(180deg, transparent, #03050acc), repeating-radial-gradient(ellipse 120% 90% at 50% 130%, transparent 0 34px, #ffffff04 34px 36px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: "50%", top: 34, transform: "translateX(-50%)", width: 150, height: 150, borderRadius: "50%", border: `3px double ${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46, opacity: 0.35, pointerEvents: "none", boxShadow: `inset 0 0 30px ${C.gold}10` }}>⚖️</div>
        {[...Array(14)].map((_, i) => <div key={i} style={{ position: "absolute", left: `${(i * 67) % 100}%`, top: `${(i * 37) % 90}%`, width: 3, height: 3, borderRadius: "50%", background: i % 3 ? C.accent : C.gold, animation: `cDust ${4 + (i % 5)}s ease-in-out ${i * 0.6}s infinite`, pointerEvents: "none" }} />)}

        {/* header */}
        <div style={{ position: "absolute", top: 12, left: 0, right: 0, textAlign: "center", zIndex: 9, pointerEvents: "none" }}>
          <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 23, letterSpacing: "0.04em", color: C.text }}>🏛️ THE INVESTMENT COUNCIL</div>
          {topic && phase !== "idle" && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, maxWidth: 640, margin: "3px auto 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{TOPIC_TYPES.find((x) => x.id === topic.type)?.emoji} {topic.title}{session?.mode === "quick" && <span style={{ color: C.accent, marginLeft: 6 }}>⚡ quick panel</span>}{source !== "live" && <span style={{ color: C.gold, marginLeft: 6 }}>↺ cached · 0 tokens</span>}</div>}
          {phase === "idle" && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, fontStyle: "italic" }}>Ten minds. One verdict. No capital committed without a debate.</div>}
        </div>
        {(phase === "debate" || phase === "powers" || phase === "voting") && (
          <button className="tiq-btn" onClick={skip} style={{ position: "absolute", top: 14, right: 14, zIndex: 10, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, fontFamily: C.display, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 13px" }}>Skip ≫</button>
        )}

        {/* 🏛 Council Treasury — themed usage ledger, health relative to own pattern */}
        <button className="tiq-btn" onClick={() => setShowTreasury((p) => !p)} style={{ position: "absolute", top: 14, left: 14, zIndex: 10, background: C.s2 + "e8", border: `1.5px solid ${healthColor}45`, borderRadius: 7, color: healthColor, fontFamily: C.display, fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 13px", boxShadow: "0 4px 10px #0008" }}>🏛 Treasury <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: healthColor, marginLeft: 3 }} /></button>
        {showTreasury && (
          <div style={{ position: "absolute", top: 52, left: 14, zIndex: 13, width: 296, background: `linear-gradient(185deg,${C.s2}fa,${C.s1}fa)`, border: `2px solid ${C.gold}30`, borderRadius: 12, padding: 15, boxShadow: "0 18px 50px #000b", animation: "cBubble 0.25s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: serif, fontWeight: 900, fontSize: 14.5, color: C.gold }}>🏛 COUNCIL TREASURY</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", padding: "2.5px 9px", borderRadius: 9, background: healthColor + "1c", color: healthColor, border: `1px solid ${healthColor}45` }}>{treasury.h.label.toUpperCase()}</span>
            </div>
            {[["⚡ Quick sessions", treasury.s.quick], ["🏛️ Full sessions", treasury.s.full], ["💬 Member queries", treasury.s.asks],
              ["↺ Cache hits", `${treasury.s.hits}${treasury.s.hits + treasury.s.misses ? ` (${Math.round(treasury.h.hitRate * 100)}%)` : ""}`], ["✦ Fresh debates", treasury.s.misses],
              ["📜 Prompt tokens", treasury.s.pin.toLocaleString()], ["🪶 Completion tokens", treasury.s.pout.toLocaleString()],
              ["🪙 Total deliberation", treasury.s.total.toLocaleString()], ["☀️ Spent today", treasury.s.today.toLocaleString()],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "4px 0", borderBottom: `1px dashed ${C.border}55` }}>
                <span style={{ color: C.muted }}>{l}</span><span style={{ color: C.text, fontFamily: C.mono, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.55 }}>Last 30 days · real Groq usage when reported · health is measured against your own pattern, not a hardcoded limit{treasury.h.ratio > 0 ? ` (today ≈ ${treasury.h.ratio}× your usual day)` : ""}.</div>
          </div>
        )}

        {/* Sterling's gavel */}
        {gavel && <div style={{ position: "absolute", left: "50%", top: "38%", zIndex: 12, fontSize: 72, animation: "cSlam 1.25s ease forwards", pointerEvents: "none", filter: "drop-shadow(0 10px 18px #000c)" }}>🔨</div>}

        {/* carpet under the table */}
        <div style={{ position: "absolute", left: "50%", top: "43%", transform: "translate(-50%,-50%)", width: "84%", height: "56%", borderRadius: "50%", background: `radial-gradient(ellipse, #122036aa 0%, #0c172855 55%, transparent 74%)`, border: "2px solid #ffffff08", pointerEvents: "none" }} />
        {/* the table — cartoon wood: thick outline, grain rings, glossy swoosh, gold inlay, props */}
        <div style={{ position: "absolute", left: "50%", top: "40%", transform: "translate(-50%,-50%)", width: "58%", height: "36%", borderRadius: "50%", background: "radial-gradient(ellipse at 50% 30%, #7a5530 0%, #5d3e20 36%, #432c14 68%, #2c1c0c 100%)", border: "5px solid #140b04", boxShadow: `0 30px 70px #000c, inset 0 12px 26px #ffffff1a, inset 0 -18px 34px #00000099, 0 0 70px ${C.accent}0a` }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "repeating-radial-gradient(ellipse at 50% 50%, transparent 0 13px, #00000016 13px 15px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: "9%", top: "7%", width: "52%", height: "28%", borderRadius: "50%", background: "linear-gradient(160deg, #ffffff2e, transparent 62%)", filter: "blur(2px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: "7%", borderRadius: "50%", border: `2px solid ${C.gold}3d`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: "10%", borderRadius: "50%", border: `1px dashed ${C.gold}24`, animation: "cRing 90s linear infinite", pointerEvents: "none" }} />
          {["📄", "☕", "📊", "🗂️", "🖋️", "📈", "☕", "📑"].map((p, i) => { const a = (i / 8) * Math.PI * 2 + 0.45; return (
            <span key={i} style={{ position: "absolute", left: `${50 + 35 * Math.cos(a)}%`, top: `${50 + 35 * Math.sin(a)}%`, transform: "translate(-50%,-50%)", fontSize: 14, filter: "drop-shadow(0 3px 3px #000a)", pointerEvents: "none" }}>
              {p}{p === "☕" && <span style={{ position: "absolute", left: 3, top: -8, fontSize: 8, animation: `cSteam 2.2s ease-out ${i * 0.7}s infinite`, display: "inline-block" }}>〰</span>}
            </span>); })}
          {phase === "idle" && !busy && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 34, opacity: 0.85 }}>⚖️</div>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 15, color: C.gold + "cc", marginTop: 5, letterSpacing: "0.12em" }}>SESSION NOT IN PROGRESS</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, maxWidth: 300 }}>Bring an opportunity, trade, position, or thesis before the council below.</div>
              {cMode === "quick" && <div style={{ fontSize: 10.5, color: C.accent + "bb", marginTop: 6 }}>⚡ Quick panel: Sterling · Veris · Sigma · Popper</div>}
            </div>
          )}
          {busy && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div className="spin" style={{ width: 30, height: 30, border: `3px solid ${C.gold}25`, borderTop: `3px solid ${C.gold}`, borderRadius: "50%" }} />
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 14, color: C.gold, marginTop: 11, letterSpacing: "0.1em" }}>THE COUNCIL IS CONVENING…</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>reviewing your portfolio, track record & theses</div>
            </div>
          )}
        </div>

        {COUNCIL.map(Seat)}
        <CenterStage />

        {/* special power interruption */}
        {activePower && (
          <div style={{ position: "absolute", inset: 0, zIndex: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "#04060acc", backdropFilter: "blur(2px)" }}>
            <div style={{ width: "min(500px,88%)", textAlign: "center", background: `linear-gradient(170deg,${C.s2},${C.s1})`, border: `2px solid ${activePower.color}66`, borderRadius: 18, padding: "30px 28px", boxShadow: `0 0 80px ${activePower.color}30`, animation: "cPower 0.5s ease" }}>
              <div style={{ fontSize: 50, animation: "cGavel 1.4s ease infinite" }}>{activePower.emoji}</div>
              <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 27, color: activePower.color, letterSpacing: "0.1em", margin: "7px 0 5px" }}>{activePower.title}</div>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>{activePower.sub}</div>
              <div style={{ fontSize: 14, lineHeight: 1.75, color: C.text, fontFamily: C.mono }}>{activePower.text}</div>
            </div>
          </div>
        )}

        {/* composer (idle) */}
        {phase === "idle" && (
          <div style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", width: "min(620px,94%)", zIndex: 9 }}>
            {err && <div style={{ background: C.red + "15", border: `1px solid ${C.red}40`, borderRadius: 8, padding: "9px 13px", fontSize: 12.5, color: C.red, marginBottom: 8 }}>⚠️ {err}</div>}
            {suggestions.length > 0 && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 9, justifyContent: "center" }}>
                {suggestions.map((s, i) => <button key={i} className="tiq-btn" onClick={() => convene(s.t)} style={{ background: C.s2 + "ee", border: `1px solid ${C.accent}30`, borderRadius: 16, color: C.accent, fontFamily: C.mono, fontSize: 11, padding: "7px 14px" }}>{s.e} {s.l}</button>)}
                {lastSaved && <button className="tiq-btn" onClick={() => replay(lastSaved)} style={{ background: C.s2 + "ee", border: `1px solid ${C.border}`, borderRadius: 16, color: C.muted, fontFamily: C.mono, fontSize: 11, padding: "7px 14px" }}>↺ Replay last session</button>}
              </div>
            )}
            <div style={{ background: C.s1 + "f2", border: `1px solid ${C.border}`, borderRadius: 13, padding: 14, boxShadow: "0 14px 44px #000a" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {COUNCIL_MODES.map((md) => <button key={md.id} className="tiq-btn" onClick={() => setCMode(md.id)} style={{ flex: 1, textAlign: "left", background: cMode === md.id ? (md.id === "quick" ? C.accent : C.gold) + "16" : "transparent", border: `1.5px solid ${cMode === md.id ? (md.id === "quick" ? C.accent : C.gold) + "60" : C.border}`, borderRadius: 9, padding: "9px 13px" }}>
                  <div style={{ fontFamily: C.display, fontWeight: 800, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: cMode === md.id ? (md.id === "quick" ? C.accent : C.gold) : C.muted }}>{md.emoji} {md.label}{md.id === "quick" && <span style={{ fontSize: 9, marginLeft: 5, opacity: 0.8 }}>DEFAULT</span>}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{md.hint}</div>
                </button>)}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {TOPIC_TYPES.map((t) => <button key={t.id} className="tiq-btn" onClick={() => setTType(t.id)} title={t.hint} style={{ background: tType === t.id ? C.accent + "1f" : "transparent", border: `1px solid ${tType === t.id ? C.accent + "60" : C.border}`, borderRadius: 7, color: tType === t.id ? C.accent : C.muted, fontFamily: C.display, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", padding: "7px 11px" }}>{t.emoji} {t.label}</button>)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="tiq-input" value={tTicker} onChange={(e) => setTTicker(e.target.value.toUpperCase())} placeholder="TICKER" style={{ width: 106, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 12px", color: C.text, fontFamily: C.mono, fontSize: 12.5 }} />
                <input className="tiq-input" value={tText} onChange={(e) => setTText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (tText.trim() || tType === "portfolio")) convene({ type: tType, ticker: tTicker.trim(), title: tText.trim() || "Review my full portfolio: exposures, concentration, correlated bets, hidden risks, and what to change." }); }} placeholder={tType === "portfolio" ? "Optional — leave blank for a full portfolio review" : `Describe the ${TOPIC_TYPES.find((x) => x.id === tType).label.toLowerCase()} to debate…`} style={{ flex: 1, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 13px", color: C.text, fontFamily: C.mono, fontSize: 13 }} />
                <button className="tiq-btn" disabled={!tText.trim() && tType !== "portfolio"} onClick={() => convene({ type: tType, ticker: tTicker.trim(), title: tText.trim() || "Review my full portfolio: exposures, concentration, correlated bets, hidden risks, and what to change." })} style={{ background: (tText.trim() || tType === "portfolio") ? `linear-gradient(120deg,${C.gold},${C.accent})` : C.muted + "30", border: "none", borderRadius: 8, color: C.bg, fontFamily: C.display, fontWeight: 800, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 18px", cursor: (tText.trim() || tType === "portfolio") ? "pointer" : "not-allowed" }}>⚖ Convene</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MINUTES RAIL ── */}
      <div style={{ width: 362, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.s1 + "c8", display: "flex", flexDirection: "column", backdropFilter: "blur(4px)" }}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 13, letterSpacing: "0.14em", color: C.muted }}>MINUTES OF THE MEETING</span>
          {session && <span style={{ fontSize: 10.5, color: C.muted }}>{playedTurns.length}/{session.transcript.length}</span>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          {!session && <div style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.7, padding: "16px 4px", textAlign: "center" }}>The live transcript, ballots, and verdict will be recorded here once the council convenes.<div style={{ marginTop: 16, fontSize: 11.5, lineHeight: 2.1, textAlign: "left" }}>{COUNCIL.map((m) => <div key={m.id} style={{ cursor: "pointer" }} onClick={() => setDossier(m.id)}><span style={{ color: m.color, fontWeight: 700 }}>{m.emoji} {m.name}</span> <span style={{ color: C.dim }}>· {m.title}</span></div>)}</div></div>}
          {playedTurns.map((t, i) => (
            <div key={i} className="msg-in" style={{ marginBottom: 11, paddingLeft: 9, borderLeft: `2px solid ${memberById(t.member).color}50` }}>
              <div style={{ fontSize: 11.5 }}><MChip id={t.member} />{KIND_TAG[kindOf(t, i, session.transcript)] && <span style={{ color: C.muted, marginLeft: 6, fontSize: 8.5, letterSpacing: "0.1em" }}>{KIND_TAG[kindOf(t, i, session.transcript)]}</span>}</div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, marginTop: 3 }}>{t.text}</div>
            </div>
          ))}
          {session?.evidence_hold?.raised && phase !== "debate" && <div className="msg-in" style={{ margin: "11px 0", padding: "9px 12px", background: "#ffd54f12", border: "1px solid #ffd54f3a", borderRadius: 8, fontSize: 11.5, color: "#ffd54f", lineHeight: 1.55 }}>🕵️ EVIDENCE MISSING — {session.evidence_hold.demand}</div>}
          {session?.red_flags?.raised && phase !== "debate" && <div className="msg-in" style={{ margin: "11px 0", padding: "9px 12px", background: "#f48fb112", border: "1px solid #f48fb13a", borderRadius: 8, fontSize: 11.5, color: "#f48fb1", lineHeight: 1.55 }}>⚖️ RED FLAG REVIEW — {(session.red_flags.flags || []).join(" · ")}</div>}
          {shownVotes.length > 0 && <div style={{ margin: "14px 0 8px", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", color: C.muted }}>— BALLOTS —</div>}
          {shownVotes.map((v) => (
            <div key={v.member} className="msg-in" style={{ marginBottom: 9, paddingLeft: 9, borderLeft: `2px solid ${VOTE_COLOR[v.vote]}50` }}>
              <div style={{ fontSize: 11.5 }}><MChip id={v.member} /> <span style={{ fontWeight: 800, color: VOTE_COLOR[v.vote] }}>{v.vote} · {v.confidence}%</span></div>
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{v.reason}</div>
            </div>
          ))}
          {phase === "verdict" && session && <div className="msg-in" style={{ marginTop: 11, padding: "10px 13px", background: VOTE_COLOR[session.verdict.recommendation] + "12", border: `1px solid ${VOTE_COLOR[session.verdict.recommendation]}3a`, borderRadius: 8, fontSize: 12, color: C.text, lineHeight: 1.6 }}>🦉 <b style={{ color: VOTE_COLOR[session.verdict.recommendation] }}>{session.verdict.recommendation}</b> ({session.verdict.confidence}%) — {session.verdict.next_action}</div>}
          <div ref={feedEnd} />
        </div>
      </div>

      {/* ── MEMBER DOSSIER ── */}
      {dossier && (() => { const m = memberById(dossier); const v = session?.votes.find((x) => x.member === m.id); const th = threads[m.id] || []; return (
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(400px,94%)", zIndex: 20, background: `linear-gradient(190deg,${C.s2}fb,${C.s1}fb)`, borderLeft: `2px solid ${m.color}50`, boxShadow: "-22px 0 60px #000b", display: "flex", flexDirection: "column", animation: "cBubble 0.3s ease" }}>
          <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div style={{ fontSize: 44, lineHeight: 1, filter: `drop-shadow(0 4px 8px #000b) drop-shadow(0 0 14px ${m.color}45)`, animation: "cBob 3.4s ease-in-out infinite" }}>{m.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 21, color: m.color }}>{m.name}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>{m.title}</div>
              </div>
              <button className="tiq-btn" onClick={() => setDossier(null)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, fontSize: 13, padding: "5px 11px" }}>✕</button>
            </div>
            {v && <div style={{ marginTop: 11, padding: "8px 12px", borderRadius: 8, background: VOTE_COLOR[v.vote] + "14", border: `1px solid ${VOTE_COLOR[v.vote]}40`, fontSize: 12, lineHeight: 1.55 }}><b style={{ color: VOTE_COLOR[v.vote] }}>{v.vote}</b> <span style={{ color: C.muted }}>· {v.confidence}% —</span> <span style={{ color: C.text }}>{v.reason}</span></div>}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
            <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.7, fontStyle: "italic", marginBottom: 10 }}>"{m.philosophy}"</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.65, marginBottom: 10 }}>{m.focus}</div>
            {m.power && <div style={{ fontSize: 11.5, color: m.color, background: m.color + "10", border: `1px solid ${m.color}30`, borderRadius: 8, padding: "8px 11px", marginBottom: 11, lineHeight: 1.55 }}>⚡ {m.power}</div>}
            {memories[m.id] && <div style={{ background: C.s2, border: `1px dashed ${m.color}38`, borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", color: m.color, marginBottom: 4 }}>{m.name.toUpperCase()}'S READ ON YOU</div>
              <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.65 }}>{memories[m.id]}</div>
            </div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {m.questions.map((q) => <button key={q} className="tiq-btn" disabled={askBusy} onClick={() => ask(m.id, q)} style={{ textAlign: "left", background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.accent, fontFamily: C.mono, fontSize: 11.5, padding: "8px 12px" }}>❝ {q} ❞</button>)}
            </div>
            {th.map((x, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: C.blue, marginBottom: 4 }}>You: {x.q}</div>
                <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.65, background: C.s3, border: `1px solid ${m.color}28`, borderRadius: "12px 12px 12px 4px", padding: "10px 13px" }}>{x.a == null ? <span style={{ color: C.muted }}>{m.emoji} thinking…</span> : x.a}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
            <input className="tiq-input" value={askQ} onChange={(e) => setAskQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(m.id, askQ)} placeholder={`Ask ${m.name} anything…`} style={{ flex: 1, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 13px", color: C.text, fontFamily: C.mono, fontSize: 12.5 }} />
            <button className="tiq-btn" disabled={askBusy || !askQ.trim()} onClick={() => ask(m.id, askQ)} style={{ background: askBusy || !askQ.trim() ? C.muted + "30" : m.color, border: "none", borderRadius: 8, color: C.bg, fontFamily: C.display, fontWeight: 800, fontSize: 11.5, padding: "0 15px", textTransform: "uppercase" }}>Ask</button>
          </div>
        </div>
      ); })()}
    </div>
  );
}
