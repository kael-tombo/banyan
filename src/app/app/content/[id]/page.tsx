import { bannedTerms, checkDraft } from "@/lib/content/checks";
import { loadClaimEvidence } from "@/lib/content/claim-evidence";
import { isChannel } from "@/lib/formats";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, StatusBadge, Badge } from "@/components/ui";
import { ContentEditor } from "./editor";
import { buildVideoTimeline, estimatedRuntime, claimLint, reviewChecklist, normalizeAdaptations } from "@/lib/video-script";

export const metadata: Metadata = { title: "Content editor" };

export default async function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceServer();
  const item = await prisma.contentItem.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { campaign: true },
  });
  if (!item) notFound();

  const [revisions, publications, campaigns, connections, profile] = await Promise.all([
    prisma.contentRevision.findMany({ where: { contentItemId: item.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.publication.findMany({ where: { contentItemId: item.id }, orderBy: { createdAt: "desc" } }),
    prisma.campaign.findMany({ where: { workspaceId: ctx.workspace.id, status: { notIn: ["archived"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }),
    prisma.channelConnection.findMany({ where: { workspaceId: ctx.workspace.id, channel: item.channel } }),
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
  ]);

  const gen = JSON.parse(item.generationMeta || "{}") as { provider?: string; model?: string; isFallback?: boolean; label?: string; action?: string; generatedAt?: string };
  // Tracked link for this content if it exists
  const link = await prisma.trackedLink.findFirst({ where: { workspaceId: ctx.workspace.id, contentItemId: item.id } });
  const timezone = profile?.timezone ?? "UTC";
  // US-044: checked against the current text, so an edit clears its own flag.
  let avoid = "";
  try {
    avoid = (JSON.parse(profile?.brandVoice || "{}") as { avoid?: string }).avoid ?? "";
  } catch {
    avoid = "";
  }
  const evidenceFor = await loadClaimEvidence(ctx.workspace.id);
  const flags = isChannel(item.channel)
    ? checkDraft({ channel: item.channel, format: item.format, body: item.body, banned: bannedTerms(avoid), evidence: evidenceFor(item.campaignId, item.sourceRef) })
    : [];

  // ————— Studio computations (pure, from recorded data) —————
  const videoExtras = JSON.parse(item.videoExtras || "{}");
  const timeline = buildVideoTimeline(videoExtras);
  // One claim list for the checklist and the editor: the phrase lint plus every claim the evidence does not back (US-054),
  // so the checklist can never say "nothing detected" while approval is held over a claim.
  const unsupported = flags.flatMap((f) => (f.code === "unsupported_claim" ? [{ phrase: f.phrase, why: "unsupported " + f.kind.replace(/_/g, " ") }] : []));
  const claims = [...claimLint(item.body), ...unsupported].filter((c, i, all) => all.findIndex((o) => o.phrase.toLowerCase() === c.phrase.toLowerCase()) === i);
  const review = reviewChecklist({
    status: item.status,
    genMeta: gen.provider ? gen : null,
    sourceRef: item.sourceRef,
    campaignEvidence: item.campaign?.evidence || null,
    claims,
  });
  const adaptations = normalizeAdaptations(videoExtras.adaptations as Record<string, string> | undefined);

  return (
    <>
      <PageHeader
        title={item.title}
        description={`${item.channel === "shortvideo" ? "Short-form video" : item.channel === "x" ? "X" : "LinkedIn"} · ${item.format}${item.campaign ? ` · campaign: ${item.campaign.name}` : ""}`}
        actions={isChannelStatus(item.status) ? <StatusBadge status={item.status} /> : null}
      />
      {/* Generation metadata honesty line */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-charcoal-soft">
        <Badge variant={gen.isFallback ? "clay" : gen.provider ? "forest" : "warm"}>
          {gen.isFallback
            ? "Dev fallback template — not a live model response"
            : gen.label || gen.provider || "Not generated yet"}
        </Badge>
        {gen.generatedAt && <span>generated {new Date(gen.generatedAt).toLocaleString()}</span>}
        {!gen.provider && <span>Never generated yet — draft as written or generate below.</span>}
        {review.humanReviewRequired && <Badge variant="warm">human review required</Badge>}
      </div>

      <ContentEditor
        item={{
          id: item.id,
          title: item.title,
          body: item.body,
          channel: item.channel,
          format: item.format,
          status: item.status,
          campaignId: item.campaignId,
          scheduledFor: item.scheduledFor?.toISOString() ?? null,
          approvedAt: item.approvedAt?.toISOString() ?? null,
          rejectionReason: item.rejectionReason,
          sourceRef: item.sourceRef,
          videoExtras,
          angle: item.angle,
          flags: flags.map((f) => f.message),
        }}
        revisions={revisions.map((r) => ({ id: r.id, title: r.title, body: r.body.slice(0, 200), note: r.note, authorType: r.authorType, createdAt: r.createdAt.toISOString() }))}
        publications={publications.map((p) => ({
          id: p.id, status: p.status, provider: p.provider, manual: p.manual,
          externalId: p.externalId, externalUrl: p.externalUrl, attempts: p.attempts,
          lastError: p.lastError, scheduledFor: p.scheduledFor?.toISOString() ?? null, publishedAt: p.publishedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        }))}
        campaigns={campaigns}
        connections={connections.map((c) => ({ id: c.id, label: c.label, status: c.status, lastError: c.lastError }))}
        trackedUrl={link ? `/t/${link.slug}` : null}
        timezone={timezone}
        timeline={timeline}
        estimatedSeconds={estimatedRuntime(timeline)}
        adaptations={adaptations}
        reviewChecks={review}
        provenance={{
          generatedWith: gen.isFallback ? null : gen.provider ?? null,
          generatedModel: gen.model ?? null,
          generatedAt: gen.generatedAt ?? null,
          campaignEvidence: item.campaign?.evidence || null,
          revisionCount: revisions.length,
        }}
        claimFlags={claims}
      />
    </>
  );
}

function isChannelStatus(status: string): boolean {
  return status.length > 0;
}
