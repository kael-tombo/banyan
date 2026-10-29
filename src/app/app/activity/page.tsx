import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AGENT_ROLES, computeAgentTeam, timeAgo } from "@/lib/growth-loop";
import {
  activityRows,
  filterActivityRows,
  approvalQueueItems,
  pauseSummary,
  ACTIVITY_STATUSES,
  type AgentTaskLite,
} from "@/lib/agent-activity";
import { ActivityControls, ApprovalActions } from "./activity-client";
import { Bot, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Agent Activity" };

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const RANGES = [1, 7, 30] as const;

const STATUS_VARIANT: Record<string, "forest" | "moss" | "warm" | "clay" | "charcoal"> = {
  completed: "forest",
  running: "moss",
  ready: "moss",
  pending: "charcoal",
  waiting_approval: "warm",
  blocked: "clay",
  failed: "clay",
  cancelled: "charcoal",
};

const AGENT_STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  working: { dot: "bg-forest", label: "Working" },
  awaiting: { dot: "bg-amber-500", label: "Awaiting review" },
  blocked: { dot: "bg-clay", label: "Blocked" },
  queued: { dot: "bg-bark/40", label: "Queued" },
  idle: { dot: "bg-forest/40", label: "Idle" },
  offline: { dot: "bg-bark/25", label: "Never ran" },
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string; days?: string }>;
}) {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;
  const sp = await searchParams;
  const role = AGENT_ROLES.includes(sp.role as never) ? sp.role : null;
  const status = (ACTIVITY_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : null;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number]) ? Number(sp.days) : 7;

  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);

  const [taskRows, pausedRaw, planRows] = await Promise.all([
    prisma.agentTask.findMany({
      where: { workspaceId: wid, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true, agentRole: true, status: true, title: true, expectedOutput: true,
        goalId: true, campaignId: true, requiresApproval: true, updatedAt: true, attempts: true,
      },
    }),
    prisma.workspace.findUnique({ where: { id: wid }, select: { agentsPausedAt: true } }),
    prisma.goalPlan.findMany({
      where: { goal: { workspaceId: wid } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { goalId: true, summary: true, status: true, updatedAt: true, goal: { select: { objective: true, status: true } } },
    }),
  ]);

  // expectedOutput is a JSON envelope in the DB; hand the pure layer parsed values.
  const tasks: AgentTaskLite[] = taskRows.map((t) => {
    let expected: unknown = null;
    try { expected = t.expectedOutput ? JSON.parse(t.expectedOutput as unknown as string) : null; } catch { expected = null; }
    return {
      id: t.id,
      agentRole: t.agentRole,
      status: t.status,
      title: t.title,
      expectedOutput: expected,
      goalId: t.goalId,
      campaignId: t.campaignId,
      requiresApproval: t.requiresApproval,
      updatedAt: t.updatedAt,
      attempts: t.attempts,
    };
  });

  const allRows = activityRows(tasks);
  const rows = filterActivityRows(allRows, { role, status, since });
  const queue = approvalQueueItems(tasks, planRows.map((p) => ({
    goalId: p.goalId,
    goalObjective: p.goal.objective,
    goalStatus: p.goal.status,
    summary: p.summary,
    status: p.status,
    updatedAt: p.updatedAt,
  })));
  const team = computeAgentTeam(tasks.slice(0, 120));
  const pause = pauseSummary(pausedRaw?.agentsPausedAt ?? null, now);

  const roleCounts = new Map<string, number>();
  for (const r of allRows) roleCounts.set(r.agentRole, (roleCounts.get(r.agentRole) ?? 0) + 1);

  const buildHref = (over: { role?: string | null; status?: string | null; days?: number }) => {
    const params = new URLSearchParams();
    const r = over.role !== undefined ? over.role : role;
    const s = over.status !== undefined ? over.status : status;
    const d = over.days ?? days;
    if (r) params.set("role", r);
    if (s) params.set("status", s);
    if (d !== 7) params.set("days", String(d));
    const qs = params.toString();
    return `/app/activity${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Agent Activity"
        description="See what the agents are doing, why, and what needs your decision. Everything here is the recorded audit trail — statuses are states, not moods."
        actions={<ActivityControls paused={pause.paused} pausedLabel={pause.label} />}
      />

      {/* ————— Approval queue ————— */}
      <Card className="rooted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-medium text-charcoal">
            <CheckCircle2 size={15} className="text-forest" aria-hidden="true" /> Approval queue
          </h2>
          <Badge variant={queue.length > 0 ? "warm" : "forest"}>{queue.length} waiting</Badge>
        </div>
        {queue.length === 0 ? (
          <p className="mt-2 text-sm text-charcoal-soft">
            Nothing waits on you. Agent gates and plan approvals appear here the moment a workflow needs a human decision.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-bark/10">
            {queue.map((item) => (
              <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-charcoal">
                    {item.title}
                    <Badge variant="warm">{item.kind === "goal_plan" ? "plan approval" : "task gate"}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-charcoal-soft">
                    {item.agentName ?? item.agentRole} · {timeAgo(item.at, now)}
                    {item.detail ? ` — ${item.detail}` : ""}
                  </p>
                </div>
                <ApprovalActions kind={item.kind} id={item.id} goalId={item.goalId} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-bark/10 pt-2 text-[11px] text-charcoal-soft">
          Approvals are enforced server-side: a rejected gate moves the workflow to a recorded stop, never a silent skip.
        </p>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* ————— Activity table ————— */}
        <div className="lg:col-span-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-medium text-charcoal"><Bot size={15} className="text-forest" aria-hidden="true" /> Activity trail</h2>
              <div className="flex flex-wrap items-center gap-1" role="navigation" aria-label="Time range">
                {RANGES.map((d) => (
                  <Link
                    key={d}
                    href={buildHref({ days: d })}
                    aria-current={d === days ? "page" : undefined}
                    className={`rounded-[2px] px-2 py-0.5 text-xs ${d === days ? "bg-forest-deep text-ivory font-medium" : "text-charcoal-soft hover:text-forest"}`}
                  >
                    {d === 1 ? "24h" : `${d}d`}
                  </Link>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-y border-bark/10 py-2">
              <span className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Agent</span>
                <Link href={buildHref({ role: null })} className={`rounded-[2px] px-1.5 py-0.5 text-xs ${!role ? "bg-forest/10 font-medium text-forest-deep" : "text-charcoal-soft hover:text-forest"}`}>All</Link>
                {AGENT_ROLES.map((r) => (
                  <Link
                    key={r}
                    href={buildHref({ role: r })}
                    className={`rounded-[2px] px-1.5 py-0.5 text-xs ${role === r ? "bg-forest/10 font-medium text-forest-deep" : "text-charcoal-soft hover:text-forest"}`}
                  >
                    {r}
                  </Link>
                ))}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-soft">Status</span>
                <Link href={buildHref({ status: null })} className={`rounded-[2px] px-1.5 py-0.5 text-xs ${!status ? "bg-forest/10 font-medium text-forest-deep" : "text-charcoal-soft hover:text-forest"}`}>All</Link>
                {ACTIVITY_STATUSES.map((s) => (
                  <Link
                    key={s}
                    href={buildHref({ status: s })}
                    className={`rounded-[2px] px-1.5 py-0.5 text-xs ${status === s ? "bg-forest/10 font-medium text-forest-deep" : "text-charcoal-soft hover:text-forest"}`}
                  >
                    {s.replace(/_/g, " ")}
                  </Link>
                ))}
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-charcoal-soft">
                No recorded agent activity in this window{role || status ? " for these filters" : ""}. Tasks appear the
                moment a goal starts executing — nothing is simulated to fill the table.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-bark/15 text-[11px] uppercase tracking-wide text-charcoal-soft">
                      <th scope="col" className="py-2 pr-3 font-medium">When</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Agent</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Action</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                      <th scope="col" className="py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 60).map((r) => (
                      <tr key={r.id} className="border-b border-bark/5 align-top">
                        <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-charcoal-soft">{timeAgo(r.at, now)}</td>
                        <td className="py-2.5 pr-3 text-xs font-medium text-charcoal">{r.agentName}</td>
                        <td className="py-2.5 pr-3 text-xs text-charcoal">
                          {r.action}
                          {r.attempts > 1 && <span className="text-charcoal-soft"> · attempt {r.attempts}</span>}
                        </td>
                        <td className="py-2.5 pr-3"><Badge variant={STATUS_VARIANT[r.status] ?? "warm"}>{r.status.replace(/_/g, " ")}</Badge></td>
                        <td className="py-2.5 text-xs text-charcoal-soft">
                          {r.detail ?? "—"}
                          {r.goalId && (
                            <>
                              {" · "}
                              <Link href={`/app/goals/${r.goalId}`} className="text-forest hover:underline">goal</Link>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 60 && (
                  <p className="mt-2 text-[11px] text-charcoal-soft">Showing the 60 most recent of {rows.length} recorded actions.</p>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ————— Agent status sidebar ————— */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <h2 className="font-medium text-charcoal">Agent status</h2>
            <p className="mt-0.5 text-[11px] text-charcoal-soft">{team.filter((t) => t.status !== "offline").length} of {team.length} roles active</p>
            <ul className="mt-3 space-y-3">
              {team.map((entry) => {
                const style = AGENT_STATUS_STYLE[entry.status];
                return (
                  <li key={entry.role}>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-charcoal">
                      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
                      {entry.role.charAt(0).toUpperCase() + entry.role.slice(1)}
                    </p>
                    <p className="ml-3.5 text-[11px] leading-snug text-charcoal-soft">
                      {style.label}
                      {entry.at ? ` · last ${timeAgo(entry.at, now)}` : ""}
                      {entry.latestAction ? ` — ${entry.latestAction.slice(0, 70)}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 border-t border-bark/10 pt-2 text-[11px] text-charcoal-soft">
              Status is derived from the recorded task trail — “working” means a task is running now, not that a model is
              spinning somewhere.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
