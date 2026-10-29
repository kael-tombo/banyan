"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type OpportunityStatus = "open" | "accepted" | "dismissed" | "acted_upon";

/** Lifecycle actions for one opportunity card. Optimistic-free: PATCH then refresh. */
export function OpportunityActions({
  id,
  status,
  title,
}: {
  id: string;
  status: OpportunityStatus;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(next: OpportunityStatus, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/recommendations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not update the opportunity.");
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function turnIntoExperiment() {
    setBusy("acted");
    setError(null);
    try {
      const res = await fetch(`/api/recommendations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "acted_upon" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not update the opportunity.");
      }
      router.push(`/app/experiments?title=${encodeURIComponent(title)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "open" || status === "accepted") && (
        <Button
          size="sm"
          onClick={turnIntoExperiment}
          disabled={busy !== null}
          title={`Turn "${title}" into an experiment — opens the pre-filled experiment form.`}
        >
          {busy === "acted" ? "Opening…" : "Turn into experiment"}
        </Button>
      )}
      {status === "open" && (
        <Button variant="secondary" size="sm" onClick={() => move("accepted", "save")} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
      )}
      {(status === "open" || status === "accepted") && (
        <Button variant="ghost" size="sm" onClick={() => move("dismissed", "dismiss")} disabled={busy !== null}>
          {busy === "dismiss" ? "Dismissing…" : "Not relevant"}
        </Button>
      )}
      {status === "dismissed" && (
        <Button variant="secondary" size="sm" onClick={() => move("open", "restore")} disabled={busy !== null}>
          Restore
        </Button>
      )}
      {error && <p className="text-xs text-clay">{error}</p>}
    </div>
  );
}
