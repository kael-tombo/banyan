import type { ReactNode } from "react";
import { ArrowDown, Check, Lock } from "lucide-react";
import { PlatformMark, type Platform } from "@/components/landing/landscape/platforms";

/**
 * The result — what repeating the cycle looks like.
 *
 * Three cycles for the same fictional product as the walkthrough, read top
 * to bottom: each one ends with a verdict and a lesson, and the lesson is
 * carried into the next. Cycle 2 shows the two honest outcomes the product
 * actually records (a blocked publication, a "not enough data" verdict), and
 * cycle 3 is drafted and waiting on a human, so its window has not opened.
 * No performance numbers are shown, because none would be real.
 */

type Output = { platform: Platform; label: string; state: "published" | "blocked" | "handoff" | "waiting" };

type Cycle = {
  n: number;
  dates: string;
  question: string;
  status: { label: string; tone: "done" | "running" };
  outputs: Output[];
  verdict: { label: string; body: string; tone: "measured" | "thin" | "pending" };
  carried?: string;
};

const CYCLES: Cycle[] = [
  {
    n: 1,
    dates: "Oct 1 – 14",
    question: "Does offline mode bring freelancers in?",
    status: { label: "Concluded", tone: "done" },
    outputs: [
      { platform: "x", label: "X thread", state: "published" },
      { platform: "linkedin", label: "LinkedIn post", state: "published" },
      { platform: "youtube", label: "Video script", state: "handoff" },
    ],
    verdict: {
      label: "Measured",
      body: "Most attributed signups came through the LinkedIn post. The ones that converted talked about getting paid, not about the feature.",
      tone: "measured",
    },
    carried: "Lead with getting paid, and test LinkedIn first",
  },
  {
    n: 2,
    dates: "Oct 15 – 28",
    question: "Does “get paid without Wi-Fi” beat the feature name?",
    status: { label: "Concluded", tone: "done" },
    outputs: [
      { platform: "linkedin", label: "LinkedIn post", state: "published" },
      { platform: "x", label: "X thread", state: "blocked" },
      { platform: "youtube", label: "Video", state: "handoff" },
    ],
    verdict: {
      label: "Not enough data",
      body: "The window closed with too few signups to compare angles, so the cycle says exactly that instead of guessing.",
      tone: "thin",
    },
    carried: "Reconnect X, and give the next test 21 days",
  },
  {
    n: 3,
    dates: "21 days from approval",
    question: "Does a customer's own story outperform ours?",
    status: { label: "Drafted · awaiting approval", tone: "running" },
    outputs: [
      { platform: "linkedin", label: "LinkedIn post", state: "waiting" },
      { platform: "x", label: "X thread", state: "waiting" },
      { platform: "youtube", label: "Video script", state: "waiting" },
    ],
    verdict: {
      label: "Not started",
      body: "The window opens when the approved posts go out. Nothing is measured before then, and nothing goes out before you approve.",
      tone: "pending",
    },
  },
];

function OutputChip({ output }: { output: Output }) {
  const state: Record<Output["state"], { text: string; cls: string; icon?: ReactNode }> = {
    published: { text: "Published", cls: "text-forest", icon: <Check size={12} aria-hidden="true" /> },
    blocked: { text: "Blocked · connection expired", cls: "text-clay", icon: <Lock size={12} aria-hidden="true" /> },
    handoff: { text: "Manual handoff", cls: "text-charcoal-soft" },
    waiting: { text: "Waiting on you", cls: "text-fig-deep" },
  };
  const s = state[output.state];
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <PlatformMark platform={output.platform} size={16} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-charcoal">{output.label}</span>
      <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${s.cls}`}>
        {output.state === "waiting" && <span className="h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" />}
        {s.icon}
        {s.text}
      </span>
    </li>
  );
}

function CycleCard({ cycle }: { cycle: Cycle }) {
  const running = cycle.status.tone === "running";
  const verdictCls =
    cycle.verdict.tone === "measured"
      ? "bg-forest-deep text-ivory"
      : cycle.verdict.tone === "thin"
        ? "bg-[#F4F1EA] text-charcoal"
        : "border border-dashed border-[#D6DADE] bg-white text-charcoal";
  const verdictLabelCls =
    cycle.verdict.tone === "measured" ? "text-rail-muted" : cycle.verdict.tone === "thin" ? "text-fig-deep" : "text-muted";

  return (
    <article className="relative grid gap-5 rounded-2xl border border-[#E6E8EA] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-base font-medium text-forest-deep">Cycle {cycle.n}</h3>
          <span className="font-mono text-xs text-muted">{cycle.dates}</span>
          <span className={`ml-auto inline-flex items-center gap-1.5 text-xs ${running ? "text-fig-deep" : "text-muted"}`}>
            {running && <span className="h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" />}
            {cycle.status.label}
          </span>
        </header>
        <p className="mt-3 font-serif text-[19px] leading-snug text-charcoal">{cycle.question}</p>
        <ul className="mt-4 border-t border-[#EEF0F2] pt-2.5">
          {cycle.outputs.map((o) => (
            <OutputChip key={o.label} output={o} />
          ))}
        </ul>
      </div>

      <div className={`flex flex-col rounded-xl p-4 ${verdictCls}`}>
        <p className={`text-xs font-medium ${verdictLabelCls}`}>{cycle.verdict.label}</p>
        <p className="mt-2 text-[14px] leading-[1.55]">{cycle.verdict.body}</p>
      </div>
    </article>
  );
}

export function CycleRecord() {
  return (
    <ol className="flex flex-col" aria-label="Three cycles for one product, each carrying its lesson into the next">
      {CYCLES.map((cycle) => (
        <li key={cycle.n} className="flex flex-col">
          <CycleCard cycle={cycle} />
          {cycle.carried && (
            <div className="flex items-center gap-3 py-3 pl-6 sm:pl-8">
              <span className="flex h-8 w-px shrink-0 bg-forest/25" aria-hidden="true" />
              <p className="flex items-center gap-2 text-[13px] text-charcoal-soft">
                <ArrowDown size={14} className="shrink-0 text-forest" aria-hidden="true" />
                <span>
                  <span className="text-muted">Carried into cycle {cycle.n + 1}:</span> {cycle.carried}
                </span>
              </p>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
