# Web and mobile: Banyan and SocialFlow Lite

Status: vision with a first concrete step shipped (M0). Written 2026-11-02.

## The one idea

**The desk is where distribution is designed; the phone is where it is supervised.**

Banyan's agents run a cycle: research, strategy, drafts, publishing, measurement. The founder's part is
small and decisive: approve or reject, pause, check what went out, react when something breaks. Those
moments happen away from the desk, so they must work on a phone in under ten seconds. Designing a
strategy, editing a long post or comparing products across an organization stays on a large screen.

SocialFlow Lite is infrastructure. It has no audience of its own: its users are Banyan, assistants over
MCP, and the operator who connects accounts. Its mobile surface *is* Banyan.

## Who does what, where

| Moment | Surface | Why |
| --- | --- | --- |
| Approve or reject a draft, answer an autopilot escalation | **Phone first** | the cycle waits on this; it is a yes/no with context |
| Pause all agents for a product | **Phone first** | an emergency brake must be reachable anywhere |
| See what was published, with live links; see failures | **Phone first** | "did it go out?" is the most common question |
| Connect LinkedIn or X | Either | the OAuth consent pages are already mobile-friendly |
| Edit copy, review claims flags | Web, readable on phone | editing long text on a phone is tolerable, not pleasant |
| Strategy, cycle planning, autonomy policy, product settings | **Web** | dense decisions with many inputs |
| All products command center, credits, roles, API tokens | **Web** | organization-level administration |
| SocialFlow Lite keys, accounts, post log | Lite CLI and Banyan's connections page | no separate Lite UI to maintain |

## Banyan web (today, and what improves)

Exists: the founder command center (all products), per-product cycles, approvals, content editor with
claims guard, connections with token expiry, autonomy policy, activity, credits, assistant tokens, and a
responsive shell with a mobile drawer.

Next on web:
- Publication states told plainly everywhere: *waiting for SocialFlow's confirmation*, *published (link)*,
  *cancelled*, *failed (why)*. The data is now reliable (BOS-027/029); the cycle and campaign pages should
  show it with the same words as the content page.
- One "needs you" count in the shell: approvals + escalations + failures + expiring tokens, per product
  and across the organization.

## Banyan on the phone: milestones

**M0 — Installable (shipped).** `src/app/manifest.ts`: add to home screen, opens standalone on
*Approvals*, shortcuts to Approvals, All products and Activity, canopy-green browser chrome. No service
worker: nothing works offline and nothing pretends to.

**M1 — The supervision loop, phone-first.** The existing pages, made thumb-sized rather than new ones:
- *Approvals* as a card stack: channel, product, hook, claims flags, one-tap approve/reject with a reason.
  Every approval still goes to the server, which re-checks role and state. Never queue an approval offline.
- A visible *Pause agents* control in the mobile header for the current product.
- *Published* list: what went out today, with live links and failures first.
- Acceptance: each of the three takes one screen and at most two taps from opening the app, at 360 px width.

**M2 — Tell me when it matters (push).** A service worker and Web Push (VAPID keys, a `PushSubscription`
table scoped to user × product, per-user quiet hours). It notifies only for decisions and failures:
draft waiting past a threshold, autopilot escalation, publication failed, token expiring, cycle closed
with a report. No engagement pings. Opening a notification lands on the exact card. Needs: VAPID keys
(operator), iOS requires the app to be installed (M0) for push.

**M3 — Native shell, only if earned.** Expo (React Native) wrapping the same routes and APIs, if the web
version hits a real wall: reliable push on iOS, share-sheet capture ("share this article to Banyan as a
source"), biometric unlock for approvals. Same API, same server-side roles; no business logic in the app.

## SocialFlow Lite: web, phone, assistants

- **Headless by design.** REST contract C1–C10 and the MCP server at `/mcp` (9 tools including
  `cancel_post`). Banyan is the human interface; assistants (Claude, others) use MCP.
- **The only human pages** are the account-connection flow (connect URL → platform consent → "Connected"
  page). They must stay readable on a phone, because founders connect accounts from wherever they are.
- **Operator view, later and small.** A read-only status page for the operator (accounts, token expiry,
  last 50 posts with outcome), protected by an operator key, if self-hosters ask for it. Not before.
- **Mobile platforms as channels** (Instagram, TikTok) are a SocialFlow capability question, not an app
  question. They need verified APIs and media upload (BOS-028), and are not promised until they exist.

## Architecture rules that make this cheap

1. **One API.** Phone, web and native shell call the same Next.js routes; roles and approval checks live in
   the server (route-guard test enforces it). A client never decides what is allowed.
2. **Server-confirmed state only.** "Published" comes from SocialFlow's confirmation; "approved" from the
   server's answer. Optimistic UI may show *sending…*, never the final state.
3. **Small payloads.** Approval cards ship the hook and flags, not the whole cycle.
4. **Assistants are a surface too.** Banyan's read-only MCP server (`/api/mcp`, personal access tokens) is
   how a founder asks "what is waiting for me?" from Claude on any device.

## Not built, stated plainly

Service worker, offline reading, Web Push, phone-first approval cards, native apps, Lite operator page,
media posts, Instagram/TikTok. M0 is the only shipped piece of this document.
