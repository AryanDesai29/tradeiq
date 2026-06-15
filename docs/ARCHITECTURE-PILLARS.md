# TradeIQ — Architecture Pillars & North Star

TradeIQ is not a journal. The mission is **help me outperform**, not merely "be a
better investor" — and outperformance comes from acting on information the market
hasn't fully processed (investigative investing). The product is three pillars
over one closed loop. This document makes the **Hypothesis Hunter a first-class
pillar today**, not a future enhancement — it is where the alpha-generation story
lives. (Adopted 2026-06-16; supersedes the "CIO Engine as a late, deferred
follow-on" framing in earlier roadmap notes.)

## The loop

```
WORLD → Signals → Hypotheses → Research → Council → Decision → Trade → Outcome → Learning
                      ▲                                  │
                      └───────────── ranked by ──────────┘
                              the Opportunity Queue
```

A pure-journal product only owns the right half (Decision → … → Learning). The
edge lives in the left half (World → Signals → Hypotheses) — generated safely,
because nothing is ever asserted as alpha; it is only ever surfaced as
**“this deserves investigation.”**

## Three pillars

### Layer 1 — CIO Engine ("monitor the investor") — **SHIPPED (Opportunity Queue)**
First-party only: holdings, journal, theses, decisions, conviction, overrides,
outcomes, lineage, Nova's ideas. Produces **"what should I do next?"** as a ranked,
fully-explainable queue:
- conviction ↔ exposure gaps (high-conviction idea, no/small position)
- stale theses on large holdings · undecided research (effort, no decision)
- rule violations in live state (you hold what you decided to avoid)
- open positions with no stop · rules you keep overriding
Deterministic cross-references ship now; **statistical** claims ("similar to past
winners", "this rule's overrides outperform") are **locked behind sample size**
(`gatedInsights`) — never fabricated. No scraping, no external data, no invented
"$ upside"; ranked by observable components only.
Code: `src/opportunityQueue.js` (pure, tested) · `src/OpportunityQueue.jsx` · 🎯 Queue tab.

### Layer 2 — Hypothesis Hunter ("monitor the world") — **NORTH STAR (phased)**
Turns legally-obtainable external signals into **research leads**, never alpha calls.
Pipeline: `World events → Signal extraction → Pattern recognition → Portfolio
relevance → Opportunity ranking → notification` — feeding the **same** Opportunity
Queue as `source:"hypothesis"` leads.

The discipline that makes it safe and defensible (and satisfies the Skeptic):
> It never says *"this will outperform."* It says *"this deserves investigation."*
Every output is a labelled **hypothesis** routed through Research → Council before
any decision — TradeIQ's existing, validated path.

**Signal tiers:**
- **Clean core (build first):** SEC/EDGAR (already integrated via `/api/filings`,
  `/api/facts`) — insider Form 4, guidance/buybacks/debt; earnings revisions;
  options/macro/credit from licensed data APIs. Respect each source's ToS + rate
  limits; never redistribute.
- **Scraping periphery (deferred, needs legal review):** job postings, supplier/
  customer announcements, exec travel, conference appearances, M&A rumours.
  Highest noise, lowest legality — do not build until a signal→return link is
  proven and counsel has cleared it.

Example output (a hypothesis, not a recommendation):
> **Needs research — expectation divergence.** Insider buying across 4 execs ·
> earnings revisions turning positive · stock lagging its sector · no estimate
> changes yet. *Investigate.*

### Layer 3 — Council — **EXISTS**
Tests evidence, thesis quality, risk, valuation. Produces **"should this become an
investment?"** Both Layer-1 actions and Layer-2 hypotheses converge here before
capital moves.

## Guardrails (Constitution)
- **Evidence Hierarchy:** Hypothesis Hunter emits Tier-3 hypotheses; it may never
  assert a Tier-1 "fact" or a "buy."
- **Conditioning Rule:** "5 investable opportunities/week from millions of signals"
  is an overfitting trap. Confidence scales inversely with conditioning depth;
  widen buckets until the sample is real; label, don't fabricate.
- **Earned Complexity:** Layer 2's *value* (do clean signals actually predict
  returns?) is unproven until the validation loop runs — build the clean core,
  measure, then expand. Scraping stays out until earned.
- **Survival / anti-fabrication:** no invented numbers, dates, or "$ upside".

## Status & sequence
1. **Layer 1 Opportunity Queue — shipped.** The 🎯 Queue has two sections:
   **WORLD** (research candidates) and **PORTFOLIO** (actions).
2. **Layer 2 World V1 — shipped (in the Queue).** Research candidates from
   legally-clean data TradeIQ already has: AI-surfaced ideas not yet acted on +
   relative-strength / momentum leaders from live prices (US + India). Each is a
   "research candidate → investigate", never a buy. `worldCandidates()` in
   `src/opportunityQueue.js`.
3. **Layer 2 World V2 — next:** insider Form 4 + earnings-revision + XBRL-buyback
   signals (EDGAR already integrated, US) as inputs, every output a Council-routed
   hypothesis — built once V1's signals prove they generate worthwhile research.
4. **Scraping periphery — deferred** pending legal + a proven signal→return link.
5. **Never a news feed.**
