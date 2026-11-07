import { Lock } from "lucide-react";
import { PlatformMark, type Platform } from "@/components/landing/landscape/platforms";

/**
 * The landing hero's one rich moment: a single cycle as the founder sees it in Banyan, stopped at the gate that is
 * theirs. Three channel-native drafts written from one update, each waiting on an approval (the fig dot is Banyan's
 * signature for "a person decides here"). No results are shown, because none exist before anything is published:
 * the measurement window opens on approval. The product (Ledgerline) is the same fictional one as the walkthrough.
 */

type Draft = { platform: Platform; format: string; lines: string[] };

const DRAFTS: Draft[] = [
  {
    platform: "linkedin",
    format: "LinkedIn post",
    lines: [
      "Most invoicing apps stop working the moment the Wi-Fi does.",
      "Ledgerline now saves and sends invoices offline, then syncs when you are back.",
    ],
  },
  {
    platform: "x",
    format: "X thread · 4 posts",
    lines: ["1/ Freelancers don't get paid at their desks.", "2/ So Ledgerline invoices work on a train, in a café, anywhere."],
  },
  {
    platform: "youtube",
    format: "Short video · script",
    lines: ["Open on a phone in airplane mode. Send the invoice. Cut to the sync tick."],
  },
];

export function HeroCycle() {
  return (
    <figure
      className="relative rounded-[20px] border border-bark/10 bg-paper p-2 shadow-[0_24px_48px_-24px_rgba(14,42,33,0.22),0_2px_6px_rgba(14,42,33,0.05)]"
      aria-label="A Banyan cycle waiting on the founder: three drafts written from one product update, each needing approval before anything is published"
    >
      <div className="rounded-[14px] border border-bark/10 bg-canvas">
        <header className="flex items-center gap-3 border-b border-bark/10 px-5 py-4">
          <span className="text-[13px] font-medium text-forest-deep">Cycle 3</span>
          <span className="font-mono text-xs text-muted">Ledgerline</span>
          <span className="ml-auto inline-flex items-center gap-2 text-xs text-fig-deep">
            <span className="h-2 w-2 rounded-full bg-fig" aria-hidden="true" />3 drafts wait on you
          </span>
        </header>

        <div className="px-5 pt-4">
          <p className="text-xs text-muted">The update</p>
          <p className="mt-1 font-serif text-[19px] leading-snug text-charcoal">Invoices now work offline</p>
          <p className="mt-3 text-xs text-muted">The angle from the approved strategy</p>
          <p className="mt-1 text-sm text-charcoal-soft">Lead with getting paid, not with the feature name</p>
        </div>

        <ul className="mt-4 space-y-2 px-3 pb-3">
          {DRAFTS.map((d) => (
            <li key={d.format} className="rounded-xl border border-bark/10 bg-paper p-4">
              <div className="flex items-center gap-2.5">
                <PlatformMark platform={d.platform} size={20} />
                <span className="text-[13px] font-medium text-charcoal">{d.format}</span>
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" />
                <span className="sr-only">Waiting on your approval</span>
              </div>
              <div className="mt-2.5 space-y-1 text-[13px] leading-[1.55] text-charcoal-soft">
                {d.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <footer className="flex flex-wrap items-center gap-3 border-t border-bark/10 px-5 py-4">
          <span className="inline-flex h-9 items-center rounded-[10px] bg-forest-deep px-4 text-[13px] font-medium text-ivory">
            Approve 3 drafts
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Lock size={13} aria-hidden="true" />
            Nothing is published or measured until you approve
          </span>
        </footer>
      </div>
    </figure>
  );
}
