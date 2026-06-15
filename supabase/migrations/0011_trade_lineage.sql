-- 0011_trade_lineage — preserve DECISION CONTEXT across the trade boundary.
--
-- Problem (proven by the lineage audit): when an opportunity becomes a trade
-- (critiqueAndLog → addTrade) the app copied only the thesis TEXT forward and
-- dropped everything else — the idea's identity, the council verdict, the
-- generation-time confidence, risk tier, sector, price-at-generation and the
-- research depth. Downstream attribution (Decision Quality, future Investor DNA /
-- CIO) was therefore forced to fall back to ticker matching: it could learn
-- "RELIANCE worked" but not "which RELIANCE thesis worked under what context".
--
-- This migration adds a FROZEN decision-context snapshot to each trade so the
-- idea → trade → outcome chain is hard-linked from here on.
--
-- FORWARD-ONLY: every column is nullable; existing trades are untouched and keep
-- NULL lineage (no fabricated backfill — past context is genuinely gone).
-- Attribution coverage begins from the date this migration is applied.
--
-- council_session_id vs council_session_hash: the council session row is written
-- best-effort/fire-and-forget and is also served from a local cache replay
-- (Council.jsx), so its bigint id is frequently unavailable at verdict time. The
-- session's deterministic natural key (topic_hash, indexed in 0007) is available
-- synchronously and offline, so it is the durable trade → debate link here.

-- Carry the council session's natural key onto the opportunity at verdict time,
-- so it can be snapshotted onto the trade.
alter table public.tradeiq_opportunities
  add column if not exists council_session_hash text;

-- ── Frozen decision-context snapshot on each trade ───────────────
-- Identity (the hard link the whole audit was about):
alter table public.tradeiq_journal add column if not exists opportunity_id       bigint
  references public.tradeiq_opportunities(id) on delete set null;
alter table public.tradeiq_journal add column if not exists council_session_hash text;

-- Decision state at the moment of the trade:
alter table public.tradeiq_journal add column if not exists council_verdict       text;
alter table public.tradeiq_journal add column if not exists council_confidence    integer;
alter table public.tradeiq_journal add column if not exists generation_confidence integer;   -- opp.confidence when generated
alter table public.tradeiq_journal add column if not exists opp_risk_level        text;

-- Context:
alter table public.tradeiq_journal add column if not exists decision_sector       text;       -- app theme/sector classification at decision time
alter table public.tradeiq_journal add column if not exists price_at_gen          numeric;    -- opp price when the idea was generated
alter table public.tradeiq_journal add column if not exists opp_researched_at     timestamptz;

-- Research state (depth indicators — were facts/filings/brief actually present?):
alter table public.tradeiq_journal add column if not exists research_brief_present boolean;
alter table public.tradeiq_journal add column if not exists filing_digest_count    integer;
alter table public.tradeiq_journal add column if not exists facts_present          boolean;

-- Attribution joins (trade → originating idea) scan opportunity_id.
create index if not exists idx_journal_opportunity
  on public.tradeiq_journal (opportunity_id) where opportunity_id is not null;
