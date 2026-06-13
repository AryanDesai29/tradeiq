<!--
This template enforces the TradeIQ Constitution (docs/CONSTITUTION.md).
A constitution nobody has to acknowledge is a document. One that appears in every PR is process.
Fill every section. A single failed Constitution Check blocks merge until resolved or explicitly waived.
-->

## Summary

<!-- What does this PR do, in one or two sentences? -->

## Why this exists

<!-- Prime Directive. Name the FUTURE DECISION this changes, and how you'd observe the change.
     "Improves understanding of the user" only qualifies if it changes a future decision. -->

---

## Constitution Check

> See `docs/CONSTITUTION.md`. Mark each. A single FAIL blocks merge.

- [ ] **1. Prime Directive** — names the future decision it changes (Decision Quality > User Understanding on conflict)
- [ ] **2. Evidence Hierarchy** — claims are tier-tagged (0 Intent / 1 Facts / 2 Metrics / 3 Inference / 4 Recommendation); any override of a lower tier is disclosed, not silent; Tier-2 metrics disclose embedded assumptions
- [ ] **3. Conditioning Rule** — conditioned numbers ship with N + confidence interval; widen-not-slice; directional subgroup divergence flagged (provisional: hide if N<5, "Low Confidence" if N<20)
- [ ] **4. Earned Complexity** — justified by a leading indicator OR rare high-impact (tail) value; tail-insurance not pruned on mean metrics
- [ ] **5. Calibration** — every confidence this emits is logged for later audit against realized frequency
- [ ] **6. Survival** — risk-of-ruin within threshold; no expectancy gain bought with unacceptable ruin risk (provisional: warn single-position >25%, theme >40%, effective bets <5)
- [ ] **7. Self-Knowledge Flywheel** — every decision this touches writes back to self-knowledge on resolution

**Verdict:** PASS / FAIL

---

## Evidence supporting the feature

<!-- Tier-tag what backs this. Objective facts (Tier 1) before inference (Tier 3) before opinion (Tier 4). -->

## Expected Decision Quality impact

<!-- How does this make decisions better? What leading indicator would show it? -->

## Expected User Understanding impact

<!-- Only counts if it routes back into a future decision. If it doesn't, say so. -->

## Risks introduced

<!-- New failure modes, ruin-risk contribution, calibration debt, complexity added. -->

---

## Waivers

<!-- If any Constitution Check is a FAIL but you're proceeding anyway, record it:
     <principle> — <rationale> — <reviewer>
     No waiver = no override. -->

_None._
