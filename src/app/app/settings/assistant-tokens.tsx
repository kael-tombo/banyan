"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

type Token = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

/** Connect an AI assistant (MCP): read-only personal access tokens for /api/mcp. */
export function AssistantTokens({ initial, mcpUrl }: { initial: Token[]; mcpUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState("Claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const config = created
    ? JSON.stringify({ mcpServers: { banyan: { url: mcpUrl, headers: { Authorization: `Bearer ${created}` } } } }, null, 2)
    : "";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create the token.");
      setCreated(body.token);
      setCopied(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: Token) {
    if (!window.confirm(`Revoke "${t.name}"? Any assistant using it loses access immediately.`)) return;
    setError(null);
    const res = await fetch(`/api/tokens/${t.id}`, { method: "DELETE", body: JSON.stringify({}) });
    if (!res.ok) setError("Could not revoke the token.");
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-charcoal-soft">
        Let Claude or any MCP client answer “what is waiting on me?”, “how is my cycle doing?” or “why was this draft
        flagged?” from your Banyan records. Access is <span className="font-medium text-charcoal">read-only</span>: an
        assistant can never approve, publish, spend credits or change your autonomy mandate. It sends you to the right
        screen instead.
      </p>

      {created ? (
        <div className="rounded-xl border border-forest/25 bg-forest/[0.04] p-3">
          <p className="text-sm font-medium text-charcoal">Copy this now. It will not be shown again.</p>
          <pre className="mt-2 max-w-full overflow-x-auto rounded-lg bg-white p-3 text-xs leading-5 text-charcoal">{config}</pre>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={copy}>{copied ? "Copied" : "Copy client config"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Done</Button>
            <span className="text-xs text-charcoal-soft">Paste it into your MCP client&apos;s server settings.</span>
          </div>
        </div>
      ) : (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Field label="Name this assistant">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create access token"}</Button>
        </form>
      )}

      {initial.length > 0 && (
        <ul className="divide-y divide-bark/10 rounded-xl border border-bark/10">
          {initial.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-charcoal">{t.name}</span>
                <span className="ml-2 font-mono text-xs text-charcoal-soft">{t.prefix}…</span>
                <span className="block text-xs text-charcoal-soft">
                  Created {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : "never used"}
                </span>
              </span>
              <Button size="sm" variant="danger" onClick={() => revoke(t)}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
