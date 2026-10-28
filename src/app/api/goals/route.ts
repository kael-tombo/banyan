import { prisma } from "@/lib/db";
import { apiError, assertSameOrigin, guardRate, json, parseJson, requireWorkspace } from "@/lib/api-utils";
import { recordActivity } from "@/lib/activity";
import { requireRole } from "@/lib/permissions";
import { canTransitionGoal } from "@/lib/state-machines";
import { startGoalWorkflow } from "@/lib/agents/orchestrator";
import { parseGoalInput } from "@/lib/agents/nl-goal";
import { routeComplete } from "@/lib/model/router";
import { extractJSON } from "@/lib/ai/provider";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const createSchema = z.object({
  rawInput: z.string().trim().min(10).max(2000),
  description: z.string().trim().max(1000).optional(),
});

const GOAL_PARSE_SCHEMA = z.object({
  objective: z.string().min(5).max(300),
  successMetric: z.string().min(2).max(60),
  metricTarget: z.number().nullable().optional(),
  deadline: z.string().nullable().optional(), // ISO date
  constraints: z.array(z.string()).max(8).default([]),
  channels: z.array(z.enum(["x", "linkedin", "shortvideo"])).max(3).default([]),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "read");
  if (forbidden) return apiError(forbidden, 403);
  const goals = await prisma.goal.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { tasks: true, campaigns: true, recommendations: true } },
    },
  });
  const withCounts = await Promise.all(
    goals.map(async (g) => {
      const tasks = await prisma.agentTask.groupBy({ by: ["status"], where: { goalId: g.id }, _count: { _all: true } });
      const statusCounts: Record<string, number> = {};
      for (const s of tasks) statusCounts[s.status] = s._count._all;
      return { ...g, taskStatusCounts: statusCounts };
    })
  );
  return json({ goals: withCounts });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "goals-create", 10, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await parseJson(createSchema, await req.json());
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const raw = parsed.data.rawInput;

  // 1. Deterministic heuristic parse (always runs; used as fallback and sanity check).
  const heuristic = parseGoalInput(raw);

  // 2. Model-based structured extraction through the router (labeled, quota'd,
  //    falls back to the heuristic result when no live provider is usable).
  let extracted = heuristic;
  let parseLabel = "Heuristic parse (no live model call needed)";
  let isFallback = true;
  try {
    const res = await routeComplete({
      workspaceId: ctx.workspace.id,
      purpose: "goal_parse",
      maxTokens: 500,
      temperature: 0.2,
      system: [
        "You extract a structured goal from a founder's natural-language request.",
        "Rules: never invent numbers, dates or metrics the user did not state. If something is missing, leave it null — the planner will list it as missing information.",
        'Respond with ONLY JSON: {"objective": string, "successMetric": string, "metricTarget": number|null, "deadline": "YYYY-MM-DD"|null, "constraints": [string], "channels": ["x"|"linkedin"|"shortvideo"]}',
      ].join("\n"),
      user: `User request: ${raw}`,
    });
    const candidate = GOAL_PARSE_SCHEMA.safeParse(extractJSON(res.text));
    if (candidate.success) {
      const d = candidate.data;
      extracted = {
        objective: d.objective,
        successMetric: d.successMetric,
        metricTarget: d.metricTarget ?? null,
        deadline: d.deadline ?? null,
        constraints: d.constraints,
        channels: d.channels,
        cleaned: heuristic.cleaned,
        metricUnit: heuristic.metricUnit,
      };
      parseLabel = res.usage.label;
      isFallback = res.usage.isFallback;
    }
  } catch {
    // heuristic result already in place; label stays honest
  }

  // Deadline sanity: the extracted date must be a real date; otherwise fall back to the heuristic parse.
  let deadline: Date | null = null;
  const deadlineSource = extracted.deadline ?? heuristic.deadline;
  if (deadlineSource) {
    const d = new Date(`${deadlineSource}T23:59:59Z`);
    if (!Number.isNaN(d.getTime())) deadline = d;
  }

  const goal = await prisma.goal.create({
    data: {
      workspaceId: ctx.workspace.id,
      objective: extracted.objective.slice(0, 300),
      description: parsed.data.description ?? "",
      successMetric: extracted.successMetric,
      metricTarget: extracted.metricTarget,
      metricUnit: heuristic.metricUnit,
      deadline,
      constraints: extracted.constraints.join("; ").slice(0, 500),
      status: canTransitionGoal("draft", "planning") ? "planning" : "draft",
      rawInput: raw,
      createdBy: ctx.user.id,
    },
  });

  await recordActivity({
    workspaceId: ctx.workspace.id,
    type: "goal",
    summary: `Goal created: "${goal.objective}" (metric: ${goal.successMetric}${goal.metricTarget != null ? `, target: ${goal.metricTarget}` : ""}).`,
    meta: { goalId: goal.id, parseLabel, isFallback },
  });

  // 3. Start the workflow: the plan_draft task runs on the next advance tick
  //    and produces the plan for human approval — no consequential action
  //    happens before that approval.
  await startGoalWorkflow(goal.id, ctx.workspace.id);

  return NextResponse.json({ goal, parseLabel }, { status: 201 });
}
