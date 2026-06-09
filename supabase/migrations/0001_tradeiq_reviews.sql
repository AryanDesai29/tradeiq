-- tradeiq_reviews — persistent, structured trade-review artifacts (P2 Trade Review Engine).
-- One review per closed trade, keyed by trade_id. Scores PROCESS (thesis/execution/
-- risk/regime) separately from OUTCOME so a disciplined loss grades well and a lucky
-- win grades badly. Mistake `tags` come from a fixed vocabulary so they aggregate into
-- "recurring mistakes" — the seed of the Personal Alpha engine.
--
-- Mirrors the per-user isolation of tradeiq_journal / tradeiq_holdings: a user_id
-- column + RLS scoping every row to auth.uid(). The app reads with a bare
-- `select("*")` and relies entirely on these policies for isolation.
--
-- trade_id is text (not a FK) so this works regardless of tradeiq_journal.id's type;
-- the app already guarantees the relationship and upserts with onConflict:"trade_id".

create table if not exists public.tradeiq_reviews (
  id              uuid primary key default gen_random_uuid(),
  trade_id        text not null,
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- process scores (0–100); outcome_score is the only outcome-based score
  thesis_score    smallint not null default 0 check (thesis_score    between 0 and 100),
  execution_score smallint not null default 0 check (execution_score between 0 and 100),
  risk_score      smallint not null default 0 check (risk_score      between 0 and 100),
  regime_score    smallint not null default 0 check (regime_score    between 0 and 100),
  outcome_score   smallint not null default 0 check (outcome_score   between 0 and 100),

  overall_grade   text,                    -- A+/A/B/C/D/F, derived from process score
  verdict         text,                    -- good|bad_process_good|bad_outcome
  review_text     text,
  strengths       text[]  not null default '{}',
  mistakes        text[]  not null default '{}',
  lessons         jsonb   not null default '{"continue":[],"improve":[],"avoid":[]}'::jsonb,
  tags            text[]  not null default '{}',  -- fixed-vocabulary mistake tags

  created_at      timestamptz not null default now(),

  -- one review per trade; required for the app's upsert(onConflict:"trade_id")
  constraint tradeiq_reviews_trade_id_key unique (trade_id)
);

create index if not exists tradeiq_reviews_user_id_idx on public.tradeiq_reviews (user_id);

-- Per-user isolation via RLS (same posture as the other tradeiq_* tables).
alter table public.tradeiq_reviews enable row level security;

drop policy if exists "own reviews: select" on public.tradeiq_reviews;
create policy "own reviews: select" on public.tradeiq_reviews
  for select using (auth.uid() = user_id);

drop policy if exists "own reviews: insert" on public.tradeiq_reviews;
create policy "own reviews: insert" on public.tradeiq_reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "own reviews: update" on public.tradeiq_reviews;
create policy "own reviews: update" on public.tradeiq_reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own reviews: delete" on public.tradeiq_reviews;
create policy "own reviews: delete" on public.tradeiq_reviews
  for delete using (auth.uid() = user_id);
