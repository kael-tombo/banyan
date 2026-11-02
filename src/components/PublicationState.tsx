import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { describePublication, type PublicationLike, type Tone } from "@/lib/publishing/plain-state";

const TONE_BADGE: Record<Tone, "forest" | "moss" | "fig" | "clay" | "warm"> = {
  good: "forest",
  pending: "moss",
  warn: "fig",
  bad: "clay",
  neutral: "warm",
};

/**
 * A publication in plain words (blocker 09): one badge, one sentence, one next
 * step. `compact` shows the badge and the live link only, for dense lists.
 */
export function PublicationState({ publication, compact = false }: { publication: PublicationLike; compact?: boolean }) {
  const s = describePublication(publication);
  const live = publication.status === "published" && publication.externalUrl;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={TONE_BADGE[s.tone]}>{s.label}</Badge>
        {live && (
          <a href={publication.externalUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs font-medium text-forest hover:underline">
            Live post <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        )}
        {compact && s.next.kind === "reconnect" && (
          <Link href={s.next.href} className="text-xs font-medium text-clay hover:underline">
            Reconnect
          </Link>
        )}
      </div>
      {!compact && s.detail && <p className={`mt-1 text-xs leading-relaxed ${s.tone === "bad" ? "text-clay" : "text-charcoal-soft"}`}>{s.detail}</p>}
      {!compact && s.next.kind === "reconnect" && (
        <Link href={s.next.href} className="mt-1 inline-block text-xs font-medium text-forest hover:underline">
          Reconnect the account →
        </Link>
      )}
    </div>
  );
}
