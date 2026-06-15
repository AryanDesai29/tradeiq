-- 0015_opportunity_memory — learn from what you IGNORED, not just what you traded.
--
-- Records every research candidate the Opportunity Queue surfaces, with the price
-- at the moment it was surfaced, its disposition (surfaced/ignored · investigated ·
-- rejected · traded), and its REAL subsequent price performance. Most investors
-- only track what they bought/sold; this tracks what they almost bought, ignored,
-- and investigated-then-rejected — the feedback loop that lets the queue eventually
-- learn which opportunity TYPES produce worthwhile research for Aryan.
--
-- Honesty: price_at_surface is recorded live at surface time; perf_pct is a REAL
-- measured delta, never a prediction. The "which types work" inference is NOT
-- stored here — it's gated behind sample size in code (Conditioning Rule).
-- Forward-only, additive, RLS owner-scoped. Paper/analytical — no orders.

create table if not exists public.tradeiq_opportunity_memory (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id),
  ticker           text not null,
  name             text,
  currency         text,
  kind             text not null,            -- rs_leader | discovered_idea | …
  reason           text,                     -- why it was surfaced (the lead's first reason)
  price_at_surface numeric,                  -- live price when first surfaced (frozen)
  surfaced_at      timestamptz not null default now(),
  status           text not null default 'surfaced',  -- surfaced | investigated | rejected | traded
  last_price       numeric,                  -- most recent observed price
  last_priced_at   timestamptz,
  perf_pct         numeric,                  -- (last_price - price_at_surface) / price_at_surface * 100
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tradeiq_opportunity_memory_uniq unique (user_id, ticker, kind)
);
alter table public.tradeiq_opportunity_memory enable row level security;
drop policy if exists opp_memory_owner on public.tradeiq_opportunity_memory;
create policy opp_memory_owner on public.tradeiq_opportunity_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_opp_memory_user on public.tradeiq_opportunity_memory (user_id, surfaced_at desc);
