import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { Reveal } from "@/components/Reveal";
import { CycleWalkthrough } from "@/components/landing/CycleWalkthrough";
import { CycleRecord } from "@/components/landing/CycleRecord";
import { BuildPlanForm } from "@/components/landing/BuildPlanForm";
import { BanyanMark } from "@/components/BanyanMark";
import { DistributionLandscape } from "@/components/landing/landscape/DistributionLandscape";
import { FragmentedDistribution } from "@/components/landing/landscape/FragmentedDistribution";
import { ArrowDown, ArrowRight, BarChart3, CheckCircle2, PenLine, Plug, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Banyan.ai — The autonomous, agentic distribution operating system" },
  description:
    "Banyan is an autonomous, agentic distribution operating system. Its agents run a complete distribution cycle for your product end to end: research, strategy, content, publishing and measurement. You approve everything that goes out, and results are measured in clicks and signups.",
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

const PRIMARY_CTA =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-forest-deep px-6 text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-forest active:scale-[0.98]";
const SECONDARY_CTA =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#E1E4E7] bg-white px-6 text-[15px] font-medium text-charcoal transition-[border-color,transform] duration-150 hover:border-[#C9CED3] active:scale-[0.98]";

export default function LandingPage() {
  return (
    <div className="landing min-h-screen bg-white">
      <SiteNav cta="Start distributing" ctaHref={SIGNUP} />

      <main>
        {/* ————— Hero: the message, with the internet flowing behind it. ————— */}
        <section className="relative isolate flex min-h-[640px] items-center overflow-hidden bg-white [height:calc(100svh-4rem)] max-h-[980px]">
          <DistributionLandscape variant="hero" />

          {/* A clearing in the landscape where the message sits. White only, never an opaque panel. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[46%] h-[min(640px,92%)] w-[min(1360px,160%)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.94)_62%,rgba(255,255,255,0)_100%)]"
          />

          <div className="relative mx-auto w-full max-w-6xl px-4 pb-[6vh] text-center">
            <p className="mb-5 text-sm font-medium text-forest sm:text-[15px]">The autonomous, agentic distribution operating system</p>
            <h1 className="mx-auto max-w-[15ch] text-[2.5rem] font-medium leading-[1.06] tracking-[-0.03em] text-forest-deep sm:max-w-none sm:text-[3rem] lg:text-[3.5rem]">
              <span className="block">Build your product.</span>
              <span className="block">Banyan orchestrates its distribution.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[36rem] text-[17px] leading-[1.6] text-charcoal-soft sm:text-lg">
              From strategy and content to coordinated distribution, Banyan helps turn what you build into a system
              designed to reach the people who need it.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link href={SIGNUP} className={PRIMARY_CTA}>
                Start distributing <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="#how-it-works" className={SECONDARY_CTA}>
                See how it works <ArrowDown size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ————— One plain sentence about what is live today. ————— */}
        <section className="border-y border-[#EEF0F2] bg-[#F7F8F8] py-4" aria-label="What Banyan connects today">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-center text-[13px] text-charcoal-soft">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-forest" aria-hidden="true" />
              You publish approved posts; Banyan records where they went live
            </span>
            <span className="flex items-center gap-2">
              <PenLine size={16} className="text-muted" aria-hidden="true" />
              Short video is a scripted manual handoff
            </span>
            <span className="flex items-center gap-2">
              <BarChart3 size={16} className="text-muted" aria-hidden="true" />
              Results are first-party clicks and signups
            </span>
          </div>
        </section>

        {/* ————— The problem: distribution in fragments. ————— */}
        <section id="problem" className="bg-white py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end lg:gap-12">
              <div>
                <Reveal as="p"><Eyebrow>The real problem</Eyebrow></Reveal>
                <Reveal as="h2" delay={80} className="mt-3 max-w-2xl text-3xl font-medium tracking-[-0.025em] text-forest-deep md:text-[2.5rem] md:leading-[1.1]">
                  The job you never applied for
                </Reveal>
              </div>
              <Reveal as="p" delay={140} className="text-base leading-relaxed text-charcoal-soft md:text-lg">
                Distribution has become a second full-time job: learn each platform, write every format, publish
                consistently, and prove it worked. The product gets the leftover time.
              </Reveal>
            </div>

            <Reveal delay={120} className="mt-12">
              <FragmentedDistribution />
            </Reveal>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {problems.map((problem, i) => (
                <Reveal key={problem.q} delay={i * 60}>
                  <figure className="flex h-full flex-col rounded-2xl border border-[#E6E8EA] bg-white p-6">
                    <span className="num font-mono text-xs text-muted">{i + 1}</span>
                    <h3 className="mt-3 font-serif text-[22px] leading-snug text-forest-deep">{problem.q}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-charcoal-soft">{problem.body}</p>
                    <p className="mt-6 border-t border-[#EEF0F2] pt-3 text-[13px] font-medium text-clay">{problem.truth}</p>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ————— How it works: one cycle, stage by stage. ————— */}
        <section id="how-it-works" className="border-y border-[#EEF0F2] bg-[#F7F8F8] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end lg:gap-12">
              <div>
                <Reveal as="p"><Eyebrow>How it works</Eyebrow></Reveal>
                <Reveal as="h2" delay={80} className="mt-3 max-w-2xl text-3xl font-medium tracking-[-0.025em] text-forest-deep md:text-[2.5rem] md:leading-[1.1]">
                  Seven stages, two of them yours
                </Reveal>
              </div>
              <Reveal as="p" delay={140} className="text-base leading-relaxed text-charcoal-soft md:text-lg">
                The scattered week above becomes one cycle with a shared plan. You bring the product and make the
                call; Banyan's autonomous agents run the research, the strategy, the writing, the publishing
                and the measurement in between, and stop at the gates that are yours.
              </Reveal>
            </div>

            <Reveal delay={120} className="mt-12">
              <CycleWalkthrough />
            </Reveal>
          </div>
        </section>

        {/* ————— The result: cycles that build on each other. ————— */}
        <section id="result" className="bg-white py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end lg:gap-12">
              <div>
                <Reveal as="p"><Eyebrow>The result</Eyebrow></Reveal>
                <Reveal as="h2" delay={80} className="mt-3 max-w-2xl text-3xl font-medium tracking-[-0.025em] text-forest-deep md:text-[2.5rem] md:leading-[1.1]">
                  A repeatable cycle, not a lucky post
                </Reveal>
              </div>
              <Reveal as="p" delay={140} className="text-base leading-relaxed text-charcoal-soft md:text-lg">
                One post can get lucky. A cycle ends with a verdict, even when the verdict is &ldquo;not enough
                data&rdquo;, and whatever it learned becomes the starting point of the next one.
              </Reveal>
            </div>

            <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] lg:gap-12">
              <div className="lg:sticky lg:top-24">
                <p className="text-[13px] text-muted">Every cycle leaves</p>
                <ul className="mt-4 divide-y divide-[#EEF0F2] border-y border-[#EEF0F2]">
                  {outcomes.map((outcome) => (
                    <li key={outcome.title} className="flex gap-4 py-5">
                      <outcome.icon size={20} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
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
              Ledgerline and every post in the landscape are fictional and illustrative. The live app starts from empty
              states and shows only recorded numbers.
            </p>
          </div>
        </section>

        {/* ————— The boundary: the trust case, in three lines. ————— */}
        <section id="trust" className="border-y border-[#EEF0F2] bg-[#F7F8F8] py-20 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <Eyebrow>The boundary</Eyebrow>
              <h2 className="mt-3 text-3xl font-medium tracking-[-0.025em] text-forest-deep md:text-[2.5rem] md:leading-[1.1]">
                Simple on purpose, honest by design
              </h2>
              <p className="mt-4 text-base leading-relaxed text-charcoal-soft md:text-lg">
                Autonomy without evidence is just risk. These are the rules the product actually enforces.
              </p>
            </div>

            <div className="mt-12 grid gap-8 border-t border-[#E6E8EA] pt-8 md:grid-cols-3 md:gap-8">
              {boundaries.map((boundary) => (
                <div key={boundary.title}>
                  <boundary.icon size={20} className="text-forest" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-medium text-forest-deep">{boundary.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{boundary.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ————— The ask: back to the landscape, richer. ————— */}
        <section id="start" className="relative isolate overflow-hidden bg-white py-28 md:py-40">
          <DistributionLandscape variant="closing" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[min(900px,115%)] w-[min(1100px,160%)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.95)_68%,rgba(255,255,255,0)_100%)]"
          />

          <div className="relative mx-auto max-w-2xl px-4 text-center">
            <h2 className="text-4xl font-medium leading-[1.08] tracking-[-0.03em] text-forest-deep md:text-[3.25rem]">
              <span className="block">You built it.</span>
              <span className="block">Banyan gets it out.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-charcoal-soft md:text-lg">
              Bring one product and one objective. Banyan drafts the strategy and three assets, then waits for your
              approval. No content calendar, no platform homework, no virality guarantees.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href={SIGNUP} className={PRIMARY_CTA}>
                Start distributing <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-8 text-[13px] text-muted">Or start from your product URL</p>
            <div className="mx-auto mt-3 max-w-xl text-left">
              <BuildPlanForm />
            </div>
          </div>
        </section>
      </main>

      {/* ————— Footer: the same facts, no extra surface. ————— */}
      <footer className="border-t border-[#EEF0F2] bg-white py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="flex items-center gap-2.5">
              <BanyanMark size={28} />
              <span className="text-lg font-medium text-forest-deep">
                Banyan<span className="text-moss">.ai</span>
              </span>
            </span>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-charcoal-soft">
              The autonomous, agentic distribution operating system for founders. You build it, Banyan&apos;s agents get it out.
            </p>
          </div>

          <nav className="flex gap-12" aria-label="Footer">
            <div>
              <h3 className="text-sm font-medium text-forest-deep">Product</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/#how-it-works" className="text-charcoal-soft hover:text-forest-deep">How it works</Link></li>
                <li><Link href="/#result" className="text-charcoal-soft hover:text-forest-deep">The result</Link></li>
                <li><Link href="/#trust" className="text-charcoal-soft hover:text-forest-deep">Trust</Link></li>
                <li><Link href={SIGNUP} className="text-charcoal-soft hover:text-forest-deep">Start distributing</Link></li>
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
