"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { Badge, Button, ErrorNote } from "@/components/ui";
import type { TrustVerdict } from "@/lib/autonomy/trust";

const NAME: Record<string, string> = { linkedin: "LinkedIn", x: "X" };

/**
 * Earned autonomy, per channel: the evidence, and, when it clears the bar, a
 * proposal the founder can accept. Accepting writes a new policy version under
 * the founder's name; Banyan never applies it by itself.
 */
export function EarnedAutonomy({ verdicts, proposals, canEdit }: { verdicts: TrustVerdict[]; proposals: Record<string, unknown>; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept(channel: string) {
    setBusy(channel);
    setError(null);
    try {
      const res = await fetch("/api/autonomy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(proposals[channel]) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update the policy.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {verdicts.map((v) => (
        <div key={v.channel} className="rounded-xl border border-bark/10 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-forest-deep">{NAME[v.channel]}</h3>
            {v.state === "supervised" && <Badge variant="forest">Supervised</Badge>}
            {v.state === "ready" && <Badge variant="fig">Ready to supervise</Badge>}
            {v.state === "not_yet" && <Badge variant="warm">You approve each</Badge>}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-charcoal">{v.summary}</p>
          <ul className="mt-3 space-y-1">
            {v.checks.map((c) => (
              <li key={c.label} className={`flex items-center gap-2 text-xs ${c.met ? "text-charcoal-soft" : "text-charcoal"}`}>
                {c.met ? <Check size={13} className="shrink-0 text-forest" aria-hidden="true" /> : <Circle size={11} className="shrink-0 text-bark/50" aria-hidden="true" />}
                <span>{c.label}</span>
                <span className="sr-only">{c.met ? "(met)" : "(not met)"}</span>
              </li>
            ))}
          </ul>
          {v.state === "ready" && canEdit && (
            <div className="mt-3 border-t border-bark/10 pt-3">
              <Button size="sm" onClick={() => accept(v.channel)} disabled={busy !== null}>
                {busy === v.channel ? "Updating…" : `Let Banyan approve routine ${NAME[v.channel]} drafts`}
              </Button>
              <p className="mt-1.5 text-[11px] leading-relaxed text-charcoal-soft">
                Your other rules stay as they are. Flagged claims, template drafts and anything unusual still come to you. Undo it any time in Rules below, or pause all agents.
              </p>
            </div>
          )}
        </div>
      ))}
      {error && <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}
