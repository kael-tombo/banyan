import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SiteNav } from "@/components/SiteNav";
import { Reveal } from "@/components/Reveal";
import { LivingTree } from "@/components/landing/LivingTree";
import { BRANCHES } from "@/components/landing/branches";
import { WorkflowFlow } from "@/components/landing/WorkflowFlow";
import { BuildPlanForm } from "@/components/landing/BuildPlanForm";
import { WorkspaceMockup } from "@/components/landing/WorkspaceMockup";
import { Card } from "@/components/ui";
import {
  ArrowDown, ArrowRight, CheckCircle2, Database, FlaskConical, KeyRound, LineChart, ListChecks,
  PenLine, Plug, ReceiptText, SearchCheck, ShieldCheck, Sprout, Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Banyan.ai — One goal. A whole business in motion." },
  description:
    "Banyan turns your business objectives into coordinated AI-powered work — from strategy and creation to distribution and measurable results.",
};

const workflow = [
  { key: "research", label: "Research" },
  { key: "strategize", label: "Strategize" },
  { key: "create", label: "Create" },
  { key: "review", label: "Review" },
  { key: "publish", label: "Publish" },
  { key: "measure", label: "Measure" },
  { key: "learn", label: "Learn" },
  { key: "iterate", label: "Iterate" },
];

const marqueeChannels = [
  "X", "LinkedIn", "Short-form video", "Newsletters", "Blogs",
  "Communities", "Threads", "Forums",
];

/* Hero chain — the whole promise in one scannable line, and the legend for the
   LivingTree's five phases below it. Same five beats, same order: a visitor who
   reads this strip can already read the tree. */
const heroChain = [
  { label: "One objective", dot: "bg-forest" },
  { label: "A plan", dot: "bg-moss" },
  { label: "Coordinated branches", dot: "bg-forest-deep" },
  { label: "Approved execution", dot: "bg-fig" },
  { label: "Measured results", dot: "bg-fig-deep" },
];

/* SECTION 2 — the illustrative objective, executed as a coherent workflow.
   Tags distinguish who acts: agents draft, you decide, the platform responds. */
const goalSteps = [
  {
    n: "01", icon: SearchCheck, tag: "Agents draft", title: "Research the audience",
    body: "Segments and hypothesis-labeled research briefs are drafted from your workspace context — assumptions to validate, never invented market facts.",
  },
  {
    n: "02", icon: Users, tag: "You decide", title: "Develop positioning and messaging",
    body: "Positioning options arrive with recorded reasoning and confidence. You pick the direction — or edit it — before any work builds on it.",
  },
  {
    n: "03", icon: Sprout, tag: "Agents draft", title: "Create campaign assets",
    body: "Channel-native drafts in your voice, each hand-off validated against a schema, every revision preserved.",
  },
  {
    n: "04", icon: PenLine, tag: "Agents draft", title: "Adapt content for each platform",
    body: "The same idea reshaped per surface: an X thread, a LinkedIn post, a short-video script with hooks, scenes, and captions.",
  },
  {
    n: "05", icon: Plug, tag: "You approve", title: "Schedule or publish",
    body: "Approved posts go out through your Postiz connection; everything else becomes a copy-ready handoff package. The provider's real response is recorded.",
  },
  {
    n: "06", icon: LineChart, tag: "System learns", title: "Measure available results",
    body: "Tracked links and one-variable experiments turn outcomes into recommendations with evidence and named confidence — feeding the next plan.",
  },
];

/* SECTION 3 — the integration inventory, stated exactly as the capability
   registry reports it. Nothing here claims availability the product cannot back. */
const integrations = [
  {
    name: "Postiz", role: "Publishing to X and LinkedIn", status: "Available", tone: "ok" as const,
    detail: "Connect your account in Publishing and approved content schedules and publishes through it. Without a connection, publications are recorded as blocked with setup guidance — never faked.",
  },
  {
    name: "Managed model access", role: "Drafting and planning", status: "Available", tone: "ok" as const,
    detail: "Live model access with per-workspace daily quotas and a usage ledger. On deployments without credentials, generation uses the clearly labeled template fallback.",
  },
  {
    name: "Short-form video", role: "Scripting and planning", status: "Manual", tone: "manual" as const,
    detail: "Banyan writes hooks, scripts, scene outlines, and captions — you record and produce the video. It is never marked published until you record the live URL.",
  },
  {
    name: "Fastlane", role: "Short-form creative + post analytics", status: "Needs credentials", tone: "creds" as const,
    detail: "The adapter is implemented against Fastlane's documented API and reports unverified until a workspace connects a key and a real call succeeds.",
  },
  {
    name: "SocialFlow.ai", role: "Distribution execution", status: "No verified API", tone: "off" as const,
    detail: "No verifiable API exists (checked October 2026), so Banyan does not pretend otherwise. The manual handoff — copy-ready package, you publish, record the live URL — is the supported path, and the adapter slot is ready when a real API appears.",
  },
];

/* SECTION 4 — the shape of real records, using the app's actual statuses. */
const outputRecords = [
  {
    icon: CheckCircle2, chip: "done", chipCls: "bg-forest/10 text-forest",
    title: "A completed task",
    body: "Tasks carry status, owner, and provenance from goal to plan to execution — visible on the goal's live view.",
  },
  {
    icon: PenLine, chip: "ready_for_review", chipCls: "bg-fig/10 text-fig-deep",
    title: "A generated content asset",
    body: "Channel drafts with every revision preserved; each agent hand-off is validated against a named schema before the next task starts.",
  },
  {
    icon: ListChecks, chip: "planned → in_progress", chipCls: "bg-mist text-charcoal-soft",
    title: "A prepared campaign",
    body: "Campaigns move through explicit states — draft, planned, in_progress, completed — enforced server-side, not by convention.",
  },
  {
    icon: Plug, chip: "health-checked", chipCls: "bg-forest/10 text-forest",
    title: "A connected integration",
    body: "Connections report honest health per workspace; a missing setup records as blocked with guidance instead of a fake success.",
  },
  {
    icon: ReceiptText, chip: "published / failed", chipCls: "bg-clay/8 text-clay",
    title: "A real execution record",
    body: "Every publishing attempt is stored with the provider's actual response — success, failure, or blocked — and the retry history behind it.",
  },
  {
    icon: LineChart, chip: "first-party", chipCls: "bg-forest/10 text-forest",
    title: "An available result",
    body: "Tracked-link clicks and experiment readouts recorded in your workspace. What Banyan reports is what it has measured.",
  },
];

/* SECTION 5 — implemented controls only. */
const controls = [
  {
    icon: ShieldCheck, title: "Approval gates",
    body: "Consequential actions wait for a recorded human decision — stored with who approved and when. Publishing is gated this way by design, not by policy text.",
  },
  {
    icon: KeyRound, title: "Permissions and connected accounts",
    body: "Connections are scoped to your workspace with health you can inspect. Capabilities declare what they can do today — availability is never assumed.",
  },
  {
    icon: FlaskConical, title: "Execution status and failure visibility",
    body: "Scheduled, publishing, published, blocked, failed — every state is explicit, with the provider's real response and the bounded retry history attached.",
  },
  {
    icon: ListChecks, title: "Activity history",
    body: "Every agent action is logged and browsable: what ran, what it produced, and what it cost. Nothing happens in your workspace that you cannot trace.",
  },
  {
    icon: Database, title: "Your constraints",
    body: "Product facts, audience, and voice stay provenance-tracked in your workspace. Agents draft from your context — uncertainty is disclosed, never guessed away.",
  },
  {
    icon: ReceiptText, title: "Credentials and sensitive data",
    body: "Use managed credentials or bring your own keys, encrypted at rest. A per-workspace usage ledger records every model call and its cost.",
  },
];

/* ————— Shared section grammar ————— */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-fig-deep">{children}</span>
  );
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div>
      <Reveal as="p"><Eyebrow>{eyebrow}</Eyebrow></Reveal>
      <Reveal as="h2" delay={80} className="tight mt-3 max-w-2xl text-3xl font-semibold leading-[1.12] text-forest-deep md:text-[2.6rem]">
        {title}
      </Reveal>
      <Reveal as="p" delay={160} className="mt-4 max-w-2xl text-base leading-relaxed text-charcoal-soft md:text-lg">
        {sub}
      </Reveal>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing min-h-screen bg-paper">
      <SiteNav />

      {/* ————— SECTION 1 · THE HERO — the promise, the CTAs, the living tree. ————— */}
      <section className="hero-glow hero-glow-drift relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 md:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-sage/40 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-forest-deep">
                <Sprout size={12} className="text-forest" aria-hidden="true" />
                Your AI business operating system
              </span>
            </Reveal>
            {/* The promise lands line by line — each line rises out of its own
                mask, then the second line keeps a slow gradient shimmer alive
                (the business literally stays in motion). CSS-only, no JS. */}
            <h1 className="display mt-6 text-[2.7rem] text-forest-deep sm:text-5xl md:text-[3.6rem]">
              <span className="hero-line-mask">
                <span className="hero-line">One goal.</span>
              </span>
              <span className="hero-line-mask">
                <span className="hero-line hero-line-shimmer">A whole business in motion.</span>
              </span>
            </h1>
            <Reveal as="p" delay={160} className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-charcoal-soft md:text-lg">
              Banyan turns your business objectives into coordinated AI-powered work — from strategy
              and creation to distribution and measurable results.
            </Reveal>
            <Reveal delay={240} className="mt-8">
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest-deep px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-14px_rgba(18,48,40,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest sm:w-auto"
                >
                  Start building with Banyan
                  <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-bark/20 bg-white px-7 py-3.5 text-sm font-semibold text-forest-deep transition-all duration-200 hover:-translate-y-0.5 hover:border-forest/50 sm:w-auto"
                >
                  See how it works
                  <ArrowDown size={15} className="transition-transform duration-200 group-hover:translate-y-0.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
            {/* The chain: five beats between the promise and the tree. A pulse
                travels the dots in order, so the loop reads as motion, not text. */}
            <Reveal delay={300}>
              <ol
                className="mt-7 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2 text-[12.5px] font-semibold text-charcoal-soft"
                aria-label="One objective becomes a plan, branches execute it in coordination, and measured results return."
              >
                {heroChain.map((step, i) => (
                  <li key={step.label} className="flex items-center gap-2">
                    <span
                      className={`chain-dot ${step.dot}`}
                      style={{ "--chain-i": i } as React.CSSProperties}
                      aria-hidden="true"
                    />
                    {step.label}
                    {i < heroChain.length - 1 && (
                      <ArrowRight size={12} className="ml-0.5 text-bark/35" aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ol>
            </Reveal>
            <Reveal delay={380}>
              <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] text-charcoal-soft">
                {[
                  { icon: ShieldCheck, text: "Nothing publishes without your approval" },
                  { icon: Plug, text: "Real connections, or honest blocks" },
                  { icon: FlaskConical, text: "Measured, never invented" },
                ].map((t) => (
                  <li key={t.text} className="flex items-center gap-2">
                    <t.icon className="text-forest" size={14} aria-hidden="true" />
                    {t.text}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* The signature tree: objective → plan → orchestration → execution → deliverables.
              The hint line names the interaction — branches are explorable, not decoration. */}
          <Reveal delay={200} className="mt-12 md:mt-14">
            <div className="dot-grid dot-grid-fade rounded-3xl px-2 pb-6 pt-2 sm:px-6">
              <p className="flex items-center justify-center gap-2 pb-3 pt-4 text-xs text-charcoal-soft/80">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fig motion-reduce:animate-none" aria-hidden="true" />
                The loop replays on its own — tap any branch to see the work inside.
              </p>
              <LivingTree />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ————— Surfaces marquee — the ground the tree drops roots into. ————— */}
      <section aria-label="Distribution surfaces" className="border-y border-bark/10 bg-white py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4">
          <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-charcoal-soft/70 md:block">
            Surfaces Banyan works across today
          </span>
          <div className="marquee-mask min-w-0 flex-1 overflow-hidden">
            <div className="marquee gap-2.5">
              {[...marqueeChannels, ...marqueeChannels].map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-bark/12 bg-paper px-4 py-1.5 text-sm text-charcoal-soft"
                  aria-hidden={i >= marqueeChannels.length}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${["bg-forest", "bg-moss", "bg-fig", "bg-sage"][i % 4]}`}
                    aria-hidden="true"
                  />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ————— SECTION 2 · FROM GOAL TO EXECUTION — one objective, made real. ————— */}
      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="From goal to execution"
            title="Watch one objective become finished work."
            sub='Take a relatable objective — "Launch a new product and build an audience." Here is the shape of that campaign in Banyan: a plan, coordinated tasks, and tangible outputs. The example is illustrative; the workflow is the real one.'
          />

          <Reveal delay={100}>
            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-bark/15 bg-mist px-4 py-1.5 text-xs font-semibold text-charcoal-soft">
              <FlaskConical size={13} className="text-forest" aria-hidden="true" />
              Illustrative example — the shape of a real campaign, not a captured run
            </p>
          </Reveal>

          <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {goalSteps.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 90}>
                <Card className="card-lift card-shadow flex h-full flex-col rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                      <s.icon size={18} aria-hidden="true" />
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        s.tag === "You approve" || s.tag === "You decide"
                          ? "bg-fig/10 text-fig-deep"
                          : s.tag === "System learns"
                            ? "bg-mist text-charcoal-soft"
                            : "bg-forest/6 text-forest"
                      }`}
                    >
                      {s.tag}
                    </span>
                  </div>
                  <h3 className="tight mt-5 text-lg font-semibold text-forest-deep">
                    <span className="mr-2 text-sm font-semibold tracking-widest text-bark/40" aria-hidden="true">{s.n}</span>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{s.body}</p>
                </Card>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={120}>
            <div className="mt-10 rounded-2xl border border-bark/12 bg-mist/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal-soft">
                The loop every objective runs
              </p>
              <div className="mt-4">
                <WorkflowFlow steps={workflow} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ————— SECTION 3 · ONE INTELLIGENCE, MANY BRANCHES — workstreams + honest ground. ————— */}
      <section id="branches" className="border-y border-bark/10 bg-mist py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="One intelligence, many branches"
            title="Five workstreams, one shared context."
            sub="Every branch reads the same provenance-tracked context and reports back into the same plan. Hover, focus, or tap a branch in the tree above — or browse them here."
          />

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {BRANCHES.map((b, i) => (
              <Reveal key={b.label} delay={i * 90} className={i === 4 ? "md:col-span-2 lg:col-span-1" : ""}>
                <Card className="card-lift card-shadow flex h-full flex-col rounded-2xl bg-white p-6">
                  <h3 className="tight text-lg font-semibold text-forest-deep">{b.label}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-charcoal">{b.work}</p>
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`${b.label} deliverables`}>
                    {b.deliverables.map((d) => (
                      <li key={d} className="rounded-full border border-forest/25 bg-forest/6 px-2.5 py-1 text-xs font-medium text-forest">{d}</li>
                    ))}
                  </ul>
                  <p className="mt-auto flex items-start gap-1.5 pt-4 text-[13px] font-medium leading-relaxed text-fig-deep">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {b.approval}
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>

          {/* The connected ground — the integration inventory, exactly as reported. */}
          <div className="mt-16">
            <Reveal as="h3" className="tight text-2xl font-semibold text-forest-deep">
              The connected ground
            </Reveal>
            <Reveal as="p" delay={80} className="mt-3 max-w-2xl text-sm leading-relaxed text-charcoal-soft md:text-base">
              Banyan is built to reach many surfaces, but it only claims what the integration
              inventory proves. Here is the ground under the tree today.
            </Reveal>

            <ul className="mt-8 space-y-3">
              {integrations.map((it, i) => (
                <Reveal as="li" key={it.name} delay={i * 70}>
                  <div className="rooted card-shadow flex flex-col gap-2 rounded-xl bg-white p-5 sm:flex-row sm:items-start sm:gap-5">
                    <div className="sm:w-56 sm:shrink-0">
                      <p className="text-[15px] font-semibold text-forest-deep">{it.name}</p>
                      <p className="text-xs text-charcoal-soft">{it.role}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          it.tone === "ok"
                            ? "bg-forest/10 text-forest"
                            : it.tone === "creds"
                              ? "bg-fig/10 text-fig-deep"
                              : "border border-bark/20 bg-paper text-charcoal-soft"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            it.tone === "ok" ? "bg-forest" : it.tone === "creds" ? "bg-fig" : "bg-bark/50"
                          }`}
                          aria-hidden="true"
                        />
                        {it.status}
                      </span>
                      <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{it.detail}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ————— SECTION 4 · WORK THAT GETS DONE — outputs over dashboards. ————— */}
      <section id="outputs" className="py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="Work that gets done"
            title="Deliverables and execution records — not decorative dashboards."
            sub="Every objective produces named outputs with real status. These are the record shapes Banyan writes today, with the app's actual state vocabulary."
          />

          <div className="mt-14 grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <Reveal className="min-w-0">
              <WorkspaceMockup />
            </Reveal>

            <ul className="space-y-3">
              {outputRecords.map((r, i) => (
                <Reveal as="li" key={r.title} delay={i * 70}>
                  <div className="card-shadow flex items-start gap-4 rounded-xl border border-bark/10 bg-white p-4.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest/6 text-forest">
                      <r.icon size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-charcoal">{r.title}</h3>
                        <span className={`rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold ${r.chipCls}`}>
                          {r.chip}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-charcoal-soft">{r.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ————— SECTION 5 · BUILT FOR TRUSTED AUTONOMY — you keep the pen. ————— */}
      <section id="trust" className="border-y border-bark/10 bg-mist py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="Built for trusted autonomy"
            title="Agents carry the work. You keep the pen."
            sub="Autonomy without visibility is just risk. Banyan gives you control where it matters — implemented controls, not promises."
          />

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {controls.map((c, i) => (
              <Reveal key={c.title} delay={i * 80}>
                <Card className="card-lift card-shadow h-full rounded-2xl bg-white p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                    <c.icon size={18} aria-hidden="true" />
                  </span>
                  <h3 className="tight mt-5 text-base font-semibold text-forest-deep">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{c.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="rooted-fig mt-10 rounded-xl bg-white p-6 card-shadow md:p-7">
              <h3 className="tight text-lg font-semibold text-forest-deep">Planning an action is not executing it</h3>
              <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-charcoal-soft md:text-[15px]">
                A plan is a proposal. Execution is what happens after you approve — and Banyan keeps
                the two visibly distinct everywhere: gates before action, status after. When something
                cannot run for lack of a connection, it says so and records the block with setup
                guidance instead of pretending.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ————— SECTION 6 · FINAL CONVERSION ————— */}
      <section className="hero-glow relative overflow-hidden py-28">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Reveal>
            <h2 className="display text-4xl text-forest-deep md:text-5xl">
              Your next business milestone
              <br />
              starts with a goal.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-charcoal-soft md:text-lg">
              Tell Banyan what you want to accomplish. Build a plan, coordinate the work
              and move forward with clarity.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-forest-deep px-8 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-14px_rgba(18,48,40,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest"
            >
              Start building with Banyan
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <div className="mt-9">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal-soft">
                Already have a product online? Bring the URL —
              </p>
              <div className="mx-auto mt-3 max-w-xl">
                <BuildPlanForm compact />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ————— Footer ————— */}
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-bark/10 bg-paper py-14">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-10 px-4">
        <div>
          <span className="flex items-center gap-2.5">
            <Image src="/brand/symbol-color.png" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
            <span className="text-lg font-semibold tracking-tight text-forest-deep">Banyan<span className="text-moss">.ai</span></span>
          </span>
          <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-charcoal-soft">
            One goal. A whole business in motion — the agentic operating system for business execution.
          </p>
        </div>
        <div className="flex gap-14">
          <div>
            <h3 className="text-sm font-semibold text-forest-deep">Product</h3>
            <ul className="mt-3.5 space-y-2.5 text-sm text-charcoal-soft">
              <li><Link href="/#how-it-works" className="transition-colors hover:text-forest-deep">How it works</Link></li>
              <li><Link href="/#branches" className="transition-colors hover:text-forest-deep">Branches</Link></li>
              <li><Link href="/#outputs" className="transition-colors hover:text-forest-deep">Outputs</Link></li>
              <li><Link href="/#trust" className="transition-colors hover:text-forest-deep">Trust &amp; control</Link></li>
              <li><Link href="/signup" className="transition-colors hover:text-forest-deep">Start building</Link></li>
              <li><Link href="/login" className="transition-colors hover:text-forest-deep">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-forest-deep">Legal</h3>
            <ul className="mt-3.5 space-y-2.5 text-sm text-charcoal-soft">
              <li><Link href="/privacy" className="transition-colors hover:text-forest-deep">Privacy</Link></li>
              <li><Link href="/terms" className="transition-colors hover:text-forest-deep">Terms</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-12 max-w-6xl px-4 text-xs text-charcoal-soft/70">
        © {new Date().getFullYear()} Banyan.ai. No invented metrics: what the product reports is what it has measured.
      </p>
    </footer>
  );
}
