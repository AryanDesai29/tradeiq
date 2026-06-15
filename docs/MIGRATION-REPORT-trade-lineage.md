# Migration Report — Reproducibility Baseline + Trade Lineage

PR: **Move 0 (reproducibility) + Move 1 (decision-context preservation)**
Branch: `feat/trade-lineage` → `main`
Scope guard: **no currency fix, no UI redesign, no telemetry change in this PR.**

---

## Phase A — Reproducibility

### Problem (proven)
Five tables existed only in the live project (`fwfmhaaulnzpjahyuhzj`) and had **no migration**: `tradeiq_holdings`, `tradeiq_journal`, `tradeiq_profiles`, `tradeiq_settings`, `tradeiq_watchlist`. A fresh DB built from `supabase/migrations/` **failed at `0001`**, whose FK references `public.tradeiq_journal`. The repository was therefore not the source of truth; the live DB was an undocumented dependency (Principle 2 — Evidence Hierarchy).

> Note: the original code-only audit named 3 missing tables. Live introspection revealed **5** — `settings` and `watchlist` are referenced by no current code, so a code audit could not see them.

### Fix
New migration **`0000_base_schema.sql`** — numbered to apply **before** `0001` — recreates all five tables **exactly as production** (verified 2026-06-15 via live-schema introspection: columns, types, defaults, PKs, uniques, checks, indexes, RLS + policies). It is fully idempotent (`create table if not exists`, `drop/create policy`), so applying it to the existing production DB is a safe no-op. `tradeiq_journal` is created in its **original** shape; existing `0002`/`0003` still layer their columns on top, unchanged.

### Migration order (applies ascending)
```
0000_base_schema          ← NEW: holdings, journal, profiles, settings, watchlist (+RLS)
0001_tradeiq_reviews      ← FK → journal(id)   [now resolves]
0002_journal_alpha_columns (ALTER journal)
0003_thesis_layer          (ALTER journal)
0004_opportunities
0005_research_workspace
0006_council_sessions
0007_council_cache
0008_opportunity_pipeline
0009_research_sources
0010_filing_intelligence
0011_trade_lineage        ← NEW: decision-context snapshot
```

### Table creation order (fresh DB)
`auth.users` (Supabase bootstrap) → **0000**: holdings, journal, profiles, settings, watchlist → **0001**: reviews (FK→journal ✓) → **0004**: opportunities → **0006**: council_sessions → **0010**: filing_digests. Every FK target now exists before its referrer.

### RLS status (all five tables)
`rls_enabled = true`, one `*_owner` policy each: `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`. **Correction to the original audit:** RLS was flagged UNKNOWN/high-risk; ground truth shows it is **enabled with a policy on every table** — there is no live cross-user exposure. Finding #1 is a reproducibility/DR issue only.

### Fresh-install validation
- **DDL parity:** `0000` was generated from live introspection (columns/types/defaults/uniques/checks/indexes/policies), so it reproduces production by construction.
- **Dependency order:** proven above — `0001`'s FK to `journal` (the original failure) resolves because `0000` precedes it.
- **Conclusive fresh apply: PROVEN in CI.** `.github/workflows/db-reproducibility.yml` spins up a clean Postgres, stubs the only two Supabase-specific objects the migrations use (`auth.users`, `auth.uid()`), applies `0000…0011` in order, and asserts the schema. Green on PR #17:
  ```
  >>> applying 0000_base_schema.sql … 0011_trade_lineage.sql   (all 12, in order)
  OK: all tables exist   ·   OK: 7 lineage columns   ·   OK: RLS on every table
  ```
  This is now a permanent gate — every future migration PR re-proves "clone → run migrations → clean DB boots." (A local `supabase db reset` against the full Supabase stack remains available for higher-fidelity RLS-behaviour testing, but the boot/reproducibility success condition is demonstrated.)

### Known smells preserved verbatim (for the cleanup follow-up)
- `tradeiq_settings.key` is **globally unique** (not per-user) — two users cannot share a key.
- `tradeiq_profiles` defaults predate India-first work (`capital = 5000`, `default_market = 'us'`).
- `settings` / `watchlist` / `profiles` are **not read by current code** (watchlist persistence and a preferences layer are designed-but-unwired).

---

## Phase B — Decision-Context Preservation (the lineage fix)

### Problem (proven by the lineage audit)
At the trade boundary (`critiqueAndLog` → `addTrade`) only the thesis **text** crossed; identity, council verdict, generation confidence, risk tier, sector, price-at-generation and research depth all died on the opportunity row. Attribution fell back to ticker matching — "RELIANCE worked", never "which RELIANCE thesis worked, under what context" (Principle 7 — Self-Knowledge Flywheel).

### Fix — `0011_trade_lineage.sql` (forward-only, all columns nullable)
On `tradeiq_journal`:
| Column | Meaning |
|---|---|
| `opportunity_id bigint → tradeiq_opportunities(id) ON DELETE SET NULL` | **the hard idea→trade link** |
| `council_session_hash text` | durable trade→debate link (see note) |
| `council_verdict text`, `council_confidence int` | council decision state at trade time |
| `generation_confidence int` | the opportunity's confidence when generated |
| `opp_risk_level text` | risk tier at decision |
| `decision_sector text` | app theme/sector classification at decision |
| `price_at_gen numeric` | idea-generation price |
| `opp_researched_at timestamptz` | research recency |
| `research_brief_present bool`, `filing_digest_count int`, `facts_present bool` | research-depth indicators |

On `tradeiq_opportunities`: `council_session_hash text` (carries the session key from verdict → trade).
Index: `idx_journal_opportunity (opportunity_id) where opportunity_id is not null`.

**Forward-only:** existing trades keep NULL lineage — no fabricated backfill (past context is genuinely gone). Attribution coverage begins at the apply date.

### Design note — `council_session_hash`, not `council_session_id`
The spec listed `council_session_id`. The council session row is inserted **best-effort / fire-and-forget** and is also **served from a local cache replay** (`Council.jsx:140,165-171`), so its bigint id is frequently unavailable at verdict time. The session's **deterministic natural key `topic_hash`** (indexed since `0007`) is available synchronously and offline, so it is the robust trade→debate link. `trade.council_session_hash` joins to `tradeiq_council_sessions.topic_hash`.

### Wiring (code)
- `src/pipeline.js` — new pure, unit-tested `lineageSnapshot(opp)` builds the snake-keyed snapshot (3 tests in `tests/pipeline.test.mjs`).
- `src/App.jsx`:
  - `handleCouncilVerdict` writes `council_session_hash` onto the opportunity (`hashTopic(...)`).
  - `critiqueAndLog` freezes `lineageSnapshot(o)` into the trade form (stamped with `_ticker`).
  - `addTrade` applies the snapshot **only if it was built for the same ticker** (guards against stale lineage) and spreads it into the insert. Also fixes the **sector leak**: opp-originated trades previously stored `sector = null`; now `sector = meta.sector || decision_sector`.
  - Removed the dead `tradeiq_profiles` upsert (wrote only `{user_id}`, never read). Table kept in schema.

### Earned Complexity
Snapshot is **persisted on write** (the boundary fix). In-memory read-back of the new columns is intentionally **not** added — nothing consumes them yet; the future Investor-DNA PR adds the read it needs. No analytics/DNA logic built ahead of evidence.

---

## Verification
- `npm test` → **177 passed / 0 failed** (174 prior + 3 lineage).
- `npm run build` → success.
- No currency/UI/telemetry changes (scope guard honored).

## Follow-up (separate issue)
Decide wire-or-remove for the unused `settings` / `watchlist` / `profiles`; fix the global-unique `settings.key`; reconcile `profiles` defaults with India-first.
