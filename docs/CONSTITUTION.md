# TradeIQ Constitution

**Version:** 1.0.1
**Status:** Governing document. Supersedes feature opinion.
**Thresholds:** numeric values live in [`CONSTITUTION-THRESHOLDS.md`](./CONSTITUTION-THRESHOLDS.md) (separate, evolving).
**Ratified:** 2026-06-13
**Amendment rule:** changes require a version bump and a one-line rationale in the Changelog. Principles may be sharpened; loopholes may not be reopened.

---

## Preamble

At this stage the biggest risk is no longer building too little. It is building too much.

This document exists to keep TradeIQ focused on **becoming a better investor**, not on **becoming a larger app**. It governs every future feature, every refactor, and every agent — human or AI — that touches this product. Where a principle and a feature conflict, the principle wins.

Each principle has a **test**. A principle without a test is a sentiment, and sentiments get rationalized away. If you cannot answer the test with evidence, the answer is No.

---

## Principle 1 — Prime Directive

A feature ships only if it does one of:

- **A.** Improves decision quality, **or**
- **B.** Improves understanding of the user *in a way that changes future decisions.*

Understanding that never reaches the decision layer is surveillance, not self-knowledge, and does not qualify under (B).

**Conflict rule:** when A and B conflict, **Decision Quality > User Understanding.** Understanding is valuable only instrumentally, through decisions.

> **Test:** Name the future decision this feature changes, and how you would observe the change. If you cannot, it does not ship.

---

## Principle 2 — Evidence Hierarchy

Every claim the system makes carries a tier. A higher tier may **never contradict a lower tier without explicitly saying so.**

| Tier | Name | Examples |
|------|------|----------|
| **0** | **User Intent** | The user's declared thesis, intended action, stated risk tolerance |
| **1** | **Objective Facts** | XBRL, filings, trade records, prices |
| **2** | **Derived Metrics** | Alpha, Investor IQ, Decision Quality |
| **3** | **Inference** | Council, research summaries |
| **4** | **Recommendation** | CIO memos, position suggestions |

**Tier 0 exists because the moat is measuring the chain: Intent → Intelligence → Decision → Outcome.** Without a recorded intent, `changed_my_mind` cannot be measured at all.

**Disclosure clause:** any Tier 2 metric that embeds a Tier 3 assumption must disclose it. "Alpha" must state its benchmark; "Decision Quality" must state its attribution model. A derived metric that hides a modeling choice is laundering inference as fact.

> **Test:** Every surfaced claim is tier-tagged. Any time a higher tier overrides a lower one, the override is shown, not silent.

---

## Principle 3 — Conditioning Rule

No conditioned insight may be shown unless its bucket satisfies all of:

- **Minimum sample size** (floor on N)
- **Minimum confidence-interval quality** (interval narrow enough to act on)
- **Minimum statistical power**

Otherwise, **widen the bucket** until the evidence is real, and say so:

> *Technology + Demand Acceleration — N=11, Expectancy +1.6R (95% CI: +0.4 to +2.8). Regime sample too small to segment further.*

Never:

> ~~Tech + Demand Acceleration + 70–80% Confidence + Trending Market = +2.1R~~ *(bucket does not survive that conditioning depth)*

**The widening behavior is the moat.** Most AI systems keep slicing until they find a story. TradeIQ widens until it finds evidence.

**Aggregation guard (Simpson's paradox):** report the widest statistically-real bucket, **and** flag when an underpowered subgroup diverges *directionally* from the aggregate. Widening is the fix for overfitting; aggregation bias is the failure mode of the fix.

> **Test:** Every conditioned number ships with N and a confidence interval. No point estimate without its interval. Directional subgroup divergence is flagged even when individually underpowered.

**Thresholds — `TBD_AFTER_VALIDATION`.** The gates (minimum N, minimum CI quality, minimum statistical power) are mandatory and timeless. Their *values* evolve with data and live in [`CONSTITUTION-THRESHOLDS.md`](./CONSTITUTION-THRESHOLDS.md), currently `PRELIMINARY`. Setting them before we know the platform's real cadence would make Investor DNA impossible (an `N≥30` floor silently deletes a thesis type that only ever reaches N=11) or admit noise (`N≥5`) — so they stay provisional until real data informs them.

---

## Principle 4 — Earned Complexity

Every layer must justify its existence. A layer may earn its keep through **either**:

- **Leading indicators** — did it change a verdict, a confidence, a position size, a decision? **or**
- **Rare high-impact outcomes** — did it prevent a catastrophic mistake, even if it is silent on the median decision?

A layer that demonstrates neither gets simplified, demoted, or removed.

**Tail-value clause:** do not prune insurance on mean metrics. A layer worthless on the average decision but decisive on the one catastrophe-avoidance per year has earned its place. Judge layers on the decisions that matter most, not the median decision.

**Attribution caveat:** in investing, outcomes lag the prune decision by quarters. Prefer leading indicators of value over lagging outcome attribution; do not kill a layer on outcome data you cannot yet have.

> **Test:** Each layer reports, per period, the verdicts/confidences/decisions it changed (leading) and any high-impact saves (tail). A layer with zero of both for a defined window is a removal candidate.

---

## Principle 5 — Calibration

Any confidence the system emits — Opportunity Engine, Research Engine, Council, CIO Engine — is a falsifiable claim and must eventually be **audited against realized frequency.**

When the system says 70%, 70%-confidence calls must happen ~70% of the time. Confidence that is never checked is decoration, and decoration contradicts Principle 2's purpose.

> **Test:** Every emitted confidence is logged with its eventual outcome. A calibration curve (predicted vs. realized) is maintained per engine and recalibrated when it drifts.

---

## Principle 6 — Survival

**No optimization may increase expected return at the cost of unacceptable risk of ruin.**

Decision quality is expectancy **survivable across repetition** — never raw R-multiple. The system will eventually discover that *High Conviction + High Concentration = Highest Expectancy*, and if unconstrained will optimize itself into blowing up the portfolio. This principle is the constraint that prevents it.

Reversibility and cost-of-being-wrong sit above expectancy, not beside it.

> **Test:** Any recommendation or optimization reports its risk-of-ruin / max-drawdown contribution. A change that raises expectancy while pushing risk-of-ruin past threshold fails, regardless of expectancy gain.

**Thresholds — `TBD_AFTER_VALIDATION`.** The risk-of-ruin ceiling is mandatory and timeless; its value evolves with data and lives in [`CONSTITUTION-THRESHOLDS.md`](./CONSTITUTION-THRESHOLDS.md), currently `PRELIMINARY`, until real closed-trade data informs it.

---

## Principle 7 — Self-Knowledge Flywheel

**No decision exits the system without updating self-knowledge.**

```
Decision → Outcome → Review → Self-Knowledge Update
```

Mandatory. No exceptions. This is how Investor DNA compounds and how the moat is built. A decision that does not feed back into the self-knowledge layer is a feature, not a flywheel.

> **Test:** Every recorded decision produces a self-knowledge write on resolution. A decision with no downstream update is a defect.

---

## The Influence Metric — `changed_my_mind`

The metric that matters is not "Did TradeIQ help?" (contaminated by hindsight bias and the demand effect). It is the **observed, pre-registered** delta between intended and actual action.

**Capture intent *before* intelligence is shown:**

```
Before Research →  What will you do?   (intended action, confidence, size, risk)
After Research  →  What will you do?   (actual action, confidence, size, risk)
```

**Record the deltas:**

- `decision_changed`
- `confidence_changed`
- `position_size_changed`
- `risk_changed`

This is the highest-value telemetry event in the system, because it is the moment intelligence influenced capital allocation. The delta is *observed*, not recalled — pre-commitment of intent is what separates it from a vanity metric.

---

## PR Constitution Check

Every PR that adds or changes product behavior must answer this block. A single Fail blocks merge until resolved or explicitly waived (with a recorded rationale and version note).

```
## Constitution Check

- [ ] Prime Directive          — names the future decision it changes
- [ ] Evidence Hierarchy        — claims are tier-tagged; overrides disclosed
- [ ] Conditioning Rule         — conditioned numbers ship with N + CI; widen-not-slice
- [ ] Earned Complexity         — leading indicator OR tail-value justification
- [ ] Calibration               — emitted confidences are logged for audit
- [ ] Survival                  — risk-of-ruin within threshold
- [ ] Self-Knowledge Flywheel   — decisions write back to self-knowledge

Verdict: PASS / FAIL
Waivers (if any): <principle> — <rationale> — <reviewer>
```

---

## Validation Gate (the pause has an exit criterion)

The current pause is correct: the roadmap is blocked by reality, not engineering. But a pause without a success condition becomes drift. Exit criterion, fixed in advance:

> Run one week. Look for **three observed `changed_my_mind` moments** — "I was going to do X; TradeIQ made me do Y."

- **Three or more →** resume building, and prioritize the specific layers that *produced* those moments (Earned Complexity in action).
- **Fewer than three →** the chain is broken. Debug the chain (Intent → Intelligence → Decision); do **not** add a layer.

The goalposts are set now, before the week starts.

---

## Changelog

- **1.0.0 (2026-06-13)** — Initial ratification. Seven principles, the `changed_my_mind` influence metric, the PR Constitution Check, and the validation gate. Conditioning-Rule and Survival thresholds left `TBD_AFTER_VALIDATION` with `PRELIMINARY` provisional values — the constitution defines *what must be measured* before it defines the numbers (evidence before conclusions). Locking N / CI / power / risk-of-ruin before knowing the platform's real cadence would either make Investor DNA impossible or admit noise.
- **1.0.1 (2026-06-13)** — Extracted all numeric thresholds into `CONSTITUTION-THRESHOLDS.md` so this document holds only timeless principles and the numbers evolve independently. No principle changed.
- **1.1.0 (planned)** — After `tiqUsage()` and `tiqFilings()` ship and real closed trades exist, replace the `PRELIMINARY` thresholds (in `CONSTITUTION-THRESHOLDS.md`) with values informed by actual TradeIQ data instead of intuition.
- **1.2.0 (planned, post-validation)** — Consider **Principle 8 — Removal Bias**: when evidence is inconclusive, prefer removing complexity over adding it. Principle 4 (Earned Complexity) asks "does this earn its existence?"; Principle 8 asks "does it *still*?" — a periodic prune against the system becoming a maze. Deferred until validation, per evidence-before-conclusions.
