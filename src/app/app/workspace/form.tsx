"use client";

import { useState, FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, StatusBadge, Textarea, Loading } from "@/components/ui";
import { CHANNEL_META } from "@/lib/formats";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

const STAGE_OPTIONS = [
  ["idea", "Idea"], ["building", "Building"], ["private_beta", "Private beta"],
  ["public_beta", "Public beta"], ["launched", "Launched"], ["growth", "Growing"],
];
const GOAL_OPTIONS = [
  ["", "Not set"], ["first_users", "Find first users"], ["launch", "Launch a product"],
  ["audience", "Grow an audience"], ["leads", "Generate qualified leads"],
  ["activation", "Improve activation"], ["conversions", "Increase conversions"],
];

type ProfileShape = {
  name: string; description: string; website: string | null; stage: string; problem: string; valueProp: string;
  audience: string | null; goal: string | null; goalTarget: number | null; goalMetric: string | null; timezone: string;
  positioning: string | null; channels: string; brandVoice: string;
} | null;

function safeChannelMeta(channel: string) {
  return CHANNEL_META[channel as keyof typeof CHANNEL_META];
}

export type { ProfileShape as unknown };

export function WorkspaceProfileForm({ profile, workspaceName, isSelf }: { profile: ProfileShape; workspaceName: string; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const voice = typeof profile?.brandVoice === "string" ? JSON.parse(profile.brandVoice || "{}") : {};

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      description: String(form.get("description") || ""),
      website: String(form.get("website") || ""),
      stage: String(form.get("stage") || ""),
      problem: String(form.get("problem") || ""),
      valueProp: String(form.get("valueProp") || ""),
      audience: String(form.get("audience") || ""),
      goal: String(form.get("goal") || ""),
      goalTarget: form.get("goalTarget") ? Number(form.get("goalTarget")) : null,
      goalMetric: String(form.get("goalMetric") || ""),
      timezone: String(form.get("timezone") || "UTC") || undefined,
    };
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save.");
      }
      setSaved("Workspace saved to the database.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 flex items-center justify-between font-medium text-charcoal">
          Product profile
          {workspaceName && <Badge variant="warm">{workspaceName}{isSelf ? " · self-distribution" : ""}</Badge>}
        </h2>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Product name" required><Input name="name" defaultValue={profile?.name ?? ""} maxLength={120} /></Field>
            <Field label="Website (optional)"><Input name="website" defaultValue={profile?.website ?? ""} inputMode="url" placeholder="https://…" /></Field>
          </div>
          <Field label="Description" required><Textarea name="description" defaultValue={profile?.description ?? ""} rows={3} maxLength={2000} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Stage" required><Select name="stage" defaultValue={profile?.stage ?? "building"}>{STAGE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Timezone" hint="Used to display scheduled times.">
              <Input name="timezone" defaultValue={profile?.timezone ?? "UTC"} maxLength={60} />
            </Field>
          </div>
          <Field label="Problem solved" required><Textarea name="problem" defaultValue={profile?.problem ?? ""} rows={2} maxLength={1000} /></Field>
          <Field label="Value proposition" required><Textarea name="valueProp" defaultValue={profile?.valueProp ?? ""} rows={2} maxLength={500} /></Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-medium text-charcoal">Audience &amp; goal</h2>
        <div className="flex flex-col gap-4">
          <Field label="Target audience"><Textarea name="audience" defaultValue={profile?.audience ?? ""} rows={2} maxLength={300} /></Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Distribution goal"><Select name="goal" defaultValue={profile?.goal ?? ""}>{GOAL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Target (optional)"><Input name="goalTarget" type="number" min={0} defaultValue={profile?.goalTarget ?? ""} inputMode="numeric" /></Field>
            <Field label="Target metric (optional)"><Input name="goalMetric" defaultValue={profile?.goalMetric ?? ""} maxLength={120} placeholder="e.g. signups" /></Field>
          </div>
        </div>
      </Card>

      <ErrorNote>{error}</ErrorNote>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save workspace"}</Button>
        {saved && <span className="flex items-center gap-1 text-sm text-moss"><CheckCircle2 size={14} /> {saved}</span>}
        {busy && <Loading label="" />}
      </div>
    </form>
  );
}

export function ChannelBadge({ channel, connections }: { channel: string; connections: { id: string; channel: string; status: string; lastError: string | null }[] }) {
  void safeChannelMeta; // channel metadata available on the client via CHANNEL_META when needed
  const connection = connections.find((c) => c.channel === channel);
  const label = channel === "x" ? "X" : channel === "linkedin" ? "LinkedIn" : channel === "shortvideo" ? "Short-form video" : channel;
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant="warm">{label}</Badge>
      {connection ? (
        <StatusBadge status={connection.status} />
      ) : channel !== "shortvideo" ? (
        <Badge variant="clay">not connected</Badge>
      ) : (
        <Badge variant="charcoal">manual production</Badge>
      )}
    </span>
  );
}
