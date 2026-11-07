/**
 * One plain-language reading of a publication, used on every page that shows
 * one (blocker 09): what happened, in words a founder uses, and the single next
 * step. Pure, so every page says the same thing for the same record.
 */

export type PublicationLike = {
  status: string;
  provider: string;
  manual: boolean;
  externalId: string | null;
  externalUrl: string | null;
  attempts: number;
  lastError: string | null;
  scheduledFor: Date | string | null;
};

export type NextStep =
  | { kind: "none" }
  | { kind: "wait"; until?: Date }
  | { kind: "retry" }
  | { kind: "reconnect"; href: string }
  | { kind: "record_url" }
  | { kind: "review" };

export type Tone = "good" | "pending" | "warn" | "bad" | "neutral";

export type PlainState = { label: string; tone: Tone; detail: string; next: NextStep };

const providerName = (p: string) => (p === "socialflow" ? "SocialFlow.ai" : p === "manual" ? "you" : p);
const when = (d: Date | string | null) => (d ? new Date(d) : undefined);

/** Error text from a failed attempt, read for the cause a founder can act on. */
export function causeOf(lastError: string | null): "auth" | "rate" | "content" | "unconfirmed_cancelled" | "unconfirmed_open" | "provider_failed" | "unknown" {
  const e = (lastError ?? "").toLowerCase();
  if (!e) return "unknown";
  if (/cancelled it in socialflow/.test(e)) return "unconfirmed_cancelled";
  if (/may still publish/.test(e)) return "unconfirmed_open";
  if (/(auth|unauthori[sz]ed|revoked|expired|invalid .*key|401|403|reconnect)/.test(e)) return "auth";
  if (/(rate.?limit|429|slow down|too many)/.test(e)) return "rate";
  if (/(validation|too long|422|400|unsupported format|character)/.test(e)) return "content";
  if (/reports that the post failed/.test(e)) return "provider_failed";
  return "unknown";
}

export function describePublication(p: PublicationLike): PlainState {
  const via = providerName(p.provider);
  switch (p.status) {
    case "published":
      if (p.manual) return { label: "Live", tone: "good", detail: "Published by you; you recorded the live link.", next: { kind: "none" } };
      return p.externalUrl
        ? { label: "Live", tone: "good", detail: `Published and confirmed by ${via}.`, next: { kind: "none" } }
        : { label: "Live, link pending", tone: "good", detail: `${via} confirmed the post. Banyan fetches its link on the next check.`, next: { kind: "wait" } };
    case "attempting":
      return { label: "Sending", tone: "pending", detail: `Being sent to ${via} now.`, next: { kind: "wait" } };
    case "scheduled": {
      const at = when(p.scheduledFor);
      if (p.externalId) {
        return { label: "Waiting for confirmation", tone: "pending", detail: `${via} has the post but has not confirmed it is live. Banyan checks again${at ? ` at ${at.toLocaleString()}` : " shortly"} and marks it live only when ${via} confirms.`, next: { kind: "wait", until: at } };
      }
      if (p.lastError && p.attempts > 0) {
        return { label: "Retrying", tone: "warn", detail: `Attempt ${p.attempts} did not go through: ${p.lastError} Banyan tries again${at ? ` at ${at.toLocaleString()}` : " shortly"}.`, next: { kind: "wait", until: at } };
      }
      return { label: "Scheduled", tone: "pending", detail: at ? `Goes out at ${at.toLocaleString()}.` : "Scheduled.", next: { kind: "wait", until: at } };
    }
    case "failed": {
      const cause = causeOf(p.lastError);
      const reason = p.lastError ? ` ${p.lastError}` : "";
      if (cause === "auth") return { label: "Not sent: account needs reconnecting", tone: "bad", detail: `The connected account was refused.${reason}`, next: { kind: "reconnect", href: "/app/connections" } };
      if (cause === "content") return { label: "Not sent: the post was refused", tone: "bad", detail: `The platform refused this copy.${reason} Edit it (it goes back to review), then publish again.`, next: { kind: "review" } };
      if (cause === "unconfirmed_open") return { label: "Unconfirmed", tone: "warn", detail: `${via} never confirmed this post and may still publish it. Retrying first checks what happened, so it is not posted twice.`, next: { kind: "retry" } };
      return { label: "Not sent", tone: "bad", detail: `${reason.trim() || "The attempt failed."} Nothing went out.`, next: { kind: "retry" } };
    }
    case "blocked": {
      const e = (p.lastError ?? "").toLowerCase();
      if (/cancelled by user/.test(e)) return { label: "Cancelled", tone: "neutral", detail: p.lastError ?? "Cancelled.", next: { kind: "none" } };
      if (/lost approval/.test(e)) return { label: "Stopped: changed after approval", tone: "warn", detail: "The copy changed after it was approved, so it was not sent. Approve the new version to publish it.", next: { kind: "review" } };
      if (/automated publishing is not available|export/.test(e)) return { label: "Publish it yourself", tone: "neutral", detail: "No publishing connection is set up for this channel. Post it yourself, then record the live link here.", next: { kind: "record_url" } };
      return { label: "Not sent", tone: "warn", detail: p.lastError ?? "Publishing was stopped.", next: { kind: "retry" } };
    }
    default:
      return { label: p.status.replace(/_/g, " "), tone: "neutral", detail: p.lastError ?? "", next: { kind: "none" } };
  }
}
