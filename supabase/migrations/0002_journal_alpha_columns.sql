-- P2.5 Personal Alpha Engine — objective dimensions on journal trades.
--
-- Adds the columns the Alpha engine groups expectancy by. Deliberately minimal:
--   * strategy  — ALREADY exists on tradeiq_journal (fixed STRATEGIES vocab), not re-added.
--   * market    — NOT added: it is 100% derivable from `currency` (INR → India,
--                 else US), so a column would be redundant denormalization. The
--                 engine derives it (src/alpha.js marketOf).
--   * sector / industry — auto-filled at trade creation from Yahoo's search
--                 response (api/search.js already receives sector/sectorDisp/
--                 industry/industryDisp; the UI stores the selected result's
--                 values). Nullable: older rows + the rare symbol with no Yahoo
--                 sector simply fall into the engine's "Unknown" / excluded path.
--   * closed_at — exit timestamp, written when a trade is closed. Unlocks holding
--                 period, day-of-week, fast-vs-slow-winner analytics. Backfill is
--                 impossible for trades closed before this shipped (no historical
--                 timestamp exists), so holding-period metrics apply only to
--                 trades closed from here on — this is expected, not a bug.

alter table public.tradeiq_journal add column if not exists sector    text;
alter table public.tradeiq_journal add column if not exists industry  text;
alter table public.tradeiq_journal add column if not exists closed_at  timestamptz;

-- Speeds up the Alpha engine's "closed trades for this user" scans.
create index if not exists tradeiq_journal_closed_at_idx
  on public.tradeiq_journal (user_id, closed_at);
