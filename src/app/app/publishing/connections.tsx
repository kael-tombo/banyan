"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorNote, StatusBadge, Loading } from "@/components/ui";

type Connection = {
  id: string;
  channel: string;
  adapter: string;
  label: string;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export function ConnectionManager({ initial, providersAvailable }: { initial: Connection[]; providersAvailable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
            No connection. Content can still be drafted and approved; automated publishing stays <Badge variant="clay">blocked</Badge>{" "}
            with an explanation, and you can export any approved post and record where it went live.
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
                  {c.status !== "removed" && (
                    <Button variant="secondary" size="sm" onClick={() => retest(c.id)} disabled={busy === c.id}>
                      {busy === c.id ? <Loading label="" /> : "Re-test"}
                    </Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => disconnect(c.id)} disabled={busy === c.id}>
                    Disconnect
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ErrorNote>{error}</ErrorNote>
      {notice && <p className="mt-2 text-sm text-moss">{notice}</p>}

      <Card className="mt-4">
        <h2 className="mb-1 font-medium text-charcoal">Add a connection</h2>
        {providersAvailable ? (
          <p className="text-sm text-charcoal-soft">Connect an account through SocialFlow.ai to publish approved posts automatically.</p>
        ) : (
          <p className="text-sm leading-relaxed text-charcoal-soft">
            Nothing to connect yet. Banyan distributes through SocialFlow.ai, which has no API Banyan can verify today, so
            no connection can be created. Until it does, use export mode: open an approved post, export it, publish it
            yourself, and record the live URL.
          </p>
        )}
      </Card>
    </>
  );
}
