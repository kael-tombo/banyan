import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SiteNav } from "@/components/SiteNav";
import { Reveal } from "@/components/Reveal";
import { WorkflowFlow } from "@/components/landing/WorkflowFlow";
import { BanyanTree } from "@/components/landing/BanyanTree";
import { Badge, Card, StatusBadge } from "@/components/ui";
import {
  PenLine, SearchCheck, CalendarClock, LineChart, Sprout,
  Share2, CheckCircle2, XCircle, FlaskConical, Users, Megaphone,
  ShieldCheck, Plug, Workflow, GitBranch, Database, Umbrella, Eye, ReceiptText,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Banyan.ai — Build. Distribute. Grow.",
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
    body: "A banyan anchors deep before it rises. Banyan.ai keeps your product facts, audience, and voice as provenance-tracked memory — every agent, draft, and plan reads from the same living record, so nothing starts from zero.",
  },
  {
    icon: Workflow,
    stage: "Trunk",
    title: "One orchestrator",
    body: "A single trunk carries every branch. One runtime owns the state of every goal, task, and run — claiming work atomically, recovering from crashes with leases, and never letting two agents do the same job twice.",
  },
  {
    icon: GitBranch,
    stage: "Aerial roots",
    title: "Channels that become trunks",
    body: "A banyan drops roots from its branches; when they touch ground they thicken into load-bearing trunks. Start with one channel and one goal — each root you grow becomes self-supporting, until one tree holds up a forest.",
  },
  {
    icon: Umbrella,
    stage: "Canopy",
    title: "Shelter for judgment",
    body: "The canopy shades the ground where new life grows. Agents do the carrying; people decide in the shade. Every plan, every draft, every publish waits for a human approval recorded in the database — by design, not by promise.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />

      {/* Hero — white paper, full sun. The tree grows on load: trunk, branches,
          canopy, then aerial roots becoming trunks. */}
      <section className="hero-light hero-light-drift relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-16 md:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-24">
          <div className="max-w-2xl">
            <Badge variant="forest" className="fade-up border-forest/15 bg-forest/5 text-forest">
              The Agentic Operating System for Product Distribution
            </Badge>
            <h1 className="display mt-6 text-5xl text-forest-deep fade-up fade-up-2 md:text-6xl lg:text-7xl">
              Build your product.
              <br />
              Let it find its people.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-charcoal-soft fade-up fade-up-3">
              Banyan.ai coordinates AI-powered research, content creation, publishing, and learning into one
              distribution workflow — helping founders reach the people who need their products.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 fade-up fade-up-3">
              <Link
                href="/signup"
                className="rounded-[4px] bg-forest-deep px-5 py-2.5 text-sm font-semibold text-ivory shadow-[0_10px_30px_-12px_rgba(18,48,40,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest"
              >
                Start distributing
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-[4px] border border-bark/25 bg-white px-5 py-2.5 text-sm font-semibold text-forest-deep transition-colors hover:border-forest"
              >
                See how it works
              </Link>
            </div>
            <p className="mt-5 max-w-xl text-xs leading-relaxed text-charcoal-soft/80 fade-up fade-up-3">
              Banyan.ai is in early development. Every number you see later is real or clearly labeled — never invented traction.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[420px] sm:max-w-[520px] lg:max-w-none">
            <BanyanTree className="h-auto w-full" />
          </div>
        </div>

        {/* Trust strip — the honest trio, under the tree. */}
        <div className="border-t border-bark/10">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, text: "Nothing publishes without your approval" },
              { icon: Plug, text: "Real connections, or honest blocks" },
              { icon: FlaskConical, text: "Measured, never invented" },
            ].map((t, i) => (
              <Reveal key={t.text} delay={i * 90} className="flex items-center justify-center gap-2.5">
                <t.icon className="shrink-0 text-forest" size={16} aria-hidden="true" />
                <span className="text-sm font-medium text-charcoal-soft">{t.text}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Problem — three roots that never grew. */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal as="h2" className="serif max-w-2xl text-3xl font-semibold text-forest-deep md:text-4xl">
            Shipping the product was the easy part.
          </Reveal>
          <Reveal as="p" delay={100} className="mt-3 max-w-2xl text-charcoal-soft">
            A seedling without roots is a David without his banyan — sheltered by nothing, reached by no one.
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Reveal delay={0}>
              <Card className="card-lift card-shadow h-full rooted">
                <XCircle className="mb-3 text-clay" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Adoption is not automatic</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  A good product does not announce itself. Most launches stall because the work of
                  reaching people is unowned, inconsistent, and unmeasured.
                </p>
              </Card>
            </Reveal>
            <Reveal delay={90}>
              <Card className="card-lift card-shadow h-full rooted">
                <Share2 className="mb-3 text-clay" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Distribution is fragmented</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Research lives in one tool, writing in another, scheduling in a third, and analytics in a
                  fourth tab nobody opens. The connections between them—the actual decisions—are lost.
                </p>
              </Card>
            </Reveal>
            <Reveal delay={180}>
              <Card className="card-lift card-shadow h-full rooted">
                <LineChart className="mb-3 text-clay" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Output is not outcome</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Publishing more posts is not distribution. Without experiments and honest learning, teams
                  produce content volume and call it progress.
                </p>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Bento — the agentic runtime, one tree many trunks. */}
      <section id="product" className="border-y border-bark/10 bg-mist py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal as="h2" className="serif text-3xl font-semibold text-forest-deep md:text-4xl">
            One tree. Many trunks.
          </Reveal>
          <Reveal as="p" delay={100} className="mt-3 max-w-2xl text-charcoal-soft">
            The runtime grows capabilities the way a banyan grows roots — each one starts thin, then becomes
            load-bearing on its own. This is what ships today, not a roadmap.
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {/* Large: goal → plan → executed work */}
            <Reveal className="md:col-span-2">
              <Card className="card-lift card-shadow flex h-full flex-col">
                <div className="flex items-center gap-2">
                  <Sprout className="text-forest" size={18} aria-hidden="true" />
                  <h3 className="serif text-lg font-semibold text-forest-deep">Goals that execute themselves</h3>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-charcoal-soft">
                  State a goal in plain language. The planner drafts a task graph — research, strategy,
                  content, approvals, publishing — with dependencies and gates. An orchestrator claims work
                  atomically, retries transient failures, and recovers from crashes with leases. You watch it
                  happen, and you decide what ships.
                </p>
                {/* Mini pipeline: the real shape of a plan, drawn quietly. */}
                <div className="mt-auto pt-6" aria-hidden="true">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {["research", "strategy", "campaign", "draft", "approval", "publish", "measure"].map((step, i) => (
                      <span key={step} className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            step === "approval"
                              ? "border-fig/40 bg-fig/10 text-fig-deep"
                              : "border-bark/15 bg-white text-charcoal-soft"
                          }`}
                        >
                          {step}
                        </span>
                        {i < 6 && <span className="text-bark/40">→</span>}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-charcoal-soft/75">
                    The gold gate is yours: publishing waits for a recorded human decision.
                  </p>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={90}>
              <Card className="card-lift card-shadow h-full rooted">
                <Database className="mb-3 text-forest" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Persistent business context</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Product facts, audience, and voice live as provenance-tracked memory. Every draft cites what
                  it knows, and uncertainty is disclosed — never guessed away.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden="true">
                  <span className="rounded-full border border-forest/25 bg-forest/5 px-2 py-0.5 text-xs text-forest">verified</span>
                  <span className="rounded-full border border-bark/15 bg-white px-2 py-0.5 text-xs text-charcoal-soft">user_provided</span>
                  <span className="rounded-full border border-bark/15 bg-white px-2 py-0.5 text-xs text-charcoal-soft">observed</span>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={0}>
              <Card className="card-lift card-shadow h-full rooted">
                <ShieldCheck className="mb-3 text-forest" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Human approval gates</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Publishing waits for a recorded human decision — stored in the database with who approved
                  and when. Nothing ships unreviewed, and the record is inspectable.
                </p>
              </Card>
            </Reveal>

            <Reveal delay={90}>
              <Card className="card-lift card-shadow h-full rooted">
                <ReceiptText className="mb-3 text-forest" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Model routing with receipts</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Managed credentials first, your keys when you add them, daily quotas per workspace — and a
                  usage ledger that records every call and its cost.
                </p>
              </Card>
            </Reveal>

            <Reveal delay={180}>
              <Card className="card-lift card-shadow h-full rooted">
                <Plug className="mb-3 text-forest" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Capability adapters, honest status</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Integrations declare what they can do today: available, needs credentials, unverified, or
                  unavailable. The product shows you which — and never fakes a success.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden="true">
                  <span className="flex items-center gap-1 rounded-full border border-forest/25 bg-forest/5 px-2 py-0.5 text-xs text-forest">
                    <span className="h-1.5 w-1.5 rounded-full bg-forest" /> available
                  </span>
                  <span className="flex items-center gap-1 rounded-full border border-bark/15 bg-white px-2 py-0.5 text-xs text-charcoal-soft">
                    <span className="h-1.5 w-1.5 rounded-full bg-fig" /> needs credentials
                  </span>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={0}>
              <Card className="card-lift card-shadow h-full rooted-fig">
                <Eye className="mb-3 text-fig-deep" aria-hidden="true" />
                <h3 className="font-semibold text-charcoal">Verified outputs, named schemas</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                  Every agent hand-off is validated against a named schema before the next task starts.
                  Work is done when it is correct — not when it says it is.
                </p>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal as="h2" className="serif text-3xl font-semibold text-forest-deep md:text-4xl">
            The same loop a strong distribution team runs
          </Reveal>
          <Reveal as="p" delay={100} className="mt-3 max-w-2xl text-charcoal-soft">
            Coordinated by agents, decided by you. Four moves, repeated until the product finds its people.
          </Reveal>

          <ol className="mt-12 grid gap-8 md:grid-cols-4">
            {[
              { n: "01", title: "State a goal", body: "Type what you want in plain language — the planner turns it into a reviewable task graph." },
              { n: "02", title: "Approve the plan", body: "Every task, dependency, and gate is visible before any agent starts work." },
              { n: "03", title: "Agents execute", body: "Research, strategy, and drafts run through verified hand-offs; you approve what ships." },
              { n: "04", title: "Publish & learn", body: "Real connections deliver; results come back as evidence for the next cycle." },
            ].map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 110} className="relative">
                <span className="serif block text-sm font-semibold tracking-widest text-fig-deep" aria-hidden="true">{s.n}</span>
                <h3 className="serif mt-2 text-lg font-semibold text-forest-deep">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{s.body}</p>
                {i < 3 && (
                  <span className="absolute -right-4 top-1 hidden text-bark/30 md:block" aria-hidden="true">→</span>
                )}
              </Reveal>
            ))}
          </ol>

          <div className="mt-12">
            <WorkflowFlow steps={workflow} />
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <Reveal delay={0}>
              <h3 className="serif text-xl font-semibold text-forest-deep">What you do</h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal-soft">
                <li className="flex gap-2"><Users className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Define your product, audience, positioning, and one clear distribution goal.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Review every piece of content. Nothing publishes without a human approval recorded in the database.</li>
                <li className="flex gap-2"><Megaphone className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Publish through a genuinely configured connection and see the provider's real response.</li>
                <li className="flex gap-2"><FlaskConical className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Run small experiments and record what you actually observed — not what you hoped.</li>
              </ul>
            </Reveal>
            <Reveal delay={120}>
              <h3 className="serif text-xl font-semibold text-forest-deep">What the system does</h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal-soft">
                <li className="flex gap-2"><SearchCheck className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Drafts research hypotheses and positioning you can accept, edit, or reject.</li>
                <li className="flex gap-2"><PenLine className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Generates channel-specific content in your brand voice, with revisions preserved.</li>
                <li className="flex gap-2"><CalendarClock className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Schedules approved content and attempts delivery through the publishing worker — retrying transient failures with backoff.</li>
                <li className="flex gap-2"><Sprout className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Turns tracked links, publications, and metrics into lessons for the next campaign.</li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Philosophy — how a banyan grows. */}
      <section id="philosophy" className="border-y border-bark/10 bg-mist py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal as="h2" className="serif max-w-2xl text-3xl font-semibold text-forest-deep md:text-4xl">
            How a banyan grows.
          </Reveal>
          <Reveal as="p" delay={100} className="mt-3 max-w-2xl text-charcoal-soft">
            The tree the product is named for teaches its design. Every part of a banyan has a job — and so
            does every part of Banyan.ai.
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {growthStages.map((g, i) => (
              <Reveal key={g.stage} delay={i * 100}>
                <Card className="card-lift card-shadow flex h-full flex-col bg-white">
                  <div className="flex items-center gap-2">
                    <g.icon className="text-forest" size={18} aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-fig-deep">{g.stage}</span>
                  </div>
                  <h3 className="serif mt-3 text-lg font-semibold text-forest-deep">{g.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{g.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <Reveal as="p" delay={0} className="text-sm leading-relaxed text-charcoal-soft">
              Banyan.ai is its own first customer. The workspace you would use if you signed up today is the
              same workspace the team uses to distribute Banyan.ai itself. The product researches its own
              audience, drafts its own campaign themes, runs its own approval queue, publishes through the
              same Postiz integration you would configure, and records its own experiments.
            </Reveal>
            <Reveal as="p" delay={120} className="text-sm leading-relaxed text-charcoal-soft">
              That is the founding principle in practice: if the workflows cannot move a real product's
              growth, no amount of interface polish excuses them. Every lesson the team logs in Banyan's own
              workspace is a prioritization decision for the next build cycle — treating observed
              bottlenecks as hypotheses to investigate, not conclusions.
            </Reveal>
          </div>

          <ul className="mt-10 grid gap-3 text-sm text-charcoal-soft md:grid-cols-2">
            {principles.map((p, i) => (
              <Reveal key={p} as="li" delay={i * 60} className="flex items-start gap-2 rounded-[3px] border border-bark/10 bg-white px-3 py-2 rooted">
                <Sprout className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" />
                <span className="text-forest-deep">{p}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Honest product preview */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Badge variant="forest" className="border-forest/15 bg-forest/5 text-forest">Product preview</Badge>
          <Reveal as="h2" className="serif mt-4 max-w-2xl text-3xl font-semibold text-forest-deep md:text-4xl">
            The dashboard the product actually ships
          </Reveal>
          <Reveal as="p" delay={100} className="mt-3 max-w-2xl text-charcoal-soft">
            This preview renders the application's real components. Panels show honest empty states — the
            app distinguishes true zeros from data that does not exist yet. No fabricated analytics.
          </Reveal>
          <Reveal delay={200} className="mt-10">
            <PreviewCard />
          </Reveal>
        </div>
      </section>

      {/* Channels — capability vs integration, stated precisely */}
      <section className="border-t border-bark/10 bg-mist py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal as="h2" className="serif text-3xl font-semibold text-forest-deep md:text-4xl">Channels, stated precisely</Reveal>
          <Reveal as="p" delay={100} className="mt-3 max-w-2xl text-charcoal-soft">
            A capability is what the product can do today. An integration is what requires your own
            credentials. We distinguish the two everywhere.
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {channels.map((c, i) => (
              <Reveal key={c.name} delay={i * 110}>
                <Card className="card-lift card-shadow flex h-full flex-col rooted-fig">
                  <h3 className="serif text-lg font-semibold text-forest-deep">{c.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">
                    <strong className="font-semibold text-forest">Available.</strong> {c.available}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">
                    <strong className="font-semibold text-fig-deep">Needs your credentials.</strong> {c.integration}
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Reveal>
            <h2 className="serif text-3xl font-semibold text-forest-deep md:text-4xl">
              Stop treating distribution as an afterthought.
            </h2>
            <p className="mt-4 text-charcoal-soft">Set up your workspace in five minutes. First plan included.</p>
            <Link
              href="/signup"
              className="mt-8 inline-block rounded-[4px] bg-forest-deep px-6 py-3 text-sm font-semibold text-ivory shadow-[0_10px_30px_-12px_rgba(18,48,40,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest hover:shadow-[0_16px_36px_-12px_rgba(18,48,40,0.65)]"
            >
              Start distributing
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

/** The preview is built from the application's genuine UI primitives, showing
 * truthful empty states rather than fabricated analytics. */
function PreviewCard() {
  return (
    <Card className="card-shadow-lg bg-white text-charcoal">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bark/10 pb-3">
        <div>
          <p className="text-sm font-medium text-charcoal-soft">Banyan.ai workspace</p>
          <h3 className="serif text-lg font-semibold text-forest-deep">Distribution dashboard</h3>
        </div>
        <Badge variant="forest">Preview · empty states, not live data</Badge>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className="rooted">
          <p className="text-xs font-medium text-charcoal-soft">Active campaign</p>
          <p className="mt-2 text-sm font-medium text-charcoal">First wave: early adopters</p>
          <div className="mt-2 flex gap-2">
            <StatusBadge status="draft" />
            <Badge variant="warm">hypotheses</Badge>
          </div>
        </Card>
        <Card className="rooted">
          <p className="text-xs font-medium text-charcoal-soft">Awaiting approval</p>
          <p className="mt-2 text-sm text-charcoal">0 items</p>
          <p className="mt-2 text-xs text-charcoal-soft">Nothing queued right now — a true zero, not missing data.</p>
        </Card>
        <Card className="rooted">
          <p className="text-xs font-medium text-charcoal-soft">Publications</p>
          <p className="mt-2 text-sm text-charcoal">None yet</p>
          <p className="mt-2 text-xs text-charcoal-soft">Publishing starts after you configure a Postiz connection.</p>
        </Card>
      </div>
      <div className="mt-4 rounded-[3px] border border-bark/10 bg-mist p-4">
        <p className="text-xs font-medium text-charcoal-soft">Recommended next actions</p>
        <ul className="mt-2 space-y-1 text-sm text-charcoal-soft">
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
    <footer className="border-t border-bark/10 bg-paper py-12">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-8 px-4">
        <div>
          <span className="flex items-center gap-2.5">
            <Image src="/brand/symbol-color.png" alt="" width={30} height={30} />
            <span className="font-serif text-lg font-semibold text-forest-deep">Banyan<span className="text-moss">.ai</span></span>
          </span>
          <p className="mt-2 max-w-xs text-sm text-charcoal-soft">Build. Distribute. Grow.</p>
        </div>
        <div className="flex gap-12">
          <div>
            <h3 className="text-sm font-semibold text-forest-deep">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-charcoal-soft">
              <li><Link href="/#product" className="hover:text-forest-deep">Product</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-forest-deep">How it works</Link></li>
              <li><Link href="/#philosophy" className="hover:text-forest-deep">Philosophy</Link></li>
              <li><Link href="/signup" className="hover:text-forest-deep">Start distributing</Link></li>
              <li><Link href="/login" className="hover:text-forest-deep">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-forest-deep">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm text-charcoal-soft">
              <li><Link href="/privacy" className="hover:text-forest-deep">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-forest-deep">Terms</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-charcoal-soft/70">
        © {new Date().getFullYear()} Banyan.ai. No invented metrics: what the product reports is what it has measured.
      </p>
    </footer>
  );
}
