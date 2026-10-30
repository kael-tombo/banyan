import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { Reveal } from "@/components/Reveal";
import { WorkspaceMockup } from "@/components/landing/WorkspaceMockup";
import { BuildPlanForm } from "@/components/landing/BuildPlanForm";
import { BanyanMark } from "@/components/BanyanMark";
import {
  ArrowDown, ArrowRight, BarChart3, CheckCircle2, Link2, PenLine, Plug, ShieldCheck, Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Banyan.ai — Your product. Viral content, everywhere." },
  description:
    "You built a product, not a media company. Banyan turns one update into a thread for X, a post for LinkedIn and Facebook, and a script for short-video — approved by you, published where connected, and measured in clicks and signups.",
};

const steps = [
  {
    n: "01",
    icon: Link2,
    tag: "You bring",
    title: "The product and the objective",
    body: "Paste a public product URL, correct what Banyan read, and choose one objective and metric. That is the only homework.",
  },
  {
    n: "02",
    icon: PenLine,
    tag: "You approve",
    title: "The strategy and three assets",
    body: "Banyan proposes the channel, angle and message, then writes an X thread, a LinkedIn post and a short-video script. You edit or approve — no blank page.",
  },
  {
    n: "03",
    icon: BarChart3,
    tag: "Banyan executes",
    title: "Publishing, measurement, next move",
    body: "Approved posts publish through Postiz. Tracked links record visits and signups, so the next move comes from evidence, not likes.",
  },
];

const problems = [
  {
    q: "What do I even say?",
    body: "You shipped something you're proud of. Then you opened a blank composer and spent an hour trying to make it sound worth posting.",
    truth: "A blank page is a strategy problem.",
  },
  {
    q: "Why does every channel need a different version?",
    body: "The same update has to become a thread, a post and a 30-second script. Rewriting it three ways is a day you didn't have.",
    truth: "One idea is not three assets.",
  },
  {
    q: "Did that post bring anyone?",
    body: "Likes climb. Signups don't. Without tracked links, you can't tell whether the post worked or the algorithm just had a good day.",
    truth: "Engagement is not evidence.",
  },
];

const outcomes = [
  {
    icon: PenLine,
    title: "Three assets, ready to approve",
    body: "A LinkedIn post, an X thread, and a short-video script — each built for its format, not one post copied three times.",
    proof: "3 formats",
  },
  {
    icon: Plug,
    title: "Two live publications, or an honest block",
    body: "X and LinkedIn publish through your Postiz connection. The provider's response is recorded; a missing connection is blocked with guidance, never faked.",
    proof: "X + LinkedIn",
  },
  {
    icon: BarChart3,
    title: "A measured result and the next move",
    body: "First-party tracked visits and attributed signups, with the limitation stated. The cycle ends with a recommendation — or an explicit not-enough-data.",
    proof: "First-party",
  },
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
  return (
    <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-fig-deep">{children}</span>
  );
}

export default function LandingPage() {
  return (
    <div className="landing min-h-screen bg-paper">
      <SiteNav cta="Run a cycle" />

      <main>
        {/* ————— Hero: the promise and the finished cycle, above the fold. ————— */}
        <section className="relative overflow-hidden border-b border-bark/10 bg-paper">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_88%_-8%,rgba(35,82,63,0.11),transparent_62%),radial-gradient(ellipse_55%_45%_at_0%_105%,rgba(184,138,51,0.07),transparent_65%)]"
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14 lg:pb-24 lg:pt-20">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/[0.05] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-forest">
                  <span className="h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" />
                  For founders, not media teams
                </span>
              </Reveal>

              <h1 className="display mt-6 text-[2rem] text-forest-deep sm:text-[3rem] lg:text-[2.6rem] xl:text-[3.1rem]">
                <span className="block">Your product.</span>
                <span className="block text-forest">Viral content, everywhere.</span>
              </h1>

              <Reveal as="p" delay={120} className="mt-6 max-w-xl text-base leading-relaxed text-charcoal-soft md:text-lg">
                You built a product, not a media company. Banyan turns one update into a
                thread for X, a post for LinkedIn and Facebook, and a script for
                short-video — approved by you, measured by what actually moved.
              </Reveal>

              <Reveal delay={200} className="mt-8">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/signup?next=%2Fapp%2Fcycles%2Fnew"
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest-deep px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-16px_rgba(14,42,33,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest sm:w-auto"
                  >
                    Run my first cycle
                    <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-bark/20 bg-white px-7 py-3.5 text-sm font-semibold text-forest-deep transition-all duration-200 hover:-translate-y-0.5 hover:border-forest/40 sm:w-auto"
                  >
                    See how one cycle works
                    <ArrowDown size={15} className="transition-transform duration-200 group-hover:translate-y-0.5" aria-hidden="true" />
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={280}>
                <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-charcoal-soft">
                  {["No content calendar to run", "No platform homework", "You approve everything"].map((item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-forest" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <Reveal delay={160} className="w-full">
              <WorkspaceMockup />
            </Reveal>
          </div>
        </section>

        {/* ————— The real problem: the founder's actual week, before the promise. ————— */}
        <section id="problem" className="border-b border-bark/10 bg-paper py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end lg:gap-12">
              <div>
                <Reveal as="p"><Eyebrow>The real problem</Eyebrow></Reveal>
                <Reveal as="h2" delay={80} className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-forest-deep md:text-[2.5rem] md:leading-[1.1]">
                  The job you never applied for.
                </Reveal>
              </div>
              <Reveal as="p" delay={140} className="text-base leading-relaxed text-charcoal-soft md:text-lg">
                Distribution has become a second full-time job: learn each platform, write
                every format, publish consistently, and prove it worked. The product gets the
                leftover time.
              </Reveal>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {problems.map((problem, i) => (
                <Reveal key={problem.q} delay={i * 90}>
                  <figure className="flex h-full flex-col rounded-2xl border border-clay/15 bg-[#fdf9f3] p-6">
                    <span className="font-mono text-[11px] tracking-[0.12em] text-clay">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-3 font-serif text-[22px] leading-snug tracking-[-0.01em] text-forest-deep">
                      {problem.q}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-charcoal-soft">{problem.body}</p>
                    <p className="mt-5 border-t border-clay/15 pt-3 text-xs font-semibold text-fig-deep">
                      {problem.truth}
                    </p>
                  </figure>
                </Reveal>
              ))}
            </div>

            <Reveal as="p" delay={120} className="mt-8 max-w-3xl text-sm font-medium leading-relaxed text-forest-deep">
              Banyan carries that work — the strategy, the three assets, the publishing and
              the measurement. You keep the product and the final yes.
            </Reveal>
          </div>
        </section>

        {/* ————— One plain sentence about what is live today. ————— */}
        <section className="border-b border-bark/10 bg-mist/60 py-4" aria-label="What Banyan connects today">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-7 gap-y-2 px-4 text-center text-xs font-medium text-charcoal-soft">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-forest" aria-hidden="true" />
              X and LinkedIn publish through Postiz
            </span>
            <span className="flex items-center gap-1.5">
              <PenLine size={12} className="text-forest" aria-hidden="true" />
              Short video is a scripted manual handoff
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 size={12} className="text-forest" aria-hidden="true" />
              Results are first-party clicks and signups
            </span>
          </div>
        </section>

        {/* ————— The cycle: three decisions, not a feature catalogue. ————— */}
        <section id="how-it-works" className="bg-paper py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <Reveal as="p"><Eyebrow>The cycle</Eyebrow></Reveal>
              <Reveal as="h2" delay={80} className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-forest-deep md:text-[2.5rem] md:leading-[1.1]">
                Three decisions. One finished cycle.
              </Reveal>
              <Reveal as="p" delay={140} className="mt-4 text-base leading-relaxed text-charcoal-soft md:text-lg">
                You bring the product, the objective and the approval. Banyan owns the
                coordination in between — the calendar, the platform rules, the rewriting and
                the measurement.
              </Reveal>
            </div>

            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((step, i) => (
                <Reveal as="li" key={step.n} delay={i * 90}>
                  <div className="flex h-full flex-col rounded-2xl border border-bark/12 bg-white p-6 shadow-[0_1px_2px_rgba(14,42,33,0.035),0_18px_40px_-32px_rgba(14,42,33,0.4)]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/[0.06] text-forest">
                        <step.icon size={18} aria-hidden="true" />
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal-soft/60">
                        {step.n}
                      </span>
                    </div>
                    <span className="mt-5 w-fit rounded-full bg-fig/10 px-2.5 py-1 text-[11px] font-semibold text-fig-deep">
                      {step.tag}
                    </span>
                    <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-forest-deep">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{step.body}</p>
                  </div>
                </Reveal>
              ))}
            </ol>

            <Reveal as="p" delay={120} className="mt-6 text-xs leading-relaxed text-charcoal-soft">
              The live path today is X and LinkedIn through Postiz, plus one short-video script
              you record yourself. Missing credentials stop the cycle at{" "}
              <span className="font-mono text-[11px] text-clay">blocked</span> — they do not
              invent a publication or a result.
            </Reveal>
          </div>
        </section>

        {/* ————— The result: what is left when the cycle finishes. ————— */}
        <section id="result" className="border-y border-bark/10 bg-mist py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <Reveal as="p"><Eyebrow>The result</Eyebrow></Reveal>
              <Reveal as="h2" delay={80} className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-forest-deep md:text-[2.5rem] md:leading-[1.1]">
                A repeatable cycle, not a lucky post.
              </Reveal>
              <Reveal as="p" delay={140} className="mt-4 text-base leading-relaxed text-charcoal-soft md:text-lg">
                Every cycle leaves the same three things. They are the proof that the work
                moved — not the volume of content it produced.
              </Reveal>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {outcomes.map((outcome, i) => (
                <Reveal key={outcome.title} delay={i * 90}>
                  <article className="flex h-full flex-col rounded-2xl border border-bark/12 bg-white p-6">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/[0.06] text-forest">
                        <outcome.icon size={18} aria-hidden="true" />
                      </span>
                      <span className="rounded-full border border-forest/20 bg-forest/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-forest">
                        {outcome.proof}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-forest-deep">
                      {outcome.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{outcome.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>

            <Reveal as="p" delay={120} className="mt-6 text-xs text-charcoal-soft">
              The sample cycle above is illustrative. The live app starts from honest empty
              states and shows only recorded numbers.
            </Reveal>
          </div>
        </section>

        {/* ————— The boundary: the trust case, in three lines. ————— */}
        <section id="trust" className="relative overflow-hidden bg-forest-deep py-16 text-ivory md:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_82%_-10%,rgba(71,118,95,0.35),transparent_65%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#9FE8BE]">
                The boundary
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#F2F8F3] md:text-[2.5rem] md:leading-[1.1]">
                Simple on purpose. Honest by design.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#A9C3B2] md:text-lg">
                Autonomy without evidence is just risk. These are the rules the product
                actually enforces.
              </p>
            </div>

            <div className="mt-10 grid gap-8 border-t border-white/10 pt-8 md:grid-cols-3 md:gap-6">
              {boundaries.map((boundary) => (
                <div key={boundary.title}>
                  <boundary.icon size={18} className="text-[#7BE7A5]" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-semibold text-[#F2F8F3]">{boundary.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#A9C3B2]">{boundary.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ————— One CTA. ————— */}
        <section id="start" className="bg-paper py-16 md:py-24">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <Reveal>
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-fig/10 text-fig-deep">
                <Sparkles size={18} aria-hidden="true" />
              </span>
              <h2 className="display mt-6 text-4xl text-forest-deep md:text-5xl">
                <span className="block">You built it.</span>
                <span className="block text-forest">Banyan gets it out.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-charcoal-soft md:text-lg">
                Bring one product and one objective. Banyan drafts the strategy and three
                assets, then waits for your approval. No content calendar, no platform
                homework, no virality guarantees.
              </p>
              <Link
                href="/signup?next=%2Fapp%2Fcycles%2Fnew"
                className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-forest-deep px-8 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_-16px_rgba(14,42,33,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest"
              >
                Run my first cycle
                <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-charcoal-soft/70">
                Or start from your product URL
              </p>
              <div className="mx-auto mt-4 max-w-xl text-left">
                <BuildPlanForm />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ————— Footer: the same facts, no extra surface. ————— */}
      <footer className="border-t border-bark/10 bg-paper py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="flex items-center gap-2.5">
              <BanyanMark size={28} />
              <span className="text-lg font-semibold tracking-tight text-forest-deep">
                Banyan<span className="text-moss">.ai</span>
              </span>
            </span>
            <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-charcoal-soft">
              The product distribution OS for founders. You build it — Banyan gets it out.
            </p>
          </div>

          <nav className="flex gap-12" aria-label="Footer">
            <div>
              <h3 className="text-sm font-semibold text-forest-deep">Product</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/#how-it-works" className="text-charcoal-soft hover:text-forest-deep">How it works</Link></li>
                <li><Link href="/#result" className="text-charcoal-soft hover:text-forest-deep">The result</Link></li>
                <li><Link href="/#trust" className="text-charcoal-soft hover:text-forest-deep">Trust</Link></li>
                <li><Link href="/signup?next=%2Fapp%2Fcycles%2Fnew" className="text-charcoal-soft hover:text-forest-deep">Run a cycle</Link></li>
                <li><Link href="/login" className="text-charcoal-soft hover:text-forest-deep">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-forest-deep">Legal</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/privacy" className="text-charcoal-soft hover:text-forest-deep">Privacy</Link></li>
                <li><Link href="/terms" className="text-charcoal-soft hover:text-forest-deep">Terms</Link></li>
              </ul>
            </div>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl px-4 text-xs text-charcoal-soft">
          © {new Date().getFullYear()} Banyan.ai. No invented metrics: what the product
          reports is what it has measured.
        </p>
      </footer>
    </div>
  );
}
