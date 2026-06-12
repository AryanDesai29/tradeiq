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

## Product Constitution (every feature must satisfy these — no exceptions)

**1. Prime Directive.** A feature ships only if it (A) improves decision quality
OR (B) improves understanding of the user. If it does neither, it does not get
built — no matter how impressive. This is the rule that stops TradeIQ becoming
"Bloomberg Lite with 500 features."

**2. Evidence Hierarchy.** Tier 1 Objective Facts (XBRL, filings, trade records,
prices) › Tier 2 Derived Metrics (Alpha, IQ, Decision Quality) › Tier 3 Inference
(Council, research summaries) › Tier 4 Opinion (recommendations, CIO memos). **A
higher tier may never contradict a lower tier without explicitly flagging it.** A
CIO memo must never state a number that contradicts XBRL. Keep the existing
inline FACT / ASSUMPTION / OPINION / SPECULATION labelling everywhere.

**3. Conditioning Rule.** Confidence scales *inversely* with conditioning depth.
Never present a deeply-conditioned claim (e.g. tech × demand-acceleration ×
confidence-band × regime → +2.1R) unless the sample survives that depth. Widen
buckets / drop conditions until N is statistically real, then report at *that*
granularity — and say so ("regime sample too small to segment further"). The
system must be comfortable saying **"not enough evidence."** Honest uncertainty
is a feature; hallucinated certainty is a bug.

**4. Earned Complexity.** Every layer must demonstrate its value *through Decision
Quality* — did Discovery increase trades researched? did Research change
decisions? did Filings change verdicts? did the Council improve outcomes? A layer
that cannot prove its worth gets simplified, demoted, or removed. No monuments to
cleverness.

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
