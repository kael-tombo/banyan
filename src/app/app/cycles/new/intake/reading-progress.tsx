"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui";

export type ReadingStatus = "queued" | "reading" | "analysing";

const STEPS: { at: ReadingStatus; label: string; detail: string }[] = [
  { at: "queued", label: "Finding your site", detail: "Checking the address is public and reachable." },
  { at: "reading", label: "Reading your pages", detail: "Home, plus pricing, about, features and customers when you link them." },
  { at: "analysing", label: "Understanding your positioning", detail: "Audience, problem, proof, pricing and voice, all from what your pages say." },
];
const ORDER: ReadingStatus[] = ["queued", "reading", "analysing"];

/** The wait, made legible: which step is running, what it looks at, and a way out. */
export function ReadingProgress({ url, status, onCancel }: { url: string; status: ReadingStatus; onCancel: () => void }) {
  const current = ORDER.indexOf(status);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  let host = url;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    /* show what was typed */
  }

  return (
    <Card flush>
      <div className="border-b border-bark/10 bg-mist/60 px-6 py-5">
        <p className="text-xs font-medium text-moss">Reading</p>
        <p className="mt-0.5 truncate font-serif text-2xl tracking-[-0.01em] text-forest-deep">{host}</p>
      </div>
      <ol className="space-y-4 px-6 py-5" aria-live="polite">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.at} className="flex gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors duration-300 ${
                  done ? "border-forest bg-forest text-ivory" : active ? "border-forest/40 bg-white text-forest" : "border-bark/15 bg-white text-muted"
                }`}
                aria-hidden="true"
              >
                {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> : i + 1}
              </span>
              <div>
                <p className={`text-sm font-medium ${done || active ? "text-charcoal" : "text-muted"}`}>
                  {step.label}
                  {active && <span className="sr-only"> (in progress)</span>}
                  {done && <span className="sr-only"> (done)</span>}
                </p>
                <p className="text-[13px] leading-5 text-muted">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {/* A skeleton of what is coming, so the wait has a shape. */}
      <div className="grid gap-3 border-t border-bark/10 px-6 py-5 sm:grid-cols-3" aria-hidden="true">
        {["Product", "Audience", "Proof"].map((label) => (
          <div key={label} className="rounded-xl border border-bark/10 p-3">
            <p className="text-[11px] font-medium text-muted">{label}</p>
            <div className="mt-2 h-2.5 w-4/5 animate-pulse rounded bg-bark/10 motion-reduce:animate-none" />
            <div className="mt-1.5 h-2.5 w-3/5 animate-pulse rounded bg-bark/10 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-bark/10 px-6 py-3">
        <p className="text-xs text-muted">{seconds < 20 ? "Usually 10–30 seconds." : "Still working. Large sites take a little longer."}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
