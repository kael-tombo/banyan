"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, StatusBadge, Loading } from "@/components/ui";

type Connection = {
  id: string;
  channel: string;
  adapter: string;
  label: string;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export function ConnectionManager({ initial }: { initial: Connection[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("add");
    setError(null);
    setNotice(null);
    const form = new FormData(e.currentTarget);
    const channel = String(form.get("channel") || "x");
    const ids = String(form.get("integrationIds") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel,
          adapter: "postiz",
          label: String(form.get("label") || ""),
          baseUrl: String(form.get("baseUrl") || ""),
          apiKey: String(form.get("apiKey") || ""),
          integrationIds: { [channel]: ids },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the connection.");
      (e.target as HTMLFormElement).reset();
      setNotice(body.check?.ok ? "Connection saved and verified." : `Saved, but verification failed: ${body.check?.detail ?? "unknown reason"}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function retest(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "POST", body: JSON.stringify({}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not re-test the connection.");
      setNotice(body.detail || (body.check?.ok ? "Verified." : "Still failing."));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    if (!window.confirm("Disconnect this channel? Scheduled attempts for it will be blocked until you reconnect.")) return;
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE", body: JSON.stringify({}) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not disconnect.");
      }
      setNotice("Disconnected.");
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
        <h2 className="mb-1 font-medium text-charcoal">Connected channels</h2>
        {initial.length === 0 ? (
          <p className="text-sm text-charcoal-soft">
            No connection yet. Content can still be drafted and approved — publishing stays <Badge variant="clay">blocked</Badge>{" "}
            until a provider is connected, and blocked attempts explain exactly what is missing.
          </p>
        ) : (
          <ul className="divide-y divide-bark/10">
            {initial.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-charcoal">{c.label}</span>
                    <Badge variant="charcoal">{c.channel}</Badge>
                    <StatusBadge status={c.status} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-charcoal-soft">
                    {c.adapter}
                    {c.lastCheckedAt ? ` · checked ${new Date(c.lastCheckedAt).toLocaleString()}` : " · never checked"}
                    {c.lastError ? ` · ${c.lastError}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => retest(c.id)} disabled={busy === c.id}>
                    {busy === c.id ? <Loading label="" /> : "Re-test"}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => disconnect(c.id)} disabled={busy === c.id}>
                    Disconnect
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-medium text-charcoal">Add a Postiz connection</h2>
        <form onSubmit={add} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Channel" required>
              <Select name="channel" defaultValue="x">
                <option value="x">X</option>
                <option value="linkedin">LinkedIn</option>
              </Select>
            </Field>
            <Field label="Label (optional)" hint="A name you will recognise later.">
              <Input name="label" maxLength={120} placeholder="e.g. Founder X account" />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Postiz base URL" required hint="Your Postiz instance, e.g. https://postiz.example.com">
              <Input name="baseUrl" inputMode="url" placeholder="https://postiz.example.com" maxLength={300} />
            </Field>
            <Field label="Postiz API key" required hint="Stored encrypted; never sent to the browser again.">
              <Input name="apiKey" type="password" maxLength={400} autoComplete="off" />
            </Field>
          </div>
          <Field
            label="Integration IDs"
            hint="Comma-separated Postiz integration ids for this channel (found in your Postiz dashboard)."
          >
            <Input name="integrationIds" placeholder="e.g. clx123, clx456" />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          {notice && <p className="text-sm text-moss">{notice}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy === "add"}>
              {busy === "add" ? "Verifying…" : "Save & verify connection"}
            </Button>
            <span className="text-xs text-charcoal-soft">Verification calls the provider — a bad key fails clearly here.</span>
          </div>
        </form>
      </Card>
    </>
  );
}
