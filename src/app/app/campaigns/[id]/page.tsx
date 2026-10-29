import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, LinkButton, PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { CheckCircle2, Circle, PenLine, Plus, Sparkles } from "lucide-react";
import {
  computeCampaignPipeline,
  computeLaunchChecklist,
  computeCampaignAttention,
  hasUtmTags,
} from "@/lib/campaign-pipeline";
import { CampaignActions, CampaignEditForm } from "./actions";

const APPROVED_STATUSES = ["approved", "scheduled", "publishing", "published"];
const SCHEDULED_STATUSES = ["scheduled", "publishing", "published"];

const ATTENTION_TONE: Record<string, string> = {
  warm: "border-fig/30 bg-fig/5",
  clay: "border-clay/30 bg-clay/5",
  forest: "border-forest/20 bg-forest/[0.05]",
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceServer();
  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { items: true, experiments: true, links: true, metrics: { orderBy: { recordedAt: "desc" } } },
  });
  if (!campaign) notFound();

  const [connections, campaignTasks] = await Promise.all([
    prisma.channelConnection.findMany({ where: { workspaceId: ctx.workspace.id } }),
    prisma.agentTask.findMany({
      where: { workspaceId: ctx.workspace.id, campaignId: campaign.id },
      select: { status: true },
    }),
  ]);

  // ——— Recorded counts (no estimates — every number traces to a row) ———
  const contentApproved = campaign.items.filter((i) => APPROVED_STATUSES.includes(i.status)).length;
  const contentScheduled = campaign.items.filter((i) => SCHEDULED_STATUSES.includes(i.status)).length;
  const contentPublished = campaign.items.filter((i) => i.status === "published").length;
  const itemsInReview = campaign.items.filter((i) => i.status === "ready_for_review").length;
  const tasksWaitingApproval = campaignTasks.filter((t) => t.status === "waiting_approval").length;
  const tasksBlocked = campaignTasks.filter((t) => t.status === "blocked").length;

  const pipeline = computeCampaignPipeline({
    status: campaign.status,
    contentTotal: campaign.items.length,
    contentApproved,
    contentScheduled,
    contentPublished,
    metricsRecorded: campaign.metrics.length,
    completedAt: campaign.completedAt,
  });
  const checklist = computeLaunchChecklist({
    trackedLinkCount: campaign.links.length,
    utmTaggedLinkCount: campaign.links.filter((l) => hasUtmTags(l.utm, l.targetUrl)).length,
    approvedItems: contentApproved,
    liveConnections: connections.length,
  });
  const attention = computeCampaignAttention({
    itemsInReview,
    tasksWaitingApproval,
    tasksBlocked,
    scheduledCount: contentScheduled,
    publishedCount: contentPublished,
    checklistReady: checklist.ready,
  });
  const checklistDone = checklist.items.filter((i) => i.done).length;

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

      {/* ————— Five-stage pipeline: Prepare → Create → Review → Publish → Learn ————— */}
      <Card className="rooted mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-charcoal">Pipeline</h2>
          {pipeline.done ? (
            <Badge variant="forest">loop closed</Badge>
          ) : pipeline.current ? (
            <Badge variant="moss">now: {pipeline.current}</Badge>
          ) : null}
        </div>
        <ol className="mt-4 grid gap-2 md:grid-cols-5">
          {pipeline.stages.map((stage, i) => (
            <li
              key={stage.key}
              className={`rounded-[3px] border p-3 ${
                stage.state === "active"
                  ? "border-forest/40 bg-forest/[0.04]"
                  : "border-bark/15 bg-white"
              } ${stage.state === "upcoming" ? "opacity-60" : ""}`}
              aria-current={stage.state === "active" ? "step" : undefined}
            >
              <div className="flex items-center gap-1.5">
                {stage.state === "complete" ? (
                  <CheckCircle2 size={14} className="shrink-0 text-forest" aria-hidden="true" />
                ) : (
                  <Circle size={14} className={`shrink-0 ${stage.state === "active" ? "text-forest" : "text-bark/40"}`} aria-hidden="true" />
                )}
                <p className="text-sm font-medium text-charcoal">{i + 1}. {stage.label}</p>
              </div>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-charcoal-soft">{stage.hint}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-charcoal-soft">{stage.detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-charcoal-soft">
          Stage states come straight from recorded rows — content, approvals, publications and metrics. Nothing is inferred.
        </p>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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

        <Card className="xl:col-span-1">
          <h2 className="flex items-center gap-2 font-medium text-charcoal">
            <Sparkles size={15} className="text-fig" aria-hidden="true" /> Campaign coordinator
          </h2>
          <ul className="mt-3 space-y-2">
            {attention.map((a) => (
              <li key={a.key} className={`rounded-[3px] border p-3 ${ATTENTION_TONE[a.tone]}`}>
                <p className="text-sm font-medium text-charcoal">{a.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-charcoal-soft">{a.detail}</p>
                <Link href={a.href} className="mt-1 inline-block text-xs font-medium text-forest hover:underline">Open →</Link>
              </li>
            ))}
          </ul>
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

      {/* ————— Pre-publish checklist + honest outcome ————— */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card id="checklist" className={checklist.ready ? "rooted" : ""}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-charcoal">Pre-publish checklist</h2>
            <Badge variant={checklist.ready ? "forest" : "warm"}>{checklistDone} of {checklist.items.length} complete</Badge>
          </div>
          <ul className="mt-3 space-y-2.5">
            {checklist.items.map((item) => (
              <li key={item.key} className="flex items-start gap-2.5">
                {item.done ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
                ) : (
                  <Circle size={16} className="mt-0.5 shrink-0 text-bark/40" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-charcoal">{item.label}</p>
                  {!item.done && <p className="text-xs leading-relaxed text-charcoal-soft">{item.hint}</p>}
                </div>
              </li>
            ))}
          </ul>
          {!checklist.ready && contentScheduled > 0 && (
            <p className="mt-3 rounded-[3px] border border-clay/30 bg-clay/5 px-3 py-2 text-xs text-clay">
              Scheduled assets may go live before this checklist is complete — attribution will be partial.
            </p>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-charcoal">Campaign outcome</h2>
            <Badge variant={contentPublished > 0 ? "forest" : "warm"}>{contentPublished > 0 ? "live" : "not live yet"}</Badge>
          </div>
          {contentPublished > 0 ? (
            <>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-[3px] border border-bark/15 bg-ivory p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-charcoal-soft">Published</dt>
                  <dd className="mt-1 font-serif text-xl text-forest-deep">{contentPublished}</dd>
                </div>
                <div className="rounded-[3px] border border-bark/15 bg-ivory p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-charcoal-soft">Tracked clicks</dt>
                  <dd className="mt-1 font-serif text-xl text-forest-deep">{campaign.links.reduce((s, l) => s + l.clicks, 0)}</dd>
                </div>
                <div className="rounded-[3px] border border-bark/15 bg-ivory p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-charcoal-soft">Metrics</dt>
                  <dd className="mt-1 font-serif text-xl text-forest-deep">{campaign.metrics.length}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-charcoal-soft">Conversion and learnings come from the experiments and metrics recorded against this campaign — never estimated.</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-charcoal-soft">
                Results will appear here after launch — tracked clicks, recorded metrics and the experiments attached to this campaign. Nothing is projected in advance.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {["Qualified signups", "Conversion rate", "Learnings"].map((label) => (
                  <div key={label} className="rounded-[3px] border border-dashed border-bark/25 bg-ivory p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-charcoal-soft">{label}</p>
                    <p className="mt-1 font-serif text-xl text-bark/40">—</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

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
