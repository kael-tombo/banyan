import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, EmptyState, StatusBadge, Badge, Card } from "@/components/ui";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Approvals" };

/**
 * The approval queue. Approval is enforced server-side: publishing refuses
 * anything without a recorded approvedById, so this page is the human gate
 * before an external action — it never approves on the user's behalf.
 */
export default async function ApprovalsPage() {
  const ctx = await requireWorkspaceServer();

  const [queue, counts] = await Promise.all([
    prisma.contentItem.findMany({
      where: { workspaceId: ctx.workspace.id, status: { in: ["ready_for_review", "rejected"] } },
      orderBy: { updatedAt: "desc" },
      include: { campaign: { select: { name: true } } },
    }),
    prisma.contentItem.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id }, _count: true }),
  ]);

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  const rejected = queue.filter((i) => i.status === "rejected");

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Content only publishes after you record an approval against a specific revision. Nothing in this queue is auto-approved, and editing approved copy sends it back for review."
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Badge variant="warm">{countFor("ready_for_review")} awaiting review</Badge>
        <Badge variant="clay">{rejected.length} needs revision</Badge>
        <Badge variant="forest">{countFor("approved")} approved</Badge>
        <Badge variant="moss">{countFor("scheduled")} scheduled</Badge>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="Nothing is waiting on you"
          body="When content is submitted for review it appears here. This is a true zero: no item currently has the ready-for-review or rejected status."
          icon={<CheckCircle2 size={22} className="text-forest" />}
        />
      ) : (
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
                  <Badge variant="charcoal">{item.channel === "shortvideo" ? "video" : item.channel}</Badge>
                  <StatusBadge status={item.status} />
                </div>
              </div>
              <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-charcoal-soft">{item.body || "No body yet."}</p>
              <p className="mt-2 text-xs text-charcoal-soft">
                {item.campaign ? `${item.campaign.name} · ` : "no campaign · "}
                {item.format} · updated {item.updatedAt.toLocaleDateString()}
                {item.status === "rejected" && item.rejectionReason ? ` · reason: ${item.rejectionReason}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-charcoal">How approval works</h2>
        <p className="mt-1 text-sm text-charcoal-soft">
          Open an item to edit, approve, or reject it. An approval is bound to the revision you reviewed — if the
          body changes afterwards the approval is invalidated and the item returns to draft. Publishing requires an
          explicit <code>approvedById</code> on the server, not a UI flag.
        </p>
      </Card>
    </>
  );
}
