"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Compass, LineChart, PenLine, SearchCheck, Share2, Sprout } from "lucide-react";

/* Icon keys are passed from the server component as plain strings — component
   references can't cross the server/client boundary. */
const ICONS = {
  research: SearchCheck,
  strategize: Compass,
  create: PenLine,
  review: CheckCircle2,
  publish: Share2,
  measure: LineChart,
  learn: Sprout,
  iterate: ArrowRight,
} as const;

export type Step = { key: string; label: string };

export function WorkflowFlow({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* The connector: one line drawing through the whole loop when in view. */}
      <svg
        className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-0.5 w-full md:block"
        viewBox="0 0 1000 2"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 1 H1000"
          className={`flow-line ${shown ? "is-visible" : ""}`}
          style={{ "--flow-len": 1000 } as React.CSSProperties}
          stroke="var(--color-moss)"
          strokeOpacity="0.45"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <nav aria-label="Workflow steps" className="relative flex flex-wrap items-stretch gap-2">
        {steps.map((step, i) => {
          const Icon = ICONS[step.key as keyof typeof ICONS] ?? ArrowRight;
          return (
            <div key={step.key} className="flex min-w-fit items-center gap-2">
              <div
                className={`flex w-32 flex-col gap-2 rounded-xl border border-bark/12 bg-white/90 p-3.5 shadow-[0_1px_2px_rgba(18,48,40,0.04),0_8px_24px_-16px_rgba(18,48,40,0.18)] backdrop-blur transition-all duration-700 ease-out md:w-auto md:flex-1 ${
                  shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <Icon className="text-forest" size={18} aria-hidden />
                <span className="text-[13px] font-medium text-forest-deep">{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight
                  className={`flow-arrow hidden text-fig md:block ${shown ? "is-visible" : ""}`}
                  style={{ "--arrow-delay": `${400 + i * 90}ms` } as React.CSSProperties}
                  size={14}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
