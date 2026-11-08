"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorNote } from "@/components/ui";

/** A button, not an automatic action on page load, so a mail scanner opening the link changes nothing. */
export function UnsubscribeButton() {
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/email/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not unsubscribe.");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  if (!token) return <ErrorNote>This page needs the link from the email.</ErrorNote>;
  if (state === "done") {
    return (
      <div>
        <p role="status" className="rounded-lg border border-forest/20 bg-forest/[0.05] px-3 py-2.5 text-[14px] text-forest-deep">
          Done. No more weekly summaries. You can turn them back on in Settings.
        </p>
        <p className="mt-6 text-[14px]"><Link href="/app/settings#email" className="font-medium text-forest hover:text-forest-deep">Open Settings</Link></p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote>{error}</ErrorNote>
      <button
        type="button"
        onClick={go}
        disabled={state === "busy"}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-forest-deep px-5 text-[15px] font-medium text-white transition-colors hover:bg-forest disabled:opacity-70"
      >
        {state === "busy" ? "Turning it off…" : "Stop the weekly summary"}
      </button>
    </div>
  );
}
