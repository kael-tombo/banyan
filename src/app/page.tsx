import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { Reveal } from "@/components/Reveal";
import { CycleWalkthrough } from "@/components/landing/CycleWalkthrough";
import { CycleRecord } from "@/components/landing/CycleRecord";
import { BuildPlanForm } from "@/components/landing/BuildPlanForm";
import { BanyanMark } from "@/components/BanyanMark";
import { HeroCycle } from "@/components/landing/HeroCycle";
import { FragmentedDistribution } from "@/components/landing/landscape/FragmentedDistribution";
import { ArrowDown, ArrowRight, BarChart3, PenLine, Plug, ShieldCheck } from "lucide-react";

// Approved execution is the honest claim (STRATEGY.md §12): Banyan's agents do the work between the founder's
// decisions, and nothing goes out without one. "Autonomous" stays off the page until Level 3 is real.
export const metadata: Metadata = {
  title: { absolute: "Banyan.ai: distribution cycles for founders, approved by you" },
  description:
    "Banyan turns each product update into a strategy and channel-native drafts for LinkedIn and X, waits for your approval, publishes, and measures what came back in first-party visits and signups.",
};

const SIGNUP = "/signup?next=%2Fapp%2Fcycles%2Fnew";

const problems = [
  {
    q: "What do I even say?",
    body: "You shipped something you're proud of. Then you opened a blank composer and spent an hour trying to make it sound worth posting.",
    truth: "A blank page is a strategy problem",
  },
  {
    q: "Why does every channel need a different version?",
    body: "The same update has to become a thread, a post and a 30-second script. Rewriting it three ways is a day you didn't have.",
    truth: "One idea is not three assets",
  },
  {
    q: "Did that post bring anyone?",
    body: "Likes climb. Signups don't. Without tracked links, you can't tell whether the post worked or the algorithm just had a good day.",
    truth: "Engagement is not evidence",
  },
];

/** What every cycle leaves behind, whatever its verdict. */
const outcomes = [
  { icon: PenLine, title: "Three approved assets", body: "Each written for its format, and kept for the next cycle to build on." },
  { icon: Plug, title: "Confirmed publications, or an honest block", body: "The provider's response is recorded. A missing connection is blocked, never faked." },
  { icon: BarChart3, title: "A verdict and the next move", body: "Measured in first-party visits and signups, or reported as not enough data." },
];

const boundaries = [
  {
    icon: ShieldCheck,
    title: "You approve everything that goes out",
    body: "A recorded human decision gates every asset. Editing approved copy resets the gate.",
  },
  {
    icon: BarChart3,
    title: "A result is a visit or a signup",
    body: "Not an impression, not a projected lift. A real zero stays a zero, and missing data is named.",
  },
  {
    icon: Plug,
    title: "No connection, no fake success",
    body: "A blocked publication is recorded as blocked, with the setup step attached.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="block text-sm font-medium text-forest">{children}</span>;
}

/** The section opening used across the page: the heading leads, the paragraph sits beside it on wide screens. */
function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end lg:gap-12">
      <div>
        <Reveal as="p"><Eyebrow>{eyebrow}</Eyebrow></Reveal>
        <Reveal as="h2" delay={80} className="mt-3 max-w-2xl font-serif text-[2rem] leading-[1.12] text-forest-deep md:text-[2.75rem]">
          {title}
        </Reveal>
      </div>
      <Reveal as="p" delay={140} className="text-base leading-relaxed text-charcoal-soft md:text-lg">
        {children}
      </Reveal>
    </div>
  );
}

const PRIMARY_CTA =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-forest-deep px-6 text-[15px] font-medium text-ivory transition-[background-color,transform] duration-150 hover:bg-forest active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-forest/25";
const SECONDARY_CTA =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-bark/15 bg-paper px-6 text-[15px] font-medium text-charcoal transition-[border-color,transform] duration-150 hover:border-bark/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-forest/25";

export default function LandingPage() {
  return (
    <div className="landing min-h-screen bg-paper">
      <SiteNav cta="Start a cycle" ctaHref={SIGNUP} />

      <main>
        {/* ————— Hero: the promise on the left, the product stopped at the founder's gate on the right. ————— */}
        <section className="relative overflow-hidden border-b border-bark/10 bg-ivory">
          <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16 lg:py-20">
            <div>
              <p className="text-sm font-medium text-forest sm:text-[15px]">Distribution for founders who ship</p>
              <h1 className="mt-5 font-serif text-[2.75rem] leading-[1.04] text-forest-deep sm:text-[3.5rem] lg:text-[3.75rem] xl:text-[4.25rem]">
                <span className="block">You build it.</span>
                <span className="block lg:whitespace-nowrap">Banyan gets it out.</span>
              </h1>
              <p className="mt-6 max-w-[34rem] text-[17px] leading-[1.6] text-charcoal-soft sm:text-lg">
                Each update becomes a strategy and channel-native drafts for LinkedIn and X. You approve them, Banyan
                publishes, then measures what came back in visits and signups and proposes the next move.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href={SIGNUP} className={PRIMARY_CTA}>
                  Start a cycle <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="#how-it-works" className={SECONDARY_CTA}>
                  See how it works <ArrowDown size={16} aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
                <span className="h-2 w-2 rounded-full bg-fig" aria-hidden="true" />
                Nothing is published without your approval
              </p>
            </div>

            <div className="lg:pl-4">
              <HeroCycle />
            </div>
          </div>
        </section>

        {/* ————— What is live today, in one plain line each. ————— */}
        <section className="border-b border-bark/10 bg-paper py-4" aria-label="What Banyan publishes to today">
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-center text-[13px] text-charcoal-soft">
            <li>LinkedIn and X: drafted, approved, then published or exported with the live link recorded</li>
            <li className="text-muted">Short video: a script and a manual handoff</li>
            <li className="text-muted">Results: first-party clicks and signups</li>
          </ul>
        </section>

        {/* ————— The problem: distribution in fragments. ————— */}
        <section id="problem" className="bg-paper py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHead eyebrow="The real problem" title="The job you never applied for">
              Distribution has become a second full-time job: learn each platform, write every format, publish
              consistently, and prove it worked. The product gets the leftover time.
            </SectionHead>

            <Reveal delay={120} className="mt-12">
              <FragmentedDistribution />
            </Reveal>

            <ol className="mt-10 border-t border-bark/10">
              {problems.map((problem, i) => (
                <Reveal as="li" key={problem.q} delay={i * 60}>
                  <div className="grid gap-3 border-b border-bark/10 py-6 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.7fr)] md:gap-8">
                    <span className="num font-mono text-xs text-muted md:pt-1.5">0{i + 1}</span>
                    <h3 className="font-serif text-[21px] leading-snug text-forest-deep">{problem.q}</h3>
                    <p className="text-sm leading-relaxed text-charcoal-soft">{problem.body}</p>
                    <p className="text-[13px] font-medium text-clay md:pt-1">{problem.truth}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ————— How it works: one cycle, stage by stage. ————— */}
        <section id="how-it-works" className="border-y border-bark/10 bg-mist py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHead eyebrow="How it works" title="Seven stages, two of them yours">
              The scattered week above becomes one cycle with a shared plan. You bring the product and make the call;
              Banyan&apos;s agents do the research, the strategy, the writing, the publishing and the measurement in
              between, and stop at the gates that are yours.
            </SectionHead>

            <Reveal delay={120} className="mt-12">
              <CycleWalkthrough />
            </Reveal>
          </div>
        </section>

        {/* ————— The result: cycles that build on each other. ————— */}
        <section id="result" className="bg-paper py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHead eyebrow="The result" title="A repeatable cycle, not a lucky post">
              One post can get lucky. A cycle ends with a verdict, even when the verdict is &ldquo;not enough
              data&rdquo;, and whatever it learned becomes the starting point of the next one.
            </SectionHead>

            <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] lg:gap-12">
              <div className="lg:sticky lg:top-24">
                <p className="text-[13px] text-muted">Every cycle leaves</p>
                <ul className="mt-4 divide-y divide-bark/10 border-y border-bark/10">
                  {outcomes.map((outcome) => (
                    <li key={outcome.title} className="flex gap-4 py-5">
                      <outcome.icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
                      <div>
                        <h3 className="text-base font-medium text-forest-deep">{outcome.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-charcoal-soft">{outcome.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <Reveal delay={120}>
                <CycleRecord />
              </Reveal>
            </div>

            <p className="mt-8 text-[13px] text-muted">
              Ledgerline and its posts are fictional and illustrative. The live app starts from empty states and shows
              only recorded numbers.
            </p>
          </div>
        </section>

        {/* ————— The boundary: the trust case, in three lines. ————— */}
        <section id="trust" className="border-y border-bark/10 bg-ivory py-20 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <Eyebrow>The boundary</Eyebrow>
              <h2 className="mt-3 font-serif text-[2rem] leading-[1.12] text-forest-deep md:text-[2.75rem]">
                Simple on purpose, honest by design
              </h2>
              <p className="mt-4 text-base leading-relaxed text-charcoal-soft md:text-lg">
                Agents without evidence are just risk. These are the rules the product actually enforces.
              </p>
            </div>

            <div className="mt-12 grid gap-8 border-t border-bark/15 pt-8 md:grid-cols-3">
              {boundaries.map((boundary) => (
                <div key={boundary.title}>
                  <boundary.icon size={18} strokeWidth={1.5} className="text-forest" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-medium text-forest-deep">{boundary.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{boundary.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ————— The ask: one action, or start straight from the product URL. ————— */}
        <section id="start" className="bg-forest-deep py-24 md:py-32">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <h2 className="font-serif text-[2.5rem] leading-[1.08] text-ivory md:text-[3.25rem]">
              Bring one product and one objective
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-rail-ink md:text-lg">
              Banyan drafts the strategy and three assets, then waits for your approval. No content calendar, no
              platform homework, no virality guarantees.
            </p>
            <div className="mx-auto mt-10 max-w-xl rounded-2xl bg-paper p-5 text-left sm:p-6">
              <p className="text-[13px] text-muted">Start from your product URL</p>
              <div className="mt-3">
                <BuildPlanForm />
              </div>
            </div>
            <p className="mt-6 text-[13px] text-rail-muted">
              Or{" "}
              <Link href={SIGNUP} className="text-ivory underline decoration-rail-muted underline-offset-4 hover:decoration-ivory">
                create an account first
              </Link>
            </p>
          </div>
        </section>
      </main>

      {/* ————— Footer: the same facts, no extra surface. ————— */}
      <footer className="border-t border-bark/10 bg-paper py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="flex items-center gap-2.5">
              <BanyanMark size={28} />
              <span className="text-lg font-medium text-forest-deep">
                Banyan<span className="text-moss">.ai</span>
              </span>
            </span>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-charcoal-soft">
              Distribution cycles for founders. You build it and approve it; Banyan&apos;s agents get it out and measure
              what came back.
            </p>
          </div>

          <nav className="flex gap-12" aria-label="Footer">
            <div>
              <h3 className="text-sm font-medium text-forest-deep">Product</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/#how-it-works" className="text-charcoal-soft hover:text-forest-deep">How it works</Link></li>
                <li><Link href="/#result" className="text-charcoal-soft hover:text-forest-deep">The result</Link></li>
                <li><Link href="/#trust" className="text-charcoal-soft hover:text-forest-deep">Trust</Link></li>
                <li><Link href={SIGNUP} className="text-charcoal-soft hover:text-forest-deep">Start a cycle</Link></li>
                <li><Link href="/login" className="text-charcoal-soft hover:text-forest-deep">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-forest-deep">Legal</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/privacy" className="text-charcoal-soft hover:text-forest-deep">Privacy</Link></li>
                <li><Link href="/terms" className="text-charcoal-soft hover:text-forest-deep">Terms</Link></li>
              </ul>
            </div>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl px-4 text-[13px] text-muted">
          © {new Date().getFullYear()} Banyan.ai. No invented metrics: what the product reports is what it has measured.
        </p>
      </footer>
    </div>
  );
}
