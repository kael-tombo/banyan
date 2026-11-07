# Onboarding 360°: your product and its market, in one read

Built 2026-11-07 on `mvp/socialflow-foundation` (commits `763cdf3`, `e1ec9dc`, `096949f`, `2ef335a`, and the
journey fixes after them). This is the reference for how onboarding understands a product, where every piece of
information comes from, what is stored, and what it cannot do yet.

**Contents:** [1. What it does](#1-what-it-does) · [2. The founder's flow](#2-the-founders-flow) ·
[3. How it works](#3-how-it-works) (incl. [3.3 What's trending](#33-whats-trending-the-trend-radar)) · [4. Data sources](#4-data-sources) ·
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
3. **Shows what's trending** on each platform: live posts where an official API allows it (YouTube, Reddit,
   Bluesky with keys; Hacker News, DEV), one-click research where none exists (TikTok, Instagram, Facebook,
   LinkedIn, X, Pinterest), interest over 12 months, hashtags, and what to post on each platform.
4. **Starts the first cycle** from that context. Any opportunity can become the cycle's topic in one click.

The founder only corrects mistakes and fills what no source states. Nothing is invented: every value links to the
page or post it came from, is marked "inferred", or is the founder's own words.

## 2. The founder's flow

Entry points: `/onboarding` (first visit; finishing it completes onboarding) and `/app/cycles/new` (any later
cycle). Both render the same component, `CycleIntakeForm`. Redesigned 2026-11-07 into **four steps, one job each**,
after the single-page report proved too much at once: about 6,000 px of scrolling, 10 chapters and around 20 fields
before the founder could act, with the most valuable parts (opportunities, trends) at the bottom.

| Step | Job | What the founder sees |
| --- | --- | --- |
| **1. Your site** | Enter the address | A centred promise ("Your product and its market, in one read." on `/onboarding`), one large address field, and four "what you'll get" cards (your product · your competitors · where buyers talk · what's trending and what to post). Alternatives: use the saved profile, or start from scratch. A read-only promise underneath. |
| — | Reading | Real progress from the analysis status, a skeleton of what's coming, Cancel. |
| **2. Confirm** ("Is this you?") | Check the facts | An identity card (logo, name, tagline, stage, website, socials; "15 of 15 fields read from home page, /about"; Read again). **The essentials**: what it does, who it's for, the problem, why it's worth it, each with its source tag; the card says "All set" or how many need you. **Everything else** (category, features, pain and outcome, positioning, differentiators, proof, pricing, tone, call to action) is one collapsed panel showing how many details were found. Beside it, a **market panel** fills in live while the founder checks (competitors read, conversations, people, opportunities, platforms read), ending with "Your briefing is ready". |
| **3. Your market** ("Your market, in brief.") | Understand the market and pick an angle | Four **headline findings**, each opening its tab: best place to start (top opportunity), the closest competitor and their own promise, the most discussed thread, and people in the market (with a quote), or the interest trend when one is missing. Then **tabs with counts**: Opportunities (default) · Competitors · Conversations · People · Trending. Any opportunity or content idea can be made the first cycle's angle. Skipped when there is no site read. |
| **4. First cycle** | Commit | Three cards: **the angle** (prefilled from the opportunity or idea picked, labelled with its source, with "Change"; or the kept opportunities as one-click choices); **the goal** (objective suggested from the site's main button, with the reason); **channels**. "Start the cycle". |

Throughout:

- **Progress bar** of four segments at the top; any step already reached can be reopened, later ones can't be
  skipped to.
- **One sticky footer** per step: Back, a one-line hint (what's missing, or the chosen angle), one primary action.
  On phones the hint takes its own line.
- The market scan and the trend radar **start automatically** after the site read and run while the founder is on
  Confirm, so Step 3 is usually ready on arrival.
- Every product field carries a **source tag**: "From /pricing", "Inferred · check it", "Needs you", "Not on your
  site", or "Your words" once edited. Lists are chips (× removes, Enter adds).
- The primary button is never dead: with a required field missing, it scrolls to and focuses that field.
- In the market tabs, competitors can be removed or added and search terms edited; either turns the button into
  **"Rescan with my changes"**.
- A returning founder sees their saved profile and, if one finished, their saved market scan and trend radar.
- The `/onboarding` page has a slim frame: the Banyan mark, "Detailed setup" and "Look around first".
- Checked at desktop and phone (375 px) widths.

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

### 3.3 What's trending (the trend radar)

The Trending tab of step 3, added 2026-11-07. It runs automatically after each market scan
(`POST /api/product/analyze/[id]/trends`) and is kept with the scan.

- **Search terms and competitors** come from the market scan (verified competitors and those named on the site).
- **Each platform gets one status:**

  | Status | Meaning | Platforms |
  | --- | --- | --- |
  | **Live** | Read through an official API; real posts with link, author, date and engagement | Hacker News (always), DEV (developer products), YouTube, Reddit, Bluesky (when their credentials are set) |
  | **Needs a key** | Has an official API, but this deployment has no credentials for it; research links meanwhile | YouTube, Reddit, Bluesky |
  | **Research links** | No public search API, so Banyan never reads it | TikTok, Instagram, Facebook, LinkedIn, X, Pinterest |
  | **Failed** | The API was called and refused (quota, outage); the reason is shown | any live platform |

- **Live readers** (`src/lib/research/trends/providers.ts`):
  - **YouTube Data API v3:** most-viewed videos of the last 90 days for two terms and one competitor (`search.list`
    ordered by views, then `videos.list` for views, likes and comments).
  - **Reddit (app-only OAuth):** this month's top posts for each term and competitor; NSFW skipped.
  - **Bluesky (`searchPosts`, signed in with an app password):** top posts.
  - **Hacker News:** stories from the last year with more than 2 points whose title matches.
  - **DEV:** top articles for single-word tags, kept only if the title matches a real search term.

  Every live item must be about the term (most of its words in the title) or name the competitor. The top 8 per
  platform are kept.
- **Research links** (`links.ts`) open the platform in the founder's own browser:
  - **Searches:** TikTok search and hashtag pages, Instagram hashtag pages, Facebook post and group search,
    LinkedIn post search, X top search, Pinterest pin search.
  - **Platform trend tools:** TikTok Creative Center (trending hashtags, top ads) and Pinterest Trends.
  - **Competitors' ads:** the Meta Ad Library and LinkedIn Ad Library for each competitor.
  - **Where a key is missing:** YouTube sorted by views, and Reddit and Bluesky search.
- **Interest over 12 months** (`interest.ts`): monthly Wikipedia page views (Wikimedia REST API, public, no key)
  for each competitor, the product and the first term. Only exact article titles count. Articles averaging under
  100 views a month are hidden, and a last month still being counted (under a quarter of the months before) is
  dropped. Change = the last three months against the three before. A link compares the same names in Google
  Trends, in Google's own tool.
- **Hashtags** per platform: from the terms and product name, plus the model's suggestions, with "Copy all".
- **Content ideas** per platform (prompt `content-ideas` v1): format, hook, angle, and the found post it builds
  on. A model idea may cite only a post found **on that same platform**; otherwise it is labelled "Suggestion:
  nothing found here to build on". Without a model, one native-format idea per platform from a fixed template,
  built on that platform's top post when there is one. **"Make this my first cycle"** turns any idea into the
  cycle's topic.
- **UI** (the Trending tab of step 3): an interest strip with sparklines, platform tabs (platforms with live posts first; a count, key or link
  icon shows each status), then for the selected platform: its note, the posts getting attention (video cards with
  thumbnails for YouTube), what to post, research links and hashtags. A sixth header tile counts trending posts
  and live platforms.

Checked live on cal.com (no platform keys, dev model): 7 relevant Hacker News threads, Calendly interest −8%,
15 platform-native ideas, research links for every platform, in about 25 seconds.

## 4. Data sources

| Source | Used for | Access | Why it's allowed / chosen |
| --- | --- | --- | --- |
| The founder's site | Product profile | Public pages through the SSRF-safe fetcher | The founder submits it |
| Competitors' home pages | Verification, tagline, pricing, button | One public page each, same fetcher | Public marketing pages, read once |
| Hacker News via the Algolia HN Search API (`hn.algolia.com/api/v1`) | Threads and buying signals | Free, no key | Official public search API for HN |
| Stack Overflow via the Stack Exchange API 2.3 | Questions, for developer products | Free, no key (300 requests/day per IP) | Public API; attribution (author + link) is kept on every item |
| YouTube Data API v3 | Trend radar: most-viewed recent videos | `YOUTUBE_API_KEY` (free; 10,000 units/day; one radar run uses ~303) | Official API; titles, channels and stats shown with links, as its terms allow |
| Reddit Data API | Trend radar: top posts of the month | `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` (app-only OAuth) | Official API. **Commercial use needs Reddit's written approval**; get it before enabling in production |
| Bluesky (AT Protocol) | Trend radar: top posts | `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD` | Official API; search requires a signed-in account |
| DEV (Forem API) | Trend radar: top articles, developer products | Free, no key | Public API |
| Wikimedia REST API | Trend radar: monthly page views as interest | Free, no key (descriptive user agent sent) | Public API with documented reuse |

**Considered and not used** (checked 2026-11-07):

| Source | Why not |
| --- | --- |
| Reddit without an app | Returns 403 to unauthenticated server requests. Supported with app credentials (above) |
| Bluesky without an account | The public AppView search returns 403 without auth. Supported with an app password (above) |
| TikTok | No public search API: the Research API is for approved academic researchers, the Display API covers only a user's own videos, and Creative Center has no API. Research links only |
| Instagram, Facebook | Meta offers no public content search (CrowdTangle closed in 2024; the Content Library is for approved researchers). The Ad Library is linked, not read |
| X | Search API is paid (from the Basic tier). Research links only |
| LinkedIn | No content search API; the Ad Library is linked |
| Pinterest | The Trends API needs partner approval. Pinterest Trends is linked |
| Google Trends, Google News | No generally available API; automated use is outside their terms. Google Trends is linked |
| Mastodon | Hashtag timelines are readable, but tested results were recent, near-zero-engagement and spammy: not "trending" |
| GDELT news | Did not respond from the test machine; not used |
| Product Hunt | Needs an OAuth token; API terms restrict commercial use |

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
| `ProductProfile` | Name, description, stage, problem, value proposition, audience, pain, outcome; `positioning`, `market` (category), `features`, `differentiators`, `problemsSolved`, **`pricing`**, **`proofPoints`**; tone and call to action merged into `brandVoice`; `lastAnalysisId` | `POST /api/product/analyze/[id]/trends` | — | 6 per 10 min, `write`. The trend radar (§3.3), after the market scan; inline, `maxDuration` 60 s. Returns `{trends}` and keeps it on the scan (`research.trends`). 404 across workspaces, 409 before the scan finishes, 502 on failure. |
| `POST /api/product/snapshot` |
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
| `content-ideas` v1 | `recommendation` | 1,800 | 1–2 native ideas per platform, citing found posts from the same platform; hashtags per platform |

All three go through the model router: logged in `ModelCall` with prompt name and version, schema validity
recorded, counted against `MODEL_MAX_CALLS_PER_DAY`. A full onboarding with a model makes **4–6 model calls**
(analysis, with one retry if invalid; scan; opportunities; content ideas). Without a model configured, or when the daily quota is
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
- **Trend radar:** sends search terms and competitor names to YouTube, Reddit and Bluesky (only when their
  credentials are set), Hacker News, DEV and Wikipedia. It never posts, and never requests TikTok, Instagram,
  Facebook, LinkedIn, X or Pinterest; those links open in the founder's own browser. Platform credentials are
  server-side settings, never sent to the browser. YouTube thumbnails load from `i.ytimg.com` in the founder's
  browser.
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
| **TikTok, Instagram, Facebook, LinkedIn, X and Pinterest are not read** | None of them offers a public search API Banyan may use, and scraping is against their terms. The radar gives research links, competitors' ad libraries and suggested ideas, not live data, for the platforms most founders care about | Only with official access: TikTok Research API (academic only today), Meta Content Library (researchers), X API (paid), Pinterest Trends API (partners) |
| **YouTube, Reddit and Bluesky need credentials** | Without them, these show research links only. YouTube's free quota allows about 33 radar runs a day per key; Reddit commercial use needs Reddit's approval | Create the keys (see §12), and ask Reddit for commercial approval |
| **"Trending" on the radar is engagement, not velocity** | Ranked by views, upvotes or points within a window (YouTube 90 days, Reddit a month, HN a year); no rate-of-growth measure | Store radar runs and compare them over time |
| **Wikipedia interest covers only names with an article** | Most young products and niche categories have none, so the interest strip is often just the big competitors | Google Trends API (alpha, limited access) when available |
| **Content ideas are suggestions** | Hooks and angles are drafted from the product and found posts; most platforms have nothing found to build on and say so. They are not tested against platform performance | Measure ideas once cycles publish |
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
| `tests/trend-radar.test.ts` (13) | YouTube, Reddit and Bluesky parsers; hashtags; research links (TikTok search, Creative Center, Meta Ad Library, Google Trends); Wikipedia exact-title match, change, unfinished last month and tiny articles; statuses without keys (and no request ever made to TikTok, Instagram, Facebook, LinkedIn, X or Pinterest); YouTube with a key; a failing platform reported; rule ideas; model ideas restricted to listed platforms and same-platform citations |
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

- **Optional platform keys for the trend radar** (all server-side; see `.env.example`):
  - `YOUTUBE_API_KEY`: Google Cloud console → enable *YouTube Data API v3* → Credentials → API key; restrict it
    to that API. Free quota 10,000 units/day; one radar run uses about 303.
  - `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`: reddit.com/prefs/apps → create a *script* app. **Request Reddit's
    approval for commercial use before turning this on in production.**
  - `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`: a Bluesky account for Banyan → Settings → Privacy and security →
    App passwords.
  Without them those platforms show research links; nothing breaks.
- **The model** is the existing provider (`AI_PROVIDER`, `OPENAI_*`). Without one,
  the parser and rules run.
- **Outbound network:** production must reach `hn.algolia.com`, `api.stackexchange.com`, `dev.to`, `en.wikipedia.org`,
  `wikimedia.org` and, when configured, `www.googleapis.com`, `www.reddit.com`/`oauth.reddit.com` and `bsky.social` over HTTPS, plus the
  public web for founder and competitor sites.
- **Migrations:** the two above, applied by `prisma migrate deploy` with the rest of PR #5.
- **Cost:** 4–6 model calls per onboarding (see §8), counted in the usage page and the daily cap; about 303 YouTube
  quota units per radar run when the key is set.
- **When something looks wrong:** the analysis record (`ProductAnalysis`) holds the pages read, the result, the
  method, the scan and its status; `ModelCall` holds each prompt call and whether its output was valid.

## 13. File map

| Area | Files |
| --- | --- |
| Site reading | `src/lib/product/site-signals.ts`, `src/lib/product/analyze.ts`, `src/lib/product/intake.ts`, `src/lib/product/analysis-runner.ts` |
| Review mapping | `src/lib/product/intake-profile.ts`, `src/lib/product/profile-review.ts` |
| Market scan | `src/lib/research/types.ts`, `sources.ts`, `competitors.ts`, `market.ts`, `runner.ts` |
| Trend radar | `src/lib/research/trends/types.ts`, `providers.ts`, `links.ts`, `interest.ts`, `radar.ts`; prompt `src/lib/ai/prompts/content-ideas.v1.ts`; route `src/app/api/product/analyze/[id]/trends/route.ts`; UI `src/app/app/cycles/new/intake/trend-radar.tsx` |
| Prompts | `src/lib/ai/prompts/product-analysis.v2.ts`, `market-scan.v1.ts`, `market-opportunities.v1.ts` |
| API | `src/app/api/product/analyze/route.ts`, `analyze/[id]/route.ts`, `analyze/[id]/research/route.ts`, `snapshot/route.ts` |
| UI | `src/app/app/cycles/new/cycle-intake-form.tsx`, `intake/reading-progress.tsx`, `intake/confirm-step.tsx` (step 2), `intake/market-step.tsx` (step 3: briefing and tabs), `intake/market-sections.tsx` and `intake/trend-radar.tsx` (tab contents), `intake/parts.tsx` (source tags, lists, sections, step footer); pages `src/app/onboarding/page.tsx`, `src/app/app/cycles/new/page.tsx` |
| Consumers | `src/lib/strategy/facts.ts`, `src/lib/content/claim-evidence.ts`, `src/lib/product-brief.ts`, `/app/opportunities` |

## 14. Next steps

In order of value:

1. Pick the production model (blocker 03) and run the three prompts on the 10-product evaluation set.
2. A **Market page** in the app that shows the saved threads and signals, with a weekly rescan.
3. Set the YouTube and Bluesky keys, and ask Reddit for commercial approval, so the radar reads them live.
4. A broader search source for non-developer products (needs a vendor and a key).
5. A Stack Apps key for the Stack Exchange quota.
6. Read competitors' `/pricing` page as well as their home page.
7. Move the scan onto the job queue where Redis exists, and retire `/api/product/intake`.
