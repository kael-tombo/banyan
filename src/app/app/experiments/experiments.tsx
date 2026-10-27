"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, StatusBadge, Textarea, Loading } from "@/components/ui";
import { FlaskConical } from "lucide-react";

type Experiment = {
  id: string;
  title: string;
  hypothesis: string;
  variable: string;
  successMetric: string;
  channel: string | null;
  status: string;
  campaignName: string | null;
  results: string | null;
  interpretation: string | null;
  limitations: string | null;
  nextAction: string | null;
  updatedAt: string;
};

export function ExperimentManager({ experiments, campaigns }: { experiments: Experiment[]; campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    setNotice(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title") || ""),
          hypothesis: String(form.get("hypothesis") || ""),
          variable: String(form.get("variable") || ""),
          successMetric: String(form.get("successMetric") || ""),
          channel: String(form.get("channel") || ""),
          campaignId: String(form.get("campaignId") || "") || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create the experiment.");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function draft(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/experiments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "draft_conclusions" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not draft conclusions.");
      setNotice("Conclusions drafted from recorded outcomes. Review and edit them before trusting them.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/experiments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not update the experiment.");
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card>
        <h2 className="mb-3 font-medium text-charcoal">New experiment</h2>
        <form onSubmit={create} className="flex flex-col gap-4">
          <Field label="Title" required>
            <Input name="title" maxLength={140} placeholder="Problem-first vs product-first openings" />
          </Field>
          <Field label="Hypothesis" required hint="State it as a testable claim: 'X causes more Y than Z'.">
            <Textarea name="hypothesis" rows={2} maxLength={1000} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Variable under test" required>
              <Input name="variable" maxLength={300} placeholder="Opening angle (problem vs product)" />
            </Field>
            <Field label="Success metric" required>
              <Input name="successMetric" maxLength={200} placeholder="Tracked clicks from campaign links" />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Channel (optional)">
              <Select name="channel" defaultValue="">
                <option value="">Any</option>
                <option value="x">X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="shortvideo">Short-form video</option>
              </Select>
            </Field>
            <Field label="Campaign (optional)">
              <Select name="campaignId" defaultValue="">
                <option value="">(none)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <ErrorNote>{error}</ErrorNote>
          {notice && <p className="text-sm text-moss">{notice}</p>}
          <div>
            <Button type="submit" disabled={busy === "create"}>
              {busy === "create" ? "Creating…" : "Create experiment"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-6 grid gap-3">
        {experiments.length === 0 ? (
          <EmptyState
            title="No experiments yet"
            body="An experiment is one hypothesis, one variable, one success metric. Start with a single question you genuinely do not know the answer to."
            icon={<FlaskConical size={22} className="text-forest" />}
          />
        ) : (
          experiments.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-forest-deep">{e.title}</h3>
                  <p className="mt-1 text-sm text-charcoal-soft">{e.hypothesis}</p>
                </div>
                <div className="flex items-center gap-2">
                  {e.channel && <Badge variant="charcoal">{e.channel}</Badge>}
                  <StatusBadge status={e.status} />
                </div>
              </div>
              <p className="mt-2 text-xs text-charcoal-soft">
                Variable: {e.variable} · Success metric: {e.successMetric}
                {e.campaignName ? ` · ${e.campaignName}` : ""}
              </p>

              {(e.results || e.interpretation) && (
                <div className="mt-3 rounded-md border border-bark/10 bg-ivory p-3 text-sm">
                  {e.results && (
                    <>
                      <p className="font-medium text-charcoal">Observed</p>
                      <p className="whitespace-pre-line text-charcoal-soft">{e.results}</p>
                    </>
                  )}
                  {e.interpretation && (
                    <>
                      <p className="mt-2 font-medium text-charcoal">Interpretation</p>
                      <p className="text-charcoal-soft">{e.interpretation}</p>
                    </>
                  )}
                  {e.limitations && (
                    <>
                      <p className="mt-2 font-medium text-charcoal">Limitations</p>
                      <p className="text-charcoal-soft">{e.limitations}</p>
                    </>
                  )}
                  {e.nextAction && (
                    <>
                      <p className="mt-2 font-medium text-charcoal">Next action</p>
                      <p className="text-charcoal-soft">{e.nextAction}</p>
                    </>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => draft(e.id)} disabled={busy === e.id}>
                  {busy === e.id ? <Loading label="" /> : "Draft conclusions from recorded data"}
                </Button>
                {e.status !== "running" && (
                  <Button variant="ghost" size="sm" onClick={() => setStatus(e.id, "running")} disabled={busy === e.id}>
                    Mark running
                  </Button>
                )}
                {e.status !== "complete" && (
                  <Button variant="ghost" size="sm" onClick={() => setStatus(e.id, "complete")} disabled={busy === e.id}>
                    Mark complete
                  </Button>
                )}
                {e.status !== "abandoned" && (
                  <Button variant="ghost" size="sm" onClick={() => setStatus(e.id, "abandoned")} disabled={busy === e.id}>
                    Abandon
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
