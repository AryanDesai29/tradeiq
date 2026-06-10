-- tradeiq_reviews — persistent, structured trade-review artifacts (P2 Trade Review Engine).
-- One review per closed trade, keyed by trade_id. Scores PROCESS (thesis/execution/
-- risk/regime) separately from OUTCOME so a disciplined loss grades well and a lucky
-- win grades badly. Mistake `tags` come from a fixed vocabulary so they aggregate into
-- "recurring mistakes" — the seed of the Personal Alpha engine.
--
-- This file mirrors the table as it already exists in the TradeIQ project
-- (fwfmhaaulnzpjahyuhzj), verified 2026-06-10 against the live schema so a fresh
-- database reproduces production exactly:
--   * id        bigint identity PK (matches tradeiq_journal/holdings convention)
--   * trade_id  bigint, unique, FK → tradeiq_journal(id) ON DELETE CASCADE
--               (bigint because tradeiq_journal.id is a bigint identity, NOT text)
--   * scores    integer; strengths/mistakes/lessons jsonb; tags text[]
--   * per-user RLS scoped to auth.uid() = user_id (reviews_*_own policies)

create table if not exists public.tradeiq_reviews (
  id              bigint generated always as identity primary key,
  trade_id        bigint not null references public.tradeiq_journal(id) on delete cascade,
  user_id         uuid   not null references auth.users(id),

  -- process scores (0–100); outcome_score is the only outcome-based score
  thesis_score    integer,
  execution_score integer,
  risk_score      integer,
  regime_score    integer,
  outcome_score   integer,

  overall_grade   text,                                  -- A+/A/B/C/D/F from process score
  verdict         text,                                  -- good|bad_process_good|bad_outcome
  review_text     text,
  strengths       jsonb   default '[]'::jsonb,
  mistakes        jsonb   default '[]'::jsonb,
  lessons         jsonb   default '{}'::jsonb,
  tags            text[]  default '{}'::text[],          -- fixed-vocabulary mistake tags

  created_at      timestamptz default now(),

  -- one review per trade; required for the app's upsert(onConflict:"trade_id")
  constraint tradeiq_reviews_trade_id_key unique (trade_id)
);

-- Per-user isolation via RLS (same posture as the other tradeiq_* tables).
alter table public.tradeiq_reviews enable row level security;

drop policy if exists reviews_select_own on public.tradeiq_reviews;
create policy reviews_select_own on public.tradeiq_reviews
  for select using (auth.uid() = user_id);

drop policy if exists reviews_insert_own on public.tradeiq_reviews;
create policy reviews_insert_own on public.tradeiq_reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists reviews_update_own on public.tradeiq_reviews;
create policy reviews_update_own on public.tradeiq_reviews
  for update using (auth.uid() = user_id);

drop policy if exists reviews_delete_own on public.tradeiq_reviews;
create policy reviews_delete_own on public.tradeiq_reviews
  for delete using (auth.uid() = user_id);
