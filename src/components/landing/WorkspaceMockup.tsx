import { BarChart3, CheckCircle2, PenLine, Share2, Sparkles, Video } from "lucide-react";

/**
 * A compact, result-first preview of one completed distribution cycle.
 *
 * Honesty rule: this is marketing imagery, so it is explicitly labelled as an
 * illustrative cycle. It shows real product states (drafted, approved,
 * published, manual handoff) and deliberately invents no performance numbers.
 * The live app starts from honest empty states.
 */

const summary = [
  { value: "3", label: "drafts", hint: "one per format" },
  { value: "3", label: "approved", hint: "recorded decision" },
  { value: "2", label: "published", hint: "provider-confirmed" },
  { value: "1", label: "manual", hint: "video script" },
];

const assets = [
  { channel: "LinkedIn", format: "Professional insight", status: "Published", live: true },
  { channel: "X", format: "Thread · 4 posts", status: "Published", live: true },
  { channel: "Short-video", format: "Hook + script", status: "Manual handoff", live: false },
];

export function WorkspaceMockup() {
  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="overflow-hidden rounded-2xl border border-bark/12 bg-white shadow-[0_1px_2px_rgba(14,42,33,0.04),0_30px_70px_-38px_rgba(14,42,33,0.45)]">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-bark/10 bg-mist/70 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-clay/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-fig/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-forest/50" />
          </div>
          <div className="mx-auto flex items-center gap-1.5 rounded-full border border-bark/12 bg-white px-3 py-0.5 text-[11px] font-medium text-charcoal-soft">
            banyan.ai/app/cycles
          </div>
          <span className="w-10" aria-hidden="true" />
        </div>

        <div className="p-4 sm:p-5">
          {/* Cycle header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-forest-deep">
              One complete cycle <span className="font-normal text-charcoal-soft">/ Acme Analytics</span>
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/25 bg-forest/[0.06] px-2.5 py-1 text-[11px] font-semibold text-forest">
              <CheckCircle2 size={11} aria-hidden="true" /> Cycle complete
            </span>
          </div>

          {/* The shape of the result, in four numbers. */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className="rounded-xl border border-bark/10 bg-mist/50 px-3 py-2.5">
                <p className="num text-xl font-semibold text-forest-deep">{item.value}</p>
                <p className="text-[11px] font-semibold text-charcoal">{item.label}</p>
                <p className="mt-0.5 text-[9.5px] leading-tight text-charcoal-soft">{item.hint}</p>
              </div>
            ))}
          </div>

          {/* What the cycle produced. */}
          <div className="mt-3 rounded-xl border border-bark/10 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-soft">What it produced</p>
              <span className="text-[10px] font-semibold text-forest">3 of 3 approved</span>
            </div>
            <ul className="mt-2.5 space-y-2">
              {assets.map((asset) => (
                <li key={asset.channel} className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-forest/[0.06] text-forest">
                      {asset.live ? <Share2 size={12} aria-hidden="true" /> : <Video size={12} aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11.5px] font-semibold text-charcoal">{asset.channel}</p>
                      <p className="truncate text-[10.5px] text-charcoal-soft">{asset.format}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${
                      asset.live
                        ? "border border-forest/20 bg-forest/[0.06] text-forest"
                        : "border border-bark/15 bg-mist text-charcoal-soft"
                    }`}
                  >
                    {asset.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The point of the cycle: a measured result and a next move. */}
          <div className="mt-3 rounded-xl bg-forest-deep p-4 text-ivory">
            <div className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#7BE7A5]">
                <BarChart3 size={14} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9FE8BE]">
                  Measured result
                </p>
                <p className="mt-1 text-sm font-semibold text-[#F2F8F3]">
                  Clicks and signups, in your workspace.
                </p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-[#A9C3B2]">
                  First-party tracked links. A real zero stays zero — no projected lift.
                </p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-2.5 text-[10.5px] font-medium text-[#9FE8BE]">
              <Sparkles size={11} aria-hidden="true" /> Next move proposed from this result
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-charcoal-soft">
        <PenLine size={11} className="text-forest" aria-hidden="true" />
        Illustrative cycle — live cycles show only recorded states and numbers
      </p>
    </div>
  );
}
