# TradeIQ Redesign Plan + Design System + Roadmap — V1

Companion to `UX-AUDIT-V1.md`. Goal: **professional investing operating system** — every screen answers "what is important right now?" in 3 seconds. No engine changes; this is a surface + information-architecture overhaul.

---

## 1. DESIGN SYSTEM (`src/ui.jsx` + `src/theme.js`)

All primitives live in two new files. Screens migrate to them; inline one-offs are deleted as they go. Keep the existing palette (it's good) — codify usage.

### 1.1 Type scale (the only 7 sizes allowed)

| Token | Size/weight | Font | Usage |
|-------|------------|------|-------|
| `display` | 28px / 800 | Fraunces | Verdict recommendation, page hero numbers |
| `h1` | 22px / 800 | Syne | Hero stats, portfolio value |
| `h2` | 17px / 700 | Syne | Page titles, card heroes |
| `h3` | 14px / 700 | Syne | Card titles, ticker symbols in rows |
| `body` | 13px / 400–600 | system / JetBrains Mono (numbers) | All content text, table cells, chat |
| `caption` | 11px / 500 | system | Secondary info, identity lines, sublabels — **absolute floor for information** |
| `micro` | 10px / 700 / uppercase / tracked | Syne | Section eyebrows ONLY (the `CT` pattern). Never for data. |

Rules: numbers always `tabular-nums` mono. Fraunces only for brand moments (logo, verdict, council title). Nothing below 10px anywhere; nothing the user must read to act below 12px.

### 1.2 Spacing & layout
- 4px scale: `4 / 8 / 12 / 16 / 24 / 32`. Card padding 16 (20 desktop-wide), gaps 12, section gaps 24.
- Breakpoints: **600** (phone), **880** (tablet, exists), **1200** (wide). Replace the single `.tiq-2col` rule with utility classes emitted from theme.
- Touch minimum 44×44px on every interactive element <600px.

### 1.3 Core components

```
<TickerID symbol name exchange currency sector size="row|card|hero" />
   AAPL                      ← 14/16/20px bold mono by size
   NASDAQ • USD • Technology ← 11px muted identity line, currency pill tinted (INR gold / USD blue)

<Money value currency size compact />    → ₹1,28,000 INR  /  +$420 USD
   Always symbol + code; Indian digit grouping for INR; sign-colored when delta.
   `compact` for tables (code at 9px in pill). FX conversions render "≈" + rate badge.

<StatHero label value sub tone />        → the one allowed 22-28px number per zone
<Badge tone="up|down|warn|info|neutral" icon>TEXT</Badge>   → 11px, text+color (never color-only)
<Section title action>…</Section>        → eyebrow + optional right action, consistent gaps
<DataTable cols rows mobileCard />       → sortable headers, 13px cells, 11px headers,
                                           auto card-collapse <600px (each row → stacked card)
<Sheet>                                  → modal on desktop, full-screen sheet <600px,
                                           sticky header w/ close, body scroll only
<Term k>expectancy</Term>                → dotted-underline + tooltip from src/glossary.js
<Chip3 process thesis outcome />         → the Journal triple: PROCESS A− · THESIS ✓ · +1.8R
```

`src/glossary.js`: one map — R-multiple, expectancy, profit factor, R:R, HHI/effective bets, each signal name, thesis field definitions, council terms. Used by `<Term>` and replaces most of the Learn tab.

### 1.4 Color semantics (codify, don't change)
- `green/red` = **money outcome only**. `accent` (gold) = attention/primary action. `blue` = process/info. `purple` = thesis/research.
- Process grades use a separate scale (A/B/C lettering + blue family) so a losing-but-well-executed trade never reads "all red".
- Every color encoding ships with a text label (votes, risk levels, signals).

---

## 2. INFORMATION ARCHITECTURE — 10 tabs → 6

```
┌─ Dashboard      Mission Control (new default tab)
├─ Markets        Watchlist + Scanner merged · Chart opens as overlay from any row
├─ Ideas          Opportunities pipeline + Research workspace
├─ Journal        Trades + Reviews (the core loop)
├─ Council        unchanged as destination
└─ Alpha          Performance + Personal Alpha + Risk Center (sub-tabs)

 ✦ AI Advisor → global drawer, available on every screen, context-aware
 ✦ Learn → dissolved into <Term> glossary + first-use hints
 ✦ Strategies → playbook cards inside Markets/Scanner; strategy stats live in Alpha
```

Cross-linking (the "connected OS" feel): watchlist rows show 💡/📓/🧠 status dots → click-through to the idea/trade; opportunity → prefilled trade (exists, keep); review → Alpha leak; Council verdict "Next Action" deep-links (research → Ideas, log → Journal).

---

## 3. TARGET LAYOUTS PER SCREEN

### 3.1 Dashboard — Mission Control
```
┌────────────────────────────────────────────────────────────┐
│ PORTFOLIO        ₹10.7L INR + $4,210 USD     RISK: ⚠ HIGH  │  hero band
│ +₹38,400 (+3.7%) all-time                    NVDA 32% of book│
├──────────────┬──────────────┬───────────────┬──────────────┤
│ Open positions(N) │ Effective bets 2.4 │ Expectancy +0.45R │ Investor IQ 71% │
├────────────────────────────────────────────────────────────┤
│ ⭐ TOP CONVICTION   RELIANCE.NS · Margin Expansion · 78%    │ → Ideas
│ ⚠ BIGGEST RISK     AI&Semis = 54% across NVDA+AMD+TSM      │ → Alpha/Risk
├────────────────────────────────────────────────────────────┤
│ Positions (cards w/ TickerID, value, P&L)    | Movers (top5)│
└────────────────────────────────────────────────────────────┘
```
Removed from Dashboard: full watchlist, hardcoded Max-Risk card, quick-AI buttons (→ drawer).

### 3.2 Markets (Watchlist+Scanner)
TradingView-density rows: `TickerID | Price+Δ% (sign-colored, Money) | spark | RSI | Signal badge | status dots | ⋯`. Sortable. Technical columns collapse behind row-expand on <880px. Chart = full-screen overlay from any row.

### 3.3 Journal trade card v2
```
┌ AAPL  NASDAQ•USD•Tech   BUY · EMA Pullback        OPEN 14d ┐
│ Entry $205.50 → Now $214.20      P&L +$87 (+4.2%) · +0.9R │ ← 16px zone
│ Stop $198 · Target $230 · 10 sh                            │
│ [PROCESS A−] [THESIS ✓ Correct] [WIN]   ▸ review, thesis   │ ← Chip3
└────────────────────────────────────────────────────────────┘
```
Add-trade = 2-step Sheet (Trade → Thesis), inline validation, live Trade Math from first price entered, close-trade inline popover (kill `prompt()`).

### 3.4 Ideas (Opportunities)
Pipeline columns or status-grouped list: NEW / RESEARCHING / WATCHING / LOGGED. Card: TickerID + thesis-type badge + labeled confidence dial + `EDGE:` line + `KILLS IT:` line + status. Research workspace: field order Type/Conf/Risk → Invalidation → Expectations/Reality → Bull/Bear; evidence entries typed FACT/ASSUMPTION/OPINION/SPECULATION (4-color tags; add `type` to research.js entries); completeness = required fields only.

### 3.5 Council
Keep the theater — fix the payoff and mobile:
- Verdict v2: Recommendation 32px → labeled tally ("3 Buy · 1 Neutral") → **NEXT ACTION box (2nd most prominent)** → bull/bear columns → risks/research collapsible. No internal scroll for the first three.
- Active-speaker spotlight ring + synced transcript highlight. Human labels for KIND tags. Cache-age banner. Quick-mode persistent badge.
- <700px: chamber only, transcript bottom-sheet, verdict full-screen sheet.

### 3.6 Alpha (Performance · Personal Alpha · Risk)
- **Performance:** hero stat band (WinRate/Expectancy/PF/MaxDD) → labeled equity curve w/ caption → per-currency Money blocks → Investor IQ condensed (3 stats). Monthly table → bars.
- **Personal Alpha:** keep Edge/Leak heroes; add source badge (Behavioral/Statistical); hide n<5 behind "Emerging"; `<Term>` everywhere.
- **Risk Center (new sub-tab, data exists in portfolio.js):** concentration donut + "2.4 effective bets" hero, theme bars, correlation clusters w/ "theme proxy" disclosure, flags as banners. Disclose FX rate.

### 3.7 Chart
Defaults candles+volume; panels 50/35px; 11px axes, 1px grid; floating crosshair tooltip; grouped Indicators control; **trade overlays from journal** (entry/stop/target lines + P&L shading + thesis pin); tap-to-inspect <600px; "Range — daily candles" labeling. Replay scrubber = Phase 4.

### 3.8 Review card v2
"Decision quality" group (4 bars) visually separate from "Result" block (explicit `Money` P&L + R). Verdict sentence promoted with plain-English subtitle. Render `thesis_reason`. Override buttons mark user-vs-AI.

---

## 4. IMPLEMENTATION ROADMAP

Each phase ships independently; `npm run build` + `npm test` green after each. Files stay <500 lines (split App.jsx tabs into `src/screens/` as they migrate).

### Phase 0 — Foundation (no visual redesign yet)
1. `src/theme.js` (tokens) + `src/ui.jsx` (TickerID, Money, Badge, StatHero, Section, Term, Sheet, DataTable) + `src/glossary.js`.
2. Global CSS: breakpoints 600/880/1200, type floor, touch-target rule, focus-visible (exists).
3. **Quick wins, app-wide:** kill every 8–9px → 10/11px; `<Money>` swap everywhere (fixes calculator $, dual-currency tile, opportunity %); `<TickerID>` swap everywhere; replace `prompt()`.
   *Exit test: no font <10px in src/; every monetary value shows a currency code.*

### Phase 1 — Mission Control + IA
4. Tab consolidation to 6 + AI drawer; default tab → Dashboard.
5. Dashboard Mission Control layout (§3.1); Risk hero from portfolio.js.
6. Cross-link status dots on watchlist rows.

### Phase 2 — Core loop (Journal · Ideas · Review)
7. Trade card v2 + Chip3; 2-step add-trade Sheet; inline validation.
8. Review card v2 (process/result split, thesis_reason, explicit P&L).
9. Ideas pipeline + research workspace reorder + typed evidence (small data-model addition in research.js + migration-safe default `type:"note"`).

### Phase 3 — Markets + Alpha
10. Merged Markets screen w/ sortable DataTable + mobile card collapse.
11. Alpha restructure (Performance order, Risk Center sub-tab, glossary pass).

### Phase 4 — Council + Chart polish
12. Council verdict v2 + mobile sheets + spotlight + human labels + cache banner.
13. Chart: defaults/axes/tooltip + trade overlays; replay scrubber last.

### Success criteria (from the brief — verify after Phase 2 and again after 4)
First-time user, 5 seconds each, no searching: What do I own? (Dashboard hero) · My risk? (Risk hero/Center) · What to look at? (Top conviction + flags) · Best opportunity? (Ideas #1) · My mistakes? (Alpha leak hero) · Council's view? (verdict v2 + dashboard link).

---

**Estimated diff surface:** ~2,000 lines touched, net code *decrease* likely (primitives replace ~700 inline style objects). No backend/API/schema changes except optional `type` on research evidence entries.
