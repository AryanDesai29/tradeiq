// ─── TRADE REVIEW MODEL — structured, aggregatable learning artifact ─────────
//
// A review scores PROCESS (thesis/execution/risk/regime) separately from
// OUTCOME, so a good process with a bad outcome is graded well. Mistakes are
// emitted as tags from a FIXED vocabulary so they aggregate across trades into
// "recurring mistakes" — the foundation of the Personal Alpha engine.

// Controlled mistake-tag vocabulary. The AI may only use these keys; anything
// else is filtered out client-side so counts stay clean.
export const MISTAKE_TAGS = {
  moved_stop:          "Moved stop against the plan",
  sold_winner_early:   "Sold winner too early",
  held_loser_too_long: "Held loser too long",
  oversized_position:  "Position too large (>2% risk)",
  undersized_position: "Position too small",
  no_stop:             "No stop-loss set",
  wide_stop:           "Stop too wide for the R:R",
  chased_entry:        "Chased / late entry",
  fomo_entry:          "FOMO entry",
  against_regime:      "Traded against the market regime",
  earnings_gamble:     "Gambled through earnings",
  revenge_trade:       "Revenge trade after a loss",
  ignored_plan:        "Deviated from the written plan",
  no_thesis:           "No clear thesis logged",
  premature_exit:      "Exited before the thesis played out",
};
export const TAG_KEYS = Object.keys(MISTAKE_TAGS);

export const SCORE_KEYS = ["thesis_score", "execution_score", "risk_score", "regime_score", "outcome_score"];
export const VERDICTS = ["good_process_good_outcome", "good_process_bad_outcome", "bad_process_good_outcome", "bad_process_bad_outcome"];
export const VERDICT_LABEL = {
  good_process_good_outcome: "Good process · good outcome",
  good_process_bad_outcome:  "Good process · bad outcome",   // keep doing this
  bad_process_good_outcome:  "Bad process · good outcome",    // got lucky — don't repeat
  bad_process_bad_outcome:   "Bad process · bad outcome",
};

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Process score deliberately EXCLUDES outcome — the whole point of the engine.
export function processScore(r) {
  const xs = ["thesis_score", "execution_score", "risk_score", "regime_score"].map((k) => clamp(r?.[k]));
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}
export function gradeFromScore(s) {
  return s >= 90 ? "A+" : s >= 80 ? "A" : s >= 70 ? "B" : s >= 60 ? "C" : s >= 50 ? "D" : "F";
}
// Process (not P&L) decides "good/bad"; realized R decides the outcome half.
export function verdictOf(r, realizedR) {
  const goodProcess = processScore(r) >= 65;
  const goodOutcome = (realizedR ?? 0) > 0;
  return `${goodProcess ? "good" : "bad"}_process_${goodOutcome ? "good" : "bad"}_outcome`;
}

// Validate/normalise raw model JSON into a safe, storable review record.
export function normalizeReview(raw, realizedR) {
  const r = raw || {};
  const scores = {};
  SCORE_KEYS.forEach((k) => (scores[k] = clamp(r[k])));
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, 6) : []);
  const lessons = r.lessons || {};
  const tags = Array.isArray(r.tags) ? [...new Set(r.tags)].filter((t) => TAG_KEYS.includes(t)) : [];
  const proc = processScore(scores);
  return {
    ...scores,
    overall_grade: gradeFromScore(proc),
    verdict: VERDICTS.includes(r.verdict) ? r.verdict : verdictOf(scores, realizedR),
    review_text: typeof r.review_text === "string" ? r.review_text.slice(0, 1200) : "",
    strengths: list(r.strengths),
    mistakes: list(r.mistakes),
    lessons: { continue: list(lessons.continue), improve: list(lessons.improve), avoid: list(lessons.avoid) },
    tags,
  };
}

// Aggregate recurring mistakes across reviews → [{ tag, label, count }] desc.
export function recurringMistakes(reviews = []) {
  const counts = {};
  for (const rv of reviews) for (const t of rv?.tags || []) if (TAG_KEYS.includes(t)) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts).map(([tag, count]) => ({ tag, label: MISTAKE_TAGS[tag], count })).sort((a, b) => b.count - a.count);
}
