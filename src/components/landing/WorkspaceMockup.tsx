import Link from "next/link";
import {
  ArrowRight, BarChart3, CheckCircle2, Megaphone, Package, Target, Users2,
} from "lucide-react";

/**
 * Hero product mockup — the growth workspace as the vision imagines it:
 * a pipeline (product → audience → channels → results), an audience card,
 * a top recommendation with a projected lift, and the channels to test first.
 *
 * Honesty rule: this is marketing imagery, so it is explicitly labeled as an
 * illustrative preview. The live app starts from honest empty states and
 * renders only recorded numbers — the footer badge says exactly that.
 */

const pipeline = [
  { icon: Package, title: "Product", body: "Your offer and value prop" },
  { icon: Users2, title: "Audience", body: "Highest-potential segments" },
  { icon: Megaphone, title: "Channels", body: "Where to test first" },
  { icon: BarChart3, title: "Results", body: "Learn and scale what works" },
];

const bars = [14, 22, 30, 44, 58, 74, 96];

export function WorkspaceMockup() {
  return (
    <div className="relative">
      {/* App window */}
      <div className="card-shadow-lg overflow-hidden rounded-2xl border border-bark/12 bg-white">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-bark/10 bg-mist/70 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-clay/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-fig/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-forest/50" />
          </div>
          <div className="mx-auto flex items-center gap-1.5 rounded-full border border-bark/12 bg-white px-3 py-0.5 text-[11px] font-medium text-charcoal-soft">
            banyan.ai/app
          </div>
          <span className="w-10" aria-hidden="true" />
        </div>

        <div className="p-4 sm:p-5">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-forest-deep">
              Growth workspace <span className="font-normal text-charcoal-soft">/ Acme Analytics</span>
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/25 bg-forest/8 px-2.5 py-1 text-[11px] font-semibold text-forest">
              <CheckCircle2 size={11} aria-hidden="true" /> Plan ready
            </span>
          </div>

          {/* Pipeline */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
            {pipeline.map((step, i) => (
              <div key={step.title} className="relative rounded-xl border border-bark/10 bg-mist/50 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <step.icon size={13} className="text-forest" />
                  <p className="text-[11.5px] font-semibold text-charcoal">{step.title}</p>
                  {i < pipeline.length - 1 && (
                    <ArrowRight size={11} className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-bark/35 sm:block" />
                  )}
                </div>
                <p className="mt-0.5 text-[10.5px] leading-snug text-charcoal-soft">{step.body}</p>
              </div>
            ))}
          </div>

          {/* Audience + recommendation */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-bark/10 bg-white p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">
                <Users2 size={11} className="text-forest" aria-hidden="true" /> Audience
              </p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-sm font-semibold text-charcoal">Solo B2B founders</p>
                <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">Strong fit</span>
              </div>
              <dl className="mt-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-charcoal-soft">Stage</dt>
                  <dd className="font-medium text-charcoal">Early → Growth</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-charcoal-soft">Team size</dt>
                  <dd className="font-medium text-charcoal">1 – 10</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-charcoal-soft">Primary focus</dt>
                  <dd className="font-medium text-charcoal">Founder-led growth</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-forest/20 bg-forest/[0.04] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Top recommendation</p>
                <span className="rounded-full border border-fig/30 bg-fig/10 px-2 py-0.5 text-[10px] font-semibold text-fig-deep">Ready for review</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-charcoal">LinkedIn founder-led launch</p>
              <p className="mt-0.5 text-[11px] text-charcoal-soft">5 posts · 2-week test · Lead capture</p>
              <div className="mt-3 flex items-end justify-between gap-3" aria-hidden="true">
                <div className="flex h-12 flex-1 items-end gap-1">
                  {bars.map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-t-[3px]"
                      style={{ height: `${h}%`, background: i === bars.length - 1 ? "var(--color-forest)" : "color-mix(in oklab, var(--color-forest) 30%, var(--color-sage))" }}
                    />
                  ))}
                </div>
                <p className="whitespace-nowrap text-sm font-semibold text-forest">+62% <span className="block text-right text-[10px] font-medium text-charcoal-soft">projected lift</span></p>
              </div>
            </div>
          </div>

          {/* Channels to test */}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Channels to test</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-hidden="true">
            {[
              { name: "X", body: "Founder threads, build in public" },
              { name: "LinkedIn", body: "Founder-led content and POV posts" },
              { name: "Short-form video", body: "Problem-first product demos" },
            ].map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-2 rounded-xl border border-bark/10 bg-white px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-charcoal">{c.name}</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-charcoal-soft">{c.body}</p>
                </div>
                <ArrowRight size={12} className="shrink-0 text-bark/35" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Honesty badge */}
      <div className="mt-3 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-bark/12 bg-white/80 px-3 py-1 text-[11px] font-medium text-charcoal-soft backdrop-blur">
          <Target size={11} className="text-forest" aria-hidden="true" />
          Illustrative preview — the live app starts from honest empty states
        </span>
      </div>
    </div>
  );
}
