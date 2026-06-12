-- Filing Intelligence (P3.2) — the system reads filings, not just their index.
--
-- 3.2a XBRL Facts: hard, deterministic fundamentals from SEC companyfacts
-- (api/facts.js → src/facts.js trend math), stored alongside the brief so the
-- workspace and Council reuse them without refetching. The compact ~2KB shape:
--   research_facts {ticker, company, cik, asOf, series:{revenue[],grossProfit[],
--                   operatingIncome[],netIncome[],rnd[]}, note}
alter table public.tradeiq_opportunities add column if not exists research_facts jsonb;

-- Embedded accession→digest map for the workspace/research/council to read
-- without a join. The durable global cache is tradeiq_filing_digests (below);
-- this is the convenient per-opportunity copy, same pattern as research_sources.
--   research_digests {<accession>: <normalized Filing Digest>}
alter table public.tradeiq_opportunities add column if not exists research_digests jsonb;

-- 3.2b Filing Digests — the narrative read from a filing's own text, produced by
-- the map-reduce pipeline (api/ingest.js) and normalised client-side
-- (src/filings.js normalizeDigest). Filings are immutable, so a digest is
-- written once per accession and cached forever (the unique constraint = the
-- permanent cache key; a re-ingest is an upsert).
create table if not exists public.tradeiq_filing_digests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  ticker      text not null,
  cik         bigint,
  accession   text not null,
  form        text,
  filed       date,
  digest      jsonb not null,          -- normalised Filing Digest
  sections_ingested jsonb,             -- manifest: {ingested:[{section,chunks,chars}], skipped:[...]}
  tokens_used integer,
  created_at  timestamptz not null default now(),
  unique (user_id, accession)
);

create index if not exists tradeiq_filing_digests_ticker_idx
  on public.tradeiq_filing_digests (user_id, ticker);

alter table public.tradeiq_filing_digests enable row level security;

-- RLS: a user sees and writes only their own digests (same policy shape as the
-- rest of the schema).
drop policy if exists "filing_digests_owner" on public.tradeiq_filing_digests;
create policy "filing_digests_owner" on public.tradeiq_filing_digests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

