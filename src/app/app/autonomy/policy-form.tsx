"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";
import type { AutonomyPolicy } from "@/lib/autonomy/policy";

const CHANNELS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
] as const;

export function PolicyForm({ policy, canEdit }: { policy: AutonomyPolicy; canEdit: boolean }) {
  const router = useRouter();
  const [level, setLevel] = useState(policy.level);
  const [channels, setChannels] = useState<string[]>(policy.channels);
  const [maxPerDay, setMaxPerDay] = useState(policy.maxPerDay);
  const [quiet, setQuiet] = useState(Boolean(policy.quietHours));
  const [quietStart, setQuietStart] = useState(policy.quietHours?.start ?? 21);
  const [quietEnd, setQuietEnd] = useState(policy.quietHours?.end ?? 8);
  const [blackout, setBlackout] = useState(policy.blackoutDates.join(", "));
  const [autoPublish, setAutoPublish] = useState(policy.autoPublish);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const supervised = level === "supervised";
  const dates = blackout.split(/[\s,;]+/).map((d) => d.trim()).filter(Boolean);
  const badDate = dates.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/autonomy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          level,
          channels: supervised ? channels : [],
          maxPerDay,
          quietHours: quiet ? { start: quietStart, end: quietEnd } : null,
          blackoutDates: dates,
          autoPublish: supervised && autoPublish,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the policy.");
      setSaved(`Saved as v${body.policy.version}. ${body.summary}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <form onSubmit={save} className="space-y-5">
      <fieldset disabled={!canEdit || saving} className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How much Banyan may do on its own">
          {(
            [
              { v: "approve_each", title: "Approve each draft", body: "Banyan writes; nothing goes out until you approve it. Today's default." },
              { v: "supervised", title: "Supervised", body: "Banyan approves routine drafts within the rules below and escalates the rest to you." },
            ] as const
          ).map((o) => (
            <label
              key={o.v}
              className={`cursor-pointer rounded-xl border p-3 transition-colors ${level === o.v ? "border-forest/40 bg-forest/[0.05]" : "border-bark/15 bg-white hover:border-bark/30"}`}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="level" value={o.v} checked={level === o.v} onChange={() => setLevel(o.v)} />
                <span className="font-medium text-charcoal">{o.title}</span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-charcoal-soft">{o.body}</span>
            </label>
          ))}
        </div>

        <div className={supervised ? "space-y-5" : "pointer-events-none space-y-5 opacity-50"} aria-disabled={!supervised}>
          <div>
            <p className="text-[13px] font-medium text-charcoal">Channels Banyan may run</p>
            <div className="mt-1.5 flex gap-4">
              {CHANNELS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    checked={channels.includes(c.key)}
                    onChange={(e) => setChannels((v) => (e.target.checked ? [...v, c.key] : v.filter((x) => x !== c.key)))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-charcoal-soft">Short-form video is always yours to publish.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Posts per channel per day">
              <Select value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-[13px] font-medium text-charcoal">
                <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Quiet hours (your time zone)
              </label>
              <div className="mt-1.5 flex items-center gap-2 text-sm text-charcoal-soft">
                <Select aria-label="Quiet hours start" value={quietStart} onChange={(e) => setQuietStart(Number(e.target.value))} disabled={!quiet} className="w-24">
                  {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </Select>
                to
                <Select aria-label="Quiet hours end" value={quietEnd} onChange={(e) => setQuietEnd(Number(e.target.value))} disabled={!quiet} className="w-24">
                  {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </Select>
              </div>
            </div>
          </div>

          <Field label="Blackout dates" hint="YYYY-MM-DD, separated by commas. Nothing is scheduled on these days.">
            <Input value={blackout} onChange={(e) => setBlackout(e.target.value)} placeholder="2026-12-24, 2026-12-25" />
          </Field>
          {badDate && <p className="text-xs text-clay">“{badDate}” is not a date in YYYY-MM-DD form.</p>}

          <label className="flex items-start gap-2 text-sm text-charcoal">
            <input type="checkbox" className="mt-1" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
            <span>
              Also schedule what it approves
              <span className="block text-xs text-charcoal-soft">
                Into the next slot your rules allow, through your verified connection. Off: approved posts wait for you to press publish.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving || Boolean(badDate) || (supervised && channels.length === 0)}>
            {saving ? "Saving…" : "Save policy"}
          </Button>
          {supervised && channels.length === 0 && <span className="text-xs text-charcoal-soft">Pick at least one channel.</span>}
          {saved && <span className="text-sm text-moss">{saved}</span>}
        </div>
      ) : (
        <p className="text-xs text-charcoal-soft">Only owners and members can change the policy.</p>
      )}
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}
