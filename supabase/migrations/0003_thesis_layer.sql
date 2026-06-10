-- P2.75 Thesis Layer — Litman: edge comes from reality diverging from expectations.
--
-- Every trade records an explicit thesis (market expectation vs your reality, the
-- bear case, invalidation, confidence, and a thesis TYPE). On close, the review
-- engine judges whether the thesis played out — separate from P&L — and stores an
-- AI verdict the user can override. Thesis accuracy (not win rate) becomes the
-- "investor IQ" score, and the Alpha engine gains a thesis-type dimension.

-- ── Trade-side capture (tradeiq_journal) ──
alter table public.tradeiq_journal add column if not exists thesis_type         text;
alter table public.tradeiq_journal add column if not exists thesis_expectations text;   -- what the market believes
alter table public.tradeiq_journal add column if not exists thesis_reality      text;   -- what you believe is true
alter table public.tradeiq_journal add column if not exists thesis_evidence     text;   -- optional supporting evidence
alter table public.tradeiq_journal add column if not exists thesis_bear_case    text;   -- why you might be wrong
alter table public.tradeiq_journal add column if not exists thesis_invalidation text;   -- what would invalidate the thesis
alter table public.tradeiq_journal add column if not exists thesis_confidence   integer; -- 0–100

-- ── Review-side verdict (tradeiq_reviews) — AI grades, user can override ──
alter table public.tradeiq_reviews add column if not exists ai_thesis_verdict    text;    -- correct | partial | incorrect
alter table public.tradeiq_reviews add column if not exists user_thesis_verdict  text;    -- user override (nullable)
alter table public.tradeiq_reviews add column if not exists expectations_changed boolean; -- did reality diverge from consensus
alter table public.tradeiq_reviews add column if not exists bear_case_realized   boolean; -- did the bear case happen
alter table public.tradeiq_reviews add column if not exists thesis_reason        text;    -- AI's one-line justification
