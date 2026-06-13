// ─── DESIGN TOKENS (Phase 0 · type floor raised in Phase 2) ──────
// Single source of truth for colors, type scale, spacing, and touch.
// Breakpoints live in ./breakpoints.js; runtime + canvas helpers in
// ./responsive.js. These four are the ONLY responsive infrastructure.
//
// TYPE RULES (12px information floor — approved Phase 2):
//   • Any text carrying INFORMATION uses T.caption (12) or larger.
//   • T.micro (11) is reserved for purely-decorative UPPERCASE tracked
//     section eyebrows ONLY — never a value, never a field label.
//   • Numbers always render in C.mono with tabular-nums.
// Phase 3 reclassifies any micro-on-data → caption and routes every
// hardcoded fontSize literal through T.

export const C = {
  bg: "#0a101e", s1: "#0e1628", s2: "#131d33", s3: "#1a2742",
  border: "#26354f", accent: "#f0b441", blue: "#5b9bff",
  gold: "#fb923c", green: "#3fe0a0", red: "#ff6b61", purple: "#c4a5f5",
  text: "#e9f0fc", muted: "#8298b8", dim: "#455a7d",
  mono: "'JetBrains Mono','Courier New',monospace",
  display: "'Syne',sans-serif",
  serif: "'Fraunces',serif",
};

// Type scale — the ONLY font sizes allowed in the app.
export const T = {
  display: 28, // brand moments, verdicts, hero numbers (Fraunces/Syne)
  h1: 22,      // hero stats, portfolio value
  h2: 17,      // page titles
  h3: 15,      // card titles, ticker symbols in cards
  body: 14,    // standard reading text: chat, reviews, notes, prose
  data: 13,    // dense numeric cells: tables, watchlist rows, inputs
  caption: 12, // secondary info, identity lines, sublabels — INFORMATION FLOOR (≥12)
  micro: 11,   // decorative UPPERCASE tracked eyebrows ONLY, never information
};

// Spacing scale (px). Use instead of ad-hoc margins/padding.
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Minimum interactive hit area (px) for touch / coarse pointers. The single
// source the canonical touch rule in ./responsive.js is built from. WCAG 2.5.5.
export const TOUCH = 44;
