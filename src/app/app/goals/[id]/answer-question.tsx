"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Textarea } from "@/components/ui";

/**
 * Answers the one question an agent asked before it could continue (R4). The answer goes back into
 * the same agent session, so the agent picks up where it stopped.
 */
export default function AnswerQuestion({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "answer", answer }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not send your answer.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <label className="sr-only" htmlFor={`answer-${taskId}`}>
        Your answer
      </label>
      <Textarea
        id={`answer-${taskId}`}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        maxLength={2000}
        required
        className="w-full text-sm"
        placeholder="Your answer"
      />
      <Button size="sm" type="submit" disabled={busy || answer.trim().length < 2}>
        Send answer
      </Button>
      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  );
}
