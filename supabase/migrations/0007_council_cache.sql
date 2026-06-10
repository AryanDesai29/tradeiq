-- Council cost redesign: sessions are cached by topic hash (mode|type|ticker|
-- normalized title, djb2) so identical discussions within the 24h TTL are
-- replayed instead of regenerated, and tagged with the council mode
-- (quick = 4-member panel, full = all ten).

alter table public.tradeiq_council_sessions add column if not exists topic_hash text;
alter table public.tradeiq_council_sessions add column if not exists mode       text default 'full'; -- quick | full

create index if not exists tradeiq_council_hash_idx on public.tradeiq_council_sessions (user_id, topic_hash, created_at);
