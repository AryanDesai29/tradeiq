# TradeIQ — Project Instructions

TradeIQ is a personal **investment operating system**, not a trading toy. It runs
a closed decision loop: Market → Discovery → Research → Filings → Council →
Thesis → Decision → Review → Learning → Behavioral Analytics. Vite + React SPA,
Vercel serverless `/api`, Supabase (project ref `fwfmhaaulnzpjahyuhzj`).

## The Three Layers

- **L1 — Intelligence** (Discovery, Research, Filings, Council) — *copyable.*
- **L2 — Self-Knowledge** (Investor IQ, Personal Alpha, Decision Quality,
  Investor DNA, Market DNA) — **the moat. Uncopyable.** It is built from Aryan's
  own multi-year decision/mistake/calibration history, which compounds every trade.
- **L3 — Action** (Mission Control, CIO Engine) — *copyable.*

Everything above and below L2 can be rebuilt by anyone in months. Protect and
deepen L2. When in doubt about what to build, build the thing that makes the
system understand Aryan better.

## Product Constitution

**Canonical source — [`docs/CONSTITUTION.md`](docs/CONSTITUTION.md)** (principles) and
**[`docs/CONSTITUTION-THRESHOLDS.md`](docs/CONSTITUTION-THRESHOLDS.md)** (numeric thresholds,
`PRELIMINARY`). That document governs; this file deliberately does **not** restate it, to keep
a single source of truth and prevent governance drift. Amend the constitution there, once —
never duplicate principles here.

The seven principles, names only (full text + per-principle tests live in the doc): **1.** Prime
Directive · **2.** Evidence Hierarchy · **3.** Conditioning Rule · **4.** Earned Complexity ·
**5.** Calibration · **6.** Survival · **7.** Self-Knowledge Flywheel. Every behavior-changing PR
completes the Constitution Check in [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

## North-star metric

Not research-opened / council-opened / filing-read — those are engagement. The
metric that matters is **decision changed**: the moment intelligence actually
influenced capital allocation. The eventual highest-value event is
`changed_my_mind = true`. (Per Earned Complexity: do not instrument it until the
manual signal proves real.)

## Roadmap (evidence-gated — each step justified by the previous step's data)

Validation week → Decision Quality Report → Filing Impact Report → Council
Effectiveness Report → Investor DNA Engine → Regime Engine → Market DNA →
Decision Attribution Engine → CIO Engine. **Do not build ahead of the evidence.**
Behavioral pattern recognition on Aryan's own history (Investor DNA → CIO) is the
endgame; it requires 30–50 real closed trades before it is anything but noise.

## Build & Test

```bash
npm test          # node --test, all pure modules covered — keep it green
npm run build     # vite build — must succeed before any commit
```

- Pure logic lives in `src/*.js` (fully tested); React UI in `src/*.jsx`; API in
  `api/*.js` (`_`-prefixed = shared, not a Vercel route).
- Money never mixes ₹/$; cross-currency math is R-multiples only.
- Anti-fabrication is sacred: never invent numbers, dates, quotes, or "recent"
  events; "unknowable from here" is a correct answer.
- After editing arrow-function-heavy files, a post-edit hook can spawn zero-byte
  junk files in the repo root — run `find . -maxdepth 1 -type f -size 0 -delete`
  before committing.
