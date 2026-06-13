# TradeIQ — Responsive Compliance Report (Phase 3B)

**Date:** 2026-06-13
**Scope:** mechanical remediation against `docs/RESPONSIVE-AUDIT.md`, using the Phase 2 tokens (`theme.js`, `breakpoints.js`, `responsive.js`). **Remediation, not redesign** — no new responsive behavior, no layout experiments, no feature work.
**Validation:** `npm test` → 174/174 pass · `npm run build` → clean.

---

## Before → After (grepped counts, not estimates)

| Rule | Before | After |
|---|---|---|
| Hardcoded `fontSize` literals < 12px | **133** | **0** |
| CSS `font-size` < 12px (bottom-nav label) | 1 | 0 |
| `<Money size={…}>` props < 12px | 1 | 0 |
| Touch targets < 44px (coarse rule + inline) | 40px rule + **4** inline 36px | **0** (44px rule app-wide) |
| Legacy breakpoint values in components (480/600/700/760/880) | **6** distinct | **0** (one 768/1024/1440 scale) |
| `100vh` (iOS URL-bar overflow) | **3** | **0** (all `100dvh`) |
| Named horizontal-overflow surfaces | **4** | **0** |
| DPR-aware canvases | 0 | **1** (ChartView, PR #15) |

---

## What changed (file-by-file, mechanical)

**Typography — floor enforced at 12px**
- One boundary-aware regex pass raised all 133 sub-12 `fontSize` literals to 12 across 12 files (e.g. Pipeline's egregious **8.5px** score labels → 12; Council's 47 sites; ResearchWorkspace's 32).
- Bottom-nav label `font-size:10px` → `12px`; one `<Money size={11}>` → `12`.
- `T.caption` is already 12 (Phase 2), so every token-driven size was already compliant.

**Touch targets — one 44px rule, app-wide**
- Injected `responsiveCss(C)` (Phase 2) into the App shell: a single `@media(pointer:coarse)` rule sets `min-height:44px` on every `button`, `[role=button]`, `select`, `.tiq-btn/.tiq-tab/.qbtn/.tiq-bn-item`.
- Raised the 4 inline `minHeight:36` buttons (ChartView period/indicator, ResearchWorkspace close/risk) to 44 so they don't override the rule.
- Retired the old `min-height:40px` coarse rule.

**Breakpoints — six values → one four-class scale**
- App: `880→1023` (2-col collapses below desktop), `700→767` (mobile chrome), removed the redundant `600` duplicate, table `600→767`.
- MissionControl: `880→1023`, `480→767`.
- Pipeline: `700→767`. Council: `760→767`.
- All now align to `breakpoints.js` (mobile <768 / tablet / desktop ≥1024).

**Overflow bugs (the 4 named in the audit)**
- ChartView OHLCV bar: 7 non-wrapping spans → `flexWrap:wrap` + `minHeight` (wraps instead of clipping on narrow screens).
- Personal Alpha bar rows: fixed-width label → `minWidth:0;flexShrink:1` (ellipsis-shrinks instead of overflowing < 360px).
- Pipeline 8.5px labels: fixed by the type sweep.
- `Term` tooltip: `width:240` → `min(240px, 92vw)` (no longer clips off-screen-edge on phones).

**iOS viewport**
- `Login`, `ErrorBoundary`, and the App no-session shell: `100vh` → `100dvh`.

---

## Residuals — logged, not hidden (per the constitution's "no silent caps")

These are **deliberately not swept** because they require per-site judgment or edge into redesign. Recorded as future items:

1. **25 `T.micro` (11px) eyebrow sites** remain by design — the decorative uppercase tracked section-label tier (`theme.js` rule). A few are borderline-informational (e.g. some Mission Control field labels). Reclassifying *those* micro→caption is a per-occurrence judgment call, not a mechanical sweep — deferred.
2. **Bottom-nav labels** raised 10→12px; watch for crowding at 320px (5 columns). If a label wraps, trim the label text — a content change, not a layout one.
3. **Scanner 9-column table** still horizontal-scrolls on phones (audit accepted this under "tables may scroll"). Converting to a card-stack would be a redesign — out of scope.
4. **ChartView header** still wraps its ~14 controls on mobile. Collapsing them into a menu is a redesign — out of scope.
5. **`Term` tooltip** is width-capped at 92vw (fixes clipping) but perfect edge-collision positioning needs JS — deferred.

## Behavior shifts to verify (breakpoint normalization is not behavior-neutral)

Collapsing six breakpoints to three boundaries necessarily moves some thresholds. Documented so review can catch anything that feels wrong:

- **2-column dashboard sections** (`.tiq-2col`, `mc-b/c/3`) now collapse to 1-col below **1024** (was 880) — tablets get a single column.
- **Mobile bottom-nav / mobile padding** now engages below **768** (was 700).
- **Council** stacks below **768** (was 760) — aligned with the app's mobile switch (fixes the old 700–760 limbo band).
- **Learning-loop grid** tiers at 1024 / 768 (was 880 / 480).

---

## Constitution Check

- [x] **1. Prime Directive** — improves **decision quality**: every metric, label, and control is now readable (≥12px) and tappable (≥44px). Directly addresses "still not usable."
- [x] **2. Evidence Hierarchy** — before/after are **grepped counts**, not assertions; residuals and behavior shifts are disclosed, not buried.
- [x] **3. Conditioning Rule** — n/a.
- [x] **4. Earned Complexity** — pure **reduction**: 6 breakpoints → 1 scale, 133 magic font numbers → the floor, one touch rule replacing scattered ones. No new abstraction.
- [x] **5. Calibration** — n/a.
- [x] **6. Survival** — n/a.
- [x] **7. Self-Knowledge Flywheel** — n/a.

**Verdict:** PASS

**Success criteria (audit Phase 3 targets):** 0 nodes < 12px ✅ · 0 touch targets < 44px ✅ · 0 legacy breakpoints ✅ · 0 of the named horizontal-overflow surfaces ✅ · DPR-aware canvas ✅. Residuals above are documented exceptions, not silent gaps.

## Changelog
- **2026-06-13** — Phase 3B mechanical sweep. Type floor, touch rule, breakpoint normalization, named overflow fixes, `100dvh`. No redesign.
