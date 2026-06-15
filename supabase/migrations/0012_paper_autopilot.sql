-- 0012_paper_autopilot — a PAPER (simulated) trading account that auto-executes
-- the system's own council-ready opportunities. Kept in its OWN namespace so
-- simulated fills never pollute the real journal / Personal Alpha / Decision
-- Quality. Mirrors the PR-#17 lineage columns so every auto-trade carries its
-- origin (which idea, which council verdict, what was known at entry).
--
-- Money is virtual; prices are real (live + Yahoo historical for the backtest
-- seed). Nothing here touches a broker or real funds.

-- One paper account per user.
create table if not exists public.tradeiq_paper_account (
  user_id        uuid primary key references auth.users(id),
  currency       text    not null default 'INR',
  starting_cash  numeric not null default 100000,   -- ₹1,00,000 sim capital (matches SIM_CAP)
  cash           numeric not null default 100000,    -- uninvested cash
  started_at     timestamptz not null default now(),
  config         jsonb   not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.tradeiq_paper_account enable row level security;
drop policy if exists paper_account_owner on public.tradeiq_paper_account;
create policy paper_account_owner on public.tradeiq_paper_account
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per simulated position (open or closed).
create table if not exists public.tradeiq_paper_trades (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id),
  ticker        text not null,
  name          text,
  currency      text,
  side          text not null default 'BUY',
  qty           numeric not null,
  entry_price   numeric not null,
  entry_at      timestamptz not null,
  stop          numeric,
  target        numeric,
  exit_price    numeric,
  exit_at       timestamptz,
  status        text not null default 'open',   -- open | closed
  exit_reason   text,                            -- target | stop | invalidation | manual
  pnl           numeric,
  r_multiple    numeric,
  reason_open   text,                            -- plain-English why-it-entered (from real council/thesis/price data)
  is_backtest   boolean not null default false,  -- true = part of the honest historical-replay seed
  -- ── lineage (mirrors PR #17 — the idea's origin survives into the sim trade) ──
  opportunity_id        bigint references public.tradeiq_opportunities(id) on delete set null,
  council_session_hash  text,
  council_verdict       text,
  council_confidence    integer,
  generation_confidence integer,
  opp_risk_level        text,
  decision_sector       text,
  thesis_type           text,
  price_at_gen          numeric,
  created_at    timestamptz not null default now()
);
alter table public.tradeiq_paper_trades enable row level security;
drop policy if exists paper_trades_owner on public.tradeiq_paper_trades;
create policy paper_trades_owner on public.tradeiq_paper_trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_paper_trades_user_status on public.tradeiq_paper_trades (user_id, status);
create index if not exists idx_paper_trades_user_entry  on public.tradeiq_paper_trades (user_id, entry_at desc);
