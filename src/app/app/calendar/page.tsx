import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, EmptyState, StatusBadge, Badge, Card } from "@/components/ui";
import { CalendarDays } from "lucide-react";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const ctx = await requireWorkspaceServer();

  const [scheduled, published, approved, publications, profile] = await Promise.all([
    prisma.contentItem.findMany({
      where: { workspaceId: ctx.workspace.id, status: "scheduled" },
      orderBy: { scheduledFor: "asc" },
      include: { campaign: { select: { name: true } } },
    }),
    prisma.contentItem.findMany({
      where: { workspaceId: ctx.workspace.id, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 30,
      include: { campaign: { select: { name: true } } },
    }),
    prisma.contentItem.findMany({
      where: { workspaceId: ctx.workspace.id, status: "approved" },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.publication.findMany({
      where: { contentItem: { workspaceId: ctx.workspace.id }, status: { in: ["scheduled", "attempting", "failed", "blocked"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { contentItem: { select: { id: true, title: true } } },
    }),
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
  ]);

  const timezone = profile?.timezone ?? "UTC";

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Times are shown in ${timezone}. Approved content is not queued until it is scheduled; the publishing worker only attempts publications whose scheduled time has passed.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal">
            <CalendarDays size={16} className="text-moss" aria-hidden="true" /> Scheduled
          </h2>
          {scheduled.length === 0 ? (
            <p className="text-sm text-charcoal-soft">
              Nothing scheduled. Approve an item, then schedule it from the content editor.
            </p>
          ) : (
            <ul className="space-y-2">
              {scheduled.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/app/content/${i.id}`} className="truncate text-charcoal hover:text-forest">
                    {i.title}
                  </Link>
                  <span className="whitespace-nowrap text-xs text-charcoal-soft">
                    {i.scheduledFor ? i.scheduledFor.toLocaleString() : "not set"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium text-charcoal">Approved (ready to schedule)</h2>
          {approved.length === 0 ? (
            <p className="text-sm text-charcoal-soft">No approved-but-unscheduled content.</p>
          ) : (
            <ul className="space-y-2">
              {approved.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/app/content/${i.id}`} className="truncate text-charcoal hover:text-forest">
                    {i.title}
                  </Link>
                  <StatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Recent publication attempts</h2>
        {publications.length === 0 ? (
          <p className="text-sm text-charcoal-soft">
            No pending or failed publication attempts. Confirmed publications appear below.
          </p>
        ) : (
          <ul className="space-y-2">
            {publications.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/app/content/${p.contentItem.id}`} className="truncate text-charcoal hover:text-forest">
                  {p.contentItem.title}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge variant="charcoal">{p.provider}</Badge>
                  <StatusBadge status={p.status} />
                  {p.lastError && <span className="max-w-xs truncate text-xs text-clay">{p.lastError}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-charcoal">Published</h2>
        {published.length === 0 ? (
          <div className="pt-1">
            <EmptyState
              title="No confirmed publications yet"
              body="The system only records a publication after the provider confirms it, or after you record a real live URL manually. Nothing is marked published on an assumption."
              icon={<CalendarDays size={22} className="text-forest" />}
            />
          </div>
        ) : (
          <ul className="space-y-2">
            {published.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/app/content/${i.id}`} className="truncate text-charcoal hover:text-forest">
                  {i.title}
                </Link>
                <span className="whitespace-nowrap text-xs text-charcoal-soft">
                  {i.publishedAt ? i.publishedAt.toLocaleString() : "unknown time"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
