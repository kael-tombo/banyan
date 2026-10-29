import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace, readJson } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { routeComplete } from "@/lib/model/router";
import {
  buildWorkspaceBrief,
  chatSystemPrompt,
  fallbackChatReply,
  flattenChatPayload,
  type ChatBriefInput,
  type ChatHistoryItem,
} from "@/lib/agents/chat";
import { z } from "zod";
import { NextRequest } from "next/server";

/**
 * Command center chat — the persisted conversation between the workspace and
 * the Banyan agent. One thread per workspace; every reply is grounded in
 * records at send time and carries its model label so the interface can show
 * what generated it (live model vs labeled template fallback).
 */

const sendSchema = z.object({
  content: z.string().trim().min(1, "Write a message first.").max(2000),
});

const HISTORY_TAKE = 30;
const MODEL_WINDOW = 12;

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const messages = await prisma.chatMessage.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TAKE,
  });
  return json({ messages: messages.reverse() });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "chat-send", 15, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await readJson(req, sendSchema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const content = parsed.data.content;

  const wid = ctx.workspace.id;
  const now = new Date();
  const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // ————— Ground the reply in records only —————
  const [profile, goal, pendingApprovals, agentTasks, connections, visitEvents, signupCount, linksAgg, topRec] =
    await Promise.all([
      prisma.productProfile.findUnique({ where: { workspaceId: wid } }),
      prisma.goal.findFirst({
        where: { workspaceId: wid, status: { in: ["planning", "awaiting_approval", "active", "paused"] } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.contentItem.count({ where: { workspaceId: wid, status: "ready_for_review" } }),
      prisma.agentTask.findMany({
        where: { workspaceId: wid },
        orderBy: { updatedAt: "desc" },
        take: 120,
        select: { status: true },
      }),
      prisma.channelConnection.findMany({ where: { workspaceId: wid }, select: { channel: true, status: true } }),
      prisma.metricEvent.count({ where: { workspaceId: wid, type: "visit", createdAt: { gte: d14 } } }),
      prisma.metricEvent.count({
        where: { workspaceId: wid, type: "signup", createdAt: { gte: d14 }, OR: [{ linkId: { not: null } }, { campaignId: { not: null } }] },
      }),
      prisma.trackedLink.aggregate({ where: { workspaceId: wid }, _sum: { clicks: true } }),
      prisma.recommendation.findFirst({ where: { workspaceId: wid, status: "open" }, orderBy: { createdAt: "desc" } }),
    ]);

  const briefInput: ChatBriefInput = {
    profile: profile
      ? { name: profile.name, stage: profile.stage, valueProp: profile.valueProp, audience: profile.audience }
      : null,
    activeGoal: goal
      ? {
          objective: goal.objective,
          successMetric: goal.successMetric,
          metricTarget: goal.metricTarget,
          metricUnit: goal.metricUnit,
          progress: goal.progress,
          status: goal.status,
          deadline: goal.deadline ? goal.deadline.toISOString().slice(0, 10) : null,
        }
      : null,
    goalsInFlight: 0, // refined below when no in-motion goal exists
    pendingApprovals,
    runningTasks: agentTasks.filter((t) => ["ready", "running"].includes(t.status)).length,
    blockedTasks: agentTasks.filter((t) => ["blocked", "failed"].includes(t.status)).length,
    connections: connections.map((c) => ({ channel: c.channel, status: c.status })),
    last14Days: { trackedClicks: linksAgg._sum.clicks ?? 0, visits: visitEvents, signups: signupCount },
    topOpenRecommendation: topRec?.title ?? null,
  };
  if (!goal) {
    briefInput.goalsInFlight = await prisma.goal.count({ where: { workspaceId: wid } });
  }

  // Persist the user message first so the transcript stays truthful about
  // what was asked, even if the model call fails.
  const userMessage = await prisma.chatMessage.create({
    data: { workspaceId: wid, role: "user", content },
  });

  // Bounded recent history (including the message just sent).
  const recent = await prisma.chatMessage.findMany({
    where: { workspaceId: wid },
    orderBy: { createdAt: "desc" },
    take: MODEL_WINDOW + 1,
  });
  const history: ChatHistoryItem[] = recent
    .reverse()
    .slice(0, -1) // everything before the current message
    .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.content }));

  const routed = await routeComplete({
    workspaceId: wid,
    purpose: "chat",
    system: chatSystemPrompt(buildWorkspaceBrief(briefInput)),
    user: flattenChatPayload(history, content, MODEL_WINDOW),
    maxTokens: 600,
    temperature: 0.6,
  });

  // Fallback served the request: replace the content-draft template with an
  // honest chat-shaped reply built from the same records, keep the label.
  const text = routed.usage.isFallback ? fallbackChatReply(briefInput, content) : routed.text.trim();

  const assistantMessage = await prisma.chatMessage.create({
    data: {
      workspaceId: wid,
      role: "assistant",
      content: text,
      modelLabel: routed.usage.label,
      isFallback: routed.usage.isFallback,
      latencyMs: routed.latencyMs,
    },
  });

  return json({ userMessage, assistantMessage });
}

export async function DELETE(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "chat-clear", 3, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);
  await prisma.chatMessage.deleteMany({ where: { workspaceId: ctx.workspace.id } });
  return json({ ok: true });
}
