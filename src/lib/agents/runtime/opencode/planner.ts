import type { z, ZodTypeAny } from "zod";
import { extractJSON } from "@/lib/ai/provider";
import { log } from "@/lib/log";
import { checkRunQuota } from "@/lib/model/router";
import { modelsOf, runAgentTask } from "./agent-task";

/**
 * The plan for a goal, drafted by the planner agent (R4). The planner may ask the founder one
 * question it cannot answer from the goal or the context. The task then waits, and the founder's
 * answer is sent into the same session, so the planner keeps everything it already read.
 */

export type PlanAnswer = { runId: string; question: string; answer: string };

export type AgentPlan<T> =
  | { ok: true; data: T; label: string }
  | { ok: false; reason: string; stopped: boolean }
  | { ok: "asked"; question: string; runId: string };

const PLAN_JSON =
  'Finish with ONLY JSON: {"summary": string, "assumptions": [string], "missingInfo": [string], "risks": [string], "phases": [{"name": string, "description": string, "taskTypes": [string]}]}';

export function plannerBrief(goalAndContext: string): string {
  return [
    goalAndContext,
    "",
    "Turn this goal into an honest, testable plan. Every claim about the market or audience is an assumption to validate.",
    "Use banyan_read_context for the product's facts. Phases map to: research, strategy, campaign_plan, content_draft, approval_gate, publish, measure, evaluate, recommend.",
    "If one thing essential to the plan is missing and nothing in the goal or the context answers it, ask the founder with banyan_ask_founder, then stop.",
    "Otherwise do not ask: list what is missing in missingInfo.",
    PLAN_JSON,
  ].join("\n");
}

export function answerFollowUp(previous: PlanAnswer): string {
  return [`The founder answered your question "${previous.question}":`, previous.answer, "", "Do not ask again. Finish the plan now.", PLAN_JSON].join("\n");
}

const LIMITS: Record<string, number> = { assumptions: 8, missingInfo: 8, risks: 6, phases: 5 };
function clamp(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [key, max] of Object.entries(LIMITS)) if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).slice(0, max);
  return out;
}

export async function planWithAgent<S extends ZodTypeAny>(args: {
  workspaceId: string;
  taskId: string;
  attempt: number;
  goalAndContext: string;
  schema: S;
  /** Set when the founder answered the planner's question: continue that run's session. */
  previous?: PlanAnswer | null;
}): Promise<AgentPlan<z.output<S>>> {
  const quota = await checkRunQuota(args.workspaceId);
  if (!quota.allowed) return { ok: false, reason: quota.reason ?? "Daily model quota reached.", stopped: false };

  const parse = (summary: string) => {
    let json: unknown;
    try {
      json = extractJSON(summary);
    } catch {
      json = undefined;
    }
    return args.schema.safeParse(clamp(json));
  };
  // The answer continues the session the question came from, not a new one for this attempt.
  const runId = args.previous?.runId ?? `attempt-${args.attempt}`;
  const result = await runAgentTask({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    runId,
    agent: "planner",
    brief: plannerBrief(args.goalAndContext),
    followUp: args.previous ? answerFollowUp(args.previous) : undefined,
    context: args.previous ? { asked: "1" } : {},
    purpose: "plan_draft",
    attempt: args.attempt,
    succeeded: (r) => (r.status === "completed" && parse(r.summary).success) || (!args.previous && r.question !== null),
  });

  if (result.question && !args.previous) return { ok: "asked", question: result.question.slice(0, 500), runId };
  const parsed = result.status === "completed" ? parse(result.summary) : null;
  if (!parsed?.success) {
    const error = result.status !== "completed" ? `Agent run ${result.status}: ${result.summary.slice(0, 200)}` : "The planner's final answer was not a plan.";
    log("warn", "agent_run_fallback", { purpose: "plan_draft", status: result.status, error, answer: result.summary.slice(0, 300) }, "worker");
    return { ok: false, reason: error, stopped: result.stopped !== null };
  }
  return { ok: true, data: parsed.data as z.output<S>, label: `OpenCode planner agent (${modelsOf(result)})` };
}
