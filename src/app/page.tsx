import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SiteNav } from "@/components/SiteNav";
import { Reveal } from "@/components/Reveal";
import { WorkflowFlow } from "@/components/landing/WorkflowFlow";
import { BanyanTree } from "@/components/landing/BanyanTree";
import { Badge, Card, StatusBadge } from "@/components/ui";
import {
  ArrowRight, PenLine, SearchCheck, CalendarClock, LineChart, Sprout,
  Share2, CheckCircle2, XCircle, FlaskConical, Users, Megaphone,
  ShieldCheck, Plug, Workflow, GitBranch, Database, Umbrella, Eye, ReceiptText, Lightbulb,
} from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Banyan.ai — Build. Distribute. Grow." },
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

const channels = [
  {
    name: "X",
    available: "Generate, edit, review, and schedule single posts, threads, discussion starters, and product updates.",
    integration: "Publishing runs through a Postiz connection you configure. Until then, drafts and approvals work normally.",
  },
  {
    name: "LinkedIn",
    available: "Professional insights, founder stories, product-building updates, problem/solution posts, and announcements.",
    integration: "Also published through Postiz. Setup is a few fields — see /app/publishing once you have an account.",
  },
  {
    name: "Short-form video",
    available: "Hooks, scripts, scene-by-scene outlines, suggested visuals, on-screen text, captions, and CTAs.",
    integration: "Video production itself is manual for now — you record; Banyan scripts and tracks; no fake 'publish'.",
  },
];

const principles = [
  "Distribution is a core product capability, not an afterthought.",
  "Outcomes matter more than content volume.",
  "AI agents coordinate the work; human judgment approves it.",
  "Every campaign produces evidence and learning.",
  "Never invent customers, traction, or research.",
  "Prefer measurable progress over technical complexity.",
];

const growthStages = [
  {
    icon: Database,
    stage: "Roots",
    title: "Persistent context",
    body: "A banyan anchors deep before it rises. Banyan.ai keeps your product facts, audience, and voice as provenance-tracked memory — every agent, draft, and plan reads from the same living record.",
  },
  {
    icon: Workflow,
    stage: "Trunk",
    title: "One orchestrator",
    body: "A single trunk carries every branch. One runtime owns the state of every goal, task, and run — claiming work atomically, recovering from crashes with leases, never letting two agents do the same job twice.",
  },
  {
    icon: GitBranch,
    stage: "Aerial roots",
    title: "Channels that become trunks",
    body: "A banyan drops roots from its branches; when they touch ground they thicken into load-bearing trunks. Start with one channel and one goal — each root you grow becomes self-supporting.",
  },
  {
    icon: Umbrella,
    stage: "Canopy",
    title: "Shelter for judgment",
    body: "The canopy shades the ground where new life grows. Agents do the carrying; people decide in the shade. Every publish waits for a human approval recorded in the database — by design.",
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

/* ————— Hero visual: the tree on its engineered stage, with the runtime
         floating around it as glass cards. Decorative → aria-hidden. ————— */

function HeroStage() {
  return (
    <div className="relative mx-auto mt-14 max-w-5xl md:mt-16">
      <div className="card-shadow-lg relative overflow-hidden rounded-[2rem] border border-bark/10 bg-gradient-to-b from-mist/80 via-white to-white">
        <div className="dot-grid dot-grid-fade absolute inset-0" aria-hidden="true" />

        <div className="relative px-3 pb-4 pt-8 sm:px-8 sm:pt-10">
          <div className="relative mx-auto max-w-3xl">
            <BanyanTree className="h-auto w-full" />

            {/* Goal card — top left */}
            <div className="glass float-bob absolute -left-14 top-12 hidden w-60 rounded-2xl p-4 lg:block" aria-hidden="true">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fig-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-fig" /> Goal · active
              </div>
              <p className="mt-2 text-sm font-medium leading-snug text-charcoal">Grow a founder audience on X</p>
              <div className="mt-3 flex flex-wrap gap-1 text-[10.5px] font-medium">
                <span className="rounded-md bg-forest/10 px-1.5 py-0.5 text-forest">research ✓</span>
                <span className="rounded-md bg-forest/10 px-1.5 py-0.5 text-forest">plan ✓</span>
                <span className="rounded-md border border-fig/30 bg-fig/10 px-1.5 py-0.5 text-fig-deep">draft · review</span>
              </div>
            </div>

            {/* Approval card — right */}
            <div className="glass float-bob-slow absolute -right-16 top-36 hidden w-64 rounded-2xl p-4 lg:block" aria-hidden="true">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-forest">
                <ShieldCheck size={12} className="text-forest" /> Approval gate
              </div>
              <p className="mt-2 text-sm font-medium leading-snug text-charcoal">X thread · v3 ready for review</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-forest-deep px-3 py-1.5 text-[11px] font-semibold text-white">Approve</span>
                <span className="rounded-full border border-bark/20 px-3 py-1.5 text-[11px] font-semibold text-charcoal-soft">Edit</span>
              </div>
            </div>

            {/* Receipt card — bottom left */}
            <div className="glass float-bob-fast absolute bottom-20 left-2 hidden w-56 rounded-2xl p-4 md:block" aria-hidden="true">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-forest">
                <span className="h-1.5 w-1.5 rounded-full bg-forest" /> Published · X
              </div>
              <p className="mt-2 text-sm font-medium leading-snug text-charcoal">Posted at 12:40 — real response, recorded</p>
              <p className="mt-2 text-[11px] text-charcoal-soft">Measurement scheduled tomorrow</p>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center gap-2 pb-5 pt-1 text-xs text-charcoal-soft/80">
          <Sprout size={12} className="text-forest" aria-hidden="true" />
          <span>One trunk. Every aerial root becomes a trunk of its own.</span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing min-h-screen bg-paper">
      <SiteNav />

      {/* ————— Hero — white paper, full sun, the tree on stage. ————— */}
      <section className="hero-glow hero-glow-drift relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-16 text-center md:pt-24">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <Link
                href="#product"
                className="group inline-flex items-center gap-2 rounded-full border border-bark/12 bg-white/70 py-1.5 pl-1.5 pr-3.5 text-xs font-medium text-charcoal-soft shadow-sm backdrop-blur transition-colors hover:border-forest/30"
              >
                <span className="rounded-full bg-fig/12 px-2 py-0.5 text-[11px] font-semibold text-fig-deep">New</span>
                The agentic execution runtime is live
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </Reveal>
            <Reveal as="h1" delay={90} className="display mt-7 text-[2.75rem] text-forest-deep sm:text-6xl md:text-7xl">
              Build your product.
              <br />
              <span className="bg-gradient-to-r from-forest via-moss to-forest bg-clip-text text-transparent">
                Let it find its people.
              </span>
            </Reveal>
            <Reveal as="p" delay={180} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-charcoal-soft md:text-lg">
              Banyan.ai is the agentic operating system for product distribution: AI agents run research,
              content, publishing, and learning as one workflow — and every publish waits for your approval.
            </Reveal>
            <Reveal delay={260} className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-forest-deep px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_-14px_rgba(18,48,40,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest"
              >
                Start distributing
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-full border border-bark/20 bg-white/80 px-6 py-3 text-sm font-semibold text-forest-deep backdrop-blur transition-colors hover:border-forest/50"
              >
                See how it works
              </Link>
            </Reveal>
            <Reveal delay={340}>
              <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] text-charcoal-soft">
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

          <Reveal delay={200}>
            <HeroStage />
          </Reveal>
        </div>
      </section>

      {/* ————— Channel marquee — the ground the tree drops roots into. ————— */}
      <section aria-label="Distribution surfaces" className="border-y border-bark/10 bg-white py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4">
          <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-charcoal-soft/70 md:block">
            One workflow, everywhere your people are
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

      {/* ————— Problem — three roots that never grew. ————— */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="The problem"
            title="Shipping the product was the easy part."
            sub="A seedling without roots is sheltered by nothing, reached by no one. Most products stall here — in three familiar ways."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              {
                n: "01", icon: XCircle, title: "Adoption is not automatic",
                body: "A good product does not announce itself. Launches stall because the work of reaching people is unowned, inconsistent, and unmeasured.",
              },
              {
                n: "02", icon: Share2, title: "Distribution is fragmented",
                body: "Research in one tab, writing in another, scheduling in a third. The connections between them — the actual decisions — get lost.",
              },
              {
                n: "03", icon: LineChart, title: "Output is not outcome",
                body: "Publishing more posts is not distribution. Without experiments and honest learning, teams ship volume and call it progress.",
              },
            ].map((p, i) => (
              <Reveal key={p.n} delay={i * 100}>
                <Card className="card-lift card-shadow h-full rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay/8 text-clay">
                      <p.icon size={18} aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold tracking-widest text-bark/40" aria-hidden="true">{p.n}</span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-charcoal">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{p.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— Bento — the agentic runtime, one tree many trunks. ————— */}
      <section id="product" className="border-y border-bark/10 bg-mist py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="The runtime"
            title="One tree. Many trunks."
            sub="The runtime grows capabilities the way a banyan grows roots — each one starts thin, then becomes load-bearing on its own. This is what ships today, not a roadmap."
          />

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {/* Large: goal → plan → executed work */}
            <Reveal className="md:col-span-2">
              <Card className="card-lift card-shadow flex h-full flex-col rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                  <Sprout size={18} aria-hidden="true" />
                </span>
                <h3 className="tight mt-5 text-xl font-semibold text-forest-deep">Goals that execute themselves</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-charcoal-soft">
                  State a goal in plain language. The planner drafts a task graph — research, strategy,
                  content, approvals, publishing — with dependencies and gates. An orchestrator claims work
                  atomically, retries transient failures, and recovers from crashes with leases.
                </p>
                <div className="mt-auto pt-7" aria-hidden="true">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {["research", "strategy", "campaign", "draft", "approval", "publish", "measure"].map((step, i) => (
                      <span key={step} className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            step === "approval"
                              ? "border-fig/40 bg-fig/10 text-fig-deep"
                              : "border-bark/12 bg-paper text-charcoal-soft"
                          }`}
                        >
                          {step}
                        </span>
                        {i < 6 && <span className="text-bark/35">→</span>}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3.5 text-xs text-charcoal-soft/75">
                    The gold gate is yours: publishing waits for a recorded human decision.
                  </p>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={90}>
              <Card className="card-lift card-shadow h-full rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                  <Database size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-charcoal">Persistent business context</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Product facts, audience, and voice live as provenance-tracked memory. Every draft cites what
                  it knows; uncertainty is disclosed, never guessed away.
                </p>
                <div className="mt-5 flex flex-wrap gap-1.5" aria-hidden="true">
                  <span className="rounded-full border border-forest/25 bg-forest/6 px-2 py-0.5 text-xs text-forest">verified</span>
                  <span className="rounded-full border border-bark/12 bg-paper px-2 py-0.5 text-xs text-charcoal-soft">user_provided</span>
                  <span className="rounded-full border border-bark/12 bg-paper px-2 py-0.5 text-xs text-charcoal-soft">observed</span>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={0}>
              <Card className="card-lift card-shadow h-full rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                  <ShieldCheck size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-charcoal">Human approval gates</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Publishing waits for a recorded human decision — stored with who approved and when.
                  Nothing ships unreviewed.
                </p>
                <div className="mt-5 flex items-center justify-between rounded-xl border border-bark/10 bg-mist/70 px-3 py-2.5" aria-hidden="true">
                  <span className="text-xs font-medium text-charcoal-soft">X thread · v3</span>
                  <span className="rounded-full bg-forest-deep px-2.5 py-1 text-[10px] font-semibold text-white">Approve</span>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={90}>
              <Card className="card-lift card-shadow h-full rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                  <ReceiptText size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-charcoal">Model routing with receipts</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Managed credentials first, your keys when you add them, daily quotas — and a ledger that
                  records every call and its cost.
                </p>
                <div className="mt-5 space-y-1.5 rounded-xl border border-bark/10 bg-mist/70 px-3 py-2.5 font-mono text-[11px] text-charcoal-soft" aria-hidden="true">
                  <div className="flex justify-between"><span>managed · gpt</span><span>1,204 calls</span></div>
                  <div className="flex justify-between"><span>fallback · llama</span><span>labeled</span></div>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={180}>
              <Card className="card-lift card-shadow h-full rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                  <Plug size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-charcoal">Adapters, honest status</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Integrations declare what they can do today — and never fake a success.
                </p>
                <div className="mt-5 flex flex-wrap gap-1.5" aria-hidden="true">
                  <span className="flex items-center gap-1.5 rounded-full border border-forest/25 bg-forest/6 px-2 py-0.5 text-xs text-forest">
                    <span className="h-1.5 w-1.5 rounded-full bg-forest" /> available
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-bark/12 bg-paper px-2 py-0.5 text-xs text-charcoal-soft">
                    <span className="h-1.5 w-1.5 rounded-full bg-fig" /> needs credentials
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-bark/12 bg-paper px-2 py-0.5 text-xs text-charcoal-soft">
                    <span className="h-1.5 w-1.5 rounded-full bg-bark/50" /> unverified
                  </span>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={0}>
              <Card className="card-lift card-shadow h-full rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fig/10 text-fig-deep">
                  <Eye size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-charcoal">Verified outputs, named schemas</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Every agent hand-off is validated against a named schema before the next task starts. Work
                  is done when it is correct — not when it says it is.
                </p>
                <div className="mt-5 rounded-xl border border-bark/10 bg-mist/70 px-3 py-2.5 font-mono text-[11px] text-charcoal-soft" aria-hidden="true">
                  output.content_draft <span className="text-forest">✓ schema@1</span>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={90} className="lg:col-span-2">
              <Card className="card-lift card-shadow h-full rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fig/10 text-fig-deep">
                  <Lightbulb size={18} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-charcoal">Evidence-backed recommendations</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  When the data is thin, the evaluator says so instead of inventing insight. Every
                  recommendation carries the evidence and confidence behind it.
                </p>
                <div className="mt-5 space-y-1.5 rounded-xl border border-bark/10 bg-mist/70 px-3 py-2.5 text-[11px]" aria-hidden="true">
                  <div className="flex justify-between font-medium text-charcoal-soft">
                    <span>post at 09:00 · X</span>
                    <span className="text-forest">medium confidence</span>
                  </div>
                  <div className="flex justify-between font-medium text-charcoal-soft/70">
                    <span>best time to post</span>
                    <span>not_enough_data</span>
                  </div>
                </div>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ————— How it works — the loop, run by agents, decided by you. ————— */}
      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="How it works"
            title="The loop a strong distribution team runs"
            sub="Four moves, repeated until the product finds its people — coordinated by agents, decided by you."
          />

          <ol className="mt-14 grid gap-x-8 gap-y-10 md:grid-cols-4">
            {[
              { n: "01", title: "State a goal", body: "Type what you want in plain language — the planner turns it into a reviewable task graph." },
              { n: "02", title: "Approve the plan", body: "Every task, dependency, and gate is visible before any agent starts work." },
              { n: "03", title: "Agents execute", body: "Research, strategy, and drafts run through verified hand-offs; you approve what ships." },
              { n: "04", title: "Publish & learn", body: "Real connections deliver; results come back as evidence for the next cycle." },
            ].map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 110} className="relative border-t border-bark/15 pt-6">
                <span className="absolute -top-[5px] left-0 h-2.5 w-2.5 rounded-full bg-forest" aria-hidden="true" />
                <span className="text-[13px] font-semibold tracking-widest text-fig-deep" aria-hidden="true">{s.n}</span>
                <h3 className="tight mt-2 text-lg font-semibold text-forest-deep">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{s.body}</p>
              </Reveal>
            ))}
          </ol>

          <div className="mt-14">
            <WorkflowFlow steps={workflow} />
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            <Reveal delay={0}>
              <Card className="card-shadow h-full rounded-2xl p-7">
                <h3 className="tight text-lg font-semibold text-forest-deep">What you do</h3>
                <ul className="mt-5 space-y-3.5 text-sm leading-relaxed text-charcoal-soft">
                  <li className="flex gap-2.5"><Users className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Define your product, audience, positioning, and one clear distribution goal.</li>
                  <li className="flex gap-2.5"><CheckCircle2 className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Review every piece of content. Nothing publishes without a human approval recorded in the database.</li>
                  <li className="flex gap-2.5"><Megaphone className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Publish through a genuinely configured connection and see the provider's real response.</li>
                  <li className="flex gap-2.5"><FlaskConical className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Run small experiments and record what you actually observed — not what you hoped.</li>
                </ul>
              </Card>
            </Reveal>
            <Reveal delay={120}>
              <Card className="card-shadow h-full rounded-2xl p-7">
                <h3 className="tight text-lg font-semibold text-forest-deep">What the system does</h3>
                <ul className="mt-5 space-y-3.5 text-sm leading-relaxed text-charcoal-soft">
                  <li className="flex gap-2.5"><SearchCheck className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Drafts research hypotheses and positioning you can accept, edit, or reject.</li>
                  <li className="flex gap-2.5"><PenLine className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Generates channel-specific content in your brand voice, with revisions preserved.</li>
                  <li className="flex gap-2.5"><CalendarClock className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Schedules approved content and attempts delivery through the publishing worker — retrying transient failures with backoff.</li>
                  <li className="flex gap-2.5"><Sprout className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Turns tracked links, publications, and metrics into lessons for the next campaign.</li>
                </ul>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ————— Philosophy — how a banyan grows. ————— */}
      <section id="philosophy" className="border-y border-bark/10 bg-mist py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="Philosophy"
            title="How a banyan grows."
            sub="The tree the product is named for teaches its design. Every part of a banyan has a job — and so does every part of Banyan.ai."
          />

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {growthStages.map((g, i) => (
              <Reveal key={g.stage} delay={i * 100}>
                <Card className="card-lift card-shadow flex h-full flex-col rounded-2xl bg-white p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/6 text-forest">
                      <g.icon size={18} aria-hidden="true" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-widest text-fig-deep">{g.stage}</span>
                  </div>
                  <h3 className="tight mt-5 text-lg font-semibold text-forest-deep">{g.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{g.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          {/* First-customer quote — the founding principle, in practice. */}
          <Reveal delay={120}>
            <figure className="relative mt-14 overflow-hidden rounded-2xl border border-forest/15 bg-white p-8 card-shadow md:p-10">
              <span className="pointer-events-none absolute -top-7 left-6 select-none font-serif text-[7rem] leading-none text-forest/8" aria-hidden="true">"</span>
              <blockquote className="relative max-w-4xl space-y-4 text-[15px] leading-relaxed text-charcoal-soft md:text-base">
                <p>
                  Banyan.ai is its own first customer. The workspace you would use if you signed up today is the
                  same workspace the team uses to distribute Banyan.ai itself — the product researches its own
                  audience, drafts its own campaign themes, runs its own approval queue, publishes through the
                  same Postiz integration you would configure, and records its own experiments.
                </p>
                <p>
                  That is the founding principle in practice: if the workflows cannot move a real product's
                  growth, no amount of interface polish excuses them. Every lesson the team logs in its own
                  workspace is a prioritization decision for the next build cycle — treating observed
                  bottlenecks as hypotheses to investigate, not conclusions.
                </p>
              </blockquote>
              <figcaption className="relative mt-6 text-sm font-medium text-forest">The founding principle, in practice</figcaption>
            </figure>
          </Reveal>

          <ul className="mt-10 grid gap-3 text-sm text-charcoal-soft md:grid-cols-2">
            {principles.map((p, i) => (
              <Reveal key={p} as="li" delay={i * 60} className="flex items-start gap-2.5 rounded-xl border border-bark/10 bg-white px-4 py-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" />
                <span className="text-charcoal">{p}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ————— Honest product preview, in a browser frame. ————— */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="Product preview"
            title="The dashboard the product actually ships"
            sub="This preview renders the application's real components. Panels show honest empty states — the app distinguishes true zeros from data that does not exist yet."
          />
          <Reveal delay={200} className="mt-14">
            <div className="card-shadow-lg overflow-hidden rounded-2xl border border-bark/12">
              <div className="flex items-center gap-3 border-b border-bark/10 bg-mist/80 px-4 py-3">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-clay/50" />
                  <span className="h-2.5 w-2.5 rounded-full bg-fig/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-forest/60" />
                </div>
                <div className="mx-auto flex items-center gap-1.5 rounded-full border border-bark/12 bg-white px-3.5 py-1 text-[11px] font-medium text-charcoal-soft">
                  <ShieldCheck size={11} className="text-forest" aria-hidden="true" />
                  banyan.ai/app
                </div>
                <div className="w-10" aria-hidden="true" />
              </div>
              <div className="bg-white p-5 sm:p-8">
                <PreviewCard />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ————— Channels — capability vs integration, stated precisely. ————— */}
      <section className="border-y border-bark/10 bg-mist py-24">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="Channels"
            title="Stated precisely"
            sub="A capability is what the product can do today. An integration is what requires your own credentials. We distinguish the two everywhere."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {channels.map((c, i) => (
              <Reveal key={c.name} delay={i * 110}>
                <Card className="card-lift card-shadow flex h-full flex-col rounded-2xl p-6">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="flex items-center gap-1.5 rounded-full border border-forest/25 bg-forest/6 px-2.5 py-0.5 text-[11px] font-semibold text-forest">
                      <span className="h-1.5 w-1.5 rounded-full bg-forest" /> Available
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-fig/30 bg-fig/8 px-2.5 py-0.5 text-[11px] font-semibold text-fig-deep">
                      <span className="h-1.5 w-1.5 rounded-full bg-fig" /> Needs your credentials
                    </span>
                  </div>
                  <h3 className="tight mt-5 text-xl font-semibold text-forest-deep">{c.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">{c.available}</p>
                  <p className="mt-3 border-t border-bark/10 pt-3 text-sm leading-relaxed text-charcoal-soft">
                    {c.integration}
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— Final CTA — full sun. ————— */}
      <section className="hero-glow relative overflow-hidden py-28">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Reveal>
            <h2 className="display text-4xl text-forest-deep md:text-5xl">
              Stop treating distribution
              <br />
              as an afterthought.
            </h2>
            <p className="mt-5 text-base text-charcoal-soft md:text-lg">
              Set up your workspace in five minutes. First plan included.
            </p>
            <Link
              href="/signup"
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-forest-deep px-8 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-14px_rgba(18,48,40,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest"
            >
              Start distributing
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ————— Footer ————— */}
      <Footer />
    </div>
  );
}

/** The preview is built from the application's genuine UI primitives, showing
 * truthful empty states rather than fabricated analytics. */
function PreviewCard() {
  return (
    <Card className="card-shadow-lg rounded-2xl bg-white text-charcoal">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bark/10 pb-4">
        <div>
          <p className="text-xs font-medium text-charcoal-soft">Banyan.ai workspace</p>
          <h3 className="tight mt-0.5 text-lg font-semibold text-forest-deep">Distribution dashboard</h3>
        </div>
        <Badge variant="forest">Preview · empty states, not live data</Badge>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Card className="rooted rounded-xl">
          <p className="text-xs font-medium text-charcoal-soft">Active campaign</p>
          <p className="mt-2 text-sm font-medium text-charcoal">First wave: early adopters</p>
          <div className="mt-2.5 flex gap-2">
            <StatusBadge status="draft" />
            <Badge variant="warm">hypotheses</Badge>
          </div>
        </Card>
        <Card className="rooted rounded-xl">
          <p className="text-xs font-medium text-charcoal-soft">Awaiting approval</p>
          <p className="mt-2 text-sm text-charcoal">0 items</p>
          <p className="mt-2 text-xs text-charcoal-soft">Nothing queued right now — a true zero, not missing data.</p>
        </Card>
        <Card className="rooted rounded-xl">
          <p className="text-xs font-medium text-charcoal-soft">Publications</p>
          <p className="mt-2 text-sm text-charcoal">None yet</p>
          <p className="mt-2 text-xs text-charcoal-soft">Publishing starts after you configure a Postiz connection.</p>
        </Card>
      </div>
      <div className="mt-5 rounded-xl border border-bark/10 bg-mist p-4">
        <p className="text-xs font-medium text-charcoal-soft">Recommended next actions</p>
        <ul className="mt-2.5 space-y-1.5 text-sm text-charcoal-soft">
          <li className="flex gap-2"><span className="text-fig-deep">→</span> Complete onboarding to generate your first draft plan</li>
          <li className="flex gap-2"><span className="text-fig-deep">→</span> Create your first campaign from a reviewable theme</li>
          <li className="flex gap-2"><span className="text-fig-deep">→</span> Connect Postiz to enable actual publishing</li>
        </ul>
      </div>
    </Card>
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
            Build. Distribute. Grow. — the agentic operating system for product distribution.
          </p>
        </div>
        <div className="flex gap-14">
          <div>
            <h3 className="text-sm font-semibold text-forest-deep">Product</h3>
            <ul className="mt-3.5 space-y-2.5 text-sm text-charcoal-soft">
              <li><Link href="/#product" className="transition-colors hover:text-forest-deep">Product</Link></li>
              <li><Link href="/#how-it-works" className="transition-colors hover:text-forest-deep">How it works</Link></li>
              <li><Link href="/#philosophy" className="transition-colors hover:text-forest-deep">Philosophy</Link></li>
              <li><Link href="/signup" className="transition-colors hover:text-forest-deep">Start distributing</Link></li>
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
