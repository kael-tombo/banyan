import { recordActivity } from "@/lib/activity";
import { env } from "@/lib/env";
import { recordAgentRun } from "@/lib/model/router";
import { ROSTER } from "../roster";
import type { RuntimeAgent } from "../types";
import type { OpenCodeRunResult } from "./runtime";

/**
 * One agent run for one Banyan task, recorded in the ledger whether or not it succeeded (ADR-007:
 * one run, one ledger row). The quota is checked by the caller, before any run starts.
 */
export async function runAgentTask(args: {
  workspaceId: string;
  taskId: string;
  /** Distinguishes runs within one attempt, e.g. "attempt-2" and "attempt-2-critic". */
  runId: string;
  agent: RuntimeAgent;
  brief: string;
  /** Ledger purpose, e.g. "research" or "content_draft". */
  purpose: string;
  attempt: number;
  context?: Record<string, string>;
  /** Decides whether the run counts as ok in the ledger. Defaults to the runtime's own status. */
  succeeded?: (result: OpenCodeRunResult) => boolean;
}): Promise<OpenCodeRunResult> {
  // Loaded here so a deployment on the direct runtime never imports the SDK's wrapper.
  const { getOpenCodeRuntime } = await import("./host");
  let result: OpenCodeRunResult;
  try {
    result = await getOpenCodeRuntime().run({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      runId: args.runId,
      agent: args.agent,
      brief: args.brief,
      budget: { maxSteps: ROSTER[args.agent].steps, maxTokens: env.AGENT_RUN_MAX_TOKENS },
      context: args.context,
    });
  } catch (err) {
    await recordIncident(args, `it could not run: ${(err as Error).message.slice(0, 200)}`, {});
    throw err;
  }
  if (result.usage.steps > 0) {
    const ok = args.succeeded ? args.succeeded(result) : result.status === "completed";
    await recordAgentRun({
      workspaceId: args.workspaceId,
      purpose: args.purpose,
      runtime: "opencode",
      perModel: result.perModel,
      reportedCostUsd: result.costUsd > 0 ? result.costUsd : undefined,
      steps: result.usage.steps,
      toolCalls: result.usage.toolCalls,
      latencyMs: result.latencyMs,
      ok,
      error: ok ? null : `Agent run ${result.status}: ${result.summary.slice(0, 200)}`,
      attempt: args.attempt,
    });
  }
  if (result.status !== "completed") await recordIncident(args, incidentReason(result), { status: result.status, tokens: result.tokens, sessionRef: result.sessionRef });
  return result;
}

/** Plain words for why a run did not finish. */
export function incidentReason(result: Pick<OpenCodeRunResult, "status" | "stopped" | "tokens" | "summary">): string {
  if (result.stopped === "budget") return `it reached its token budget (${result.tokens.toLocaleString("en-US")} tokens used, limit ${env.AGENT_RUN_MAX_TOKENS.toLocaleString("en-US")})`;
  if (result.stopped === "timeout") return `it ran out of time (${Math.round(env.AGENT_RUN_TIMEOUT_MS / 1000)}s)`;
  return result.summary ? `it ended without a usable answer: ${result.summary.slice(0, 160)}` : "it ended without an answer";
}

/** The incident log (R4): every agent run that stops early is recorded where the founder sees activity. */
async function recordIncident(args: { workspaceId: string; taskId: string; agent: RuntimeAgent; purpose: string }, reason: string, meta: Record<string, unknown>): Promise<void> {
  await recordActivity({
    workspaceId: args.workspaceId,
    type: "agent_incident",
    actorType: "ai",
    summary: `The ${args.agent} agent stopped: ${reason}. Nothing more was spent on this run.`,
    meta: { taskId: args.taskId, purpose: args.purpose, ...meta },
  }).catch(() => {});
}

export const modelsOf = (result: OpenCodeRunResult) => [...new Set(result.perModel.map((m) => m.model))].join("+") || "unknown model";
