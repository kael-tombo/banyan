"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Input } from "@/components/ui";

/**
 * The goal's draft credit budget (R4): how many credits this cycle's drafts may hold or spend. Empty
 * means only the workspace balance limits them. A draft task over the budget waits, blocked, until
 * the budget is raised or cleared and the task is retried.
 */
export default function CreditBudget({ goalId, budget, used, canEdit }: { goalId: string; budget: number | null; used: number; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(budget == null ? "" : String(budget));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: number | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creditBudget: next }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save the budget.");
        return;
      }
      if (next == null) setValue("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed == null || (Number.isInteger(parsed) && parsed >= 0 && parsed <= 100_000);
  const over = budget != null && used >= budget;

  return (
    <div>
      <p className="text-sm text-charcoal">
        {budget == null ? (
          <>Drafts have used <strong>{used}</strong> credit{used === 1 ? "" : "s"}. No budget is set, so only your balance limits them.</>
        ) : (
          <>
            Drafts have used <strong>{used}</strong> of <strong>{budget}</strong> credit{budget === 1 ? "" : "s"}.
            {over && <span className="text-clay"> The budget is spent: new drafts wait until you raise it.</span>}
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-charcoal-soft">Each draft holds 1 credit while it is written. Template drafts and failed runs give it back.</p>
      {canEdit && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void save(parsed);
          }}
        >
          <label className="sr-only" htmlFor={`budget-${goalId}`}>Credit budget for this goal's drafts</label>
          <Input
            id={`budget-${goalId}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="No budget"
            className="w-32"
          />
          <Button size="sm" type="submit" disabled={busy || !valid || parsed === budget}>Save budget</Button>
          {budget != null && (
            <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={() => void save(null)}>Remove budget</Button>
          )}
        </form>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
