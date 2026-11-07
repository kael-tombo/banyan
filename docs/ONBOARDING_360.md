# Onboarding 360°: your product and its market, in one read

Built 2026-11-07 on `mvp/socialflow-foundation` (commits `763cdf3`, `e1ec9dc`, `096949f`, `2ef335a`, and the
journey fixes after them). This is the reference for how onboarding understands a product, where every piece of
information comes from, what is stored, and what it cannot do yet.

**Contents:** [1. What it does](#1-what-it-does) · [2. The founder's flow](#2-the-founders-flow) ·
[3. How it works](#3-how-it-works) · [4. Data sources](#4-data-sources) ·
[5. Honesty rules](#5-honesty-rules-and-provenance) · [6. What is stored](#6-what-is-stored-and-who-uses-it) ·
[7. API](#7-api) · [8. Prompts and model use](#8-prompts-and-model-use) · [9. Privacy and security](#9-privacy-and-security) ·
[10. Limits](#10-limits-and-known-gaps) · [11. Testing](#11-how-it-was-tested) · [12. Operating it](#12-operating-it) ·
[13. File map](#13-file-map) · [14. Next steps](#14-next-steps)

---

## 1. What it does

A founder pastes their website. Banyan:

1. **Reads the product** from up to five of the founder's own public pages: what it does, for whom, the problem,
   positioning, features, differentiators, pricing, proof, tone, call to action, stage, logo and social profiles.
2. **Maps the market** around it: competitors (checked on their own websites), the public threads where this
   market talks, people publicly asking for or switching away from tools like it, and 3–5 opportunities, each
   citing its evidence.
3. **Starts the first cycle** from that context. Any opportunity can become the cycle's topic in one click.

The founder only corrects mistakes and fills what no source states. Nothing is invented: every value links to the
page or post it came from, is marked "inferred", or is the founder's own words.

## 2. The founder's flow

Entry points: `/onboarding` (first visit; finishing it completes onboarding) and `/app/cycles/new` (any later
cycle). Both render the same component, `CycleIntakeForm`.

| Step | Screen | What happens |
| --- | --- | --- |
| 1. Your site | One address field, three promises (your site then your market · nothing made up · read-only) | Enter or "Read my site" starts the analysis. "No website yet? Start from scratch" opens an empty review. A saved profile can be reused. |
| — | Reading | Real progress from the analysis status (`queued` → `reading` → `analysing`), a skeleton of what is coming, "Usually 10–30 seconds", Cancel. |
| 2. Your 360 | One-page report | **Header:** logo, name, tagline, stage, social links, five tiles (Profile, Competitors, Conversations, People in market, Opportunities) that jump to their chapter and shimmer while the scan runs. **Chapter nav** on desktop. **Your product:** 01 Product · 02 Who it's for · 03 Problem and positioning · 04 Proof and pricing · 05 Voice and the ask. **Your market:** 06 Competitors · 07 Where your market talks · 08 People in the market · 09 Opportunities. A sticky bar holds "Plan the cycle". |
| 3. Your first cycle | Objective, metric, target, window, channels | The objective is suggested from the site's main button ("Book a demo" → 5 demos; waitlist → 50 signups; trial → 20 trial signups; download → 50 installs; buy → 10 sales; otherwise 20 signups), with the reason shown. Kept opportunities appear as one-click topics. |

Interaction details:

- The market scan **starts automatically** as soon as the product half is on screen; the founder can edit
  meanwhile.
- Every product field carries a **source tag**: "From /pricing", "Inferred · check it", "Needs you" (required
  and empty), "Not on your site" (optional and empty, only after a site read), or "Your words" once edited.
- Lists (features, differentiators, proof, search terms) are chips: × removes, Enter adds.
- Competitors can be removed or added (name + site). Search terms can be edited. Either change turns the button
  into **"Rescan with my changes"**, which reruns the scan with the founder's list.
- Each opportunity has **Keep** (on by default) and **"Make this my first cycle"**.
- "Plan the cycle" is never a dead button: with a required field missing, it scrolls to and focuses that field.
- A returning founder sees their saved profile and, if one finished, their saved market scan.
- Phone layout: tiles in two columns, no side nav, every chapter stacks; checked at 375 px.

## 3. How it works

```
Founder's URL
   │
   ▼
POST /api/product/analyze ──► analyzeProduct()            src/lib/product/analyze.ts
   │   home page (or www./bare-domain fallback)
   │   + up to 4 linked pages in parallel: pricing, about, features, customers/use cases, FAQ
   │   ├─ extractSiteSignals() per page, mergeSignals()   src/lib/product/site-signals.ts
   │   ├─ with a model: prompt product-analysis v2 (pages + signals, fenced as untrusted)
   │   │      over-long lists/text are trimmed, gaps filled from the parser
   │   └─ without one: basicAnalysis() — the parser's readings only
   ▼
ProductAnalysis.result  ──► intakeFromAnalysis()          src/lib/product/intake-profile.ts
   │                          (form fields + per-field sources)
   ▼
POST /api/product/analyze/[id]/research ──► runMarketResearch()   src/lib/research/market.ts
   │   1. candidates: alternatives named on the site + (model) market-scan v1 suggestions
   │   2. in parallel:
   │        readCompetitor() for each                     src/lib/research/competitors.ts
   │        Hacker News stories: category terms + each competitor name
   │        Hacker News comments: "<competitor> alternative" + category terms
   │        Stack Overflow questions (developer products)  src/lib/research/sources.ts
   │   3. opportunities: (model) market-opportunities v1 against numbered evidence,
   │      else ruleOpportunities()
   ▼
ProductAnalysis.research
   │
   ▼  founder clicks "Start the cycle"
POST /api/product/snapshot ──► ProductProfile, ProfileFact (competitors), Recommendation (opportunities)
POST /api/goals             ──► the first cycle
```

### 3.1 Reading the product

- **Pages.** The home page, then up to four same-site links ranked pricing → about → features → customers/use
  cases → FAQ, one per kind first. `www.` and the bare domain count as one site. If the address doesn't resolve,
  the other host form is tried once.
- **Parser (no model).** From each page: JSON-LD (`SoftwareApplication`, `Product`, `Organization`: name,
  category, offers, ratings, `sameAs`), meta and Open Graph tags, `<title>`, the hero `<h1>` (repeated animated
  text collapsed), the first real paragraph after it, h2/h3 headings, button-like calls to action, prices (a
  currency amount with a billing period or plan word, or a stated free plan; "$10K MRR" and "10M+ calls per
  month" are not prices), proof (customer counts, ratings, "trusted by", quotes in `<blockquote>`), audience
  phrases ("built for …", "for freelancers"), pain phrases (from paragraphs and headings only), stage hints
  (waitlist, beta in the title or hero, customer counts), social profiles, logo, theme colour, language. Prose
  signals come only from prose elements (`p`, `h1–h4`, `li`, `blockquote`, `figcaption`, `dd`), so product
  screenshots built from divs don't leak in. Navigation, footers and cookie banners are removed first.
- **Model (prompt `product-analysis` v2).** Receives the page text (home ≤ 12,000 characters, others ≤ 6,000)
  and a digest of the signals, both fenced as untrusted. Returns tagline, description, value proposition,
  category, stage, audience, pain, outcome, problems, features, differentiators, positioning, pricing, proof,
  main call to action, tone, alternatives, missing information and per-field provenance. Lists and text that run
  long are trimmed at a word boundary instead of rejecting the answer; a wrong type is still invalid and is retried
  once. Fields the model leaves empty but the parser read (price, button, tagline, category, pain, proof, stage)
  are filled from the parser.
- **Without a model**, the parser's result is used and labelled: "Read without an AI model: Banyan copied what
  your pages state and left the rest for you."

### 3.2 Mapping the market

- **Competitor candidates.** Alternatives the founder's site names, plus up to five model suggestions with
  domains. The founder's list replaces both on a rescan. Dropped: the product itself, duplicates, and the status
  quo (names with `/`, `,`, `&`, "or", "alternative", "vs", over four words, or words like email, spreadsheet,
  manual, in-house, agency, back-and-forth). At most five.
- **Verification.** Banyan fetches the candidate's home page (the given domain, or `name.com` for a name with no
  domain). It counts as verified only when the page loads as HTML and its title, site name or hero names the
  competitor. The hostname alone never counts, so a parked or for-sale domain fails. A verified competitor's
  tagline, description, pricing and main button come from that page. An unverified candidate is kept only if its
  domain was given, not guessed, and is labelled "couldn't confirm" or "couldn't read theirs".
- **Search terms.** From the model (3–5 two-to-four-word phrases) or, without one, from the category, tagline
  and first features. Filler words (software, tool, app, platform, best, saas…) are stripped before searching.
- **Conversations.** Hacker News stories from the last year whose **title** matches the term (all meaningful words
  without a model; two thirds with one), plus stories about each competitor over two years; Stack Overflow
  questions for developer products, filtered the same way. Ranked by points + 2 × comments; top 8. Links go to
  the discussion, not the article.
- **People in the market.** Hacker News comments over two years, relevance-ranked, for "<competitor>
  alternative" and for each category term. A comment counts only if **one sentence** carries both the topic and
  an intent:
  - for a competitor: wanting an alternative ("alternative to X", "switched/moving off X", "replaced X"),
    frustration ("X is too expensive", "sick of X"), or comparing ("compared to X", "X vs");
  - for a topic: asking ("looking for", "any recommendations", "is there a tool") with every topic word in that
    sentence.
  Excluded: job posts and signatures (hiring, location:, salary, email me, book a call…), a tool named only
  inside a link, and founders announcing their own product ("I'm building a Calendly alternative"). Unanswered
  Stack Overflow questions count as "stuck on the problem". Newest first; top 8. The excerpt is the matching
  sentence.
- **Opportunities.** With a model: the evidence is numbered (E1…: the product's value proposition, audience,
  differentiators, pricing, proof or its absence, what the site doesn't say, each verified competitor, each
  thread, each post), and the model returns 3–5 opportunities citing ids. **An opportunity citing no valid id is
  dropped.** Ids are stripped from the prose; the cited items become linked "Based on" chips. Without a model,
  or if the model yields none, five rules run: reply to people already asking; publish an honest "you vs
  competitor" page; answer the most discussed thread; add proof if the site has none; lead with what the named
  alternative doesn't do.

## 4. Data sources

| Source | Used for | Access | Why it's allowed / chosen |
| --- | --- | --- | --- |
| The founder's site | Product profile | Public pages through the SSRF-safe fetcher | The founder submits it |
| Competitors' home pages | Verification, tagline, pricing, button | One public page each, same fetcher | Public marketing pages, read once |
| Hacker News via the Algolia HN Search API (`hn.algolia.com/api/v1`) | Threads and buying signals | Free, no key | Official public search API for HN |
| Stack Overflow via the Stack Exchange API 2.3 | Questions, for developer products | Free, no key (300 requests/day per IP) | Public API; attribution (author + link) is kept on every item |

**Considered and not used** (checked 2026-11-07):

| Source | Why not |
| --- | --- |
| Reddit | Returns 403 to server requests; its Data API terms require approval for this use |
| Bluesky search | The public AppView search now returns 403 without auth |
| X, LinkedIn | Search APIs are paid or partner-only; scraping is against their terms |
| Google Trends, Google News | No official API; automated use is outside their terms |
| Product Hunt | Needs an OAuth token |

"Trending" in the UI means *recent and well-discussed in these sources*. It is not a trend metric.

## 5. Honesty rules and provenance

These are enforced in code and covered by tests:

1. **Every value has a source.** Product fields carry the page URL or "inferred". Competitors carry how they were
   found (named on your site · suggested · added by you) and whether Banyan read their site. Threads and posts
   carry their link, author and date. Opportunities carry their evidence.
2. **Nothing is written from memory about a competitor.** Tagline, pricing and button come only from their page.
3. **A source that fails is reported, not filled in.** The scan lists each source with ✓ or ✗; empty chapters say
   why and what to try.
4. **Recommendations must cite.** A model opportunity with no valid evidence id is dropped.
5. **Page text, competitor pages and posts are untrusted.** They are fenced with a per-call nonce, the system
   prompts carry the untrusted-content rules, and instruction-like text on the founder's pages is flagged.
6. **Banyan never acts on the market.** It does not post, reply or contact anyone. The UI says so under the
   buying signals: "Reply where you can genuinely help, in your own words."

Provenance when saved (see §6):

| Item | Stored as | Provenance |
| --- | --- | --- |
| Product fields the founder reviewed | `ProductProfile` + `ProfileFact` | `user_provided`: submitting the review is the approval |
| Competitor read from its own site | `ProfileFact` `competitor:<slug>` | `external_observation`, confidence high |
| Competitor suggested but not confirmed | same | `hypothesis`, confidence low |
| Competitor the founder added | same | `user_provided` |
| Kept opportunity | `Recommendation`, `producedBy: agent:onboarding` | Evidence JSON `[{source: url, summary: label}]` |

## 6. What is stored, and who uses it

| Where | What | Written by |
| --- | --- | --- |
| `ProductAnalysis.result` | The product analysis (v2 schema; v1 results still parse) and the parser's site summary (logo, colour, language, buttons, socials) | `POST /api/product/analyze` |
| `ProductAnalysis.research`, `.researchStatus` | The market scan (`MarketResearch` JSON) and `running \| ready \| failed` | `POST /api/product/analyze/[id]/research` |
| `ProductProfile` | Name, description, stage, problem, value proposition, audience, pain, outcome; `positioning`, `market` (category), `features`, `differentiators`, `problemsSolved`, **`pricing`**, **`proofPoints`**; tone and call to action merged into `brandVoice`; `lastAnalysisId` | `POST /api/product/snapshot` |
| `ProfileFact` (`category: competitor`, `source: onboarding 360`) | Kept competitors | same; replaced on each submit |
| `Recommendation` (`producedBy: agent:onboarding`, `status: open`) | Kept opportunities, shown on `/app/opportunities` | same; open ones replaced on each submit |

Migrations: `20261107200000_product_profile_pricing_proof` (two profile columns) and
`20261107210000_product_analysis_research` (two analysis columns). Both are additive and nullable or defaulted.

**Who reads it:**

- Strategy facts (`src/lib/strategy/facts.ts`) cite market, positioning, features, problems, differentiators,
  **pricing and proof** as numbered facts.
- The claims check (`src/lib/content/claim-evidence.ts`) accepts **pricing and proof** as evidence, so a post may
  cite "Trusted by 3,000 freelancers" only if the site said it.
- The writer reads tone and call to action from `brandVoice`.
- Competitor facts appear in the product brief's "Alternatives" row (`src/lib/product-brief.ts`).
- Kept opportunities appear on `/app/opportunities`.
- **Not yet used after onboarding:** the conversations and buying signals live only on the analysis record and in
  the onboarding report (see §10).

The form only sends a field it shows, so a page without the market half never erases saved competitors, features
or proof.

## 7. API

| Method & path | Body | Notes |
| --- | --- | --- |
| `POST /api/product/analyze` | `{url}` | 8/min, `write`. Starts the site read; private addresses refused before any request. Runs on the queue with Redis, inline without (Vercel). `maxDuration` 60 s. Returns `{analysis}` (202). |
| `GET /api/product/analyze/[id]` | — | Poll. Returns status, pages, `result`, `research`, `researchStatus`, error. Another workspace's analysis is a 404. |
| `POST /api/product/analyze/[id]/research` | `{queries?: string[≤5], competitors?: [{name, domain?, source?, reason?}≤6]}` | 6 per 10 min, `write`. Runs the market scan inline (`maxDuration` 60 s) and returns `{research}`. 404 for another workspace's analysis, 409 if the site read hasn't finished or a scan started under 90 s ago, 502 if it fails. With `queries`/`competitors`, the founder's lists replace the generated ones. |
| `POST /api/product/snapshot` | Profile fields + optional `positioning, category, pricing, tone, primaryCta, features[], differentiators[], problemsSolved[], proof[], analysisId, competitors[], opportunities[]` | 20/min, `write`. Saves the reviewed profile (see §6). Optional fields are written only when sent. |
| `POST /api/product/intake` | `{url}` | Older single-page reader. Still served (the journey uses it for an SSRF check) but **no longer used by the UI**. Errors are now plain language. |

`MarketResearch` shape (`src/lib/research/types.ts`): `method` (`model \| basic`), `queries`, `competitors[]`
(`name, url, source, verified, reason, tagline, description, pricing, cta, logo`), `conversations[]` (`source,
title, url, author, points, comments, createdAt, query`), `leads[]` (`source, author, excerpt, url, createdAt,
intent, about`), `opportunities[]` (`kind, title, rationale, firstStep, evidence[], confidence`), `sources[]`
(`name, ok`), `generatedAt`.

## 8. Prompts and model use

| Prompt | Purpose (ledger) | Max tokens | Notes |
| --- | --- | --- | --- |
| `product-analysis` v2 | `product_analysis` | 2,000 | Replaces v1 for new analyses; v1 stays registered for stored results |
| `market-scan` v1 | `research` | 900 | Competitor candidates with domains, search terms, developer flag |
| `market-opportunities` v1 | `recommendation` | 1,400 | 3–5 opportunities citing evidence ids |

All three go through the model router: logged in `ModelCall` with prompt name and version, schema validity
recorded, counted against `MODEL_MAX_CALLS_PER_DAY`. A full onboarding with a model makes **3–5 model calls**
(analysis, with one retry if invalid; scan; opportunities). Without a model configured, or when the daily quota is
spent, every step falls back to the parser and rules, and says so.

## 9. Privacy and security

- **What leaves Banyan:** requests to the founder's site and to competitors' home pages (user agent
  `BanyanBot/1.0`), and **search terms and competitor names** to Algolia (Hacker News) and Stack Exchange. No
  founder account data, no emails, nothing private is sent.
- **Fetching:** every request goes through `safeFetch` (http/https only; DNS checked; loopback, private,
  link-local and metadata addresses refused; redirects re-validated; size caps: founder pages 2 MB, competitor
  pages 1.5 MB, API responses 1 MB; timeouts 8–12 s).
- **Untrusted content:** page and post text are fenced for the model; displayed text is rendered by React
  (escaped), never as HTML.
- **People in the market:** only what the post shows publicly (username, sentence, link, date) is kept, inside
  the analysis record. It is deleted with the workspace (cascade). Banyan never contacts them.
- **Third-party images:** the founder's and competitors' logos load from their own domains in the founder's
  browser (`referrerPolicy="no-referrer"`), so those sites see the founder's IP.
- **Abuse limits:** 8 site reads per minute and 6 scans per 10 minutes per client; a scan refuses to start while
  one is running.

## 10. Limits and known gaps

### Coverage

| Limit | Effect | What would fix it |
| --- | --- | --- |
| **Only two public sources** (Hacker News, Stack Overflow) | Strong for developer, SaaS and startup tools; **weak for consumer, local, e-commerce and non-English products**, which often get no threads or signals | A paid web/social search API (Brave, Tavily, Exa or Serper) behind a key, or approved Reddit API access. Needs a vendor decision. |
| **Buying signals are sparse by design** | Precision over recall: a cal.com scan found 2 genuine posts. Many real buyers phrase things the patterns miss | More phrasings, other languages, and a model pass to classify candidate comments |
| **English-only patterns** | Intent, price, proof, pain and audience patterns are English | Per-language patterns, or model classification |
| **"Trending" is not a trend metric** | Ranks by points and comments in two indexes; no search-volume or growth data | A trends data source |
| **Stack Exchange quota** | 300 requests/day per IP without a key; on Vercel's shared IPs it can run out, and the source then shows ✗ | Register a free Stack Apps key (10,000/day) |

### Accuracy

| Limit | Effect |
| --- | --- |
| **Competitor suggestions rely on the model's knowledge** | New or niche competitors can be missed. A wrong domain is caught by verification, but a different company with the same name on that domain would pass. |
| **Competitor reads are one page, parser only** | JavaScript-only sites yield little. A hero built from product-screenshot text can show up as the tagline. Pricing is often missing because plans live on `/pricing`. |
| **No-model mode is basic** | Search terms built from tagline and features can be poor (e.g. from mock text), so the strict relevance filter often leaves no conversations. Opportunities come from five fixed rules. |
| **Product read has parser blind spots** | Testimonials outside `<blockquote>`, prices rendered by JavaScript, and audiences not phrased "for …" are missed without a model. Stage is a guess from a few hints and is labelled "Inferred · check it". |
| **Model quality is unproven in production** | Prompts v2 and both market prompts were tested live with the development model (`glm-5.3-flash` via OpenCode Go, development-only by its terms) on cal.com, linear.app and resend.com. They have **not** been run on the 10-product evaluation set or on the production model (blocker 03). |
| **Confidence is the model's own label** | "High confidence" on an opportunity is not calibrated. |

### Product and operations

| Limit | Effect |
| --- | --- |
| **Time** | Site read 5–25 s; market scan about 20 s, and up to about 45 s with a model on a slow connection. Each request is limited to 60 s on Vercel; a slow competitor (10 s timeout) shows as unconfirmed rather than holding the scan. |
| **The scan runs inline, once** | It is not queued and not refreshed. A saved scan goes stale; the founder must press Rescan. |
| **Signals and threads stop at onboarding** | They are kept on the analysis but shown nowhere else in the app yet (no Market page, no alerts). |
| **Saving replaces earlier onboarding output** | Each submit replaces competitor facts with source `onboarding 360` and *open* onboarding recommendations. Accepted or dismissed ones are kept. |
| **The detailed setup is unchanged** | `/onboarding?mode=detailed` (the older wizard) has no 360. |
| **No end-to-end browser test signed in** | The flow is covered by unit tests and the CI journey (HTTP). The screens were checked with live cal.com data on a temporary dev page at desktop and phone widths, not clicked through as a signed-in founder (no database on the dev machine). |
| **Accessibility** | Labels, `aria-live` progress, focus on the first missing field, reduced-motion handling and keyboard-usable chips are in place; no screen-reader audit has been done. |
| **Old intake route** | `/api/product/intake` is now unused by the UI and could be removed once the journey's SSRF check moves to `/api/product/analyze`. |

These are tracked as TD-20 to TD-25 in [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).

## 11. How it was tested

| Test file | Covers |
| --- | --- |
| `tests/site-signals.test.ts` (14) | JSON-LD, meta, hero, lead, CTAs, prices, proof, audience, pain, stage, socials, logo; cookie banners kept out; malformed JSON-LD; page ranking; www fallback; JavaScript-only page; first-paragraph description; review mapping, sources and cycle suggestion |
| `tests/market-research.test.ts` (15) | Buying signals (switching, frustration, comparing kept; job posts, self-promotion and link-only mentions dropped; topic needs all words in one sentence); threads and relevance; Stack Overflow; filler stripping; status-quo competitors dropped; verification (parked domain fails, down site fails); no-model scan end to end; founder overrides; failing source reported; uncited model opportunities dropped; evidence-id stripping |
| `tests/product-analysis.test.ts`, `tests/prompts.test.ts`, `tests/profile-review.test.ts` | v2 prompt registered and used, retry and fallback, untrusted fencing, failure messages, v2 fields merge into the profile |
| `scripts/e2e-acceptance.sh` (CI) | Onboarding page loads on the 360 headline; site analysis through the API; drafted profile carries the page's description; private address refused; cross-workspace analysis and market scan refused (404) |

Live checks run during development (not in CI, since they depend on third-party sites):

| Site | Without a model | With the dev model |
| --- | --- | --- |
| cal.com | 9–10 of 15 product fields | 15 of 15; 3 of 4 competitors read from their sites; 8 threads; 2 buying signals; 5 cited opportunities |
| linear.app | 8–9 of 15 | 15 of 15 |
| resend.com | 10 of 15 | — |
| banyan-ai.app | 9 of 15 | — |

## 12. Operating it

- **No new environment variables.** The model is the existing provider (`AI_PROVIDER`, `OPENAI_*`). Without one,
  the parser and rules run.
- **Outbound network:** production must reach `hn.algolia.com` and `api.stackexchange.com` over HTTPS, plus the
  public web for founder and competitor sites.
- **Migrations:** the two above, applied by `prisma migrate deploy` with the rest of PR #5.
- **Cost:** 3–5 model calls per onboarding (see §8), counted in the usage page and the daily cap.
- **When something looks wrong:** the analysis record (`ProductAnalysis`) holds the pages read, the result, the
  method, the scan and its status; `ModelCall` holds each prompt call and whether its output was valid.

## 13. File map

| Area | Files |
| --- | --- |
| Site reading | `src/lib/product/site-signals.ts`, `src/lib/product/analyze.ts`, `src/lib/product/intake.ts`, `src/lib/product/analysis-runner.ts` |
| Review mapping | `src/lib/product/intake-profile.ts`, `src/lib/product/profile-review.ts` |
| Market scan | `src/lib/research/types.ts`, `sources.ts`, `competitors.ts`, `market.ts`, `runner.ts` |
| Prompts | `src/lib/ai/prompts/product-analysis.v2.ts`, `market-scan.v1.ts`, `market-opportunities.v1.ts` |
| API | `src/app/api/product/analyze/route.ts`, `analyze/[id]/route.ts`, `analyze/[id]/research/route.ts`, `snapshot/route.ts` |
| UI | `src/app/app/cycles/new/cycle-intake-form.tsx`, `intake/reading-progress.tsx`, `intake/understood.tsx`, `intake/market-sections.tsx`, `intake/parts.tsx`; pages `src/app/onboarding/page.tsx`, `src/app/app/cycles/new/page.tsx` |
| Consumers | `src/lib/strategy/facts.ts`, `src/lib/content/claim-evidence.ts`, `src/lib/product-brief.ts`, `/app/opportunities` |

## 14. Next steps

In order of value:

1. Pick the production model (blocker 03) and run the three prompts on the 10-product evaluation set.
2. A **Market page** in the app that shows the saved threads and signals, with a weekly rescan.
3. A broader search source for non-developer products (needs a vendor and a key).
4. A Stack Apps key for the Stack Exchange quota.
5. Read competitors' `/pricing` page as well as their home page.
6. Move the scan onto the job queue where Redis exists, and retire `/api/product/intake`.
