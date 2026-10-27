import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, LinkButton, PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { PenLine, Plus } from "lucide-react";
import { CampaignActions, CampaignEditForm } from "./actions";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceServer();
  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { items: true, experiments: true, links: true, metrics: { orderBy: { recordedAt: "desc" } } },
  });
  if (!campaign) notFound();

  const connections = await prisma.channelConnection.findMany({ where: { workspaceId: ctx.workspace.id } });

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.objective} · metric: ${campaign.successMetric}`}
        actions={
          <>
            <CampaignActions campaign={{ id: campaign.id, status: campaign.status, name: campaign.name }} />
            <LinkButton href="/app/campaigns/new" variant="secondary" size="sm"><Plus size={14} aria-hidden="true" /> New</LinkButton>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={campaign.status} />
        {campaign.isSelfCampaign ? <Badge variant="warm">self-distribution theme</Badge> : null}
        {campaign.startedAt && <span className="text-xs text-charcoal-soft">started {campaign.startedAt.toLocaleDateString()}</span>}
        {campaign.completedAt && <span className="text-xs text-charcoal-soft">completed {campaign.completedAt.toLocaleDateString()}</span>}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-medium text-charcoal">Brief</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Key message</dt><dd className="mt-0.5 text-charcoal">{campaign.keyMessage}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Audience</dt><dd className="mt-0.5 text-charcoal">{campaign.targetAudience}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">CTA</dt><dd className="mt-0.5 text-charcoal">{campaign.cta}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Evidence</dt><dd className="mt-0.5 text-charcoal">{campaign.evidence || <em className="text-charcoal-soft">None — generation will avoid unsupported claims</em>}</dd></div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-charcoal-soft">Channels / formats</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                {([...JSON.parse(campaign.channels)] as string[]).map((c) => <Badge key={c} variant="moss">{c}</Badge>)}
                {[...JSON.parse(campaign.formats)].map((f: string) => <Badge key={f} variant="charcoal">{f}</Badge>)}
              </dd>
            </div>
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Proposed schedule</dt><dd className="mt-0.5 text-charcoal">{JSON.parse(campaign.schedule || "{}")?.cadence || "not specified"}</dd></div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 font-medium text-charcoal">History</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Created</dt><dd className="mt-0.5 text-charcoal">{campaign.createdAt.toLocaleString()}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Last updated</dt><dd className="mt-0.5 text-charcoal">{campaign.updatedAt.toLocaleString()}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Tracked clicks</dt><dd className="mt-0.5 text-charcoal">{campaign.links.reduce((s, l) => s + l.clicks, 0)} (observed)</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-charcoal-soft">Tracked links / metrics</dt><dd className="mt-0.5 text-charcoal">{campaign.links.length} link(s) · {campaign.metrics.length} metric entr{campaign.metrics.length === 1 ? "y" : "ies"}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-charcoal-soft">Status history is recorded as workspace activity events; see the dashboard feed.</p>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-charcoal">Content in this campaign</h2>
          <LinkButton href={`/app/content/new?campaignId=${campaign.id}`} variant="primary" size="sm"><PenLine size={14} aria-hidden="true" /> Draft content</LinkButton>
        </div>
        {campaign.items.length > 0 ? (
          <ul className="divide-y divide-bark/10">
            {campaign.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/app/content/${i.id}`} className="truncate font-medium text-charcoal hover:text-forest">{i.title}</Link>
                <div className="flex items-center gap-2">
                  <Badge variant="charcoal">{i.channel}</Badge>
                  <StatusBadge status={i.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No content yet" body="Draft your first item — generation will use the brief above, in your brand voice." action={<LinkButton href={`/app/content/new?campaignId=${campaign.id}`} variant="secondary" size="sm"><PenLine size={14} aria-hidden="true" /> Draft content</LinkButton>} icon={<PenLine size={20} className="text-forest" />} />
        )}
      </Card>

      {(campaign.experiments.length > 0 || campaign.links.length > 0) && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {campaign.experiments.length > 0 && (
            <Card>
              <h2 className="mb-2 font-medium text-charcoal">Experiments</h2>
              <ul className="space-y-1 text-sm">
                {campaign.experiments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <Link href={`/app/experiments?open=${e.id}`} className="text-charcoal hover:text-forest">{e.title}</Link>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {campaign.links.length > 0 && (
            <Card>
              <h2 className="mb-2 font-medium text-charcoal">Tracked links</h2>
              <ul className="space-y-1.5 text-sm">
                {campaign.links.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <code className="truncate text-xs text-charcoal-soft">/t/{l.slug}</code>
                    <Badge variant="forest">{l.clicks} clicks</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <CampaignEditForm
        campaign={{
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          targetAudience: campaign.targetAudience,
          keyMessage: campaign.keyMessage,
          evidence: campaign.evidence,
          cta: campaign.cta,
          channels: JSON.parse(campaign.channels),
          formats: JSON.parse(campaign.formats),
          schedule: JSON.parse(campaign.schedule || "{}"),
          successMetric: campaign.successMetric,
          status: campaign.status,
        }}
      />
    </>
  );
}
