import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, PageHeader } from "@/components/ui";
import { canApprove } from "@/lib/permissions";
import { buildDigest, describePolicy, isSupervised, parsePolicy } from "@/lib/autonomy/policy";
import { autonomyEvents } from "@/lib/autonomy/service";
import { ActivityControls } from "@/app/app/activity/activity-client";
import { PolicyForm } from "./policy-form";

export const metadata: Metadata = { title: "Autonomy" };
export const dynamic = "force-dynamic";

const DECISION = {
  auto_approved: { text: "Approved by policy", variant: "forest" },
  scheduled: { text: "Scheduled", variant: "moss" },
  not_scheduled: { text: "Approved, not scheduled", variant: "warm" },
  escalated: { text: "Left for you", variant: "clay" },
} as const;

const CHANNEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", shortvideo: "Short-form video" };

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-bark/10 bg-ivory/40 p-3">
      <p className="num font-serif text-2xl leading-none text-forest-deep">{value}</p>
      <p className="mt-1 text-[12px] font-semibold text-charcoal">{label}</p>
    </div>
  );
}

export default async function AutonomyPage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;
  const ws = await prisma.workspace.findUnique({ where: { id: wid }, select: { autonomyPolicy: true, agentsPausedAt: true, timeZone: true } });
  const policy = parsePolicy(ws?.autonomyPolicy);
  const setBy = policy.setById ? await prisma.user.findUnique({ where: { id: policy.setById }, select: { name: true } }) : null;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const events = await autonomyEvents(wid, new Date(Date.now() - 30 * 86_400_000), 100);
  const digest = buildDigest(events, weekAgo);
  const paused = Boolean(ws?.agentsPausedAt);
  const supervised = isSupervised(policy);

  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="Autonomy"
        description="What Banyan may do without asking. You set the mandate; Banyan never widens it, and anything outside it comes back to you with the reason."
        actions={<ActivityControls paused={paused} pausedLabel="Stops every agent, including supervised approvals." />}
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">Current mandate</h2>
            <p className="mt-1 text-sm text-charcoal">{describePolicy(policy)}</p>
            <p className="mt-1 text-xs text-charcoal-soft">
              {policy.version > 0 ? `v${policy.version}, set by ${setBy?.name ?? "a workspace member"} on ${new Date(policy.setAt!).toLocaleDateString()}` : "Never changed"}
              {` · times in ${ws?.timeZone ?? "UTC"}`}
              {" · "}
              <Link href="/app/settings" className="text-forest hover:underline">change time zone</Link>
            </p>
          </div>
          <Badge variant={paused ? "clay" : supervised ? "forest" : "charcoal"}>{paused ? "Paused" : supervised ? "Supervised" : "Approve each"}</Badge>
        </div>
        <ul className="mt-4 grid gap-1.5 text-xs text-charcoal-soft sm:grid-cols-2">
          <li>Always comes back to you: a claim nothing backs, a banned term, an over-long post.</li>
          <li>Always comes back to you: a template-written draft, and your first post on a channel.</li>
          <li>Never: publishing unapproved copy, spending money, messaging people, changing accounts.</li>
          <li>Only you: connecting a channel or changing this mandate.</li>
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-serif text-xl tracking-[-0.01em] text-forest-deep">Rules</h2>
        <PolicyForm policy={policy} canEdit={canApprove(ctx.membership.role)} />
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">This week</h2>
          <span className="text-xs text-charcoal-soft">Since {weekAgo.toLocaleDateString()}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile value={digest.autoApproved} label="Approved by policy" />
          <Tile value={digest.scheduled} label="Scheduled" />
          <Tile value={digest.escalated} label="Left for you" />
          <Tile value={digest.notScheduled} label="Approved, not scheduled" />
        </div>
        {digest.topEscalations.length > 0 && (
          <div className="mt-4">
            <p className="text-[13px] font-medium text-charcoal">Why drafts came back to you</p>
            <ul className="mt-1 space-y-1 text-sm text-charcoal-soft">
              {digest.topEscalations.map((e) => (
                <li key={e.reason}>
                  <span className="num font-medium text-charcoal">{e.count}×</span> {e.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">Decisions</h2>
        <p className="mt-0.5 text-xs text-charcoal-soft">Every call made under your policy in the last 30 days, with its reason.</p>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-charcoal-soft">
            {supervised
              ? "No decisions yet. The next time Banyan writes drafts from an approved strategy, they are checked against your rules here."
              : "Nothing yet: with “Approve each”, every draft waits for you in Approvals."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-bark/10">
            {events.map((e, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  {e.contentItemId ? (
                    <Link href={`/app/content/${e.contentItemId}`} className="font-medium text-charcoal hover:underline">{e.title}</Link>
                  ) : (
                    <span className="font-medium text-charcoal">{e.title}</span>
                  )}
                  <span className="block text-xs text-charcoal-soft">
                    {CHANNEL[e.channel] ?? e.channel} · {e.createdAt.toLocaleString()}
                    {e.policyVersion ? ` · policy v${e.policyVersion}` : ""}
                    {e.scheduledFor ? ` · for ${new Date(e.scheduledFor).toLocaleString()}` : ""}
                  </span>
                  <span className="mt-0.5 block text-xs text-charcoal-soft">{e.reasons.join(" ")}</span>
                </span>
                <Badge variant={DECISION[e.decision].variant}>{DECISION[e.decision].text}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
