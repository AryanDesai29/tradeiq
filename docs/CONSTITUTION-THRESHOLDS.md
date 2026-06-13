# TradeIQ Constitution — Thresholds

**Version:** 0.1.0 · `PRELIMINARY`
**Governs:** the numeric values referenced by [`CONSTITUTION.md`](./CONSTITUTION.md).
**Status:** provisional. These numbers are **not settled science.** They exist so the system has *something* to enforce before real data arrives; they are explicitly expected to change.

---

## Why this file is separate

`CONSTITUTION.md` holds **timeless principles.** This file holds **evolving numbers.** The principles should rarely change. These values will change the moment real TradeIQ data exists. Keeping them apart means a threshold revision never touches — and never appears to weaken — a principle.

This separation is itself an application of the constitution's philosophy:

```
Thresholds exist  →  required  →  measured  →  set
```

not

```
Thresholds sound reasonable  →  shipped forever
```

Every value below is therefore tagged with the data that will eventually replace intuition with evidence.

---

## Conditioning Rule thresholds (Principle 3)

The gates — minimum N, minimum CI quality, minimum statistical power — are **mandatory and live in the constitution.** Their values live here.

| Gate | Provisional value | Replace with evidence from |
|------|-------------------|----------------------------|
| Hard hide | No conditioned insight displayed if **N < 5** | Real per-bucket sample distribution |
| Low-confidence label | Display "Low Confidence" if **N < 20** | Calibration vs. realized outcomes per N band |
| Act-on floor | **N ≥ 10** to surface as actionable | Where expectancy estimates stabilize empirically |
| Confidence interval | **Mandatory at every N** (the interval is the honesty) | — *(timeless; never relaxed)* |
| Statistical power | TBD — no provisional value | Power analysis once effect sizes are observed |

**Open risk to resolve with data:** an `N≥30`-style floor would make Investor DNA impossible if a real thesis type only ever reaches N=11. An `N≥5` floor may admit noise. The right floor is whatever survives calibration, discovered — not assumed.

---

## Survival Rule thresholds (Principle 6)

The risk-of-ruin ceiling is **mandatory and lives in the constitution.** Its values live here.

| Warning | Provisional trigger | Replace with evidence from |
|---------|--------------------|----------------------------|
| Single-position concentration | **> 25%** of portfolio | Realized drawdown contribution by position size |
| Theme concentration | **> 40%** in one theme | Correlated-drawdown events across themes |
| Effective bets | **< 5** effective independent positions | Observed correlation structure of held positions |
| Risk-of-ruin ceiling | TBD — no hard value | Distribution of realized outcomes once trades close |

These are close to limits already used elsewhere in the codebase, so they are reasonable *starting* guards — not endpoints.

---

## Escalation / sample gates

*(Reserved.)* Rules for how a bucket graduates from "hidden" → "low confidence" → "actionable," and how a Survival warning escalates to a block, will be defined here once there is enough closed-trade data to calibrate them. Until then, the bands above are the only gates.

---

## Review trigger

Revisit and version-bump this file when **both** are true:

1. `tiqUsage()` and `tiqFilings()` contain enough real behavior to estimate per-bucket sample sizes, and
2. There are enough **closed trades** to estimate realized outcome and drawdown distributions.

At that point, replace each `PRELIMINARY` value with a data-derived one, cite the data, and record it in the Changelog. That is the moment TradeIQ stops being a well-designed system and becomes a measured one.

---

## Changelog

- **0.1.0 (2026-06-13)** — Extracted from `CONSTITUTION.md` v1.0.0 so principles stay timeless and numbers evolve independently. All values `PRELIMINARY`; awaiting validation data.
