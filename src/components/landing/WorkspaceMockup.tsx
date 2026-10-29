import {
  ArrowRight, BadgeCheck, Building2, Mail, Megaphone, Search, Users,
} from "lucide-react";

/**
 * Hero product mockup — mirrors the Distribution OS vision for the landing
 * preview: the growth workspace with an audience read, a top recommendation
 * with its projected lift, and the channels queued to test — plus the
 * Product → Audience → Channels → Results spine.
 *
 * Honesty rule: this is marketing imagery, so it is explicitly labeled as an
 * illustrative preview, and the projected lift carries its own "projected,
 * not measured" caveat inside the mockup. The live app starts from honest
 * empty states and renders only recorded numbers.
 */

const planSpine = [
  { icon: Building2, label: "Product", sub: "Your website and offer" },
  { icon: Users, label: "Audience", sub: "Ideal customer segments" },
  { icon: Megaphone, label: "Channels", sub: "Highest-potential tests" },
  { icon: BadgeCheck, label: "Results", sub: "Learn and scale what works" },
];

const channelsToTest = [
  { icon: Mail, name: "LinkedIn", sub: "Founder-led content, thought leadership" },
  { icon: Search, name: "Search guides", sub: "High-intent keywords, product comparison" },
  { icon: Megaphone, name: "Communities", sub: "Targeted answers where the audience already is" },
];

// Illustrative mini bar chart: 8 weeks of a projected ramp (labeled as projected).
const bars = [12, 18, 24, 30, 42, 55, 68, 80];

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
              <BadgeCheck size={11} aria-hidden="true" /> Plan ready for review
            </span>
          </div>

          {/* Product → Audience → Channels → Results spine */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
            {planSpine.map((step, i) => (
              <div key={step.label} className="relative rounded-xl border border-bark/10 bg-mist/50 px-3 py-2.5">
                <step.icon size={13} className="text-forest" />
                <p className="mt-1 text-[12px] font-semibold text-charcoal">{step.label}</p>
                <p className="text-[10.5px] leading-snug text-charcoal-soft">{step.sub}</p>
                {i < planSpine.length - 1 && (
                  <ArrowRight size={11} className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-bark/35 sm:block" />
                )}
              </div>
            ))}
          </div>

          {/* Audience + top recommendation */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-bark/10 bg-white p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Audience</p>
                <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">Strong fit</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-charcoal">B2B SaaS founders</p>
              <p className="mt-1 text-[11px] leading-snug text-charcoal-soft">
                Early-stage to growth-stage founders focused on product-led growth, typically 2–50 employees.
              </p>
              <dl className="mt-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-charcoal-soft">Company stage</dt>
                  <dd className="font-medium text-charcoal">Early → Growth</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-charcoal-soft">Primary focus</dt>
                  <dd className="font-medium text-charcoal">Product-led growth</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-bark/10 bg-white p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Top recommendation</p>
                <span className="rounded-full border border-fig/30 bg-fig/10 px-2 py-0.5 text-[10px] font-semibold text-fig-deep">Ready for review</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-charcoal">LinkedIn founder-led launch</p>
              <p className="mt-1 text-[11px] leading-snug text-charcoal-soft">
                Share the founder&apos;s point of view in a focused 2-week content test to drive qualified sign-ups.
              </p>
              <p className="mt-1.5 text-[11px] font-medium text-charcoal-soft">5 posts · 2-week test · lead capture</p>
              <div className="mt-2.5 flex items-end justify-between gap-3">
                <div className="flex h-10 items-end gap-1" aria-hidden="true">
                  {bars.map((h, i) => (
                    <span key={i} className="w-2.5 rounded-t-sm bg-sage" style={{ height: `${h}%` }} data-last={i === bars.length - 1} />
                  ))}
                </div>
                <p className="text-right">
                  <span className="block text-sm font-semibold text-forest">+62%</span>
                  <span className="block text-[10px] leading-tight text-charcoal-soft">projected lift<br />(illustrative)</span>
                </p>
              </div>
            </div>
          </div>

          {/* Channels to test */}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Channels to test</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {channelsToTest.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-2 rounded-xl border border-bark/10 bg-mist/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-charcoal">
                    <c.icon size={12} className="text-forest" aria-hidden="true" /> {c.name}
                  </p>
                  <p className="truncate text-[10.5px] text-charcoal-soft">{c.sub}</p>
                </div>
                <ArrowRight size={12} className="shrink-0 text-bark/40" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Honesty badge */}
      <div className="mt-3 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-bark/12 bg-white/80 px-3 py-1 text-[11px] font-medium text-charcoal-soft backdrop-blur">
          <BadgeCheck size={11} className="text-forest" aria-hidden="true" />
          Illustrative preview — the live app starts from honest empty states
        </span>
      </div>
    </div>
  );
}
