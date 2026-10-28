"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";

/**
 * Closes an approval_gate task after the human approved the content in the
 * Approvals UI. The server re-verifies that no draft is left unreviewed —
 * the button cannot bypass the gate, it can only record that the human
 * decision happened.
 */
export default function GateActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function closeGate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve_gate" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not close the gate.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="sm" onClick={closeGate} disabled={busy}>Approval done — close the gate</Button>
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}
