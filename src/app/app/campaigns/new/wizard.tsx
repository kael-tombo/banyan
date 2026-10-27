"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea, Loading } from "@/components/ui";
import { CHANNEL_META, CHANNEL_FORMATS } from "@/lib/formats";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";

type Profile = { name: string; description: string; audience: string; goal: string; valueProp: string };

export function CampaignWizard({ profile, existing }: { profile: Profile; existing: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill sensible defaults from the workspace profile.
  const [channels, setChannels] = useState<string[]>(["x"]);
  const [formats, setFormats] = useState<string[]>(["single"]);

  function toggleChannel(key: string) {
    setChannels((c) => {
      const next = c.includes(key) ? c.filter((k) => k !== key) : [...c, key];
      if (!next.includes(key)) setFormats((f) => f.filter((f) => CHANNEL_FORMATS[key as keyof typeof CHANNEL_FORMATS]?.some((x) => x.key === f)));
      return next;
    });
  }
  function toggleFormat(key: string) {
    setFormats((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      objective: String(form.get("objective") || ""),
      targetAudience: String(form.get("targetAudience") || profile.audience || ""),
      keyMessage: String(form.get("keyMessage") || ""),
      evidence: String(form.get("evidence") || ""),
      cta: String(form.get("cta") || ""),
      channels,
      formats,
      schedule: {
        startDate: String(form.get("startDate") || ""),
        cadence: String(form.get("cadence") || ""),
      },
      successMetric: String(form.get("successMetric") || ""),
    };
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create campaign.");
      setCreated(data.campaign.id);
      router.push(`/app/campaigns/${data.campaign.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) return null;

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campaign name" required><Input name="name" required maxLength={120} placeholder="e.g. Why building is not enough" /></Field>
          <Field label="Objective" required><Input name="objective" required maxLength={200} placeholder="e.g. attract early adopters via founder story" /></Field>
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="Target audience" required hint={profile.audience ? `Workspace audience: ${profile.audience}` : undefined}>
            <Input name="targetAudience" defaultValue={profile.audience} required maxLength={300} />
          </Field>
          <Field label="Key message" required hint="The one idea this campaign should leave behind.">
            <Textarea name="keyMessage" required rows={2} maxLength={1000} />
          </Field>
          <Field label="Supporting evidence (optional)" hint="Facts only. Claims without evidence will not be generated.">
            <Textarea name="evidence" rows={2} maxLength={2000} placeholder="e.g. we are live at app.banyan.ai; onboarding takes about 5 minutes" />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal">Channels &amp; formats</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(["x", "linkedin", "shortvideo"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={channels.includes(k)}
                onClick={() => toggleChannel(k)}
                className={`rounded-full border px-3 py-1.5 text-sm ${channels.includes(k) ? "border-forest/40 bg-forest/10 text-forest-deep" : "border-bark/15 bg-white text-charcoal-soft hover:border-forest/30"}`}
              >
                {CHANNEL_META[k].label}
              </button>
            ))}
          </div>
          {channels.map((c) => (
            <div key={c}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-charcoal-soft">{CHANNEL_META[c as keyof typeof CHANNEL_META].label} formats</p>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_FORMATS[c as keyof typeof CHANNEL_FORMATS].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={formats.includes(f.key)}
                    onClick={() => toggleFormat(f.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${formats.includes(f.key) ? "border-forest/40 bg-forest/5 text-forest-deep" : "border-bark/15 bg-white text-charcoal-soft"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal">Plan &amp; success metric</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Proposed start date (optional)"><Input name="startDate" type="date" /></Field>
          <Field label="Cta" required><Input name="cta" required maxLength={200} placeholder="e.g. Try it and tell us what's missing" /></Field>
          <Field label="Success metric" required hint="How will this campaign be evaluated?">
            <Input name="successMetric" required maxLength={200} placeholder="e.g. tracked link clicks / 10 product trials" />
          </Field>
          <Field label="Content volume (optional)"><Input name="cadence" maxLength={100} placeholder="e.g. 3 posts over 2 weeks" /></Field>
        </div>
      </Card>

      <ErrorNote>{error}</ErrorNote>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || channels.length === 0 || formats.length === 0}>
          {busy ? "Creating…" : "Create campaign as draft"} <CheckCircle2 size={16} aria-hidden="true" />
        </Button>
        {busy && <Loading />}
        <span className="text-xs text-charcoal-soft">Draft is editable before being planned.</span>
      </div>
    </form>
  );
}
