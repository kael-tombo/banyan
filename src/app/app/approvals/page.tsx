import { generationChip, readGenerationMeta } from "@/lib/content/generation-meta";
import { bannedTerms, checkDraft } from "@/lib/content/checks";
import { loadClaimEvidence, type EvidenceFor } from "@/lib/content/claim-evidence";
import { firstLine, isChannel, postLabel } from "@/lib/formats";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, EmptyState, Badge, Card } from "@/components/ui";
import { ArrowRight, CheckCircle2, Circle, Compass, ShieldCheck } from "lucide-react";
import GateActions from "@/app/app/goals/[id]/gate-actions";

export const metadata: Metadata = { title: "Approvals" };

/**
 * "Waiting on you": everything that can't move without a recorded decision,
 * in the order a founder makes those decisions. The strategy first; then,
 * per cycle, each draft; then that cycle's gate, which only becomes closable
 * once every draft has a decision.
 *
 * Approval is enforced server-side: publishing refuses anything without a
 * recorded approval, and a gate closes only after the server re-verifies no
 * draft is left unreviewed. This page never approves on anyone's behalf.
 */

/** Pre-review flags on the current text (US-044). */
function makeFlagCounter(avoid: string, evidenceFor: EvidenceFor) {
  const banned = bannedTerms(avoid);
  return (item: { channel: string; format: string; body: string; campaignId?: string | null; sourceRef?: string | null }) =>
    isChannel(item.channel)
      ? checkDraft({ channel: item.channel, format: item.format, body: item.body, banned, evidence: evidenceFor(item.campaignId ?? null, item.sourceRef) }).length
      : 0;
}

type Group = {
  key: string;
  goalId: string | null;
  title: string;
  drafts: Awaited<ReturnType<typeof loadQueue>>;
  reviewed: number;
  gateTaskId: string | null;
};

async function loadQueue(workspaceId: string) {
  return prisma.contentItem.findMany({
    where: { workspaceId, status: { in: ["ready_for_review", "rejected"] } },
    orderBy: { createdAt: "asc" },
    include: { campaign: { select: { name: true, goalId: true, goal: { select: { objective: true } } } } },
  });
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

  const [queue, gateTasks, decisions, proposedStrategy] = await Promise.all([
    loadQueue(ctx.workspace.id),
    prisma.agentTask.findMany({
      where: { workspaceId: ctx.workspace.id, type: "approval_gate", status: "waiting_approval" },
      orderBy: { updatedAt: "desc" },
      include: { goal: { select: { id: true, objective: true } } },
    }),
    prisma.activityEvent.findMany({
      where: { workspaceId: ctx.workspace.id, type: "approval" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, summary: true, actorType: true, actorSummary: true, createdAt: true },
    }),
    prisma.strategy.findFirst({ where: { workspaceId: ctx.workspace.id, status: "proposed" }, orderBy: { version: "desc" }, select: { id: true, version: true, method: true } }),
  ]);

  // Per cycle: how many of its drafts already have a decision (approved/scheduled/published), for the progress line.
  const goalIds = [...new Set([...queue.map((q) => q.campaign?.goalId).filter(Boolean), ...gateTasks.map((t) => t.goal?.id).filter(Boolean)])] as string[];
  const decided = goalIds.length
    ? await prisma.contentItem.groupBy({
        by: ["campaignId"],
        where: { workspaceId: ctx.workspace.id, status: { in: ["approved", "scheduled", "published"] }, campaign: { goalId: { in: goalIds } } },
        _count: true,
      })
    : [];
  const campaigns = goalIds.length ? await prisma.campaign.findMany({ where: { workspaceId: ctx.workspace.id, goalId: { in: goalIds } }, select: { id: true, goalId: true } }) : [];
  const decidedFor = (goalId: string) => decided.filter((d) => campaigns.some((c) => c.id === d.campaignId && c.goalId === goalId)).reduce((n, d) => n + d._count, 0);

  const groups = new Map<string, Group>();
  const groupFor = (goalId: string | null, title: string) => {
    const key = goalId ?? "other";
    if (!groups.has(key)) groups.set(key, { key, goalId, title, drafts: [], reviewed: goalId ? decidedFor(goalId) : 0, gateTaskId: null });
    return groups.get(key)!;
  };
  for (const item of queue) groupFor(item.campaign?.goalId ?? null, item.campaign?.goal?.objective ?? "Other drafts").drafts.push(item);
  for (const t of gateTasks) groupFor(t.goal?.id ?? null, t.goal?.objective ?? "A workflow").gateTaskId = t.id;

  const waiting = queue.length + [...groups.values()].filter((g) => g.gateTaskId && g.drafts.length === 0).length + (proposedStrategy ? 1 : 0);
  const nothingWaiting = waiting === 0;

  return (
    <>
      <PageHeader
        title="Waiting on you"
        description={
          nothingWaiting
            ? "Every decision is made. New drafts and plans appear here the moment they need you."
            : `${waiting} decision${waiting === 1 ? "" : "s"}. Nothing publishes without one, and editing an approved post sends it back here.`
        }
      />

      {proposedStrategy && (
        <Link href="/app/strategy" className="card-lift mb-5 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-fig/40 bg-white p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fig/[0.12] text-fig-deep" aria-hidden="true">
            <Compass size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-lg text-forest-deep">Strategy v{proposedStrategy.version} is ready for review</span>
            <span className="mt-0.5 block text-[13px] text-charcoal-soft">
              Channels, angles, cadence and KPIs {proposedStrategy.method === "edited" ? "you edited" : "drafted from your profile"}. The posts are written only from a strategy you approve.
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-forest">Review <ArrowRight size={14} aria-hidden="true" /></span>
        </Link>
      )}

      {nothingWaiting ? (
        <EmptyState
          title="Nothing is waiting on you"
          body="When Banyan drafts posts or a plan needs approval, it appears here. This is a true zero: no draft and no gate is open."
          icon={<CheckCircle2 size={22} className="text-forest" />}
        />
      ) : (
        <div className="space-y-5">
          {[...groups.values()].map((g) => {
            const total = g.drafts.length + g.reviewed;
            const allDecided = g.drafts.length === 0;
            return (
              <Card key={g.key} className="p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-bark/10 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-muted">Cycle</p>
                    <h2 className="font-serif text-xl leading-snug text-forest-deep">{g.title}</h2>
                  </div>
                  {g.goalId && (
                    <Link href={`/app/cycles/${g.goalId}`} className="text-[13px] font-medium text-forest hover:underline">
                      Open the cycle
                    </Link>
                  )}
                </div>

                {/* Step 1: each draft. */}
                {g.drafts.length > 0 && (
                  <div className="px-6 py-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-charcoal">
                        1. Review {g.drafts.length === 1 ? "the draft" : `each draft`}
                      </p>
                      {total > 1 && (
                        <p className="text-[12px] text-muted">
                          {g.reviewed} of {total} decided
                        </p>
                      )}
                    </div>
                    <ul className="space-y-2">
                      {g.drafts.map((item) => {
                        const label = postLabel(item);
                        const flags = flagCount(item);
                        return (
                          <li key={item.id}>
                            <Link href={`/app/content/${item.id}`} className="group flex items-start gap-3 rounded-xl border border-bark/12 bg-white p-4 transition hover:border-forest/30 hover:shadow-[0_6px_20px_-12px_rgba(14,42,33,0.25)]">
                              <Circle size={16} className={`mt-0.5 shrink-0 ${item.status === "rejected" ? "text-clay" : "text-bark/40"}`} aria-hidden="true" />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-forest-deep">{label.name}</span>
                                  {item.status === "rejected" ? <Badge variant="clay">needs a rewrite</Badge> : null}
                                  {flags > 0 && <Badge variant="warm">{flags} to check</Badge>}
                                  <GenerationChip raw={item.generationMeta} />
                                </span>
                                <span className="mt-1 block line-clamp-2 text-[13px] leading-5 text-charcoal-soft">{firstLine(item.body, 220) || "No text yet."}</span>
                                {item.status === "rejected" && item.rejectionReason && <span className="mt-1 block text-[12px] text-clay">Your note: {item.rejectionReason}</span>}
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-1 self-center text-[13px] font-medium text-forest opacity-80 group-hover:opacity-100">
                                Review <ArrowRight size={13} aria-hidden="true" />
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Step 2: the gate, after the drafts. */}
                {g.gateTaskId && (
                  <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${g.drafts.length > 0 ? "border-t border-bark/10 bg-ivory/40" : ""}`}>
                    <div className="flex min-w-0 items-start gap-2">
                      <ShieldCheck size={16} className={`mt-0.5 shrink-0 ${allDecided ? "text-forest" : "text-muted"}`} aria-hidden="true" />
                      <div>
                        <p className="text-[13px] font-medium text-charcoal">{g.drafts.length > 0 ? "2. " : ""}Let Banyan publish what you approved</p>
                        <p className="text-[12px] leading-5 text-muted">
                          {allDecided
                            ? "Every draft has a decision. Closing the gate sends approved posts to their channels; it can't approve anything for you."
                            : `Opens once ${g.drafts.length === 1 ? "the draft above has" : `all ${g.drafts.length} drafts above have`} a decision.`}
                        </p>
                      </div>
                    </div>
                    {allDecided && <GateActions taskId={g.gateTaskId} />}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-charcoal">Recent decisions</h2>
        {decisions.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">None yet. Each decision you record, with who and when, appears here and in the audit trail.</p>
        ) : (
          <ul className="mt-2 divide-y divide-bark/10">
            {decisions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 text-charcoal">{d.summary}</span>
                <span className="shrink-0 text-xs text-charcoal-soft">
                  {d.actorType === "user" ? "you" : d.actorSummary || d.actorType} ·{" "}
                  {d.createdAt.toLocaleDateString([], { month: "short", day: "numeric" })} {d.createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-bark/10 pt-3 text-[12px] leading-5 text-muted">
          An approval belongs to the exact text you reviewed: change the post afterwards and it comes back here. Banyan publishes only what has a recorded approval.
        </p>
      </Card>
    </>
  );
}

/** Which model wrote the draft, so a founder knows what they are approving. */
function GenerationChip({ raw }: { raw: string }) {
  const meta = readGenerationMeta(raw);
  const chip = generationChip(meta);
  if (chip.tone === "none") return null;
  return (
    <span title={meta.label ?? undefined}>
      <Badge variant={chip.tone === "template" ? "clay" : "forest"}>{chip.text}</Badge>
    </span>
  );
}

