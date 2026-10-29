import {
  ArrowRight, BadgeCheck, Bot, FileText, Globe, Target, UserPlus,
} from "lucide-react";

/**
 * Hero product mockup — mirrors what the real dashboard actually renders:
 * a goal with progress, an experiment in its honest early-read state, the
 * agent team with live statuses, the first-party funnel, and the
 * recommendation banner that links to it.
 *
 * Honesty rule: this is marketing imagery, so it is explicitly labeled as an
 * illustrative preview. The live app starts from honest empty states and
 * renders only recorded numbers — the footer badge says exactly that. Even
 * the mockup's experiment carries the "early read" caveat rather than a
 * projected win.
 */

const funnel = [
  { icon: FileText, label: "Content visits", value: "1,240" },
  { icon: Globe, label: "Landing visitors", value: "186" },
  { icon: UserPlus, label: "Sign-ups", value: "14" },
  { icon: BadgeCheck, label: "Qualified", value: "4" },
];

const agents = [
  { name: "Market Research", line: "Analyzed 42 founder discussions · 8 signals" },
  { name: "Growth Strategist", line: "Drafted the landing-page message test (v3)" },
  { name: "Creator", line: "2 short-video drafts awaiting review" },
  { name: "Analyst", line: "Updated attribution for the last 24 hours" },
];

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
              <Bot size={11} aria-hidden="true" /> Agents moving the goal forward
            </span>
          </div>

          {/* Goal banner */}
          <div className="mt-4 rounded-xl border border-bark/10 bg-mist/50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-charcoal">
                <Target size={14} className="text-forest" aria-hidden="true" />
                Goal: first 100 qualified customers
              </p>
              <p className="text-xs font-semibold text-forest">
                34 / 100 <span className="font-medium text-charcoal-soft">· +18% this week</span>
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sage/50" aria-hidden="true">
              <div className="h-full w-[34%] rounded-full bg-forest" />
            </div>
          </div>

          {/* Experiment + agent team */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-bark/10 bg-white p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Active experiment</p>
                <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">Running · day 6/14</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-charcoal">Problem-led landing page</p>
              <dl className="mt-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-charcoal-soft">Baseline conversion</dt>
                  <dd className="font-medium text-charcoal">5.7%</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-charcoal-soft">Current conversion</dt>
                  <dd className="font-medium text-charcoal">7.5%</dd>
                </div>
              </dl>
              <p className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-fig/30 bg-fig/10 px-2 py-0.5 text-[10px] font-semibold text-fig-deep">
                Early read only — not enough evidence yet
              </p>
            </div>

            <div className="rounded-xl border border-bark/10 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Agent team</p>
              <ul className="mt-2 space-y-1.5" aria-hidden="true">
                {agents.map((a) => (
                  <li key={a.name} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
                    <p className="text-[11px] leading-snug text-charcoal">
                      <span className="font-semibold">{a.name}</span>{" "}
                      <span className="text-charcoal-soft">— {a.line}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* First-party funnel */}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Customer journey · first-party events</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
            {funnel.map((step, i) => (
              <div key={step.label} className="relative rounded-xl border border-bark/10 bg-mist/50 px-3 py-2.5 text-center">
                <step.icon size={13} className="mx-auto text-forest" />
                <p className="mt-1 text-sm font-semibold text-charcoal">{step.value}</p>
                <p className="text-[10.5px] leading-snug text-charcoal-soft">{step.label}</p>
                {i < funnel.length - 1 && (
                  <ArrowRight size={11} className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-bark/35 sm:block" />
                )}
              </div>
            ))}
          </div>

          {/* Recommended next test */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fig/25 bg-fig/[0.06] p-3.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fig-deep">Recommended next test</p>
              <p className="mt-0.5 text-sm font-semibold text-charcoal">Founder-story landing page for solo builders</p>
              <p className="mt-0.5 text-[11px] text-charcoal-soft">Based on recorded outcomes and audience evidence — with what would disconfirm it.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-3.5 py-1.5 text-[11px] font-semibold text-ivory">
              Review plan <ArrowRight size={11} aria-hidden="true" />
            </span>
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
