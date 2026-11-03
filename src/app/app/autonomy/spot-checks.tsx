"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, ErrorNote } from "@/components/ui";

const NAME: Record<string, string> = { linkedin: "LinkedIn", x: "X" };

export type SpotCheckView = {
  contentItemId: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  scheduledFor: string | null;
  approvedAt: string;
  policyVersion: number | null;
};

function when(item: SpotCheckView): string {
  if (item.status === "published") return "Already live";
  if (item.status === "scheduled" && item.scheduledFor) return `Goes out ${new Date(item.scheduledFor).toLocaleString()}`;
  if (item.status === "failed") return "Failed to publish";
  return "Approved, waiting for you to publish";
}

/**
 * Spot checks: a sample of what the policy approved on its own, back in front
 * of the founder. Each verdict counts in the channel's record; "Shouldn't go
 * out" also stops a post that has not been published yet.
 */
export function SpotChecks({ items, canEdit }: { items: SpotCheckView[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  async function judge(id: string, verdict: "as_written" | "would_edit" | "stop") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/autonomy/spot-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentItemId: id, verdict }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not record your verdict.");
      setDone((d) => ({ ...d, [id]: String(body.message) }));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) {
    return <p className="mt-2 text-sm text-charcoal-soft">Nothing to check. Banyan sends you the first post it approves on a channel, then one in every three after that.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      <ErrorNote>{error}</ErrorNote>
      {items.map((item) => (
        <article key={item.contentItemId} className="rounded-xl border border-bark/10 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/app/content/${item.contentItemId}`} className="font-medium text-charcoal hover:underline">{item.title}</Link>
            <span className="flex items-center gap-2 text-xs text-charcoal-soft">
              <Badge variant="forest">{NAME[item.channel] ?? item.channel}</Badge>
              {when(item)}
            </span>
          </div>
          <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-charcoal">{item.body}</p>
          <p className="mt-2 text-xs text-charcoal-soft">
            Approved by your policy{item.policyVersion ? ` v${item.policyVersion}` : ""} on {new Date(item.approvedAt).toLocaleString()}.
          </p>
          {done[item.contentItemId] ? (
            <p role="status" className="mt-3 text-sm text-moss">{done[item.contentItemId]}</p>
          ) : canEdit ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-bark/10 pt-3" role="group" aria-label={`Your verdict on ${item.title}`}>
              <span className="mr-1 text-[13px] text-charcoal">Would you have approved it?</span>
              <Button size="sm" onClick={() => judge(item.contentItemId, "as_written")} disabled={busy !== null}>Yes, as written</Button>
              <Button size="sm" variant="secondary" onClick={() => judge(item.contentItemId, "would_edit")} disabled={busy !== null}>I'd have changed it</Button>
              <Button size="sm" variant="secondary" onClick={() => judge(item.contentItemId, "stop")} disabled={busy !== null}>
                {item.status === "published" ? "It shouldn't have gone out" : "Stop it, it shouldn't go out"}
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-charcoal-soft">Owners and members give the verdict.</p>
          )}
        </article>
      ))}
    </div>
  );
}
