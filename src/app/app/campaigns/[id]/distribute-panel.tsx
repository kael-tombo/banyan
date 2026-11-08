"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, Download, ExternalLink, Send } from "lucide-react";
import { Button, Card, ErrorNote, Input } from "@/components/ui";
import { CHANNEL_META, type Channel } from "@/lib/formats";
import type { CampaignCounts, NextStep } from "@/lib/campaign/progress";

type Post = { id: string; title: string; channel: string; status: string; liveUrl: string | null };
type KitItem = { contentItemId: string; channel: string; title: string; body: string; trackedLink: string | null; checklist: string[] };
type Outcome = { contentItemId: string; title: string; ok: boolean; message: string };

const label = (c: string) => CHANNEL_META[c as Channel]?.label ?? c;

/**
 * Distribute — US-047 and US-049. The campaign's posts by state, the one
 * next step, and the way out: a posting kit in export mode (copy, post,
 * record the live link), or one-click publishing through SocialFlow.ai
 * once it is verified.
 */
export function DistributePanel({
  campaignId,
  mode,
  counts,
  next,
  posts,
  canPublish,
}: {
  campaignId: string;
  mode: "socialflow" | "export";
  counts: CampaignCounts;
  next: NextStep;
  posts: Post[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kit, setKit] = useState<KitItem[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  async function openKit() {
    setBusy("kit");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/export`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not prepare the posting kit.");
      setKit(data.items as KitItem[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function downloadKit() {
    setBusy("download");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/export?format=md`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error("Could not download the posting kit.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `banyan-posting-kit-${campaignId}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy(item: KitItem) {
    const text = item.trackedLink ? `${item.body}\n\n${item.trackedLink}` : item.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(item.contentItemId);
      window.setTimeout(() => setCopied((c) => (c === item.contentItemId ? null : c)), 2000);
    } catch {
      setError("Copying is blocked in this browser. Select the text and copy it instead.");
    }
  }

  async function record(id: string) {
    setBusy(`record:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/content/${id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "manual", liveUrl: urls[id] ?? "" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || "Could not record the live link.");
      setKit((k) => k?.filter((i) => i.contentItemId !== id) ?? null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function publishAll() {
    setBusy("publish");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/distribute`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not publish.");
      setOutcomes(data.outcomes as Outcome[]);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const stats: { key: string; label: string; value: number; tone?: string }[] = [
    { key: "review", label: "In review", value: counts.review },
    { key: "ready", label: "Ready to post", value: counts.ready },
    { key: "out", label: "Scheduled or publishing", value: counts.scheduled + counts.publishing },
    { key: "published", label: "Published", value: counts.published },
    ...(counts.failed ? [{ key: "failed", label: "Did not go out", value: counts.failed, tone: "text-clay" }] : []),
  ];
  const published = posts.filter((p) => p.status === "published");

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-charcoal">Distribute</h2>
          <p className="mt-1 text-[13px] text-charcoal-soft">
            {mode === "socialflow" ? "Publishing through SocialFlow.ai. Banyan records what the provider confirms." : "Export mode: you post from a ready-made kit, Banyan tracks every visit and signup through each post's link."}
          </p>
        </div>
      </div>

      <dl className={`mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bark/10 bg-bark/10 ${stats.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        {stats.map((s) => (
          <div key={s.key} className="bg-white px-4 py-3">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className={`num mt-1 text-xl font-medium ${s.tone ?? "text-forest-deep"}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-charcoal">Next: {next.label}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-charcoal-soft">{next.detail}</p>
        </div>
        {next.kind === "review" && (
          <Link href="/app/approvals" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-forest-deep px-3 text-[13px] font-medium text-white hover:bg-forest">
            Open approvals <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
        {next.kind === "write" && (
          <Link href="/app/strategy" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-forest-deep px-3 text-[13px] font-medium text-white hover:bg-forest">
            Open strategy <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
        {next.kind === "post" && canPublish && !kit && (
          <Button size="sm" onClick={openKit} disabled={!!busy}>{busy === "kit" ? "Preparing…" : "Open posting kit"}</Button>
        )}
        {next.kind === "publish" && canPublish && (
          <Button size="sm" onClick={publishAll} disabled={!!busy}><Send size={14} aria-hidden="true" /> {busy === "publish" ? "Publishing…" : "Publish approved posts"}</Button>
        )}
      </div>

      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>

      {outcomes && (
        <ul className="mt-4 space-y-1.5 text-[13px]" role="status">
          {outcomes.map((o) => (
            <li key={o.contentItemId} className={o.ok ? "text-forest" : "text-clay"}>
              {o.ok ? "Sent" : "Not sent"}: {o.title} — {o.message}
            </li>
          ))}
        </ul>
      )}

      {kit && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-charcoal">Posting kit · {kit.length} {kit.length === 1 ? "post" : "posts"}</h3>
            <Button size="sm" variant="ghost" onClick={downloadKit} disabled={!!busy}><Download size={14} aria-hidden="true" /> Download as Markdown</Button>
          </div>
          {kit.length === 0 && <p className="mt-2 text-[13px] text-charcoal-soft">Every approved post has its live link recorded.</p>}
          <ol className="mt-3 space-y-4">
            {kit.map((item, i) => (
              <li key={item.contentItemId} className="rounded-xl border border-bark/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-charcoal"><span className="num mr-2 font-mono text-xs text-muted">{i + 1}</span>{label(item.channel)} · {item.title}</p>
                  <Button size="sm" variant="secondary" onClick={() => copy(item)}>
                    {copied === item.contentItemId ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy post</>}
                  </Button>
                </div>
                <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2.5 text-[13px] leading-relaxed text-charcoal">
                  {item.body}
                  {item.trackedLink && <span className="mt-2 block font-mono text-xs text-forest">{item.trackedLink}</span>}
                </div>
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void record(item.contentItemId);
                  }}
                >
                  <label htmlFor={`url-${item.contentItemId}`} className="sr-only">Live post link for {item.title}</label>
                  <Input
                    id={`url-${item.contentItemId}`}
                    type="url"
                    inputMode="url"
                    placeholder="Paste the live post link after posting"
                    value={urls[item.contentItemId] ?? ""}
                    onChange={(e) => setUrls((u) => ({ ...u, [item.contentItemId]: e.target.value }))}
                    className="min-w-0 flex-1"
                  />
                  <Button type="submit" size="sm" disabled={!!busy || !(urls[item.contentItemId] ?? "").startsWith("https://")}>
                    {busy === `record:${item.contentItemId}` ? "Recording…" : "Mark as posted"}
                  </Button>
                </form>
              </li>
            ))}
          </ol>
        </div>
      )}

      {published.length > 0 && (
        <div className="mt-5 border-t border-bark/[0.08] pt-4">
          <h3 className="text-sm font-medium text-charcoal">Live</h3>
          <ul className="mt-2 divide-y divide-bark/[0.06] text-[13px]">
            {published.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/app/content/${p.id}`} className="min-w-0 truncate text-charcoal hover:text-forest">{label(p.channel)} · {p.title}</Link>
                {p.liveUrl && (
                  <a href={p.liveUrl} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-1 text-forest hover:text-forest-deep">
                    View post <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
