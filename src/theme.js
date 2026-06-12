// ─── DESIGN TOKENS (Phase 0) ─────────────────────────────────────
// Single source of truth for colors, type scale, and spacing.
// Rules: nothing below T.micro (10px) anywhere; T.micro is for UPPERCASE
// section eyebrows ONLY — any text carrying information uses T.caption (11)
// or larger. Numbers always render in C.mono with tabular-nums.

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
  caption: 11, // secondary info, identity lines, sublabels — INFORMATION FLOOR
  micro: 10,   // uppercase tracked section eyebrows ONLY, never data
};

// Spacing scale (px). Use instead of ad-hoc margins/padding.
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
