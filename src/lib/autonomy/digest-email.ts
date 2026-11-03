import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { buildDigest, isSupervised, parsePolicy, type Digest } from "@/lib/autonomy/policy";
import { autonomyEvents } from "@/lib/autonomy/service";
import { pendingSpotChecks } from "@/lib/autonomy/spot-checks";
import { channelTrust } from "@/lib/autonomy/trust-service";
import { queueEmail } from "@/lib/email/outbox";
import { oneClickUnsubscribeUrl, parseEmailPrefs, unsubscribeUrl } from "@/lib/email/preferences";

/**
 * The weekly autopilot summary (STRATEGY.md Level 2: "weekly digest of
 * everything auto-approved"). A supervised autopilot acts while the founder
 * is away; this is how they hear what it did and what waits for them,
 * without opening Banyan. Sent once per ISO week (UTC) per workspace and
 * owner, only when something happened or is waiting, only to confirmed
 * addresses, and never to someone who turned it off.
 */

const NAME: Record<string, string> = { linkedin: "LinkedIn", x: "X", shortvideo: "short-form video" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type DigestFacts = {
  digest: Digest;
  waitingApprovals: number;
  spotChecks: number;
  slipping: string[];
  paused: boolean;
};

/** Plain sentences for the email: what the autopilot did, and what needs the founder. Pure. */
export function digestLines(f: DigestFacts): { done: string[]; waiting: string[] } {
  const done: string[] = [];
  const d = f.digest;
  if (d.autoApproved) {
    const by = d.byChannel.filter((c) => c.autoApproved).map((c) => `${c.autoApproved} on ${NAME[c.channel] ?? c.channel}`).join(", ");
    done.push(`Approved ${plural(d.autoApproved, "routine draft")} within your rules (${by}).`);
  }
  if (d.scheduled) done.push(`Scheduled ${d.scheduled} of them into the next slots your rules allow.`);
  if (d.notScheduled) done.push(`Left ${plural(d.notScheduled, "approved post")} unscheduled, for you to publish (no verified connection or no free slot).`);
  if (d.escalated) {
    const top = d.topEscalations[0];
    done.push(`Sent ${plural(d.escalated, "draft")} back to you${top ? `; most often because: ${top.reason}` : "."}`);
  }

  const waiting: string[] = [];
  if (f.paused) waiting.push("Your agents are paused: nothing is drafted, approved or scheduled until you resume them.");
  if (f.waitingApprovals) waiting.push(`${plural(f.waitingApprovals, "draft")} waiting for your review.`);
  if (f.spotChecks) waiting.push(`${plural(f.spotChecks, "spot check")}: posts Banyan approved on its own, for you to confirm or stop.`);
  for (const c of f.slipping) {
    waiting.push(`${NAME[c] ?? c}'s record slipped (a rejection, flagged claim or failed post). Banyan suggests approving each ${NAME[c] ?? c} draft again until it is clean.`);
  }
  return { done, waiting };
}

/** ISO 8601 week key in UTC, e.g. "2026-W45". */
export function isoWeekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export async function sendDueAutonomyDigests(now: Date = new Date()): Promise<{ workspaces: number; queued: number }> {
  const week = isoWeekKey(now);
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const candidates = await prisma.workspace.findMany({
    where: { autonomyPolicy: { contains: '"supervised"' } },
    select: { id: true, name: true, agentsPausedAt: true, autonomyPolicy: true, profile: { select: { name: true } } },
  });
  let workspaces = 0;
  let queued = 0;
  for (const ws of candidates) {
    const policy = parsePolicy(ws.autonomyPolicy);
    if (!isSupervised(policy)) continue;
    try {
      const owners = await prisma.membership.findMany({
        where: { workspaceId: ws.id, role: "owner", user: { emailVerifiedAt: { not: null } } },
        select: { user: { select: { id: true, name: true, email: true, emailPrefs: true } } },
      });
      const recipients = owners.map((o) => o.user).filter((u) => parseEmailPrefs(u.emailPrefs).autonomyDigest);
      if (!recipients.length) continue;

      const [events, spot, waitingApprovals, verdicts] = await Promise.all([
        autonomyEvents(ws.id, since, 1000),
        pendingSpotChecks(ws.id, now),
        prisma.contentItem.count({ where: { workspaceId: ws.id, status: "ready_for_review" } }),
        channelTrust(ws.id, policy),
      ]);
      const lines = digestLines({
        digest: buildDigest(events, since),
        waitingApprovals,
        spotChecks: spot.length,
        slipping: verdicts.filter((v) => v.state === "slipping").map((v) => v.channel),
        paused: Boolean(ws.agentsPausedAt),
      });
      if (!lines.done.length && !lines.waiting.length) continue; // a quiet week sends nothing
      workspaces++;

      const product = ws.profile?.name || ws.name;
      for (const u of recipients) {
        const res = await queueEmail({
          template: "autonomy_digest",
          to: u.email,
          userId: u.id,
          dedupeKey: `autonomy_digest:${ws.id}:${u.id}:${week}`,
          data: {
            name: u.name,
            product,
            period: `${fmt(since)} to ${fmt(now)}`,
            done: lines.done,
            waiting: lines.waiting,
            link: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/app/autonomy`,
            unsubscribe: unsubscribeUrl(u.id, "autonomyDigest"),
            oneClick: oneClickUnsubscribeUrl(u.id, "autonomyDigest"),
          },
        });
        if (!res.duplicate) queued++;
      }
    } catch (err) {
      log("error", "autonomy.digest_failed", { workspaceId: ws.id, error: (err as Error).message });
    }
  }
  return { workspaces, queued };
}
