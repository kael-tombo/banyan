"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorNote, Field, Input, Select } from "@/components/ui";
import ProvenanceBadge from "../goals/[id]/provenance-badge";

export type FactView = {
  id: string;
  category: string;
  key: string;
  value: string;
  provenance: string;
  confidence: string;
  source: string | null;
  verifiedAt: string | null;
  updatedAt: string;
};

const CATEGORIES = ["product", "audience", "positioning", "voice", "competitor", "constraint", "resource", "metric", "research"] as const;

/**
 * Inspect-and-correct UI for the persistent business context. Every mutation
 * is explicit; provenance is updated honestly by the server (corrections reset
 * verification; verify records who and when).
 */
export default function FactsManager({ initialFacts }: { initialFacts: FactView[] }) {
  const router = useRouter();
  const [facts, setFacts] = useState(initialFacts);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newFact, setNewFact] = useState({ category: "competitor", key: "", value: "" });

  const visible = filter === "all" ? facts : facts.filter((f) => f.category === filter);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/profile/facts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { fact?: FactView; error?: string };
      if (!res.ok || !data.fact) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setFacts((prev) => prev.map((f) => (f.id === id ? { ...f, ...data.fact! } : f)));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this fact? Agents will stop seeing it.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/profile/facts/${id}`, { method: "DELETE" });
      if (res.ok) setFacts((prev) => prev.filter((f) => f.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function addFact() {
    setError(null);
    if (newFact.key.trim().length < 2 || newFact.value.trim().length < 1) {
      setError("Give the fact a key (e.g. competitor:acme) and a value.");
      return;
    }
    const res = await fetch("/api/profile/facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...newFact, provenance: "user_provided", source: "user entry" }),
    });
    const data = (await res.json()) as { fact?: FactView; error?: string };
    if (!res.ok || !data.fact) {
      setError(data.error ?? "Could not save the fact.");
      return;
    }
    setFacts((prev) => [{ ...data.fact! }, ...prev]);
    setNewFact({ category: newFact.category, key: "", value: "" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <h2 className="font-medium text-charcoal">Add a fact</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[10rem_12rem_1fr_auto]">
          <Field label="Category" htmlFor="fact-category">
            <Select id="fact-category" value={newFact.category} onChange={(e) => setNewFact((v) => ({ ...v, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Key" htmlFor="fact-key" hint="e.g. competitor:acme">
            <Input id="fact-key" value={newFact.key} onChange={(e) => setNewFact((v) => ({ ...v, key: e.target.value }))} placeholder="competitor:acme" maxLength={80} />
          </Field>
          <Field label="Value" htmlFor="fact-value">
            <Input id="fact-value" value={newFact.value} onChange={(e) => setNewFact((v) => ({ ...v, value: e.target.value }))} placeholder="What you know — agents see it labelled as user-provided." maxLength={2000} />
          </Field>
          <div className="flex items-end">
            <Button onClick={addFact} size="md">Add</Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <label htmlFor="fact-filter" className="text-sm text-charcoal-soft">Filter:</label>
        <Select id="fact-filter" className="w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <span className="text-xs text-charcoal-soft">{visible.length} fact(s)</span>
      </div>

      <div className="space-y-3">
        {visible.map((f) => (
          <Card key={f.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-charcoal">
                  <Badge variant="charcoal">{f.category}</Badge>{" "}
                  <code className="text-xs text-charcoal-soft">{f.key}</code>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-charcoal">{f.value}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-charcoal-soft">
                  <ProvenanceBadge kind={f.provenance} />
                  <span>confidence: {f.confidence}</span>
                  {f.source && <span>· source: {f.source}</span>}
                  {f.verifiedAt && <span>· verified {new Date(f.verifiedAt).toLocaleDateString()}</span>}
                  <span>· updated {new Date(f.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {f.provenance !== "verified" && (
                  <Button size="sm" variant="secondary" disabled={busyId === f.id} onClick={() => patch(f.id, { markVerified: true })}>Mark verified</Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === f.id}
                  onClick={() => {
                    const value = window.prompt("Correct the value:", f.value);
                    if (value && value.trim().length > 0) void patch(f.id, { value: value.trim() });
                  }}
                >
                  Correct
                </Button>
                <Button size="sm" variant="danger" disabled={busyId === f.id} onClick={() => remove(f.id)}>Delete</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
