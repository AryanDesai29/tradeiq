-- Opportunity Discovery Engine — AI proactively generates investable theses from
-- the watchlist/universe. Stored so each idea can be MEASURED against outcome
-- later (price_at_gen + generated_at), independent of whether it was traded.
-- Reuses the same thesis vocabulary as the journal (thesis_type, confidence) so
-- generated ideas flow straight into the trade form and the thesis-type analytics.

create table if not exists public.tradeiq_opportunities (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  ticker              text not null,
  name                text,
  currency            text,
  thesis_type         text,
  market_expectations text,   -- what the market currently believes
  reality_hypothesis  text,   -- what may actually be true (hypothesis to critique)
  evidence            text,
  bull_case           text,
  bear_case           text,
  invalidation        text,   -- what would kill the idea
  confidence          integer,-- 0–100
  risk_level          text,   -- low | medium | high
  price_at_gen        numeric,-- snapshot price when generated → measurable later
  status              text default 'new',  -- new | watching | logged | dismissed
  generated_at        timestamptz default now()
);

create index if not exists tradeiq_opportunities_user_idx on public.tradeiq_opportunities (user_id, status, generated_at);

alter table public.tradeiq_opportunities enable row level security;

drop policy if exists opps_select_own on public.tradeiq_opportunities;
create policy opps_select_own on public.tradeiq_opportunities for select using (auth.uid() = user_id);
drop policy if exists opps_insert_own on public.tradeiq_opportunities;
create policy opps_insert_own on public.tradeiq_opportunities for insert with check (auth.uid() = user_id);
drop policy if exists opps_update_own on public.tradeiq_opportunities;
create policy opps_update_own on public.tradeiq_opportunities for update using (auth.uid() = user_id);
drop policy if exists opps_delete_own on public.tradeiq_opportunities;
create policy opps_delete_own on public.tradeiq_opportunities for delete using (auth.uid() = user_id);
