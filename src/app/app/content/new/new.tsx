"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea } from "@/components/ui";
import { CHANNEL_FORMATS, CHANNEL_META, isChannel, type Channel } from "@/lib/formats";

export function NewContentForm({ campaigns, defaultChannel }: { campaigns: { id: string; name: string }[]; defaultChannel: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>(isChannel(defaultChannel) ? defaultChannel : "x");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formats = CHANNEL_FORMATS[channel];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel,
          format: String(form.get("format") || formats[0]?.key || "single"),
          title: String(form.get("title") || ""),
          body: String(form.get("body") || ""),
          campaignId: String(form.get("campaignId") || "") || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create the draft.");
      const id = body.item?.id;
      if (!id) throw new Error("Draft created but no id was returned.");
      router.push(`/app/content/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Channel" required>
            <Select
              value={channel}
              onChange={(e) => setChannel(isChannel(e.target.value) ? e.target.value : "x")}
            >
              {(Object.keys(CHANNEL_META) as Channel[]).map((c) => (
                <option key={c} value={c}>{CHANNEL_META[c].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Format" required>
            <Select name="format" defaultValue={formats[0]?.key}>
              {formats.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
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

        <p className="text-xs text-charcoal-soft">{CHANNEL_META[channel].capability}</p>

        <Field label="Title (optional)" hint="Leave blank to auto-name it from the channel.">
          <Input name="title" maxLength={200} />
        </Field>
        <Field label="Starting body (optional)" hint="You can write here now, or generate copy in the editor next.">
          <Textarea name="body" rows={6} maxLength={10000} placeholder="Draft as much or as little as you like." />
        </Field>

        <ErrorNote>{error}</ErrorNote>
        <div>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create draft & open editor"}</Button>
        </div>
      </form>
    </Card>
  );
}
