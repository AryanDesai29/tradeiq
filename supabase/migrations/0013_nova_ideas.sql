-- 0013_nova_ideas — Nova's own persistent idea memory (the autopilot agent's
-- track record). Every thesis she forms is stored with its fate (formed → taken
-- or passed) and, when taken, linked to the paper trade. This turns her working
-- ideas into a durable dataset she can later learn from (hit-rate by thesis type,
-- ideas she passed that ran, etc.) — "her own everything".
--
-- Forward-only, additive, RLS owner-scoped. Virtual/simulated — no real money.

create table if not exists public.tradeiq_nova_ideas (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references auth.users(id),
  ticker               text not null,
  name                 text,
  currency             text,
  thesis_type          text,
  market_expectations  text,
  reality_hypothesis   text,
  confidence           integer,                 -- Nova's own conviction at formation
  price_at_gen         numeric,
  council_verdict      text,
  council_confidence   integer,
  council_session_hash text,
  status               text not null default 'formed',  -- formed | taken | passed
  paper_trade_id       bigint references public.tradeiq_paper_trades(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.tradeiq_nova_ideas enable row level security;
drop policy if exists nova_ideas_owner on public.tradeiq_nova_ideas;
create policy nova_ideas_owner on public.tradeiq_nova_ideas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_nova_ideas_user on public.tradeiq_nova_ideas (user_id, created_at desc);
create index if not exists idx_nova_ideas_user_status on public.tradeiq_nova_ideas (user_id, status);
