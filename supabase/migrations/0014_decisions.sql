-- 0014_decisions — the Founder Memory Graph (strategy protection).
--
-- Not memory of conversations — memory of DECISIONS. The founder records explicit
-- strategy rules ("avoid Turnaround theses above 75% confidence", "India-first",
-- "no leverage"). When a new trade/opportunity conflicts with an ACTIVE decision,
-- the system flags it ("this conflicts with decision #N — has your strategy
-- changed?"). If the founder proceeds anyway, that override is captured AS A
-- MANUAL changed-my-mind signal (challenged_count + a one-line note) — honouring
-- the Constitution's rule to capture changed_my_mind manually before instrumenting.
--
-- Forward-only, additive, RLS owner-scoped.

create table if not exists public.tradeiq_decisions (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users(id),
  statement           text not null,                       -- the decision, in the founder's words
  kind                text not null default 'avoid',       -- avoid | rule | bet
  tags                text[] not null default '{}'::text[],-- thesis types / tickers / sectors / markets it governs
  active              boolean not null default true,
  challenged_count    integer not null default 0,          -- times a conflicting action was taken anyway
  last_challenge_note text,                                 -- the manual "I changed my mind because…" capture
  last_challenged_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.tradeiq_decisions enable row level security;
drop policy if exists decisions_owner on public.tradeiq_decisions;
create policy decisions_owner on public.tradeiq_decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_decisions_user_active on public.tradeiq_decisions (user_id, active);
