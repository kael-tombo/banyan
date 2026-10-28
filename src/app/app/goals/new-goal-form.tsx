"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorNote, Textarea } from "@/components/ui";

/**
 * The directing interface: plain-language goal in, structured execution out.
 * Deliberately minimal — this is how work is directed; the goal page is how
 * work is inspected. No simulated chat, no fake progress.
 */
export default function NewGoalForm() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rawInput.trim().length < 10) {
      setError("Describe the goal in at least a short sentence.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawInput }),
      });
      const body = (await res.json()) as { goal?: { id: string }; error?: string };
      if (!res.ok || !body.goal) {
        setError(body.error ?? "Could not create the goal.");
        return;
      }
      setRawInput("");
      router.push(`/app/goals/${body.goal.id}`);
    } catch {
      setError("Network error — the goal was not created. Nothing ran in the background.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <label htmlFor="goal-input" className="text-sm font-medium text-charcoal">
        New goal — describe it the way you'd tell a colleague
      </label>
      <Textarea
        id="goal-input"
        className="mt-2 min-h-24"
        placeholder="e.g. Get 50 signups from LinkedIn and X in the next 6 weeks, without paid ads."
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
        maxLength={2000}
        aria-describedby="goal-input-hint"
      />
      <p id="goal-input-hint" className="mt-1 text-xs text-charcoal-soft">
        Banyan extracts the metric, target and deadline, drafts a plan with its assumptions and the information it is missing, and asks for your approval before anything consequential runs.
      </p>
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={busy || rawInput.trim().length < 10} aria-busy={busy}>
          {busy ? "Structuring the goal…" : "Create goal & draft plan"}
        </Button>
      </div>
    </Card>
  );
}
