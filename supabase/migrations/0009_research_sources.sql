-- Research sources (P3.1) — the real external data behind a research run:
-- dated news headlines (Yahoo) + the SEC EDGAR filings index, stored alongside
-- the brief so every research artifact keeps the sources it was built from.
--   research_sources  {news:[{title,publisher,at,link}], filings:[{form,filed,title,link}], filings_note, fetched_at}

alter table public.tradeiq_opportunities add column if not exists research_sources jsonb;
