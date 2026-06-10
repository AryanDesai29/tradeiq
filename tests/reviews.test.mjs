// Tests for the trade-review model: process-vs-outcome scoring, grade bands,
// AI-output normalisation/validation, and recurring-mistake aggregation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processScore, gradeFromScore, verdictOf, normalizeReview, recurringMistakes, TAG_KEYS } from '../src/reviews.js';

test('processScore excludes outcome', () => {
  // outcome_score is intentionally ignored by processScore.
  const r = { thesis_score: 80, execution_score: 80, risk_score: 80, regime_score: 80, outcome_score: 0 };
  assert.equal(processScore(r), 80);
});

test('gradeFromScore bands', () => {
  assert.equal(gradeFromScore(95), 'A+');
  assert.equal(gradeFromScore(82), 'A');
  assert.equal(gradeFromScore(71), 'B');
  assert.equal(gradeFromScore(60), 'C');
  assert.equal(gradeFromScore(51), 'D');
  assert.equal(gradeFromScore(40), 'F');
});

test('verdictOf separates process from outcome (the core rule)', () => {
  const good = { thesis_score: 80, execution_score: 80, risk_score: 80, regime_score: 80 };
  const bad  = { thesis_score: 20, execution_score: 20, risk_score: 20, regime_score: 20 };
  assert.equal(verdictOf(good, -1.5), 'good_process_bad_outcome'); // disciplined loss = still good
  assert.equal(verdictOf(bad, +3),   'bad_process_good_outcome');  // lucky win = still bad
  assert.equal(verdictOf(good, +2),  'good_process_good_outcome');
});

test('normalizeReview clamps scores, derives grade, filters bad tags', () => {
  const raw = {
    thesis_score: 200, execution_score: -5, risk_score: 70, regime_score: 60, outcome_score: 'x',
    review_text: 'ok', strengths: ['a', 7, ''], mistakes: ['b'],
    lessons: { continue: ['keep stop'], improve: ['size up'], avoid: ['fomo'] },
    tags: ['moved_stop', 'not_a_real_tag', 'moved_stop'], // dup + invalid
  };
  const n = normalizeReview(raw, -1);
  assert.equal(n.thesis_score, 100);     // clamped
  assert.equal(n.execution_score, 0);    // clamped
  assert.equal(n.outcome_score, 0);      // non-numeric → 0
  assert.deepEqual(n.tags, ['moved_stop']); // deduped + invalid removed
  assert.deepEqual(n.strengths, ['a']);  // non-strings dropped
  assert.equal(n.lessons.avoid[0], 'fomo');
  assert.ok(['A+', 'A', 'B', 'C', 'D', 'F'].includes(n.overall_grade));
  assert.ok(TAG_KEYS.includes(n.tags[0]));
});

test('recurringMistakes aggregates and sorts by frequency', () => {
  const reviews = [
    { tags: ['moved_stop', 'fomo_entry'] },
    { tags: ['moved_stop'] },
    { tags: ['moved_stop', 'no_stop', 'bogus'] },
    { tags: [] },
    null,
  ];
  const m = recurringMistakes(reviews);
  assert.equal(m[0].tag, 'moved_stop');
  assert.equal(m[0].count, 3);
  assert.ok(m[0].label.length > 0);
  // invalid tag never counted
  assert.equal(m.find((x) => x.tag === 'bogus'), undefined);
});
