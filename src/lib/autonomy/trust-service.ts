import { prisma } from "@/lib/db";
import { AUTONOMY_CHANNELS, type AutonomyPolicy } from "@/lib/autonomy/policy";
import { autonomyEvents } from "@/lib/autonomy/service";
import { spotCheckVerdicts } from "@/lib/autonomy/spot-checks";
import { TRUST_BAR, trustRecord, trustVerdict, type ReviewedDraft, type TrustVerdict } from "@/lib/autonomy/trust";

/** Read the founder's recent decisions per channel and judge each against the bar (earned autonomy). */
export async function channelTrust(workspaceId: string, policy: AutonomyPolicy): Promise<TrustVerdict[]> {
  const byPolicy = new Set(
    (await autonomyEvents(workspaceId, new Date(Date.now() - 180 * 86_400_000), 500))
      .filter((e) => e.decision === "auto_approved" && e.contentItemId)
      .map((e) => e.contentItemId!),
  );
  // The founder's spot-check verdicts on policy-approved drafts are human decisions too.
  const spotChecks = await spotCheckVerdicts(workspaceId, new Date(Date.now() - 180 * 86_400_000));
  const items = await prisma.contentItem.findMany({
    where: {
      workspaceId,
      channel: { in: [...AUTONOMY_CHANNELS] },
      OR: [{ approvedById: { not: null } }, { status: "rejected" }, { id: { in: [...spotChecks.keys()] } }],
    },
    orderBy: { updatedAt: "desc" },
    take: TRUST_BAR.window * 4,
    select: {
      id: true,
      channel: true,
      status: true,
      checks: true,
      generationMeta: true,
      approvedAt: true,
      revisions: { where: { authorType: "user" }, select: { createdAt: true } },
      publications: { select: { status: true, manual: true } },
    },
  });
  // Only drafts a model wrote count: a hand-written post or a template fallback says nothing about the agents.
  const modelWritten = items.filter((i) => {
    try {
      const m = JSON.parse(i.generationMeta || "{}") as { provider?: string; isFallback?: boolean };
      return Boolean(m.provider) && m.isFallback !== true && m.provider !== "template-fallback";
    } catch {
      return false;
    }
  });
  const drafts: ReviewedDraft[] = modelWritten.map((i) => {
    let flagged = false;
    try {
      const c = JSON.parse(i.checks || "[]");
      flagged = Array.isArray(c) && c.length > 0;
    } catch {
      flagged = false;
    }
    return {
      channel: i.channel,
      status: i.status,
      // The founder changed the model's copy before deciding on it.
      edited: i.revisions.some((r) => !i.approvedAt || r.createdAt <= i.approvedAt),
      approvedByPolicy: byPolicy.has(i.id),
      flagged: i.status !== "rejected" && flagged,
      publishedLive: i.publications.some((p) => p.status === "published" && !p.manual),
      failed: i.publications.some((p) => p.status === "failed"),
      spotCheck: spotChecks.get(i.id),
    };
  });
  return AUTONOMY_CHANNELS.map((ch) => trustVerdict(trustRecord(ch, drafts), policy));
}
