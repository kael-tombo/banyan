import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { approvalState } from "@/lib/product/profile-review";
import { bannedTerms, checkDraft, parseFlags } from "@/lib/content/checks";
import { loadClaimEvidence } from "@/lib/content/claim-evidence";
import { isChannel } from "@/lib/formats";
import { loadCycleReport } from "@/lib/cycle-report-data";
import { buildDigest, describePolicy, parsePolicy } from "@/lib/autonomy/policy";
import { autonomyEvents } from "@/lib/autonomy/service";
import { enabledProviderIds } from "@/lib/distribution/providers";
import type { TokenContext } from "@/lib/api-tokens";

/**
 * Banyan's MCP tools. Read-only by design (STRATEGY.md §12): an assistant can
 * see what is waiting, how cycles are doing and why, but approving, publishing,
 * spending and changing the mandate stay with a person in the app. Every answer
 * links to the screen where that person acts.
 */

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
  run: (ctx: TokenContext, args: Record<string, unknown>) => Promise<unknown>;
};

const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const link = (path: string) => `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${path}`;
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const idArg = (desc: string) => ({ type: "string", description: desc });

export class ToolInputError extends Error {}

function needId(args: Record<string, unknown>, key: string): string {
  const v = typeof args[key] === "string" ? (args[key] as string).trim() : "";
  if (!v) throw new ToolInputError(`${key} is required.`);
  return v;
}

export const TOOLS: ToolDef[] = [
  {
    name: "whats_waiting",
    title: "What is waiting on me",
    description: "Everything that needs the founder's decision in Banyan right now: drafts to review (with their pre-review flags), a proposed strategy, a profile to approve, gates to close, and the credit balance.",
    inputSchema: obj({}),
    annotations: RO,
    async run(ctx) {
      const wid = ctx.workspace.id;
      const [drafts, strategy, profile, gates, credits] = await Promise.all([
        prisma.contentItem.findMany({ where: { workspaceId: wid, status: "ready_for_review" }, orderBy: { createdAt: "asc" }, take: 25, select: { id: true, title: true, channel: true, checks: true } }),
        prisma.strategy.findFirst({ where: { workspaceId: wid, status: "proposed" }, orderBy: { version: "desc" }, select: { id: true, version: true, createdAt: true } }),
        prisma.productProfile.findUnique({ where: { workspaceId: wid }, select: { fieldSources: true, approvedAt: true } }),
        prisma.agentTask.count({ where: { workspaceId: wid, status: "waiting_approval" } }),
        prisma.creditAccount.findUnique({ where: { workspaceId: wid }, select: { available: true, reserved: true } }),
      ]);
      const profileState = approvalState(profile);
      return {
        drafts_to_review: drafts.map((d) => {
          const flags = parseFlags(d.checks);
          return { id: d.id, title: d.title, channel: d.channel, flags: flags.map((f) => f.message), open: link(`/app/content/${d.id}`) };
        }),
        strategy_to_review: strategy ? { id: strategy.id, version: strategy.version, proposed_at: strategy.createdAt, open: link("/app/strategy") } : null,
        profile_needs_approval: profileState.needsApproval ? { reason: profileState.reason, open: link("/app/product") } : null,
        gates_waiting: gates,
        credits: credits ? { available: credits.available, reserved: credits.reserved } : null,
        approvals_happen_in: link("/app/approvals"),
      };
    },
  },
  {
    name: "list_cycles",
    title: "List cycles",
    description: "The workspace's distribution cycles, newest first: objective, metric and target, status, progress, window, and whether it runs on a strategy.",
    inputSchema: obj({}),
    annotations: RO,
    async run(ctx) {
      const goals = await prisma.goal.findMany({
        where: { workspaceId: ctx.workspace.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, objective: true, status: true, successMetric: true, metricTarget: true, progress: true, deadline: true, createdAt: true, campaigns: { select: { strategyId: true } } },
      });
      return {
        cycles: goals.map((g) => ({
          id: g.id,
          objective: g.objective,
          status: g.status,
          metric: g.successMetric,
          target: g.metricTarget,
          progress_percent: g.progress,
          started: g.createdAt,
          ends: g.deadline,
          runs_on: g.campaigns.some((c) => c.strategyId) ? "strategy" : "agent workflow",
          open: link(`/app/cycles/${g.id}`),
          report: link(`/app/cycles/${g.id}/report`),
        })),
      };
    },
  },
  {
    name: "get_cycle_report",
    title: "Cycle report",
    description: "One cycle's report from recorded rows only: what shipped, what it produced (null = not measured, 0 = measured nothing), the objective against target, what cannot be attributed, and the proposed next move.",
    inputSchema: obj({ cycle_id: idArg("A cycle id from list_cycles.") }, ["cycle_id"]),
    annotations: RO,
    async run(ctx, args) {
      const loaded = await loadCycleReport(ctx.workspace.id, needId(args, "cycle_id"));
      if (!loaded) throw new ToolInputError("No such cycle in this workspace.");
      const r = loaded.report;
      return {
        objective: loaded.goal.objective,
        final: r.final,
        window: r.window,
        against_objective: r.objective,
        shipped: r.shipped.map((s) => ({ title: s.title, channel: s.channel, state: s.state, approved_by: s.approvedBy, url: s.url, tracked_link: s.link })),
        produced: r.produced,
        cannot_be_attributed: r.notAttributable,
        next_move: r.next,
        open: link(`/app/cycles/${loaded.goal.id}/report`),
      };
    },
  },
  {
    name: "get_draft",
    title: "Read a draft",
    description: "A draft's text, status and current pre-review flags, including claims nothing in the founder's evidence backs. Approving it is done by a person in Banyan.",
    inputSchema: obj({ draft_id: idArg("A draft id from whats_waiting.") }, ["draft_id"]),
    annotations: RO,
    async run(ctx, args) {
      const item = await prisma.contentItem.findFirst({ where: { id: needId(args, "draft_id"), workspaceId: ctx.workspace.id } });
      if (!item) throw new ToolInputError("No such draft in this workspace.");
      const profile = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id }, select: { brandVoice: true } });
      let avoid = "";
      try {
        avoid = (JSON.parse(profile?.brandVoice || "{}") as { avoid?: string }).avoid ?? "";
      } catch {
        avoid = "";
      }
      const evidence = (await loadClaimEvidence(ctx.workspace.id))(item.campaignId, item.sourceRef);
      const flags = isChannel(item.channel) ? checkDraft({ channel: item.channel, format: item.format, body: item.body, banned: bannedTerms(avoid), evidence }) : [];
      return {
        id: item.id,
        title: item.title,
        channel: item.channel,
        format: item.format,
        status: item.status,
        approved_at: item.approvedAt,
        body: item.body,
        flags: flags.map((f) => ({ code: f.code, message: f.message })),
        open: link(`/app/content/${item.id}`),
      };
    },
  },
  {
    name: "get_publishing_status",
    title: "Publishing status",
    description: "Whether automated publishing is available, the channel connections, and the latest publications with their live URLs and outcomes (provider-confirmed vs recorded by hand).",
    inputSchema: obj({}),
    annotations: RO,
    async run(ctx) {
      const wid = ctx.workspace.id;
      const [connections, pubs] = await Promise.all([
        prisma.channelConnection.findMany({ where: { workspaceId: wid }, select: { channel: true, adapter: true, status: true, lastError: true } }),
        prisma.publication.findMany({
          where: { contentItem: { workspaceId: wid } },
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: { status: true, manual: true, externalUrl: true, publishedAt: true, lastError: true, contentItem: { select: { id: true, title: true, channel: true } } },
        }),
      ]);
      const providers = enabledProviderIds();
      return {
        automated_publishing: providers.length ? "available" : "off (export mode: the founder publishes and records the URL)",
        connections,
        recent_publications: pubs.map((p) => ({
          title: p.contentItem.title,
          channel: p.contentItem.channel,
          status: p.status,
          confirmed_by: p.status === "published" ? (p.manual ? "founder (recorded URL)" : "platform") : null,
          url: p.externalUrl,
          published_at: p.publishedAt,
          error: p.lastError,
          open: link(`/app/content/${p.contentItem.id}`),
        })),
      };
    },
  },
  {
    name: "get_autonomy",
    title: "Autonomy mandate and decisions",
    description: "What Banyan may do without asking (the founder's policy, in plain language) and this week's decisions made under it: approved, scheduled, and left for the founder, with the most common reasons.",
    inputSchema: obj({}),
    annotations: RO,
    async run(ctx) {
      const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspace.id }, select: { autonomyPolicy: true, agentsPausedAt: true } });
      const policy = parsePolicy(ws?.autonomyPolicy);
      const since = new Date(Date.now() - 7 * 86_400_000);
      const digest = buildDigest(await autonomyEvents(ctx.workspace.id, since), since);
      return {
        agents_paused: Boolean(ws?.agentsPausedAt),
        mandate: describePolicy(policy),
        policy_version: policy.version,
        this_week: digest,
        only_a_person_can: ["approve or reject drafts outside the mandate", "publish", "change the mandate", "connect accounts", "resume paused agents"],
        open: link("/app/autonomy"),
      };
    },
  },
];

export const MCP_INSTRUCTIONS =
  "Banyan runs a founder's product distribution. These tools are read-only: use them to tell the founder what is waiting on them, how cycles are doing and why. " +
  "Never claim you approved, published or changed anything; send the founder to the linked screen instead. Report numbers exactly as given: null means not measured, 0 means measured and nothing happened.";
