# TradeIQ Frontend UX/UI Audit — V1

**Date:** 2026-06-12
**Scope:** Every screen in `src/` (App.jsx tabs, Council, ChartView, Performance, Personal Alpha, Portfolio Intelligence, Research Workspace, Trade Review, Ticker Search, Login).
**Method:** Full code-level audit of all 2,700 rendered lines; five parallel deep-read passes, synthesized here.
**Verdict:** TradeIQ's *engines* are institutional-grade (R-multiple analytics, per-currency isolation, process-vs-outcome review model, council memories). The *surface* is not. The UI systematically under-sizes what matters (tickers, verdicts, insights) and over-renders what doesn't (chrome, tables, duplicate sections). Nothing here needs a rebuild — it needs a hierarchy inversion and a design system.

---

## 0. THE SEVEN SYSTEMIC PROBLEMS

These appear on every screen. Fixing them globally resolves ~60% of the per-page findings.

### S1. Micro-typography epidemic
**Problem:** The app's de-facto body text is 10–11px; labels run 8–9.5px uppercase with letter-spacing. Found on every screen: table headers 9px, field labels 8px (Opportunities), evidence timestamps 8px, council role titles 9px, chart axis dates 9px. Three typefaces (Syne, Fraunces, JetBrains Mono) compete at these sizes.
**Why it matters:** 9px uppercase tracked text is below any professional readability floor (Bloomberg's smallest terminal text ≈ 11px equivalent; Linear/Stripe never go below 12px for content). It fails WCAG AA contrast-at-size, and on a 375px phone it is physically illegible. The user must lean in to read their own money.
**Fix:** Enforce a 7-level type scale (see Design System) with an **11px absolute floor**, 12px for anything the user must read to act. Reserve uppercase-tracked micro labels for true section eyebrows only.

### S2. No design system — 700+ inline styles, one breakpoint
**Problem:** Every style is an inline object; the only responsive rule in the entire app is `@media(max-width:880px){.tiq-2col{...}}`. No spacing scale, no shared table/modal/badge primitives beyond 6 micro-components.
**Why it matters:** Inconsistent density is a direct consequence — each card invents its own padding and font sizes. Mobile is structurally broken (Council's fixed 362px rail, modals with 24px padding on 375px screens, 9-column tables that can't reflow). One-off styling makes every future feature drift further.
**Fix:** Extract tokens + primitives into a single `ui.jsx` (or CSS file): spacing scale, type scale, Card/Badge/Button/Table/Modal with built-in responsive behavior. Delete one-off styles as screens migrate.

### S3. Currency is ambient, never explicit
**Problem:** Money renders with `symbolFor()` only (`₹`/`$`). The Portfolio Value stat card mixes USD primary + INR sub-line in one tile. The position-size calculator hardcodes `$` labels. Opportunity return % has no currency context. FX is a hardcoded `1/84` with no disclosure.
**Why it matters:** This is a dual-market (NSE + US) app — currency ambiguity is not cosmetic, it's a correctness hazard. `₹` and `$` at 10px are one glyph apart from a 84× valuation error.
**Fix:** A single `<Money>` component used everywhere: symbol + amount + small currency code (`₹1,28,000 INR` / `+$420 USD`), locale-correct grouping (Indian lakh grouping for INR). Disclose the FX rate wherever cross-currency aggregation happens.

### S4. Tickers are the smallest important thing on screen
**Problem:** Tickers render at 12px (watchlist/scanner) to 15–16px (cards/headers), with no exchange, no sector, and currency only as an occasional tag. The clock in the market header is 15px — bigger than most tickers.
**Why it matters:** The ticker is the user's anchor for every decision. TradingView renders symbols as the dominant element of every row. In TradeIQ you identify a stock by squinting.
**Fix:** A dedicated `<TickerID>` block used in every row/card/header:
```
AAPL                    RELIANCE.NS
NASDAQ • USD • Tech     NSE • INR • Energy
```
Symbol 15–18px bold mono/display, identity line 11px muted. Search metadata (exchange, sector) is already captured at entry — render it.

### S5. Hierarchy is flat or inverted — insights buried, chrome promoted
**Problem:** Default tab is Performance (not a mission control). Performance buries Win Rate/Expectancy under a 6-card Investor IQ block. Portfolio concentration — the #1 risk metric — is three 8px-label tiles below the fold of the Dashboard. The Council verdict's "Next Action" is a small box at the bottom of a scrolling 46vh modal. Every screen presents 10–40 data points at near-equal visual weight.
**Why it matters:** The product's promise is "what is important right now, in 3 seconds." Today the answer requires scanning tables.
**Fix:** Every screen gets exactly one hero zone (the single most decision-relevant fact, 22–34px), a support row (3–5 stats), and collapsed/secondary detail. Specifics per page below.

### S6. Ten disconnected tabs — the engines don't feel like one OS
**Problem:** Council, Performance, Opportunities, Dashboard, AI Advisor, Scanner, Charts, Strategies, Journal, Learn — ten peer tabs with emoji labels. Opportunities → Research → Journal → Review → Alpha is the product's actual loop, but the nav presents them as unrelated rooms. Recurring Mistakes appears in both Performance and Personal Alpha; watchlist logic appears in Dashboard and Scanner.
**Why it matters:** IA sprawl is why it "feels like developer tools" — features accreted as tabs instead of composing into workflows.
**Fix:** Consolidate to 6 destinations (see Redesign Plan): **Dashboard · Markets (watchlist+scanner+chart) · Ideas (opportunities+research) · Journal (trades+reviews) · Council · Alpha (performance+personal alpha+risk)**. AI Advisor becomes a global drawer; Learn dissolves into inline glossary tooltips; Strategies folds into Markets/Journal.

### S7. Unexplained jargon everywhere
**Problem:** R-multiple, expectancy, R:R, HHI/effective bets, signal names (EMA PULLBACK / BREAKOUT WATCH), council "KIND" tags (OPENS/INTERJECTS), "council score," confidence tiers, thesis field names — none defined in-product. The Learn tab exists but is disconnected from the moments of confusion.
**Why it matters:** The user's own success metric: a first-time user answering 6 questions in 5 seconds. Jargon without affordance fails them at every screen.
**Fix:** One `<Term>` tooltip component with a shared glossary; first-use inline hints; rename internal vocabulary to human labels (e.g. "INTERJECTS" → "Moderator note").

### S8 (bonus). Accessibility debt
Color-only encodings (votes, risk levels), no aria labels on tabs/seats/charts, clickable `<tr>`s with no keyboard path, touch targets down to 14–22px (Council buttons, risk toggles), muted-on-dark below 4.5:1 at small sizes, browser `prompt()` for closing trades.
**Fix:** Bundled into the design-system primitives: 44px touch minimum, text+color dual encoding, aria on all interactive elements, focus-visible everywhere (already partly present), replace `prompt()` with proper inline forms.

---

## 1. DASHBOARD (App.jsx 541–617)

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 1.1 | Default tab is **Performance**, not Dashboard — there is no "mission control" landing | First 3 seconds of every session land on analytics, not "what do I own / what's my risk / what needs attention" | New Mission Control layout (see plan): Portfolio Value+Risk hero band → Open positions → Top conviction opportunity → Biggest risk flag → Alpha snapshot → Investor IQ |
| 1.2 | Portfolio Value card mixes USD primary + ₹ sub-value in one 22px tile | Mixed-currency holders can't tell which number is real vs converted; conversion uses undisclosed hardcoded ₹84/$ | `<Money>` with explicit code; conversion on its own labeled line: "≈ ₹10.7L INR @ ₹84/$" |
| 1.3 | "Max Risk/Trade ₹100" is a hardcoded stat card | Dead number presented at the same weight as live P&L; erodes trust in every other stat | Compute from capital × risk% setting; or remove from hero row |
| 1.4 | Portfolio Intelligence (concentration, themes, flags) renders as 8px-label tiles and 10px bars below holdings | The single biggest account risk (e.g. "NVDA is 32% of book") is the least visible element | Promote to a Risk hero card: "≈2.4 effective bets · NVDA 32% ⚠" with donut; flags as full-width alert banners |
| 1.5 | Holdings table: 11px rows, 9px headers, 75px inline price-update input, rows double as AI-chat triggers | Cramped, no keyboard path, accidental chat invocations; inline input untappable on phone | Card-per-holding on mobile; explicit ⋯ menu for actions; update-price as proper control |
| 1.6 | Watchlist inside Dashboard duplicates Scanner's list with different columns | Two half-watchlists = neither feels authoritative | Dashboard shows top-5 movers/positions only; full watchlist lives in Markets |
| 1.7 | Market header: clock at 15px outweighs everything; refresh is a bare ↻ at 10px | Time-of-day is decoration; data freshness is buried | Compact status chips (`US OPEN · India CLOSED · Updated 12:34`); demote clocks |

---

## 2. WATCHLIST + SCANNER (App.jsx 115–167, 682–713)

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 2.1 | Ticker cell = 12px symbol + 9px name; no exchange/currency/sector | Core identification fails the 3-second test | `<TickerID>` block per row (S4) |
| 2.2 | 9-column scanner table (Stock/Price/EMA20/EMA200/RSI/Signal/Stop/Target/Size) at 9–11px | Unscannable density; impossible at 375px | Tiered row: identity + price/Δ% + signal badge prominent; EMA/RSI/stop/target in expandable detail or right-side column set hidden on mobile |
| 2.3 | Signal tags (EMA PULLBACK, BREAKOUT WATCH, WAIT) unexplained | User can't act on a label they don't understand | `<Term>` tooltip + signal legend; "WAIT" rows de-emphasized via opacity, not "—" |
| 2.4 | No sorting, no thesis/opportunity status on rows | The watchlist doesn't show whether *you* have a view on the stock — the one thing TradingView can't do | Sortable headers; per-row status dots: 💡 has opportunity · 📓 open trade · 🧠 thesis logged |
| 2.5 | Position calculator labels hardcode `$` | Indian user computing position size in the wrong currency | Currency follows selected market/ticker via `<Money>` |
| 2.6 | US/India toggle is two large clock-cards | Heavy market switcher; redundant info | Segmented control + status chips |

---

## 3. JOURNAL (App.jsx 749–838) — core product

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 3.1 | Trade card shows ticker 15px + tags, but Entry/Stop/Target/Exit live in a 9px-label grid; P&L 14px with 9px % | The five numbers that define a trade are the smallest text on the card | Trade card v2: TickerID left · Entry→Current/Exit center · P&L (value+%+R) right at 16–18px; thesis/review strips below |
| 3.2 | **Process vs Thesis vs Outcome conflated** (with TradeReview, see §7): one P&L color drives the whole card | The product's core epistemics — good process ≠ winning trade ≠ correct thesis — are invisible at card level | Three independent chips on every closed trade: `PROCESS A−` (review grade) · `THESIS ✓ correct` · `P&L +1.8R`; each its own color scale |
| 3.3 | Add-trade form: 8 fields + 4 thesis textareas + slider + evidence in one wall | Highest-friction moment of the product; cognitive overload deters logging | Two-step flow: ① Trade (ticker/side/prices/size — with live Trade Math) ② Thesis (type, confidence, 4 fields with inline validation). Prefill from opportunity already exists — surface it |
| 3.4 | Validation errors render *below* the save button after click | User discovers problems too late, must hunt the failing field | Inline per-field validation; save button shows missing-count |
| 3.5 | Close-trade uses `window.prompt()` | Breaks design language entirely; no validation, jarring on mobile | Inline close popover: exit price, auto-computed P&L/R preview, confirm |
| 3.6 | Character counters only turn visible at limit; thesis section borders gold-when-empty | Subtle states the user must decode | Counter warns at 80%; explicit "required" badges |
| 3.7 | Currency tag "₹ INR" pill beside ticker but prices show symbol only | Inconsistent — identity says INR, numbers say ambiguous | TickerID carries currency; all numbers via `<Money>` |

---

## 4. OPPORTUNITIES (App.jsx 492–536)

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 4.1 | Card leads with ticker 15px, but Confidence is an unlabeled 16px "72%" and Expected-edge/Key-risk are 8px-label/10px-text fields | A hedge-fund pipeline card must answer: what, how confident, what edge, what kills it — currently all whispered | Card v2 header: TickerID · thesis-type badge · confidence dial (labeled) · status. Body: "Edge" and "Key risk" as the two visible lines; rest behind expand |
| 4.2 | Return-since-generation % has no currency/price context | "+5.2%" against an invisible baseline | "↑ +5.2% since ₹2,750 · May 28" |
| 4.3 | Risk level = colored left border only | Color-only encoding; meaning undefined | `RISK: MEDIUM` text badge + tooltip on methodology |
| 4.4 | "Critique & Log →" label | Internal vocabulary; intent unclear | "Log as Trade →" (keeps the critique framing in the form it opens) |
| 4.5 | Logged cards fade to 0.78 opacity wholesale | Reads as disabled, not as status | Status badge column (NEW / RESEARCHING / WATCHING / LOGGED / DISMISSED) — a real pipeline, kanban-ish grouping |

---

## 5. COUNCIL (Council.jsx, 528 lines)

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 5.1 | Verdict modal: 8+ stacked sections inside `maxHeight:46vh` scroll; "Next Action" is a small box near the bottom | The flagship feature's payoff can be scrolled past or never seen | Verdict v2 hierarchy: Recommendation (32px+) → vote tally bar with labels → Next Action as the #2 element (14–16px, accent box) → bull/bear columns → risks/research collapsible |
| 5.2 | Speaker ID relies on a subtle 1.22× scale + dim others; nameplate 13px, role 9px | Following the debate requires constant re-orientation | Spotlight ring in member color around active seat; transcript rail highlights current turn in sync |
| 5.3 | Minutes rail fixed 362px; dialogue bubble min(680px,96%) | At 375px the rail consumes ~96% of width or overlaps — Council is desktop-only today | <700px: chamber-only view, transcript as bottom-sheet drawer, verdict full-screen |
| 5.4 | Vote tally bar is color-only segments; "council score 0.8" unexplained | Color-blind users can't read the vote; score is opaque | Tally with counts+labels ("3 Buy · 1 Neutral"); score gets subtitle "avg vote, −2…+2" |
| 5.5 | KIND tags (OPENS/CHALLENGES/INTERJECTS/POWER), "RED FLAG REVIEW", "EVIDENCE MISSING" | Developer vocabulary in a consumer moment | Human labels + first-use tooltips ("⚡ Intervention — Marlowe can suspend the vote") |
| 5.6 | Quick-mode (4 members) indicated only by tiny header badge + dim "observing" seats | Users think the council is broken when 6 members stay silent | Persistent "⚡ Quick panel — 4 of 10 voices" banner + verdict footnote + escalate CTA (exists, keep) |
| 5.7 | Cached sessions show "↺ cached" with no age | Stale verdicts can drive live decisions | "Convened May 30, 2:10 PM — markets have moved · Convene fresh" banner |
| 5.8 | Touch targets: dossier close 22px, composer buttons 24px, suggested questions 18px | Below 44px minimum; flagship feature frustrates on phone | Design-system buttons fix globally |

---

## 6. CHART PAGE (ChartView.jsx, 509 lines)

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 6.1 | With default toggles, indicator panels (Vol 45px + RSI 70px + MACD 70px + gaps) eat ~37% of canvas height | Price action — the point of the page — is compressed | Default: candles + volume only; panel heights 50/35px; chart keeps ≥72% |
| 6.2 | **No trade or thesis overlays** — journal data never reaches ChartView | The one chart feature TradingView can't offer (your entries/stops/targets/theses on the chart) is missing | Pass ticker-filtered trades: entry marker, stop/target dashed lines, P&L zone shading, thesis annotation pins |
| 6.3 | Grid 0.5px @ 50% alpha; prices 10px; dates 9px and colliding | Reference frame illegible | 1px grid @ ~25% lighter color, 11px axis labels, max 5–6 date labels |
| 6.4 | OHLCV readout fixed in a 28px top bar, far from cursor | Constant eye travel | Floating crosshair tooltip near cursor + keep bar |
| 6.5 | Indicator toggles: four 9px uppercase buttons, unlabeled cluster | Discoverability ≈ zero | Grouped "Indicators" control with clear on/off states |
| 6.6 | No touch model: crosshair cursor, hover-only, no pinch/scrub | Chart is mouse-only in 2026 | Tap-to-inspect, drag-to-scrub; stack panels vertically <600px |
| 6.7 | No replay/scrub | Thesis backtesting moment lost | Date scrubber + step-forward replay (Phase 4 — nice-to-have) |
| 6.8 | "1M/3M/6M/1Y" buttons imply candle interval | All data is daily; "1M" reads as monthly candles | Label "Range — daily candles"; interval param already exists server-side for future |

---

## 7. TRADE REVIEW (TradeReview.jsx) + RESEARCH WORKSPACE (ResearchWorkspace.jsx)

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 7.1 | Outcome score bar rendered identically to the 4 process bars | UI contradicts the product's own thesis (process ≠ outcome); reviews.js explicitly separates them | Visually split: "Decision quality" group (4 bars) vs "Result" (P&L/R, distinct styling); verdict label ("Good process · bad outcome") promoted above the bars at ≥12px with plain-English subtitle ("You did it right and got unlucky — keep doing this") |
| 7.2 | Realized P&L/R never shown explicitly in the review | The reader infers money from an abstract 0–100 "Outcome" | "Result: −₹420 INR · −0.8R" line in the Result block |
| 7.3 | `thesis_reason` (AI's why) exists in data but is never rendered | Verdict without reasoning = no trust, no learning | Render under thesis verdict; user override buttons get "your call" highlight when overriding AI |
| 7.4 | Evidence log is one flat type — no Fact/Assumption/Opinion/Speculation | The audit-trail credibility the Research Command Center needs doesn't exist in the data model | Add `type` to evidence entries (research.js) + 4-color tag selector in UI; AI-sourced entries already marked — extend the pattern |
| 7.5 | Research completeness meter counts evidence+notes, so 4/4 required fields ≈ 66% | "Done" never reads as done | Meter = required fields only; evidence/notes listed as "strengthen your case" extras |
| 7.6 | Invalidation — the most decision-critical field — renders last, below bull/bear walls | Users trade without exit criteria visible | Reorder: Type/Confidence/Risk → **Invalidation** → Expectations/Reality → Bull/Bear |
| 7.7 | "Create Trade from Research" at 0.6 opacity when blocked, reason in 9px below | Dead-feeling primary CTA | Disabled state + "Missing: bear case, invalidation" inline list |

---

## 8. PERFORMANCE + PERSONAL ALPHA + (future) RISK CENTER

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 8.1 | Investor IQ's 6 sub-cards sit above the headline Win Rate/Expectancy/PF tiles | Hero metrics demoted on their own page | Order: hero stat band → equity curve → currency blocks → Investor IQ (3 condensed stats) |
| 8.2 | Equity curve: unlabeled SVG, no axis, no trend caption | Fast scroll registers nothing | Y ticks in R, zero line, caption "↗ +4.2R over 23 trades"; green/red zone fill |
| 8.3 | Monthly returns = month×currency table, 9px headers | Spreadsheet where a picture belongs | Per-currency bar pairs or dual sparkline + total line |
| 8.4 | Recurring Mistakes section duplicates Personal Alpha's leak analysis on the same page | Same insight twice, half-strength both times | Remove from Performance; Personal Alpha owns leaks |
| 8.5 | Personal Alpha hero cards (Edge/Leak) are good — but leak card silently switches between behavioral-mistake and statistical-condition sources | Two different kinds of advice look identical | Sub-badge: "Behavioral (from reviews)" vs "Statistical (expectancy)" |
| 8.6 | Sub-5-trade dimensions render dimmed but present; "LOW" confidence tier on hero cards | Clutter + mistrust ("why is an unreliable stat my headline?") | Hide <5-trade buckets behind "Emerging" expander; rename LOW → "Early signal · n=7" |
| 8.7 | No glossary for expectancy/R/confidence anywhere | The page is unreadable to its target user without prior education | `<Term>` tooltips; one-line explainer under page title |

---

## 9. TICKER SEARCH, LOGIN, AI ADVISOR

| # | Problem | Why it matters | Proposed fix |
|---|---------|----------------|--------------|
| 9.1 | Search rows: 12px symbol, 9px name/exchange/currency | The moment exchange+currency matter most, they're at 9px | Result row uses TickerID layout; currency pill 11px |
| 9.2 | AI chat bubbles max-width 80% (≈990px on desktop), 12.5px mono | 200-char lines are unreadable | maxWidth min(640px, 86%); 13px |
| 9.3 | Chat lacks timestamps, error surfacing on 429/failure | Silent failures in an advice surface | Timestamps 10px; inline error banner with retry |
| 9.4 | AI Advisor as a peer tab | The advisor is a companion to every screen, not a destination | Global chat drawer (keyboard `?` / corner button), context-aware to the active screen |
| 9.5 | Login is fine — keep. Minor: 9px footer note → 11px | — | — |

---

## 10. MOBILE SUMMARY (all pages, 375px)

- **Broken:** Council (362px rail), all 6+ column tables (Holdings, Scanner, Monthly Returns), Research/Verdict modals (24px padding, no sticky close), chart (hover-only), thesis form (4 textareas full-bleed).
- **Degraded:** every 8–10px label, 14–24px touch targets, two-currency stat tiles.
- **Cause:** single 880px breakpoint; desktop-density layouts shrink instead of reflowing.
- **Fix policy (design system):** breakpoints 600/880/1200; tables→cards <600px; modals→full-screen sheets <600px; rails→drawers; min touch 44px; type floor 11px (12px for data).

---

*Continue to `REDESIGN-PLAN-V1.md` for the design system, per-screen target layouts, and the implementation roadmap.*
