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
  const result = await getOpenCodeRuntime().run({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    runId: args.runId,
    agent: args.agent,
    brief: args.brief,
    budget: { maxSteps: ROSTER[args.agent].steps, maxTokens: env.AGENT_RUN_MAX_TOKENS },
    context: args.context,
  });
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
  return result;
}

export const modelsOf = (result: OpenCodeRunResult) => [...new Set(result.perModel.map((m) => m.model))].join("+") || "unknown model";
