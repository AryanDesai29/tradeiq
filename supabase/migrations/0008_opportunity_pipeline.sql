-- Opportunity Pipeline + Research Analyst Engine (P3).
-- The flat status column gains pipeline states (researching | council_review |
-- ready | archived — legacy new/watching/dismissed are mapped on read, never
-- rewritten), and each opportunity carries its research work product:
--   research_tasks  [{id, type, question, source, status, finding, created_at, completed_at}]
--   research_brief  normalized analyst brief (facts/assumptions/.../unknowns kept separate)
--   scores          {edge, research, council, risk, composite} snapshot for ranking
-- plus the Council linkage that closes the Evidence-Missing → Research →
-- Reconvene loop.

alter table public.tradeiq_opportunities add column if not exists research_tasks     jsonb default '[]'::jsonb;
alter table public.tradeiq_opportunities add column if not exists research_brief     jsonb;
alter table public.tradeiq_opportunities add column if not exists scores             jsonb;
alter table public.tradeiq_opportunities add column if not exists researched_at      timestamptz;
alter table public.tradeiq_opportunities add column if not exists council_verdict    text;     -- Strong Buy | Buy | Neutral | Avoid | Strong Avoid
alter table public.tradeiq_opportunities add column if not exists council_confidence integer;  -- 0-100
