# TradeIQ — Responsive Architecture Audit (Phase 1)

**Date:** 2026-06-13
**Scope:** every page/tab + modals, 320px → 2560px, Chrome/Safari/Edge/Firefox.
**Method:** static read of all 15 `src/*.jsx` files, `theme.js`, and the two injected `<style>` blocks (App shell `GS`, Council). No code changed (Phase 1 is audit-only).
**Status of this doc:** findings + recommended fixes. Phases 2–3 (design system + refactor) are **not** started.

---

## 0. Executive summary — read this first

TradeIQ is **not** an un-responsive app. There is a real mobile pass already in place:

- Bottom nav + "More" sheet on phones, desktop tab strip hidden < 700px (`App.jsx` `GS`).
- `100dvh`-aware full-bleed heights, `env(safe-area-inset-*)` notch handling, `-webkit-overflow-scrolling:touch`, `-webkit-text-size-adjust:100%`.
- Inputs forced to 16px on phones to kill iOS focus-zoom (`GS` line 134).
- Most page layouts use `auto-fit`/`minmax` grids that genuinely collapse (Mission Control, Alpha Lab, Decision Quality, Learn, Journal cards).
- Tables live in `.tiq-scroll` horizontal-scroll containers; Council and the Opportunity board reflow/stack via their own media queries.

So the honest framing: **this is a remediation, not a rebuild.** The failures are **systemic but shallow** — they repeat the same handful of root causes across pages. Fixing the 5 systemic issues below resolves ~80% of the findings. The remaining ~20% are a short list of specific overflow bugs.

**The three hard-requirement violations that are real and pervasive:**

1. **Informational text below 12px** — the type scale *defines* its information floor at **11px** (`T.caption`), uses **10px** (`T.micro`) for labels, and individual components hardcode **8.5px–11.5px** for real data. This violates "no informational text below 12px" almost everywhere.
2. **Touch targets below 44px** — the global coarse-pointer rule sets only **40px** (`GS` line 137); many buttons are 24–36px tall.
3. **Breakpoint sprawl** — six different breakpoints (`880/760/700/600/480`, plus Council `760`) hardcoded across four files with no shared token.

Everything else is a contained list (Section 4).

---

## 1. Breakpoint reality (what exists today)

| Breakpoint | Where | Purpose |
|---|---|---|
| 880px | `MissionControl` mc-grids, `App GS` `.tiq-2col` | collapse 2-col → 1-col |
| 760px | `Council` `.c-root` | stack chamber + rail |
| 700px | `App GS` | desktop tabs → bottom nav, mobile padding, 16px inputs |
| 600px | `App GS` | duplicate `.tiq-2col` rule, table min-width |
| 480px | `MissionControl` `.mc-loop` | 4-col learning loop → 1-col |
| (none) | most pages | rely on `minmax()` auto-fit |

**Problem:** the Council stacks at 760 but the app chrome only switches to mobile at 700 — a 60px band (700–760) where Council is already mobile-stacked while the rest of the app is still desktop. Breakpoints must become shared tokens (Phase 2).

---

## 2. Type scale vs the 12px requirement

`theme.js` declares the **only allowed sizes**:

```
display 28 · h1 22 · h2 17 · h3 15 · body 14 · data 13 · caption 11 · micro 10
```

The scale's own comment names **`caption:11` the "INFORMATION FLOOR"** and `micro:10` for "uppercase eyebrows ONLY." The hard requirement is a **12px** information floor. Therefore:

- Every `fontSize:T.caption` (11px) carrying information **fails** — and it is used for identity sublines, %, deltas, council bull/bear text, source publishers, dates, hints, etc., on every page.
- Every `fontSize:T.micro` (10px) used as a **data label** (not just an eyebrow) fails — e.g. Mission Control `Kv` value labels, Open-Position Entry/Now/Unrealized labels.
- **Hardcoded sub-floor literals** (worst offenders):
  - `Pipeline.jsx:29,46` — **`fontSize:8.5`** score-strip labels (Edge/Research/Council/Risk). **Critical.**
  - `ResearchWorkspace.jsx` — `10`/`11` for task meta, source dates, "not ingested", fundamentals labels, footers.
  - `Council.jsx` — `11`, `11.5`, `12` for debate lines, votes, verdict text.
  - `TradeReview.jsx` — `10`/`11` for verdict labels, score bars, tags.
  - `ChartView.jsx:456` — OHLCV hover bar at `11`; canvas axis text drawn at `10–11px`.

**Root cause:** the floor was set to 11/10 by design intent; the requirement raises it to 12. This is a **one-token change + a sweep of hardcoded literals**, not per-component redesign.

---

## 3. Systemic findings (documented once; they recur on every page)

| ID | Finding | Screen sizes | Severity | Root cause | Recommended fix |
|---|---|---|---|---|---|
| **S1** | Informational text at 8.5–11px throughout | all (worst on mobile) | **High** (Critical at 8.5px) | `T.caption=11`/`T.micro=10` floor + hardcoded literals | Raise info floor to 12px: bump `T.caption→12`, reserve `T.micro=11` for eyebrows only; purge `fontSize:8.5/10/10.5/11/11.5`; route all sizes through `T` |
| **S2** | Touch targets 24–40px (need ≥44) | touch / coarse pointer | **High** | `@media(pointer:coarse){.tiq-btn{min-height:40px}}` is 40 not 44; many buttons set `padding:3px 8px`/`minHeight:36` and bypass `.tiq-btn` | Set coarse min to **44px** for `.tiq-btn/.tiq-tab/.qbtn/.tiq-bn-item`; give icon/close/period/indicator/verdict buttons `min-width:44;min-height:44` |
| **S3** | Six hardcoded breakpoints across 4 files | tablet bands | **Medium** | no shared scale; `880/760/700/600/480` ad hoc | `breakpoints` token module; align Council (760) to the app's 700 mobile switch; dedupe `.tiq-2col` 880/600 |
| **S4** | `<canvas>` not scaled for devicePixelRatio | high-DPI (retina/most phones, all browsers) | **Medium** | `ChartView.jsx:360` sets `canvas.width = parent.clientWidth` (CSS px, not ×dpr) | multiply width/height by `window.devicePixelRatio`, `ctx.scale(dpr,dpr)`; chart text/lines render crisp on Safari/mobile |
| **S5** | Login uses `100vh` (everything else uses `100dvh`) | iOS Safari/Chrome | **Low** | `Login.jsx:11` `minHeight:"100vh"` | change to `100dvh` to avoid URL-bar overflow/jump on the auth screen |

---

## 4. Per-page audit

Severity key: **Critical** = blocks use / horizontal page scroll · **High** = hard-requirement breach · **Medium** = degraded but usable · **Low** = polish. "S#" = inherits a systemic finding from Section 3.

### Mission Control (`MissionControl.jsx`) — landing/dashboard
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| `Kv` labels & Open-Position Entry/Now/Unrealized labels at `T.micro` 10px | all | High | S1 | use 12px floor |
| Exposure theme rows: fixed `width:150` label + `width:40` value beside a flex bar | ≤360px | Medium | fixed cell widths | make label `min-width:0;flex` with ellipsis; shrink value |
| Council/IQ/Alpha bull-bear & sub-stats at `T.caption` 11px | all | High | S1 | 12px floor |
| Otherwise grids (`mc-b/c/3/pos/loop`) collapse correctly at 880/480 | — | OK | — | keep |

### Opportunities — board (`Pipeline.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| **Score-strip labels at `fontSize:8.5`** | all | **Critical** | hardcoded 8.5px | 12px floor (S1) |
| `Chip` + `Act` buttons at `T.micro` 10px; `Act` padding `6px 10px` ≈ 28–40px tall | touch | High | S1, S2 | 12px text, 44px targets |
| 5-column board → horizontal scroll on desktop/tablet, stacks to 1-col < 700px | tablet 768–1023 | Medium | kanban needs width | acceptable; ensure scroll affordance visible on tablet |
| Archived grid `minmax(265px,1fr)` | 320 | OK (1-col) | — | keep |

### Research Workspace (modal) (`ResearchWorkspace.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| Dense info at 10–12.5px (task meta, sources, digests, fundamentals labels, footers) | all | High | S1 | 12px floor |
| Close ✕ and risk buttons `minHeight:36` (< 44) | touch | High | S2 | 44px |
| Modal height: `maxHeight:calc(100dvh - 32px)`, inner `overflowY:auto` | all | **OK — passes "fit viewport height"** | dvh-aware | keep pattern as the modal standard |
| `Field` `minWidth:220` two-up → wraps to 1-col on phones | 320 | OK | — | keep |

### Council (`Council.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| Stacks chamber+rail at **760px** (app chrome switches at 700) | 700–760 band | Medium | S3 mismatch | align to shared mobile breakpoint |
| Seats are %-positioned on a ring; `min-height:540` chamber | ≤360px | Medium | absolute ring crowds on narrow widths | scale seat radius/avatar with container; verify labels don't collide at 320 |
| Debate lines, votes, verdict, composer at 11–12.5px | all | High | S1 | 12px floor |
| Composer input `tTicker width:106` fixed | 320 | Low | fixed but small enough to fit | ok / make flex |
| Rail stacks to `max-height:40vh` scroll on mobile | — | OK | — | keep |

### Journal (`App.jsx` `JournalTab` + `TradeReview.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| Add-Trade form is **inline `<Card>`**, not an overlay — grows page, no viewport trap | all | **OK** (good pattern) | — | keep |
| Thesis textareas `height:36`; many labels `T.caption` 11px / thesis eyebrow 10px | all | High | S1 | 12px floor |
| Small action buttons (Close/✕/Log/verdict Confirm-Partial-Incorrect ≈ 24px) | touch | High | S2 | 44px |
| Close-trade uses native `window.prompt()` for exit price | mobile | Low | UX, not layout | (optional) inline field |
| Card grids `minmax(90/140/150px,1fr)` collapse | — | OK | — | keep |

### Alpha Lab (`Performance.jsx` + `Alpha.jsx` + `DecisionQuality.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| **Personal Alpha bar rows**: `width:130` label + flex bar + `width:56` value + `width:118` stat = ~304px fixed + gaps > 320px | ≤360px | High | fixed cell widths (`Alpha.jsx:133–139`) | make label flex/ellipsis, drop or wrap the 118px stat column on mobile |
| Decision Quality funnel `width:110` + `width:78`, signal `width:150` | 320 | Medium | fixed widths | flex/min-width:0 |
| Tiles/IQ/per-currency grids `minmax(96–260px,1fr)` collapse well | — | OK | — | keep |
| Monthly-returns + many labels at 10–11px | all | High | S1 | 12px floor |
| Monthly returns `<table>` in `.tiq-scroll` | mobile | OK (scrolls) | — | keep |

### Charts (`ChartView.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| **OHLCV hover bar**: 7 non-wrapping spans (`O H L C V RSI`), `gap:16`, no `overflow`/`wrap` | ≤768px | High | `ChartView.jsx:456` fixed row, no wrap | allow wrap or horizontal-scroll; shorten on small screens |
| **OHLCV is hover-only** — no touch/tap path to inspect a candle | touch (phone/tablet) | High | `onMouseMove` only | add touch handler / tap-to-inspect |
| Header has ~14 controls with `flexWrap` → 3–4 rows on phone, squeezing the chart | mobile/tablet | Medium | many inline controls wrap | collapse controls into a menu < 700px |
| Period/indicator buttons `minHeight:36`; type/close `padding:3px 8px` (~24px) | touch | High | S2 | 44px |
| Canvas blurry on high-DPI | all high-DPI | Medium | S4 | dpr scale |
| Canvas itself is fluid (ResizeObserver) — scales to tablet width | tablet | OK | — | keep |

### Scanner (`App.jsx` `Scanner`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| **9-column scan table** in `.tiq-scroll` (`min-width:560`) → heavy horizontal scroll | ≤480px | Medium | dense table, scroll-only (no stack) | acceptable per "or scroll"; consider card-stack < 600px or prioritized columns |
| Sub-cell deltas (chg%, EMA dist) at `T.caption` 11px | all | High | S1 | 12px floor |
| Pos-Size calc inputs `width:130/130/90` fixed in flex-wrap | 320 | Low (wraps) | — | ok |
| Row tap = AI analysis; inner "Log" button stops propagation | touch | OK | — | keep; ensure Log ≥44px (S2) |

### Strategies (`App.jsx` `StrategiesTab`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| Algorithm `<pre>` at `T.caption` 11px, `overflowX:auto` | mobile | Low–Med | code block, contained scroll | bump ≥12px; keep scroll |
| Strategy cards (`maxWidth:500` rules, flex-wrap stats) | — | OK | — | keep |

### Learn (`App.jsx` `Learn`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| Card grids `minmax(260/200px,1fr)` collapse cleanly | all | **OK** (cleanest page) | — | keep |
| Card desc/link text at `T.caption` 11px | all | Med | S1 | 12px floor |

### AI Advisor (`App.jsx` chat) & Login (`Login.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| Chat fit height `.tiq-fit-chat` `calc(100dvh - …)` | all | OK | — | keep |
| Chat footer hint row at `T.caption` 11px | all | Low | S1 | 12px floor |
| Login `minHeight:100vh` (not dvh) | iOS | Low | S5 | `100dvh` |
| Login card `maxWidth:380`, centered | all | OK | — | keep |

### Shared primitives & overlays (`ui.jsx`, `App.jsx`)
| Problem | Screen | Sev | Root cause | Fix |
|---|---|---|---|---|
| `Term` tooltip: `position:absolute; width:240; transform:translateX(-50%)`, `pointer-events:none` | ≤360px near edges | Medium | no viewport-edge collision logic | clamp within viewport; or `max-width:min(240px,90vw)` |
| `Money`/`TickerID` use `whiteSpace:nowrap` | very narrow cells | Low | intended (no number wrap) | ok; ensure containers `min-width:0` |
| "More" bottom sheet (`fixed`, safe-area bottom) | mobile | OK | — | keep |
| `1920px+ / 2560px`: main content `maxWidth:1240` centered → large empty gutters | ≥1920px | Low–Med | fixed max-width | intentional readability cap; optionally widen tables/board to use the space |

---

## 5. Cross-browser matrix

| Concern | Chrome | Edge | Safari (macOS/iOS) | Firefox | Notes / fix |
|---|---|---|---|---|---|
| `backdrop-filter` (header/tabs/nav) | ✅ | ✅ | ✅ (`-webkit-` present) | ✅ | prefixed already; fine |
| `100dvh` fit heights | ✅ | ✅ | ✅ | ✅ | good — **except Login uses `100vh`** (S5) |
| iOS focus-zoom on <16px inputs | n/a | n/a | **handled** (16px on phones) | n/a | keep `GS:134` |
| `env(safe-area-inset-*)` notch | ✅ | ✅ | ✅ | ✅ | good |
| `<canvas>` DPR sharpness | blurry hi-DPI | blurry | **blurry on retina/iPhone** | blurry hi-DPI | S4 — affects all, most visible on Safari/mobile |
| Styled scrollbars | ✅ `-webkit-` | ✅ | ✅ | partial (`scrollbar-width`) | cosmetic only |
| `<select>` option contrast on dark theme | ✅ | ✅ | ✅ | ✅ | `option{color:#000}` set — handled |
| Touch hover (Charts OHLCV, `Term`) | n/a | n/a | **no hover** → inspection unavailable | n/a | add tap path (Charts High; Term ok via onClick) |

**Verdict:** no major browser-specific *breakage*. The only genuine cross-browser defects are **canvas DPR blur (S4)**, **Login `100vh` (S5)**, and **hover-only chart inspection on touch**.

---

## 6. Severity rollup

- **Critical (1):** Pipeline 8.5px score labels.
- **High (systemic + ~10 page instances):** S1 sub-12px text (app-wide), S2 sub-44px touch targets (app-wide), Alpha fixed-width bar overflow, Chart OHLCV hover bar overflow + hover-only inspection.
- **Medium (~8):** S3 breakpoint sprawl, S4 canvas DPR, Council 700/760 mismatch + seat crowding, Scanner 9-col scroll, Decision-Quality fixed widths, chart header wrap, Term tooltip edge clip, ultra-wide gutters.
- **Low (~6):** S5 Login vh, native exit prompt, strategies `<pre>` size, misc caption text.

**Pass already (do not touch):** Research-modal viewport-height fit, inline Add forms, Learn grids, most `auto-fit` grids, bottom-nav/safe-area/16px-input mobile pass, table horizontal-scroll containers.

---

## 7. Phase 2 preview (NOT yet built)

The audit points to a small, high-leverage design-system core (note: project is **JavaScript, not TypeScript** — Phase 2's `breakpoints.ts` should be **`breakpoints.js`**, and tokens extend the existing `theme.js`, which already holds `T` and `SP`):

1. **`breakpoints.js`** — single scale (e.g. `sm 480 / md 700 / lg 1024 / xl 1440`); replace all six ad-hoc numbers; align Council.
2. **Typography** — raise `T.caption` to 12 (info floor), keep `T.micro` for eyebrows only; lint/sweep hardcoded `fontSize` literals to route through `T`.
3. **Spacing** — `SP` already exists in `theme.js`; adopt it in the injected styles to retire ad-hoc px.
4. **Card / Modal / Table systems** — promote the three proven patterns to shared primitives: the `Card` (App), the **Research-modal shell** (`inset:0` + `maxHeight:calc(100dvh - 32px)` + inner scroll) as the canonical dialog, and `.tiq-scroll` (+ an optional stack-below-breakpoint variant) as the canonical table.
5. **Touch** — one coarse-pointer rule enforcing 44px across all interactive primitives.

Goal: no component carries a raw viewport number or raw font px unless justified.

---

## Constitution Check

Per `docs/CONSTITUTION.md`. This is usability/accessibility remediation, not a feature.

- [x] **1. Prime Directive** — qualifies under **decision quality**: a founder cannot make a quality decision from an unreadable 8.5–11px metric or an un-tappable control. Future decision changed: legibility/usability of the data that feeds every decision.
- [x] **2. Evidence Hierarchy** — every finding is grounded in a cited `file:line`; no invented breakages. Pages that already pass (Research modal height, inline forms, Learn) are recorded as passing rather than dressed up as work.
- [x] **3. Conditioning Rule** — n/a (no statistical claim).
- [x] **4. Earned Complexity** — explicitly **reduces** complexity: collapses 6 breakpoints → 1 scale, sub-floor literals → one token. The audit argues *against* a rebuild.
- [x] **5. Calibration** — n/a.
- [x] **6. Survival** — n/a (no portfolio risk).
- [x] **7. Self-Knowledge Flywheel** — n/a (no decision write-back).

**Verdict:** PASS. **Measurable targets for Phase 3:** 0 informational nodes < 12px · 0 interactive targets < 44px · 0 horizontal page scroll 320–768px · 1 breakpoint scale · canvas crisp at DPR≥2.

**Guardrails honored:** no features, no workflow redesign, no new animations, no new intelligence. Audit only — no code changed.
