import { bannedTerms, checkDraft } from "@/lib/content/checks";
import { loadClaimEvidence, type EvidenceFor } from "@/lib/content/claim-evidence";
import { isChannel } from "@/lib/formats";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, EmptyState, StatusBadge, Badge, Card } from "@/components/ui";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import GateActions from "@/app/app/goals/[id]/gate-actions";

export const metadata: Metadata = { title: "Approvals" };

/**
 * The "waiting on you" command center — everything that cannot proceed
 * without a recorded human decision, in one place: content awaiting review
 * and execution gates waiting to close.
 *
 * Approval is enforced server-side: publishing refuses anything without a
 * recorded approvedById, and a gate can only be closed after the server
 * re-verifies no draft is left unreviewed. This page never approves on the
 * user's behalf — it only gathers what is waiting and shows the decisions
 * already recorded.
 */
/** Pre-review flags on the current text (US-044). */
function makeFlagCounter(avoid: string, evidenceFor: EvidenceFor) {
  const banned = bannedTerms(avoid);
  return (item: { channel: string; format: string; body: string; campaignId?: string | null; sourceRef?: string | null }) =>
    isChannel(item.channel)
      ? checkDraft({ channel: item.channel, format: item.format, body: item.body, banned, evidence: evidenceFor(item.campaignId ?? null, item.sourceRef) }).length
      : 0;
}

export default async function ApprovalsPage() {
  const ctx = await requireWorkspaceServer();
  let avoid = "";
  try {
    avoid = (JSON.parse(ctx.profile?.brandVoice || "{}") as { avoid?: string }).avoid ?? "";
  } catch {
    avoid = "";
  }
  const flagCount = makeFlagCounter(avoid, await loadClaimEvidence(ctx.workspace.id));

  const [queue, gateTasks, decisions, counts, proposedStrategy] = await Promise.all([
    prisma.contentItem.findMany({
      where: { workspaceId: ctx.workspace.id, status: { in: ["ready_for_review", "rejected"] } },
      orderBy: { updatedAt: "desc" },
      include: { campaign: { select: { name: true } } },
    }),
    prisma.agentTask.findMany({
      where: { workspaceId: ctx.workspace.id, type: "approval_gate", status: "waiting_approval" },
      orderBy: { updatedAt: "desc" },
      include: { goal: { select: { id: true, objective: true } } },
    }),
    // The recorded-decision history: every approval event lands in the audit trail.
    prisma.activityEvent.findMany({
      where: { workspaceId: ctx.workspace.id, type: "approval" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, summary: true, actorType: true, actorSummary: true, createdAt: true },
    }),
    prisma.contentItem.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id }, _count: true }),
    // A strategy proposal is a decision too (US-043); it counts in "waiting on you".
    prisma.strategy.findFirst({ where: { workspaceId: ctx.workspace.id, status: "proposed" }, orderBy: { version: "desc" }, select: { id: true, version: true, method: true, createdAt: true } }),
  ]);

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  const rejected = queue.filter((i) => i.status === "rejected");
  const nothingWaiting = queue.length === 0 && gateTasks.length === 0 && !proposedStrategy;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Everything that cannot proceed without your recorded decision: the distribution strategy, content awaiting review, and execution gates waiting to close. Nothing here is auto-approved, and editing approved copy sends it back for review."
      />

      {proposedStrategy && (
        <Link href="/app/strategy" className="card-lift mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-fig/30 bg-white p-4">
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold text-forest-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" />
              Distribution strategy v{proposedStrategy.version}
            </span>
            <span className="mt-1 block text-sm text-charcoal-soft">
              Channels, cadence and KPIs {proposedStrategy.method === "edited" ? "you edited" : "drafted from your approved profile"}. Drafts are written only from a strategy you approve.
            </span>
          </span>
          <Badge variant="warm">Review strategy</Badge>
        </Link>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {proposedStrategy && <Badge variant="warm">1 strategy to approve</Badge>}
        <Badge variant="warm">{countFor("ready_for_review")} awaiting review</Badge>
        <Badge variant="clay">{rejected.length} needs revision</Badge>
        <Badge variant={gateTasks.length > 0 ? "warm" : "moss"}>
          {gateTasks.length} execution gate{gateTasks.length === 1 ? "" : "s"} waiting
        </Badge>
        <Badge variant="forest">{countFor("approved")} approved</Badge>
        <Badge variant="moss">{countFor("scheduled")} scheduled</Badge>
      </div>

      {/* ————— Execution gates — the approval gates inside running workflows ————— */}
      {gateTasks.length > 0 && (
        <Card className="mb-6">
          <h2 className="flex items-center gap-2 font-medium text-charcoal">
            <ShieldCheck size={16} className="text-forest" aria-hidden="true" /> Execution gates waiting on your decision
          </h2>
          <p className="mt-1 text-xs text-charcoal-soft">
            These workflows paused at a gate. Review the drafts below, then close each gate — the server re-verifies
            that nothing unreviewed slips through.
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            {gateTasks.map((t) => (
              <li key={t.id} className="space-y-1.5 rounded-lg border border-bark/10 bg-ivory/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-charcoal">{t.title}</span>
                  {t.goal && (
                    <Link
                      href={`/app/goals/${t.goal.id}`}
                      className="text-xs font-medium text-forest hover:underline"
                    >
                      {t.goal.objective.length > 48 ? `${t.goal.objective.slice(0, 48)}…` : t.goal.objective} ↗
                    </Link>
                  )}
                </div>
                <GateActions taskId={t.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ————— Content queue ————— */}
      {nothingWaiting ? (
        <EmptyState
          title="Nothing is waiting on you"
          body="When content is submitted for review, or a workflow reaches an approval gate, it appears here. This is a true zero: no item is ready for review, and no gate is open."
          icon={<CheckCircle2 size={22} className="text-forest" />}
        />
      ) : (
        queue.length > 0 && (
          <div className="grid gap-3">
            {queue.map((item) => (
              <Link
                key={item.id}
                href={`/app/content/${item.id}`}
                className="card-lift block rounded-lg border border-bark/15 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-forest-deep">{item.title}</h2>
                  <div className="flex items-center gap-2">
                    {flagCount(item) > 0 && <Badge variant="warm">{flagCount(item)} to check</Badge>}
                    <Badge variant="charcoal">{item.channel === "shortvideo" ? "video" : item.channel}</Badge>
                    <StatusBadge status={item.status} />
                  </div>
                </div>
                {item.angle && <p className="mt-1 text-xs text-charcoal-soft">Angle: {item.angle}</p>}
                <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-charcoal-soft">{item.body || "No body yet."}</p>
                <p className="mt-2 text-xs text-charcoal-soft">
                  {item.campaign ? `${item.campaign.name} · ` : "no campaign · "}
                  {item.format} · updated {item.updatedAt.toLocaleDateString()}
                  {item.status === "rejected" && item.rejectionReason ? ` · reason: ${item.rejectionReason}` : ""}
                </p>
              </Link>
            ))}
          </div>
        )
      )}

      {/* ————— Recorded decisions — the pen's audit trail ————— */}
      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-charcoal">Recorded decisions</h2>
        {decisions.length === 0 ? (
          <p className="mt-1 text-sm text-charcoal-soft">
            No approval recorded yet. Every decision you record — with who and when — lands here and in the audit trail.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-bark/10">
            {decisions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 text-charcoal">{d.summary}</span>
                <span className="shrink-0 text-xs text-charcoal-soft">
                  {d.actorType === "user" ? "you" : d.actorSummary || d.actorType} ·{" "}
                  {d.createdAt.toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                  {d.createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-charcoal">How approval works</h2>
        <p className="mt-1 text-sm text-charcoal-soft">
          Open an item to edit, approve, or reject it. An approval is bound to the revision you reviewed — if the
          body changes afterwards the approval is invalidated and the item returns to draft. Publishing requires an
          explicit <code>approvedById</code> on the server, not a UI flag; gates close only after that approval exists.
        </p>
      </Card>
    </>
  );
}
