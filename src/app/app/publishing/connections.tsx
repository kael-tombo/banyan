"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Select, StatusBadge } from "@/components/ui";
import { expiryNote } from "@/lib/distribution/token-expiry";

type Connection = {
  id: string;
  channel: string;
  adapter: string;
  label: string;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
};

type Provider = { id: string; label: string };

type Account = {
  id: string;
  platform: string;
  handle: string;
  status: "active" | "revoked" | "error";
  capabilities: { publish: boolean; schedule: boolean; analytics: boolean };
  tokenExpiresAt?: string | null;
};

const CHANNEL_NAME: Record<string, string> = { linkedin: "LinkedIn", x: "X" };
const channelName = (c: string) => CHANNEL_NAME[c] ?? c;

export function ConnectionManager({ initial, providers }: { initial: Connection[]; providers: Provider[] }) {
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

  async function disconnect(c: Connection) {
    const message =
      `Remove the ${c.label} connection from Banyan? Scheduled attempts for it will be blocked until you reconnect.` +
      (c.adapter === "socialflow" ? `\n\nAny ${channelName(c.channel)} account stays connected in SocialFlow. To revoke its access, disconnect the account below first.` : "");
    if (!window.confirm(message)) return;
    setBusy(c.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/connections/${c.id}`, { method: "DELETE", body: JSON.stringify({}) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not disconnect.");
      }
      setNotice("Connection removed.");
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
              <li key={c.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                    <Button variant="danger" size="sm" onClick={() => disconnect(c)} disabled={busy === c.id}>
                      Remove
                    </Button>
                  </span>
                </div>
                {c.status === "verified" && providers.some((p) => p.id === c.adapter) && <AccountsPanel connection={c} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ErrorNote>{error}</ErrorNote>
      {notice && <p className="mt-2 text-sm text-moss">{notice}</p>}

      <Card className="mt-4">
        <h2 className="mb-1 font-medium text-charcoal">Add a connection</h2>
        {providers.length > 0 ? (
          <AddConnectionForm providers={providers} existing={initial} />
        ) : (
          <p className="text-sm leading-relaxed text-charcoal-soft">
            Nothing to connect yet. Banyan distributes through SocialFlow.ai, and this deployment has no verified
            SocialFlow.ai connection, so none can be created. Until there is one, use export mode: open an approved
            post, export it, publish it yourself, and record the live URL.
          </p>
        )}
      </Card>
    </>
  );
}

function AddConnectionForm({ providers, existing }: { providers: Provider[]; existing: Connection[] }) {
  const router = useRouter();
  const [adapter, setAdapter] = useState(providers[0].id);
  const [channel, setChannel] = useState<"linkedin" | "x">("linkedin");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = existing.some((c) => c.adapter === adapter && c.channel === channel && c.status !== "removed");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adapter, channel, credentials: { apiKey: apiKey.trim() } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not add the connection.");
      if (!body.check?.ok) throw new Error(`Saved, but the key was not accepted: ${body.check?.detail ?? "unknown reason"}`);
      setApiKey("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
      {providers.length > 1 && (
        <Field label="Provider">
          <Select value={adapter} onChange={(e) => setAdapter(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Channel">
        <Select value={channel} onChange={(e) => setChannel(e.target.value as "linkedin" | "x")}>
          <option value="linkedin">LinkedIn</option>
          <option value="x">X</option>
        </Select>
      </Field>
      <Field label={`${providers.find((p) => p.id === adapter)?.label ?? "Provider"} API key`} hint="Stored encrypted; never shown again." required>
        <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sfl_…" />
      </Field>
      <Button type="submit" disabled={saving || !apiKey.trim() || taken}>
        {saving ? <Loading label="Checking" /> : "Add"}
      </Button>
      {taken && <p className="text-xs text-charcoal-soft sm:col-span-4">This channel already has a connection.</p>}
      {error && (
        <div className="sm:col-span-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </form>
  );
}

/** US-032: the LinkedIn or X account behind a connection, connected at the provider (which keeps the token). */
function AccountsPanel({ connection }: { connection: Connection }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const name = channelName(connection.channel);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/connections/${connection.id}/accounts`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load accounts.");
      setAccounts(body.accounts);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [connection.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy("connect");
    setError(null);
    // Open the tab synchronously (inside the click) so popup blockers allow it.
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/connections/${connection.id}/accounts`, { method: "POST", body: JSON.stringify({}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Could not start connecting ${name}.`);
      if (tab) {
        tab.opener = null;
        tab.location.href = body.connectUrl;
      } else {
        window.location.href = body.connectUrl;
      }
      setWaiting(true);
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function revoke(a: Account) {
    if (!window.confirm(`Disconnect ${a.handle}? Banyan will no longer be able to publish to it, and its access is revoked.`)) return;
    setBusy(a.id);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${connection.id}/accounts/${encodeURIComponent(a.id)}`, { method: "DELETE", body: JSON.stringify({}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not disconnect.");
      if (!body.platformConfirmed) setError(`${a.handle} is disconnected from Banyan and SocialFlow, but ${name} did not confirm the revocation. Remove the app in your ${name} settings to be sure.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const visible = (accounts ?? []).filter((a) => a.status !== "revoked");
  const active = visible.filter((a) => a.status === "active");

  return (
    <div className="mt-3 rounded-lg border border-bark/10 bg-bark/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-charcoal">{name} account</span>
        <span className="flex items-center gap-2">
          {waiting && (
            <Button variant="secondary" size="sm" onClick={() => { setWaiting(false); void load(); }}>
              I've finished — refresh
            </Button>
          )}
          {active.length === 0 && (
            <Button size="sm" onClick={connect} disabled={busy === "connect"}>
              {busy === "connect" ? <Loading label="" /> : visible.length ? `Reconnect ${name}` : `Connect ${name}`}
            </Button>
          )}
        </span>
      </div>
      {accounts === null && !error && <p className="mt-1 text-xs text-charcoal-soft">Loading…</p>}
      {accounts !== null && visible.length === 0 && (
        <p className="mt-1 text-xs text-charcoal-soft">
          No {name} account connected yet. Publishing to {name} stays blocked until you connect one.
        </p>
      )}
      {visible.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {visible.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="text-charcoal">{a.handle}</span>
                <StatusBadge status={a.status} />
                {a.status === "error" && <span className="text-xs text-clay">needs reconnecting</span>}
                {a.status === "active" && (
                  <span className="text-xs text-charcoal-soft">
                    {[a.capabilities.publish && "publish", a.capabilities.schedule && "schedule", a.capabilities.analytics ? "analytics" : "no analytics"].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <Button variant="danger" size="sm" onClick={() => revoke(a)} disabled={busy === a.id}>
                {busy === a.id ? <Loading label="" /> : "Disconnect"}
              </Button>
              {(() => {
                const note = a.status === "revoked" ? null : expiryNote(a.tokenExpiresAt);
                return note ? (
                  <span className={`basis-full text-xs ${note.tone === "ok" ? "text-charcoal-soft" : "text-clay"}`}>{note.text}</span>
                ) : null;
              })()}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1.5 text-xs text-clay">{error}</p>}
    </div>
  );
}
