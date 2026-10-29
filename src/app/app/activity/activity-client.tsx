"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";
import { Pause, Play, Check, X, RotateCcw } from "lucide-react";

/**
 * Agent activity controls. Every action hits an existing, server-enforced
 * endpoint: the pause switch hits /api/agent-activity/pause, gate and plan
 * decisions hit the same endpoints the rest of the app uses — no parallel
 * permission path.
 */

export function ActivityControls({ paused, pausedLabel }: { paused: boolean; pausedLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-activity/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change the pause state.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {!paused && <span className="text-xs text-charcoal-soft">{pausedLabel}</span>}
        <Button variant={paused ? "primary" : "secondary"} size="sm" onClick={toggle} disabled={busy}>
          {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          {paused ? "Resume agents" : "Pause agents"}
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export function ApprovalActions({
  kind,
  id,
  goalId,
}: {
  kind: "task_gate" | "goal_plan";
  id: string;
  goalId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(label: string, path: string, body: unknown) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const approve = () => {
    if (kind === "task_gate") return act("approve", `/api/tasks/${id}`, { action: "approve_gate" });
    return act("approve", `/api/goals/${id}/plan/approve`, { decision: "approve" });
  };

  const reject = () => {
    if (kind === "task_gate") return act("reject", `/api/tasks/${id}`, { action: "cancel" });
    const reason = prompt("Rejection reason (required, min 3 chars):");
    if (!reason || reason.trim().length < 3) return;
    return act("reject", `/api/goals/${id}/plan/approve`, { decision: "reject", reason: reason.trim() });
  };

  const retry = () => act("retry", `/api/tasks/${id}`, { action: "retry" });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={approve} disabled={!!busy} aria-label="Approve">
          <Check size={13} aria-hidden="true" /> {busy === "approve" ? "…" : "Approve"}
        </Button>
        <Button size="sm" variant="danger" onClick={reject} disabled={!!busy} aria-label="Reject">
          <X size={13} aria-hidden="true" /> {busy === "reject" ? "…" : "Reject"}
        </Button>
        {kind === "task_gate" && (
          <Button size="sm" variant="ghost" onClick={retry} disabled={!!busy} aria-label="Retry task">
            <RotateCcw size={12} aria-hidden="true" />
          </Button>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
