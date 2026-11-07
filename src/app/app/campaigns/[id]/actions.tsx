"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea, StatusBadge, Badge, Loading } from "@/components/ui";
import { CHANNEL_META, CHANNEL_FORMATS } from "@/lib/formats";
import { Copy } from "lucide-react";

/** Lifecycle actions available from the current state (US-046), decided on the server. */
export function CampaignActions({ campaign, actions }: { campaign: { id: string; name: string }; actions: { action: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicated, setDuplicated] = useState<string | null>(null);

  async function transition(action: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/lifecycle`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not update status.");
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/duplicate`, { method: "POST", body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not duplicate.");
      setDuplicated(data.campaign.id);
      router.push(`/app/campaigns/${data.campaign.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((o) => (
        <Button key={o.action} size="sm" variant={["cancel", "pause", "reject"].includes(o.action) ? "secondary" : "primary"} onClick={() => transition(o.action)} disabled={busy}>
          {busy ? "…" : o.label}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={duplicate} disabled={busy} title="Duplicate campaign">
        <Copy size={14} aria-hidden="true" /> Duplicate
      </Button>
      <ErrorNote>{error}</ErrorNote>
      {duplicated && <Badge variant="forest">duplicated</Badge>}
    </div>
  );
}

type CampaignShape = {
  id: string; name: string; objective: string; targetAudience: string; keyMessage: string; evidence: string;
  cta: string; channels: string[]; formats: string[]; schedule: Record<string, string>; successMetric: string; status: string;
};

export function CampaignEditForm({ campaign }: { campaign: CampaignShape }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(null);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get("name") || ""),
      objective: String(form.get("objective") || ""),
      targetAudience: String(form.get("targetAudience") || ""),
      keyMessage: String(form.get("keyMessage") || ""),
      evidence: String(form.get("evidence") || ""),
      cta: String(form.get("cta") || ""),
      successMetric: String(form.get("successMetric") || ""),
      schedule: {
        startDate: String(form.get("startDate") || ""),
        cadence: String(form.get("cadence") || ""),
      },
    };
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not save campaign.");
      }
      setSaved("Saved. All changes persisted.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8">
      <details>
        <summary className="cursor-pointer font-medium text-charcoal">Edit campaign brief</summary>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" required><Input name="name" defaultValue={campaign.name} maxLength={120} /></Field>
            <Field label="Objective" required><Input name="objective" defaultValue={campaign.objective} maxLength={200} /></Field>
          </div>
          <Field label="Target audience" required><Input name="targetAudience" defaultValue={campaign.targetAudience} maxLength={300} /></Field>
          <Field label="Key message" required><Textarea name="keyMessage" defaultValue={campaign.keyMessage} rows={2} maxLength={1000} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Evidence"><Textarea name="evidence" defaultValue={campaign.evidence} rows={2} maxLength={2000} /></Field>
            <Field label="CTA" required><Input name="cta" defaultValue={campaign.cta} maxLength={200} /></Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Success metric" required><Input name="successMetric" defaultValue={campaign.successMetric} maxLength={200} /></Field>
            <Field label="Start date"><Input name="startDate" type="date" defaultValue={campaign.schedule?.startDate ?? ""} /></Field>
            <Field label="Cadence"><Input name="cadence" defaultValue={campaign.schedule?.cadence ?? ""} maxLength={100} /></Field>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="charcoal">channels</Badge> {campaign.channels.join(", ")}
            <Badge variant="charcoal">formats</Badge> {campaign.formats.join(", ")}
            <StatusBadge status={campaign.status} />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
            {saved && <span className="text-sm text-moss">{saved}</span>}
            {busy && <Loading label="" />}
          </div>
        </form>
      </details>
    </Card>
  );
}
