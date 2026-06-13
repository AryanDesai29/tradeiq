// ─── BREAKPOINTS — the ONLY responsive boundaries in the app (Phase 2) ───────
// Four device classes replace the scattered 480/600/700/760/880/1024 the
// responsive audit found across App.jsx, MissionControl.jsx, Council.jsx and
// Pipeline.jsx. Components reference these NAMES (or the `mq` strings / the
// `useBreakpoint` hook in ./responsive.js) — never a raw pixel width.
//
//   mobile    < 768     phones (320–767), incl. large phones
//   tablet    768–1023
//   desktop   1024–1439
//   large     ≥ 1440
//
// This module is intentionally PURE (no React, no window at import time) so it
// is unit-testable and safe to import anywhere. Runtime/DOM helpers that need
// `window` live in ./responsive.js.

// Boundary values. Three boundaries → four classes. Nothing else is a breakpoint.
export const BP = { tablet: 768, desktop: 1024, large: 1440 };

// Ordered class names, smallest → largest.
export const CLASSES = ["mobile", "tablet", "desktop", "large"];

// Raw media-query conditions (no `@media` prefix) — compose as needed.
// `below.*` uses boundary-1px so ranges never overlap with `up.*`.
export const below = {
  tablet:  `(max-width:${BP.tablet - 1}px)`,   // mobile only
  desktop: `(max-width:${BP.desktop - 1}px)`,  // mobile + tablet
  large:   `(max-width:${BP.large - 1}px)`,    // everything below large
};
export const up = {
  tablet:  `(min-width:${BP.tablet}px)`,
  desktop: `(min-width:${BP.desktop}px)`,
  large:   `(min-width:${BP.large}px)`,
};

// Ready-to-paste `@media` strings for injected <style> templates. Prefer these
// over hand-written pixel queries. `mq.phone` is the app's primary
// "collapse to one-handed mobile" switch (replaces the old 700px rule).
export const mq = {
  mobile:  `@media ${below.tablet}`,
  tablet:  `@media ${up.tablet} and ${below.desktop}`,
  desktop: `@media ${up.desktop}`,
  large:   `@media ${up.large}`,
  phone:   `@media ${below.tablet}`,            // alias: < tablet
  belowDesktop: `@media ${below.desktop}`,      // mobile + tablet (stacking)
};

// Map a viewport width (px) → device class. Pure; used by the runtime hook.
export function classifyWidth(w) {
  if (w < BP.tablet)  return "mobile";
  if (w < BP.desktop) return "tablet";
  if (w < BP.large)   return "desktop";
  return "large";
}
