// ─── RESPONSIVE UTILITIES (Phase 2) ──────────────────────────────────────────
// Runtime + DOM helpers that complement the pure token modules:
//   ./breakpoints.js  → the breakpoint scale (BP, mq, classifyWidth)
//   ./theme.js        → type / spacing / TOUCH tokens
// This file holds the parts that need React or `window` (a hook, touch
// detection, DPR canvas sizing) plus the canonical responsive CSS string built
// FROM the tokens — so there is exactly one definition of each rule.
//
// Phase 2 only DEFINES these. Phase 3 wires them into pages (e.g. ChartView's
// resize handler calls fitCanvasToParent; App injects responsiveCss once and
// the scattered per-component touch/table rules are removed).

import { useState, useEffect } from "react";
import { TOUCH } from "./theme.js";
import { BP, classifyWidth, mq } from "./breakpoints.js";

// ── useBreakpoint — current device class, re-renders on resize ──
// Returns "mobile" | "tablet" | "desktop" | "large". SSR-safe default = desktop
// (this app is a client SPA, but guarding keeps it import-safe everywhere).
export function useBreakpoint() {
  const read = () => classifyWidth(typeof window === "undefined" ? BP.desktop : window.innerWidth);
  const [bp, setBp] = useState(read);
  useEffect(() => {
    const onResize = () => setBp(read());
    window.addEventListener("resize", onResize, { passive: true });
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return bp;
}

// Convenience booleans derived from the class (read once, not reactive).
export const isPhoneWidth = () =>
  typeof window !== "undefined" && classifyWidth(window.innerWidth) === "mobile";

// True on touch / coarse-pointer devices — the single JS source mirroring the
// CSS `@media(pointer:coarse)` rule (used by ChartView to add a tap path).
export const isTouch = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer:coarse)").matches;

// ── DPR-aware canvas sizing (system-level, audit S4) ──
// Sizes a <canvas> to its parent in CSS pixels but backs it with a
// devicePixelRatio-scaled bitmap, then scales the 2D context so all drawing is
// done in CSS-pixel coordinates. Eliminates blurry charts on retina / phones /
// MacBooks across every browser. DPR is clamped to [1,3] so a 4×/8× display
// can't allocate a runaway bitmap.
//
// Returns { ctx, width, height, dpr } where width/height are CSS pixels — the
// dimensions drawing code must use (NOT canvas.width/height, which are now
// the scaled bitmap size).
export function fitCanvasToParent(canvas) {
  if (!canvas || !canvas.parentElement) return null;
  const parent = canvas.parentElement;
  const cssW = parent.clientWidth;
  const cssH = parent.clientHeight;
  const dpr = Math.max(1, Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
  canvas.width  = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width  = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS-pixel space
  return { ctx, width: cssW, height: cssH, dpr };
}

// Map a pointer/mouse/touch event to logical (CSS-pixel) canvas coordinates.
// Works for both mouse and touch so ChartView can share one handler. Because
// drawing happens in CSS-pixel space (see fitCanvasToParent), no DPR factor is
// applied here — getBoundingClientRect is already in CSS pixels.
export function canvasPoint(canvas, evt) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const src = evt.touches?.[0] || evt.changedTouches?.[0] || evt;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

// ── Canonical responsive CSS (built from tokens) ──
// The ONE definition of the touch-target rule and the table-scroll/stack
// utilities. Phase 3 injects this once at the app root and deletes the
// scattered `@media(pointer:coarse){min-height:40px}` and ad-hoc table rules.
// Pass the theme `C` for the colors a few utilities need.
export function responsiveCss(C) {
  return `
  /* Single touch-target rule — every interactive primitive ≥ ${TOUCH}px on
     coarse pointers (replaces the old 40px rule; WCAG 2.5.5). */
  @media (pointer:coarse) {
    .tiq-btn, .tiq-tab, .qbtn, .tiq-bn-item,
    button, [role="button"], select, a.tiq-card {
      min-height:${TOUCH}px;
    }
    .tiq-hit { min-width:${TOUCH}px; min-height:${TOUCH}px;
      display:inline-flex; align-items:center; justify-content:center; }
  }
  /* Canonical horizontal-scroll table wrapper. */
  .tiq-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%; }
  .tiq-scroll table { min-width:560px; }
  ${mq.phone} { .tiq-scroll table { min-width:520px; } }
  /* Opt-in: a table that should STACK to rows on phones instead of scrolling.
     Phase 3 applies .tiq-stack to dense tables where stacking reads better. */
  ${mq.phone} {
    .tiq-stack thead { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
    .tiq-stack tr { display:block; border-bottom:1px solid ${C?.border || "#26354f"}; padding:6px 0; }
    .tiq-stack td { display:flex; justify-content:space-between; gap:12px; padding:4px 6px; }
    .tiq-stack td::before { content:attr(data-label); color:${C?.muted || "#8298b8"}; font-weight:600; }
  }
  /* Visibility utilities keyed to the single breakpoint scale. */
  ${mq.phone}       { .tiq-only-wide { display:none!important; } }
  ${mq.belowDesktop}{ .tiq-only-desktop { display:none!important; } }
  `;
}
