import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { JourneyStep } from "@/lib/journey";

/**
 * The launch path on the dashboard: the five steps of the promise, what
 * Banyan has done, and the one thing it needs from the founder now.
 */
export function LaunchPath({ steps }: { steps: JourneyStep[] }) {
  const current = steps.find((s) => s.state === "current");
  const doneCount = steps.filter((s) => s.state === "done").length;

  return (
    <section aria-label="Launch path" className="card-shadow mb-4 rounded-2xl border border-bark/10 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-medium text-charcoal">Launch path</h2>
        <p className="text-[13px] text-muted">
          <span className="num">{doneCount}</span> of {steps.length} done
          {current ? <> · now: {current.title.toLowerCase()}</> : " · loop closed"}
        </p>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5 md:gap-0">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.state === "current" ? "step" : undefined}
            className={`relative flex gap-3 md:flex-col md:gap-0 md:px-3 ${i > 0 ? "md:border-l md:border-bark/[0.08]" : "md:pl-0"} ${
              s.state === "current" ? "rounded-xl bg-canvas p-3 md:rounded-none md:bg-transparent md:p-0 md:px-3" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  s.state === "done"
                    ? "bg-forest text-white"
                    : s.state === "current"
                      ? "bg-forest-deep text-white ring-4 ring-forest/10"
                      : "border border-bark/20 text-muted"
                }`}
                aria-hidden="true"
              >
                {s.state === "done" ? <Check size={13} strokeWidth={2.25} /> : <span className="num font-mono">{i + 1}</span>}
              </span>
              <span className={`text-sm font-medium ${s.state === "upcoming" ? "text-muted" : "text-charcoal"}`}>{s.title}</span>
              {s.waitingOnYou && (
                <span className="ml-auto flex items-center gap-1 text-xs text-fig-deep md:ml-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" /> you
                </span>
              )}
              <span className="sr-only">{s.state === "done" ? "done" : s.state === "current" ? "current step" : "not started"}</span>
            </div>
            <div className="min-w-0 flex-1 md:mt-2">
              <p className={`text-[13px] leading-5 ${s.state === "upcoming" ? "text-muted" : "text-charcoal-soft"}`}>{s.line}</p>
              {s.action && (
                <Link
                  href={s.action.href}
                  className={`mt-2 inline-flex items-center gap-1 text-[13px] font-medium ${
                    s.state === "current" ? "rounded-lg bg-forest-deep px-3 py-1.5 text-white hover:bg-forest" : "text-forest hover:text-forest-deep"
                  }`}
                >
                  {s.action.label} <ArrowRight size={13} aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
