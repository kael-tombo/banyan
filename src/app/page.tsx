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
    <div className="grain min-h-screen bg-ivory">
      <SiteNav />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-20 md:pt-28">
        <div className="max-w-3xl">
          <Badge variant="forest" className="fade-up">The Agentic Operating System for Product Distribution</Badge>
          <h1 className="serif mt-6 text-4xl font-semibold leading-tight text-forest-deep fade-up fade-up-2 md:text-6xl">
            Build your product.
            <br />
            Let it find its people.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-charcoal-soft fade-up fade-up-3">
            Banyan.ai coordinates AI-powered research, content creation, publishing, and learning into one
            distribution workflow—helping founders reach the people who need their products.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 fade-up fade-up-3">
            <Link
              href="/signup"
              className="rounded-md bg-forest px-5 py-2.5 text-sm font-semibold text-ivory shadow-md hover:bg-forest-deep"
            >
              Start distributing
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-md border border-forest/25 px-5 py-2.5 text-sm font-semibold text-forest-deep hover:bg-forest/5"
            >
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-xs text-charcoal-soft fade-up fade-up-3">
            Banyan.ai is in early development. Every number you see later is real or clearly labeled — never invented traction.
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-bark/10 bg-ivory-deep/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="serif max-w-2xl text-3xl font-semibold text-forest-deep">
            Shipping the product was the easy part.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Card className="card-lift">
              <XCircle className="mb-3 text-clay" aria-hidden="true" />
              <h3 className="font-medium text-charcoal">Adoption is not automatic</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                A good product does not announce itself. Most launches stall because the work of
                reaching people is unowned, inconsistent, and unmeasured.
              </p>
            </Card>
            <Card className="card-lift">
              <Share2 className="mb-3 text-clay" aria-hidden="true" />
              <h3 className="font-medium text-charcoal">Distribution is fragmented</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                Research lives in one tool, writing in another, scheduling in a third, and analytics in a
                fourth tab nobody opens. The connections between them—the actual decisions—are lost.
              </p>
            </Card>
            <Card className="card-lift">
              <LineChart className="mb-3 text-clay" aria-hidden="true" />
              <h3 className="font-medium text-charcoal">Output is not outcome</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">
                Publishing more posts is not distribution. Without experiments and honest learning, teams
                produce content volume and call it progress.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Solution / workflow */}
      <section id="product" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="serif text-3xl font-semibold text-forest-deep">One coordinated workflow</h2>
          <p className="mt-3 max-w-2xl text-charcoal-soft">
            The same loop a strong distribution team runs — coordinated by agents, decided by you.
          </p>
          <nav aria-label="Workflow steps" className="mt-8 flex flex-wrap items-stretch gap-2">
            {workflow.map((step, i) => (
              <div key={step.key} className="flex min-w-fit items-center gap-2">
                <div className="flex w-32 flex-col gap-2 rounded-lg border border-forest/15 bg-white p-3 md:w-auto md:flex-1">
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
                <li className="flex gap-2"><CalendarClock className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Schedules approved content and attempts delivery through the publishing worker.</li>
                <li className="flex gap-2"><Sprout className="mt-0.5 shrink-0 text-moss" size={16} aria-hidden="true" /> Turns tracked links, publications, and metrics into lessons for the next campaign.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — honest product preview */}
      <section id="how-it-works" className="border-y border-bark/10 bg-forest-deep py-20 text-ivory">
        <div className="mx-auto max-w-6xl px-4">
          <Badge variant="forest" className="bg-ivory/10 text-sage border-ivory/20">Product preview</Badge>
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

      {/* Channels */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="serif text-3xl font-semibold text-forest-deep">Channels, stated precisely</h2>
          <p className="mt-3 max-w-2xl text-charcoal-soft">
            A capability is what the product can do today. An integration is what requires your own
            credentials. We distinguish the two everywhere.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {channels.map((c) => (
              <Card key={c.name} className="card-lift flex flex-col">
                <h3 className="serif text-lg font-semibold text-forest-deep">{c.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">
                  <strong className="font-medium text-forest">Available:</strong> {c.available}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">
                  <strong className="font-medium text-clay">Integration:</strong> {c.integration}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section id="philosophy" className="border-y border-bark/10 bg-ivory-deep/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Badge variant="forest">Founding philosophy</Badge>
          <h2 className="serif mt-4 max-w-2xl text-3xl font-semibold text-forest-deep">
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
          <ol className="mt-10 grid gap-4 text-sm text-charcoal-soft md:grid-cols-2">
            {[
              "Distribution is a core product capability, not an afterthought.",
              "Outcomes matter more than content volume.",
              "AI agents coordinate the work; human judgment approves it.",
              "Every campaign produces evidence and learning.",
              "Never invent customers, traction, or research.",
              "Prefer measurable progress over technical complexity.",
            ].map((p, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-ivory px-3 py-2">
                <Sprout className="mt-0.5 shrink-0 text-forest" size={16} aria-hidden="true" />
                {p}
              </li>
            ))}
          </ol>
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
            className="mt-8 inline-block rounded-md bg-forest px-6 py-3 text-sm font-semibold text-ivory shadow-md hover:bg-forest-deep"
          >
            Start distributing
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-bark/10 bg-ivory-deep py-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-8 px-4">
          <div>
            <span className="font-serif text-lg font-semibold text-forest-deep">Banyan<span className="text-moss">.ai</span></span>
            <p className="mt-2 max-w-xs text-sm text-charcoal-soft">Build. Distribute. Grow.</p>
          </div>
          <div className="flex gap-12">
            <div>
              <h3 className="text-sm font-semibold text-charcoal">Product</h3>
              <ul className="mt-3 space-y-2 text-sm text-charcoal-soft">
                <li><Link href="/#product" className="hover:text-forest-deep">Product</Link></li>
                <li><Link href="/#how-it-works" className="hover:text-forest-deep">How it works</Link></li>
                <li><Link href="/signup" className="hover:text-forest-deep">Start distributing</Link></li>
                <li><Link href="/login" className="hover:text-forest-deep">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-charcoal">Legal</h3>
              <ul className="mt-3 space-y-2 text-sm text-charcoal-soft">
                <li><Link href="/privacy" className="hover:text-forest-deep">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-forest-deep">Terms</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-charcoal-soft">
          © {new Date().getFullYear()} Banyan.ai. No invented metrics: what the product reports is what it has measured.
        </p>
      </footer>
    </div>
  );
}

/** The preview is built from the application's genuine UI primitives, showing
 * truthful empty states rather than fabricated analytics. */
function PreviewCard() {
  return (
    <Card className="mt-10 bg-ivory text-charcoal">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bark/10 pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-charcoal-soft">Banyan.ai workspace</p>
          <h3 className="serif text-lg font-semibold text-forest-deep">Distribution dashboard</h3>
        </div>
        <Badge variant="forest">Preview · empty states, not live data</Badge>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Active campaign</p>
          <p className="mt-2 text-sm font-medium text-charcoal">First wave: early adopters</p>
          <div className="mt-2 flex gap-2">
            <StatusBadge status="draft" />
            <Badge variant="warm">hypotheses</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Awaiting approval</p>
          <p className="mt-2 text-sm text-charcoal">0 items</p>
          <p className="mt-2 text-xs text-charcoal-soft">Nothing queued right now — true zero, not missing data.</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Publications</p>
          <p className="mt-2 text-sm text-charcoal">None yet</p>
          <p className="mt-2 text-xs text-charcoal-soft">Publishing starts after you configure a Postiz connection.</p>
        </Card>
      </div>
      <div className="mt-4 rounded-lg bg-ivory p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Recommended next actions</p>
        <ul className="mt-2 space-y-1 text-sm text-charcoal-soft">
          <li>· Complete onboarding to generate your first draft plan</li>
          <li>· Create your first campaign from a reviewable theme</li>
          <li>· Connect Postiz to enable actual publishing</li>
        </ul>
      </div>
    </Card>
  );
}
