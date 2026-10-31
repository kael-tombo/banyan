import { BarChart3, CheckCircle2, Share2, Video } from "lucide-react";

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
      <div className="overflow-hidden rounded-2xl border border-[#E6E8EA] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_rgba(17,24,39,0.06)]">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-[#EEF0F2] bg-[#F7F8F8] px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#E1E4E7]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#E1E4E7]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#E1E4E7]" />
          </div>
          <div className="mx-auto flex items-center gap-1.5 rounded-md border border-[#E6E8EA] bg-white px-3 py-0.5 font-mono text-xs text-muted">
            banyan.ai/app/cycles
          </div>
          <span className="w-10" aria-hidden="true" />
        </div>

        <div className="p-4 sm:p-5">
          {/* Cycle header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-forest-deep">
              One complete cycle <span className="font-normal text-charcoal-soft">/ Acme Analytics</span>
            </p>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-forest">
              <CheckCircle2 size={16} aria-hidden="true" /> Cycle complete
            </span>
          </div>

          {/* The shape of the result, in four numbers. */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className="rounded-lg bg-[#F7F8F8] px-3 py-3">
                <p className="num font-serif text-2xl leading-none text-forest-deep">{item.value}</p>
                <p className="mt-2 text-xs font-medium capitalize text-charcoal">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted">{item.hint}</p>
              </div>
            ))}
          </div>

          {/* What the cycle produced. */}
          <div className="mt-3 rounded-lg border border-[#EEF0F2] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-charcoal-soft">What it produced</p>
              <span className="num text-xs text-muted">3 of 3 approved</span>
            </div>
            <ul className="mt-3 space-y-3">
              {assets.map((asset) => (
                <li key={asset.channel} className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-muted">
                      {asset.live ? <Share2 size={16} aria-hidden="true" /> : <Video size={16} aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-5 text-charcoal">{asset.channel}</p>
                      <p className="truncate text-xs text-muted">{asset.format}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                      asset.live ? "bg-forest/[0.08] text-forest" : "bg-[#F1F3F4] text-charcoal-soft"
                    }`}
                  >
                    {asset.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The point of the cycle: a measured result and a next move. */}
          <div className="mt-3 rounded-lg bg-forest-deep p-4 text-ivory">
            <div className="flex items-start gap-2.5">
              <BarChart3 size={16} className="mt-0.5 shrink-0 text-sage" aria-hidden="true" />
              <div>
                <p className="text-xs text-rail-muted">Measured result</p>
                <p className="mt-1 text-sm font-medium text-ivory">Clicks and signups, in your workspace</p>
                <p className="mt-1 text-xs leading-4 text-rail-ink">
                  First-party tracked links. A real zero stays zero, with no projected lift.
                </p>
              </div>
            </div>
            <p className="mt-3 border-t border-white/10 pt-3 text-xs text-rail-ink">
              Next move proposed from this result
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        Illustrative cycle. Live cycles show only recorded states and numbers
      </p>
    </div>
  );
}
