"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorNote } from "@/components/ui";

/**
 * Live execution controls for a goal:
 *  - plan approve/reject when a decision is required;
 *  - auto-advance while tasks are open (the UI drives the same orchestrator
 *    the worker uses — tasks are claimed atomically, so both can run);
 *  - pause/cancel controls.
 */
export default function GoalLive({
  goalId,
  initial,
  hasOpenWork,
}: {
  goalId: string;
  initial: { status: string; progress: number };
  hasOpenWork: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const advancing = useRef(false);

  // Server refreshes carry the authoritative status. Without this sync the
  // controls keep showing "Approve plan" after the plan was already approved.
  useEffect(() => {
    setStatus(initial.status);
  }, [initial.status]);

  const advance = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    try {
      const res = await fetch(`/api/goals/${goalId}/advance`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await res.json()) as { report?: { executed: number }; error?: string };
      if (!res.ok) {
        if (body.error) setError(body.error);
        return;
      }
      if ((body.report?.executed ?? 0) > 0) router.refresh();
    } catch {
      /* transient network issue; the worker tick is the safety net */
    } finally {
      advancing.current = false;
    }
  }, [goalId, router]);

  // While work is open, advance every few seconds and refresh the server-rendered state.
  useEffect(() => {
    if (!hasOpenWork || ["cancelled", "paused"].includes(status)) return;
    const tick = setInterval(() => void advance(), 5000);
    void advance();
    return () => clearInterval(tick);
  }, [hasOpenWork, status, advance]);

  async function decide(decision: "approve" | "reject") {
    let reason = "";
    if (decision === "reject") {
      reason = window.prompt("What should the planner change before re-drafting?") ?? "";
      if (reason.trim().length < 3) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/plan/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision === "approve" ? { decision } : { decision, reason }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "The decision could not be recorded.");
        return;
      }
      setNote(decision === "approve" ? "Plan approved — execution started." : "Plan rejected — regenerate it or cancel the goal.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setStatusTo(next: "paused" | "active" | "cancelled") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not update the goal.");
        return;
      }
      setStatus(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rooted">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-xs text-charcoal-soft">
            <span>Execution progress (share of tasks completed)</span>
            <span>{initial.progress}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ivory-deep/70" role="progressbar" aria-valuenow={initial.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Execution progress">
            <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${Math.min(100, initial.progress)}%` }} />
          </div>
          {hasOpenWork && !["paused", "cancelled"].includes(status) && (
            <p className="mt-1 text-xs text-charcoal-soft" aria-live="polite">The workflow is advancing automatically — records refresh as tasks complete.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "awaiting_approval" && (
            <>
              <Button size="sm" onClick={() => decide("approve")} disabled={busy}>Approve plan</Button>
              <Button size="sm" variant="danger" onClick={() => decide("reject")} disabled={busy}>Reject</Button>
            </>
          )}
          {status === "active" && (
            <Button size="sm" variant="secondary" onClick={() => setStatusTo("paused")} disabled={busy}>Pause</Button>
          )}
          {status === "paused" && (
            <Button size="sm" onClick={() => setStatusTo("active")} disabled={busy}>Resume</Button>
          )}
          {["draft", "planning", "awaiting_approval", "active", "paused"].includes(status) && (
            <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Cancel this goal? All open tasks will be cancelled — completed work and records stay.")) void setStatusTo("cancelled"); }} disabled={busy}>Cancel goal</Button>
          )}
        </div>
      </div>
      {note && <p className="mt-2 text-sm text-forest">{note}</p>}
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}
