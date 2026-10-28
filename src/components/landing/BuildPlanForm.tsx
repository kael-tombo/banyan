"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2 } from "lucide-react";

/**
 * The landing hero's "Build my plan" control: a product URL goes in, and the
 * founder lands on signup with onboarding pre-seeded to that URL. The URL is
 * carried through `next` → `/onboarding?url=…`, where it prefills the website
 * field — the first real step of "from product URL to your next experiment".
 */
export function BuildPlanForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const trimmed = url.trim();
    if (!trimmed) {
      router.push("/signup");
      return;
    }
    // Best-effort normalize; onboarding treats the field as optional text.
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const next = encodeURIComponent(`/onboarding?url=${encodeURIComponent(normalized)}`);
    router.push(`/signup?next=${next}`);
  }

  return (
    <form onSubmit={onSubmit} className={compact ? "w-full" : "w-full max-w-xl"}>
      <div className="flex flex-col gap-2 rounded-2xl border border-bark/15 bg-white p-2 shadow-[0_10px_30px_-18px_rgba(18,48,40,0.25)] sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
          <Link2 size={16} className="shrink-0 text-bark/50" aria-hidden="true" />
          <span className="sr-only">Your product URL</span>
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourproduct.com"
            autoComplete="url"
            spellCheck={false}
            className="w-full bg-transparent text-sm text-charcoal placeholder:text-charcoal-soft/50 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-forest-deep px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-forest disabled:opacity-60"
        >
          Build my plan
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2.5 text-xs text-charcoal-soft">
        No account connections required to get started.
      </p>
    </form>
  );
}
