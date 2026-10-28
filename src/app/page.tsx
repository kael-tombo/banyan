import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { Badge, Card, StatusBadge } from "@/components/ui";
import {
  Compass, PenLine, SearchCheck, CalendarClock, LineChart, Sprout,
  Share2, CheckCircle2, XCircle, ArrowRight, FlaskConical, Users, Megaphone,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Banyan.ai — Build. Distribute. Grow.",
};

const workflow = [
  { key: "research", label: "Research", icon: SearchCheck },
  { key: "strategize", label: "Strategize", icon: Compass },
  { key: "create", label: "Create", icon: PenLine },
  { key: "review", label: "Review", icon: CheckCircle2 },
  { key: "publish", label: "Publish", icon: Share2 },
  { key: "measure", label: "Measure", icon: LineChart },
  { key: "learn", label: "Learn", icon: Sprout },
  { key: "iterate", label: "Iterate", icon: ArrowRight },
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />

      {/* Hero — the canopy: the whole page hangs from this ink root. */}
      <section className="canopy relative overflow-hidden text-ivory">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-24 md:pt-32">
          <div className="max-w-3xl">
            <Badge variant="forest" className="fade-up border-ivory/25 bg-ivory/10 text-sage">
              The Agentic Operating System for Product Distribution
            </Badge>
            <h1 className="display mt-7 text-5xl fade-up fade-up-2 md:text-7xl">
              Build your product.
              <br />
              Let it find its people.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-sage/90 fade-up fade-up-3">
              Banyan.ai coordinates AI-powered research, content creation, publishing, and learning into one
              distribution workflow—helping founders reach the people who need their products.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3 fade-up fade-up-3">
              <Link
                href="/signup"
                className="rounded-[4px] bg-ivory px-5 py-2.5 text-sm font-semibold text-forest-deep hover:bg-sage"
              >
                Start distributing
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-[4px] border border-ivory/30 px-5 py-2.5 text-sm font-semibold text-ivory hover:border-ivory/60"
              >
                See how it works
              </Link>
            </div>
            <p className="mt-5 text-xs text-sage/70 fade-up fade-up-3">
              Banyan.ai is in early development. Every number you see later is real or clearly labeled — never invented traction.
            </p>
          </div>
        </div>
        {/* The single bold moment: one root line descending and branching into
            the channels the product actually reaches. */}
        <Rootline className="pointer-events-none absolute bottom-0 left-1/2 h-36 w-full max-w-4xl -translate-x-1/2" />
      </section>

      {/* Problem — three roots that never grew. */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="serif max-w-2xl text-3xl font-semibold text-forest-deep">
            Shipping the product was the easy part.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Card className="card-lift rooted">
              <XCircle className="mb-3 text-ember" aria-hidden="true" />
              <h3 className="font-semibold text-charcoal">Adoption is not automatic</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                A good product does not announce itself. Most launches stall because the work of
                reaching people is unowned, inconsistent, and unmeasured.
              </p>
            </Card>
            <Card className="card-lift rooted">
              <Share2 className="mb-3 text-ember" aria-hidden="true" />
              <h3 className="font-semibold text-charcoal">Distribution is fragmented</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                Research lives in one tool, writing in another, scheduling in a third, and analytics in a
                fourth tab nobody opens. The connections between them—the actual decisions—are lost.
              </p>
            </Card>
            <Card className="card-lift rooted">
              <LineChart className="mb-3 text-ember" aria-hidden="true" />
              <h3 className="font-semibold text-charcoal">Output is not outcome</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                Publishing more posts is not distribution. Without experiments and honest learning, teams
                produce content volume and call it progress.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="product" className="border-y border-bark/10 bg-ivory-deep/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="serif text-3xl font-semibold text-forest-deep">One coordinated workflow</h2>
          <p className="mt-3 max-w-2xl text-charcoal-soft">
            The same loop a strong distribution team runs — coordinated by agents, decided by you.
          </p>
          <nav aria-label="Workflow steps" className="mt-8 flex flex-wrap items-stretch gap-2">
            {workflow.map((step, i) => (
              <div key={step.key} className="flex min-w-fit items-center gap-2">
                <div className="flex w-32 flex-col gap-2 rounded-[3px] border border-bark/15 bg-white p-3 md:w-auto md:flex-1">
                  <step.icon className="text-forest" size={18} aria-hidden="true" />
                  <span className="text-sm font-medium text-forest-deep">{step.label}</span>
                </div>
                {i < workflow.length - 1 && <ArrowRight className="hidden text-moss md:block" size={14} aria-hidden="true" />}
              </div>
            ))}
          </nav>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="serif text-xl font-semibold text-forest-deep">What you do</h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal-soft">
                <li className="flex gap-2"><Users className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Define your product, audience, positioning, and one clear distribution goal.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Review every piece of content. Nothing publishes without a human approval recorded in the database.</li>
                <li className="flex gap-2"><Megaphone className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Publish through a genuinely configured connection and see the provider's real response.</li>
                <li className="flex gap-2"><FlaskConical className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" /> Run small experiments and record what you actually observed — not what you hoped.</li>
              </ul>
            </div>
            <div>
              <h3 className="serif text-xl font-semibold text-forest-deep">What the system does</h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal-soft">
                <li className="flex gap-2"><SearchCheck className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Drafts research hypotheses and positioning you can accept, edit, or reject.</li>
                <li className="flex gap-2"><PenLine className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Generates channel-specific content in your brand voice, with revisions preserved.</li>
                <li className="flex gap-2"><CalendarClock className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Schedules approved content and attempts delivery through the publishing worker — retrying transient failures with backoff.</li>
                <li className="flex gap-2"><Sprout className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Turns tracked links, publications, and metrics into lessons for the next campaign.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Honest product preview */}
      <section id="how-it-works" className="canopy py-20 text-ivory">
        <div className="mx-auto max-w-6xl px-4">
          <Badge variant="forest" className="border-ivory/20 bg-ivory/10 text-sage">Product preview</Badge>
          <h2 className="serif mt-4 max-w-2xl text-3xl font-semibold">
            The dashboard the product actually ships
          </h2>
          <p className="mt-3 max-w-2xl text-sage/80">
            This preview renders the application's real components. Panels show honest empty states — the
            app distinguishes true zeros from data that does not exist yet. No fabricated analytics.
          </p>
          <PreviewCard />
        </div>
      </section>

      {/* Channels — capability vs integration, stated precisely */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="serif text-3xl font-semibold text-forest-deep">Channels, stated precisely</h2>
          <p className="mt-3 max-w-2xl text-charcoal-soft">
            A capability is what the product can do today. An integration is what requires your own
            credentials. We distinguish the two everywhere.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {channels.map((c) => (
              <Card key={c.name} className="card-lift rooted-fig flex flex-col">
                <h3 className="serif text-lg font-semibold text-forest-deep">{c.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">
                  <strong className="font-semibold text-forest">Available.</strong> {c.available}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">
                  <strong className="font-semibold text-fig-deep">Needs your credentials.</strong> {c.integration}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section id="philosophy" className="border-y border-bark/10 bg-ivory-deep/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="serif max-w-2xl text-3xl font-semibold text-forest-deep">
            Banyan.ai is its own first customer.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <p className="text-sm leading-relaxed text-charcoal-soft">
              The workspace you would use if you signed up today is the same workspace the team uses to
              distribute Banyan.ai itself. The product researches its own audience, drafts its own
              campaign themes, runs its own approval queue, publishes through the same Postiz
              integration you would configure, and records its own experiments.
            </p>
            <p className="text-sm leading-relaxed text-charcoal-soft">
              That is the founding principle in practice: if the workflows cannot move a real product's
              growth, no amount of interface polish excuses them. Every lesson the team logs in
              Banyan's own workspace is a prioritization decision for the next build cycle — treating
              observed bottlenecks as hypotheses to investigate, not conclusions.
            </p>
          </div>
          <ul className="mt-10 grid gap-4 text-sm text-charcoal-soft md:grid-cols-2">
            {[
              "Distribution is a core product capability, not an afterthought.",
              "Outcomes matter more than content volume.",
              "AI agents coordinate the work; human judgment approves it.",
              "Every campaign produces evidence and learning.",
              "Never invent customers, traction, or research.",
              "Prefer measurable progress over technical complexity.",
            ].map((p) => (
              <li key={p} className="flex items-start gap-2 rounded-[3px] bg-white px-3 py-2 rooted">
                <Sprout className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" />
                <span className="text-forest-deep">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="serif text-3xl font-semibold text-forest-deep md:text-4xl">
            Stop treating distribution as an afterthought.
          </h2>
          <p className="mt-4 text-charcoal-soft">Set up your workspace in five minutes. First plan included.</p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-[4px] bg-forest-deep px-6 py-3 text-sm font-semibold text-ivory hover:bg-forest"
          >
            Start distributing
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

/**
 * The one orchestrated visual: a root line growing out of the canopy band,
 * branching into the channels. Drawn once on load; static under reduced motion.
 */
function Rootline({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1040 150" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMax meet" className={className}>
      <path
        className="rootline"
        d="M520 0 V34 C520 58 520 66 520 88 C520 104 520 112 520 128"
        stroke="var(--color-sage)"
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <path
        className="rootline"
        d="M520 88 C 440 100, 380 112, 320 132"
        stroke="var(--color-sage)"
        strokeOpacity="0.5"
        strokeWidth="1.2"
      />
      <path
        className="rootline"
        d="M520 88 C 600 100, 660 112, 720 132"
        stroke="var(--color-sage)"
        strokeOpacity="0.5"
        strokeWidth="1.2"
      />
      <path
        className="rootline"
        d="M520 128 C 520 136, 520 142, 520 148"
        stroke="var(--color-fig)"
        strokeWidth="1.6"
      />
      <circle className="fill-fig" cx="320" cy="132" r="3" />
      <circle className="fill-fig" cx="720" cy="132" r="3" />
      <circle className="fill-fig" cx="520" cy="148" r="3" />
    </svg>
  );
}

/** The preview is built from the application's genuine UI primitives, showing
 * truthful empty states rather than fabricated analytics. */
function PreviewCard() {
  return (
    <Card className="mt-10 bg-white text-charcoal">
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
      <div className="mt-4 rounded-[3px] border border-bark/10 bg-ivory p-4">
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
    <footer className="canopy border-t border-bark/10 py-12 text-ivory">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-8 px-4">
        <div>
          <span className="font-serif text-lg font-semibold">Banyan<span className="text-fig">.ai</span></span>
          <p className="mt-2 max-w-xs text-sm text-sage/70">Build. Distribute. Grow.</p>
        </div>
        <div className="flex gap-12">
          <div>
            <h3 className="text-sm font-semibold">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-sage/80">
              <li><Link href="/#product" className="hover:text-ivory">Product</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-ivory">How it works</Link></li>
              <li><Link href="/signup" className="hover:text-ivory">Start distributing</Link></li>
              <li><Link href="/login" className="hover:text-ivory">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm text-sage/80">
              <li><Link href="/privacy" className="hover:text-ivory">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-ivory">Terms</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-sage/60">
        © {new Date().getFullYear()} Banyan.ai. No invented metrics: what the product reports is what it has measured.
      </p>
    </footer>
  );
}
