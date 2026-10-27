"use client";

import { useState, FormEvent } from "react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, Textarea, Loading } from "@/components/ui";
import { Binoculars, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Insight = { id: string; title: string; body: string; source: string; confidence: string; createdAt: string };

const SOURCE_LABELS: Record<string, string> = {
  assumption: "Assumption", interview: "Interview", research: "External research", observed: "Observed in product",
};
const CONFIDENCE_VARIANTS: Record<string, "warm" | "moss" | "forest"> = {
  low: "warm", medium: "moss", high: "forest",
};

export function AudienceManager({ insights }: { insights: Insight[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/audience", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title") || ""),
          body: String(form.get("body") || ""),
          source: String(form.get("source") || "assumption"),
          confidence: String(form.get("confidence") || "low"),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not add insight.");
      }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/audience/${id}`, { method: "DELETE", body: JSON.stringify({}) });
      if (!res.ok) throw new Error("Could not delete insight.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal"><Binoculars size={16} className="text-forest" aria-hidden="true" /> Record an insight</h2>
        <form onSubmit={add} className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Title" required><Input name="title" required maxLength={200} placeholder="e.g. Founders say scheduling eats Fridays" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source" required><Select name="source" defaultValue="assumption">{Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Confidence" required><Select name="confidence" defaultValue="low"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
            </div>
          </div>
          <Field label="What you learned (or assumed)" required hint="Be honest with yourself: what would need to be true?">
            <Textarea name="body" required rows={2} maxLength={2000} />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" disabled={busy} className="w-fit"><Plus size={16} /> {busy ? "Saving…" : "Add insight"}</Button>
        </form>
      </Card>

      {insights.length === 0 ? (
        <EmptyState
          title="No audience insights recorded yet"
          body="The distribution plan generator will still run from your onboarding answers, but re-uses only clearly-labeled assumptions. Record what you know — interviews, observations, or hunches — with an honest confidence score."
          icon={<Binoculars size={22} className="text-forest" />}
        />
      ) : (
        <div className="grid gap-3">
          {insights.map((i) => (
            <Card key={i.id} className="card-lift flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-charcoal">{i.title}</h3>
                  <Badge variant="charcoal">{SOURCE_LABELS[i.source] ?? i.source}</Badge>
                  <Badge variant={CONFIDENCE_VARIANTS[i.confidence] ?? "warm"}>{i.confidence} confidence</Badge>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm text-charcoal-soft">{i.body}</p>
                <p className="mt-1 text-xs text-bark/50">{new Date(i.createdAt).toLocaleDateString()}</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => remove(i.id)} disabled={busy} aria-label={`Delete ${i.title}`}>
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            </Card>
          ))}
          {busy && <Loading />}
        </div>
      )}
    </div>
  );
}
