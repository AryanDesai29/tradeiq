-- THE INVESTMENT COUNCIL — completed committee sessions, stored so verdicts are
-- a permanent record the user can revisit and (later) measure against outcome,
-- exactly like opportunities. The full normalized session (transcript, votes,
-- powers, verdict) is one jsonb document; topic columns exist for listing.

create table if not exists public.tradeiq_council_sessions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  topic_type  text,            -- opportunity | trade | position | portfolio | thesis
  topic_title text,
  ticker      text,
  session     jsonb not null,  -- {transcript, votes, verdict, evidence_hold, red_flags}
  created_at  timestamptz default now()
);

create index if not exists tradeiq_council_user_idx on public.tradeiq_council_sessions (user_id, created_at);

alter table public.tradeiq_council_sessions enable row level security;

drop policy if exists council_select_own on public.tradeiq_council_sessions;
create policy council_select_own on public.tradeiq_council_sessions for select using (auth.uid() = user_id);
drop policy if exists council_insert_own on public.tradeiq_council_sessions;
create policy council_insert_own on public.tradeiq_council_sessions for insert with check (auth.uid() = user_id);
drop policy if exists council_delete_own on public.tradeiq_council_sessions;
create policy council_delete_own on public.tradeiq_council_sessions for delete using (auth.uid() = user_id);
