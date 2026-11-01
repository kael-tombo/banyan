"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";

/** Accept the recommendation and start the next cycle with that one change. */
export function NextCycleButton({ recommendationId, change }: { recommendationId: string; change: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/next-cycle`, { method: "POST", body: JSON.stringify({}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not start the next cycle.");
      router.push(`/app/cycles/${body.goal.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="sm" onClick={start} disabled={busy}>
        {busy ? "Starting…" : "Start the next cycle with this change"}
      </Button>
      <p className="mt-1.5 text-xs text-charcoal-soft">
        Same objective, metric, target, channels and window; one change: “{change}”. Banyan drafts the plan, and it waits for your approval.
      </p>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
