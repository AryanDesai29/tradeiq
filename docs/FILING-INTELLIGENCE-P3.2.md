# Phase 3.2 — Filing Intelligence Engine (Architecture)

**Status: BUILT 2026-06-13 (3.2a + 3.2b + L3 council-triggered ingestion).**
Approved decisions (§6): map model = llama-3.1-8b-instant; scope cap = 8 chunks
(MD&A + Risk Factors); trigger = three-tier (L1 XBRL facts auto · L2 manual Read
buttons · L3 Council "Evidence Missing" → auto-read → re-research); India 3.3a =
held for the usage-validation period. Shipped: `api/_edgar.js`, `api/facts.js`,
`src/facts.js`, `api/ingest.js`, `src/filings.js`, migration `0010`, vercel.json
`maxDuration`, research + Council injection, Workspace Fundamentals + Read button
+ Digest panels, Pipeline chips. 16 new pure tests (157 total green). Remaining
(3.2c polish, optional): Mission Control staleness nudge; sync the offline
validation-lab.mjs prompt copy with the new FUNDAMENTALS/FILING DIGEST rules.
Date: 2026-06-12. Builds on Phase 3 / P3.1 (commit `acd6300`): the analyst can
currently cite that a filing *exists* (form, date, link) but knows nothing of
its contents. This phase makes the system actually **read** filings.

Target sentence: *"I read the company's last 10-Q and found three thesis risks."*

---

## 0. Measured constraints (probed live 2026-06-12, not guessed)

| Fact | Measurement |
|---|---|
| NVDA 10-Q primary doc | 1.1 MB iXBRL HTML → **153 KB plain text ≈ 39k tokens** after tag-strip |
| 10-K (expectation) | 3–5× a 10-Q ≈ 120–200k tokens — never single-call |
| 8-K (expectation) | usually < 5k tokens — single-call |
| XBRL `companyfacts` | **works, free, no key**: 3.9 MB JSON; full quarterly series for Revenues, GrossProfit, OperatingIncomeLoss, NetIncomeLoss, R&D (NVDA: 276–310 data points per tag) |
| Section headings | "MD&A" / "Item 1A Risk Factors" findable by regex, but the FIRST hit is the table of contents — splitter must take the LAST/second occurrence |
| Groq free tier | llama-3.3-70b ≈ 12k TPM → a 39k-token single call is NOT possible on free tier; chunked map-reduce or section-priority required. llama-3.1-8b-instant has a separate (cheaper) budget |
| Vercel serverless | default 10s timeout; `vercel.json` `maxDuration` raise needed for ingestion (60s on hobby) |

**Design consequence:** numbers should come from XBRL (deterministic, zero
tokens, zero hallucination risk), narrative from filing text (LLM, chunked).
Never ask an LLM for a number that XBRL already states.

---

## 1. Two pillars

### Pillar A — XBRL Facts Engine (3.2a) — deterministic, zero LLM

`data.sec.gov/api/xbrl/companyfacts/CIK{10}.json` → pure computation → hard FACTS.

- **`api/facts.js`** (GET `?ticker=`): reuses the CIK resolver from
  `api/filings.js` (extract it to `api/_edgar.js` shared helper). Fetches
  companyfacts, extracts a fixed tag set, returns the last 10 quarters:
  - `Revenues` (fallback `RevenueFromContractWithCustomerExcludingAssessedTax`)
  - `GrossProfit`, `OperatingIncomeLoss`, `NetIncomeLoss`,
    `ResearchAndDevelopmentExpense`
  - Dedupe by (fy, fp, form) keeping the latest filing's value (restatements win).
  - The 3.9 MB JSON never reaches the client — server reduces to ~2 KB.
- **`src/facts.js`** (pure, tested): trend math — YoY/QoQ revenue growth,
  gross/op/net margin per quarter + delta vs 4 quarters ago, R&D intensity;
  `factsBlock()` renders ≤ 600 chars for prompts, e.g.
  `REVENUE: 81.6B latest q (+43% YoY, +12% QoQ) · GROSS MARGIN 75.0% (▼1.2pp YoY) · …`
- These lines are labeled **[FACT, XBRL 10-Q 2026-05-20]** — the strongest
  evidence class in the app, and they directly answer "revenue trends, margin
  changes" without one LLM token.
- Caveats handled honestly: banks/insurers use different tags (missing tag →
  omitted, never guessed); `.NS` tickers → same "files with NSE/BSE" note as
  filings.

### Pillar B — Filing Text Ingestion (3.2b) — narrative via map-reduce

```
filings index (have) → pick filing → download primary doc (EDGAR Archives)
  → strip iXBRL/HTML → section split (TOC-aware) → prioritize sections
  → chunk → MAP: extraction per chunk (8b-instant)
  → REDUCE: merge into Filing Digest (70b)
  → store digest (Supabase, cached forever per accession)
  → feed Research Analyst + Council + Workspace
```

- **`api/ingest.js`** (POST `{ticker, accession}`):
  1. Resolve + download primary document (UA-compliant, ~1 MB).
  2. **Extract text**: regex strip (script/style → tags → entities → whitespace).
     No npm dependency — EDGAR docs strip cleanly (measured above).
  3. **Section split**: locate canonical headings (10-Q: Part I Item 2 MD&A,
     Part II Item 1A Risk Factors; 10-K: Item 1A, Item 7) using the LAST
     occurrence of each heading (first = TOC). Unmatched → fall back to whole
     doc as one section.
  4. **Prioritize**: MD&A → Risk Factors → everything else. Boilerplate
     (legal proceedings, exhibits, signatures) skipped.
  5. **Chunk**: ~14k chars (≈3.5k tokens) per chunk, hard cap **8 chunks**
     (≈28k tokens read). A 10-Q's MD&A + Risk Factors fits; for a 10-K this
     reads the highest-value ~25% — the manifest records what was skipped.
  6. **MAP** (llama-3.1-8b-instant, JSON mode, sequential to respect TPM):
     per-chunk extraction — `{guidance[], risks[], demand_signals[],
     margin_commentary[], competitive[], segment_notes[], quotes[]}`.
     Prompt rule: *extract only what THIS text states; no outside knowledge;
     every item carries its section name; quotes verbatim ≤ 200 chars.*
  7. **REDUCE** (llama-3.3-70b, one call ≈ 6k tokens in): merge chunk
     extractions into one **Filing Digest** (schema below). Rule: merge and
     dedupe only — add nothing that no chunk stated.
  8. Store + return.
- **Runtime budget**: 8 map calls ≈ 2-4s each (sequential) + reduce ≈ 4s +
  download ≈ 2s → **30–45s** → requires `vercel.json` `maxDuration: 60` for
  this route. UI shows per-stage progress ("Reading MD&A… 3/8").
- **Cost per filing**: ≈ 30–40k input tokens on 8b + ≈ 7k on 70b. Groq free
  tier sustains roughly 5–10 ingestions/day — fine for personal use, enforced
  by rate limit `ingest: 2/10min + 6/day` and by the cache (an accession is
  ingested **once, ever**).

### Storage — `tradeiq_filing_digests` (migration 0010)

```sql
id bigint identity PK,
user_id uuid → auth.users (RLS as everywhere),
ticker text, cik bigint, accession text, form text, filed date,
digest jsonb,                 -- normalized Filing Digest
sections_ingested jsonb,      -- manifest: [{section, chunks, chars}] + skipped[]
tokens_used integer,
created_at timestamptz default now(),
unique (user_id, accession)   -- upsert = permanent cache, filings are immutable
```

### Filing Digest schema (normalized client-side in `src/filings.js`, same
clamp discipline as `normalizeBrief`/`normalizeSession`)

```
{
  summary,                       // ≤ 600 chars
  guidance[],                    // management's forward statements
  revenue_drivers[], margin_commentary[],
  risk_changes[],                // new/escalated risk factors
  competitive[], segment_notes[],
  red_flags[],                   // analyst-judged, must reference a quote/section
  quotes[]: {text ≤200 verbatim, section},
  not_ingested[],                // sections skipped — honesty manifest
  evidence_note                  // "read MD&A + Risk Factors of 10-Q 2026-05-20"
}
```

**Anti-hallucination contract** (extends the app's existing rules):
every digest item carries section provenance; quotes are verbatim; skipped
sections are listed, so "the filing doesn't mention X" can never be claimed —
only "the ingested sections don't mention X"; a digest cites as
**[FACT, 10-Q 2026-05-20, MD&A]**.

---

## 2. Integration points (all existing seams, no new architecture)

| Consumer | How |
|---|---|
| **Research Analyst** (`api/research.js`) | client includes `digestBlock()` (≤ 1200 chars) + `factsBlock()` in the request, exactly like `sourcesText` today. Briefs stop saying "recent quarters UNKNOWN" for US names with a digest |
| **Council** (`buildCouncilContext`) | topic ticker has digest/facts → append compact block (≤ 500 chars): Veris gets reality-vs-expectations ammunition, Marlowe's EVIDENCE MISSING can be answered by ingesting the filing |
| **Council loop (P4)** | `tasksFromCouncil` items classified `expectations`/`risk`/`company` that a digest answers get auto-marked addressable; "Run research" after an ingest re-runs with filing context |
| **Workspace** (Sources panel) | each US filing row gains **📖 Read** (not yet ingested) / **✓ Read** (open digest); digest renders like the brief with its sections |
| **Pipeline scores** | no formula change — a digest-grounded brief naturally raises `evidence_strength` and resolves `unknowns`, which `researchConfidenceScore`/`riskScore` already read |
| **Mission Control** | Research Pipeline panel: "filing read" indicator per researching item; optional later: "new 10-Q filed since last research" staleness nudge |

**Trigger model (recommended):** manual **📖 Read filing** button per filing +
one-click "Read latest 10-Q/10-K" inside the research workspace. NOT auto-run
on every research pass (cost control, and ingestion is once-per-accession
anyway). XBRL facts (cheap) ARE auto-fetched with every research run.

---

## 3. India path (Phase 3.3 — design note only, not in 3.2)

- **BSE**: `api.bseindia.com` corporate-announcements JSON is publicly
  reachable → index-level integration (like EDGAR today) is feasible:
  announcement title + date + PDF link. **PDF text extraction is the blocker**
  (needs a PDF lib — first new npm dependency, or an external parse service).
- **NSE**: API requires a cookie/session dance and aggressively blocks
  serverless IPs — not reliable from Vercel; do not promise it.
- **Earnings transcripts / investor presentations**: no free structured
  source; defer.
- Sequencing: 3.3a = BSE announcements **index** (honest, cheap, replaces the
  "unavailable" note for `.NS`), 3.3b = PDF ingestion reusing the 3.2b
  map-reduce pipeline unchanged (the chunker doesn't care where text came from).

---

## 4. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM invents numbers "from the filing" | numbers come from XBRL only; map prompt forbids arithmetic; digest normalizer drops items without section provenance |
| TOC false-positive section split | take LAST heading occurrence; verify section length > 5k chars else fall back to whole-doc chunking |
| Vercel timeout mid-ingest | per-stage progress + idempotent retry (cache hit on re-run resumes free); cap 8 chunks |
| Groq TPM 429s | sequential map calls, 8b model, exponential backoff once; partial digest stored with manifest noting incomplete |
| 10-K too large | priority sections only + explicit `not_ingested` manifest |
| Filing amended (10-Q/A) | accession differs → new ingest; digest header shows form verbatim |
| EDGAR rate/UA policy | declared UA (already), ≤ 10 req/s policy is far above our usage; company_tickers.json cached 24h (already) |

## 5. Build sequence (when approved)

1. **3.2a** XBRL Facts: `api/_edgar.js` (extract shared CIK resolver),
   `api/facts.js`, `src/facts.js` + tests, wire into research + council
   context. *Small, deterministic, immediately valuable.*
2. **3.2b** Ingestion: `api/ingest.js`, `src/filings.js` (normalizeDigest /
   digestBlock) + tests, migration 0010, `vercel.json` maxDuration, Workspace
   read-button + digest panel, research/council injection.
3. **3.2c** Polish: 8-K single-call ingestion, Mission Control staleness
   nudge, council-task ↔ digest cross-referencing.

Tests: pure modules fully covered (section splitter on synthetic TOC+body
fixtures, trend math, digest normalizer clamps); endpoint smoke-probed live
like P3.1.

## 6. Open decisions (need approval)

1. **Map model**: llama-3.1-8b-instant (recommended — cheap, extraction is
   easy) vs 70b everywhere (better prose, ~5× token budget).
2. **Digest scope cap**: 8 chunks ≈ MD&A + Risk Factors (recommended) vs more.
3. **Trigger**: manual Read button (recommended) vs auto-ingest latest 10-Q on
   first research of a ticker.
4. **vercel.json maxDuration 60** for `/api/ingest` — confirm plan supports it.
5. Proceed with 3.3a (BSE index for India) right after 3.2, or hold for the
   2–3 day usage validation period first.
