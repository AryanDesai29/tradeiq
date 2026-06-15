-- 0000_base_schema — REPRODUCIBILITY BASELINE (retrofit).
--
-- These five tables (holdings, journal, profiles, settings, watchlist) were
-- originally created by hand directly in the live project (fwfmhaaulnzpjahyuhzj)
-- and never had a migration. As a result a fresh database built from this folder
-- FAILED at 0001 (whose FK references public.tradeiq_journal). This file is the
-- missing floor: it recreates those tables EXACTLY as they exist in production
-- (verified 2026-06-15 via live-schema introspection) so the repo is the source
-- of truth and a from-migrations rebuild reproduces production.
--
-- It is numbered 0000 so it applies BEFORE 0001's FK. It is fully idempotent
-- (create table if not exists + drop/create policy), so applying it to the
-- existing production database is a safe no-op.
--
-- journal is created in its ORIGINAL shape; migrations 0002 (sector/industry/
-- closed_at) and 0003 (thesis_* columns) still layer on top, unchanged.
--
-- KNOWN SMELLS preserved verbatim for fidelity (see the cleanup follow-up issue):
--   * tradeiq_settings.key is GLOBALLY unique (not per-user) — two users cannot
--     share a settings key. Reproduced as-is.
--   * tradeiq_profiles defaults predate the India-first / ₹1,00,000 work
--     (capital default 5000, default_market 'us'); reproduced as-is.
--   * settings / watchlist / profiles are not currently read by the app.

-- ── tradeiq_holdings ─────────────────────────────────────────────
create table if not exists public.tradeiq_holdings (
  id          bigint generated always as identity primary key,
  user_id     uuid    not null references auth.users(id),
  ticker      text    not null,
  name        text,
  exchange    text,
  currency    text,
  shares      numeric default 0,
  avg_cost    numeric default 0,
  price       numeric default 0,
  sector      text    default 'Tech'::text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_holdings_user on public.tradeiq_holdings (user_id, created_at);

alter table public.tradeiq_holdings enable row level security;
drop policy if exists holdings_owner on public.tradeiq_holdings;
create policy holdings_owner on public.tradeiq_holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── tradeiq_journal (original shape; 0002/0003 extend it) ─────────
create table if not exists public.tradeiq_journal (
  id           bigint generated always as identity primary key,
  user_id      uuid    not null references auth.users(id),
  ticker       text    not null,
  name         text,
  exchange     text,
  currency     text,
  side         text    default 'BUY'::text,
  entry_price  numeric,
  exit_price   numeric,
  shares       numeric,
  stop_loss    numeric,
  target       numeric,
  strategy     text,
  notes        text,
  trade_date   date,
  closed       boolean default false,
  created_at   timestamptz default now()
);
create index if not exists idx_journal_user on public.tradeiq_journal (user_id, created_at desc);

alter table public.tradeiq_journal enable row level security;
drop policy if exists journal_owner on public.tradeiq_journal;
create policy journal_owner on public.tradeiq_journal
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── tradeiq_profiles (per-user preferences; not yet wired in code) ─
create table if not exists public.tradeiq_profiles (
  user_id            uuid primary key references auth.users(id),
  capital            numeric default 5000,
  risk_per_trade_pct numeric default 2,
  default_market     text    default 'us'::text check (default_market = any (array['us'::text,'india'::text])),
  trading_style      text,
  ai_personalization text,
  updated_at         timestamptz default now()
);

alter table public.tradeiq_profiles enable row level security;
drop policy if exists profiles_owner on public.tradeiq_profiles;
create policy profiles_owner on public.tradeiq_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── tradeiq_settings (key/value; not yet wired in code) ──────────
-- NOTE: `key` is globally unique in production (smell — see follow-up issue).
create table if not exists public.tradeiq_settings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id),
  key        text not null unique,
  value      text,
  updated_at timestamptz default now()
);

alter table public.tradeiq_settings enable row level security;
drop policy if exists settings_owner on public.tradeiq_settings;
create policy settings_owner on public.tradeiq_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── tradeiq_watchlist (persisted custom tickers; not yet wired in code) ─
create table if not exists public.tradeiq_watchlist (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id),
  ticker     text not null check (char_length(ticker) >= 1 and char_length(ticker) <= 20),
  market     text not null check (market = any (array['us'::text,'india'::text])),
  created_at timestamptz not null default now(),
  constraint tradeiq_watchlist_user_id_ticker_key unique (user_id, ticker)
);
create index if not exists idx_watchlist_user on public.tradeiq_watchlist (user_id);

alter table public.tradeiq_watchlist enable row level security;
drop policy if exists watchlist_owner on public.tradeiq_watchlist;
create policy watchlist_owner on public.tradeiq_watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
