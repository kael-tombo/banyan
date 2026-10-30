"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";

/** Retry a blocked/failed task from the cycle view. State is preserved by the API. */
export default function CycleRetry({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not retry this task.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant="secondary" onClick={retry} disabled={busy}>
        {busy ? "Retrying…" : "Retry"}
      </Button>
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}
