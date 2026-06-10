-- Research Workspace — enriches a generated opportunity into investable research.
-- The thesis fields (market_expectations, reality_hypothesis, bull/bear case,
-- invalidation, confidence) are edited in place on the opportunity row; this adds
-- the two new research surfaces: a timestamped evidence log and freeform notes.
-- Research still flows into the trade form via the existing thesis schema, so it
-- reaches the Journal, Reviews, Investor IQ, and Personal Alpha Engine unchanged.

alter table public.tradeiq_opportunities add column if not exists evidence_log jsonb default '[]'::jsonb;  -- [{text, at}]
alter table public.tradeiq_opportunities add column if not exists notes        text;
