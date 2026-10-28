# Banyan — Launch Assets (October 31 2026)

Ready-to-use launch materials. Nothing here has been auto-published; the
announcement is a draft for the founder to review and post.

## 1. Launch announcement (draft)

> **Banyan.ai — You build the product. Banyan brings it visibility.**
>
> Most founders don't fail because they built the wrong thing. They fail
> because nobody found the right thing. Distribution is a second job —
> research, strategy, content, posting, measuring — and it never stops.
>
> Banyan is an agentic operating system for product distribution. Give it a
> goal in plain language — *"Grow a founder audience on X by posting three
> threads a week"* — and it drafts a complete plan: research, strategy,
> campaign, and ready-to-edit content.
>
> Then you stay in control: **nothing publishes without your explicit
> approval.** Every agent hand-off is verified, every recommendation carries
> its evidence and confidence, and when the data is thin, Banyan says
> "not enough data" instead of inventing insight.
>
> What ships today:
> - Natural-language goals → human-approved execution plans
> - Agents that research, strategize, and draft platform-specific content
> - An approval gate on every publish (connect Postiz, or record posts manually)
> - Honest measurement: zero means zero, "not enough data" means learn more
> - Recommendations backed by evidence you can audit
>
> Banyan is named after the banyan tree: one trunk, and every aerial root
> becomes a trunk of its own. That's the philosophy — one workflow that
> grows into every channel your people already use.
>
> Build your product. Let it find its people. → https://banyan.ai

*(Host note: replace the URL with the live domain before posting.)*

## 2. Demo scenario (5 minutes, seeded or fresh account)

1. **Landing** — the promise: "Build your product. Let it find its people."
   Point out the three guarantees: nothing publishes without approval · real
   connections or honest blocks · measured, never invented.
2. **Onboarding** — sign up, enter product + audience + goal (2 minutes of
   forms total; every field optional beyond the minimum).
3. **Create a goal in plain language** — e.g. "Grow a founder audience on X
   by posting 3 threads a week for 2 weeks." The plan appears with explicit
   assumptions and missing-info flags.
4. **The approval gate** — approve the plan as the human in the loop. Tasks
   light up: research → strategy → campaign → content drafts.
5. **Review content** — open a draft, edit it, submit, approve. Show that
   editing invalidates a stale approval (the gate re-requires sign-off).
6. **Honest publishing** — publish without a connection → the honest block
   ("connect Postiz or record manually"). Record a manual publication.
7. **Learning loop** — record experiment results by hand (or connect
   analytics later); the evaluator reports verdicts with evidence, or says
   "not enough data." The recommendation shows its citations and confidence.
8. **Usage ledger** — `/app/settings` → usage: every model call with
   provider, tokens, and estimated cost. Nothing hidden.

## 3. Known limitations (publish these honestly)

- **No automated website scraping in v1.** Product context is what you tell
  Banyan (plus optional research, which is labeled as hypotheses). This is a
  deliberate security choice for v1.
- **Publishing** works through a Postiz connection (X/LinkedIn) or manual
  recording. Short-form video publishing is manual in v1.
- **Live model calls need your own OpenAI-compatible key** (or the hosted
  managed key if enabled by the operator). Without one, Banyan uses clearly
  labeled template output — never presented as live model text.
- **Measurement** reads what Banyan can actually see (tracked links, manual
  results, provider-confirmed publications). It will not fabricate platform
  analytics it cannot observe — expect "not enough data" until real evidence
  exists.
- **Single-node deployment** (SQLite, in-memory rate limits). Fine for a
  first public release; Postgres is the next step.
- The recommendation engine is **evidence-first and conservative**: early
  recommendations are explicitly low-confidence.

## 4. Support & feedback

- Minimum viable loop for launch: a **Support/feedback link in the app
  footer** (mailto: or issue tracker — the operator sets this before launch)
  plus the activity trail for debugging user reports.
- Critical-issue response: triage via `TaskRun`/`ModelCall` records; hotfix
  path = §8 of docs/RELEASE_RUNBOOK.md.
