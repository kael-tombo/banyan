import type { z, ZodTypeAny } from "zod";
import { extractJSON } from "@/lib/ai/provider";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { checkRunQuota, recordAgentRun } from "@/lib/model/router";
import { ROSTER } from "../roster";

/**
 * The research task as an agent run (roadmap R2's first task type). The researcher reads the
 * product's context, records each finding as a note with provenance, and ends with the same
 * JSON brief the single-call handler produces, so nothing downstream changes.
 *
 * Any failure returns a reason instead of throwing, and the handler falls back to the direct
 * call, labelled. A run that spent anything is recorded in the ledger either way.
 */

export type AgentResearch<T> = { ok: true; data: T; label: string; notes: number; sessionRef: string | null } | { ok: false; reason: string };

export function researchBrief(context: string): string {
  return [
    context,
    "",
    "Research this product's audience and channels using banyan_read_context.",
    "Record each hypothesis angle with banyan_record_note (provenance hypothesis), one finding per note.",
    "You have no web access: everything you produce is a hypothesis, never a market fact or statistic.",
    'Finish with ONLY JSON: {"questions": [string], "hypothesisAngles": [string], "sourcesNeeded": [string], "labelledAs": "hypothesis"}',
  ].join("\n");
}

export async function researchWithAgent<S extends ZodTypeAny>(args: { workspaceId: string; taskId: string; attempt: number; context: string; schema: S }): Promise<AgentResearch<z.output<S>>> {
  const quota = await checkRunQuota(args.workspaceId);
  if (!quota.allowed) return { ok: false, reason: quota.reason ?? "Daily model quota reached." };

  // Loaded here so a deployment on the direct runtime never imports the SDK's wrapper.
  const { getOpenCodeRuntime } = await import("./host");
  const result = await getOpenCodeRuntime().run({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    runId: `attempt-${args.attempt}`,
    agent: "researcher",
    brief: researchBrief(args.context),
    budget: { maxSteps: ROSTER.researcher.steps, maxTokens: env.AGENT_RUN_MAX_TOKENS },
  });

  const parsed = result.status === "completed" ? args.schema.safeParse(extractJSON(result.summary)) : null;
  const ok = !!parsed?.success;
  const error = ok ? null : result.status !== "completed" ? `Agent run ${result.status}: ${result.summary.slice(0, 200)}` : "The agent's final answer was not the research brief.";

  if (result.usage.steps > 0) {
    await recordAgentRun({
      workspaceId: args.workspaceId,
      purpose: "research",
      runtime: "opencode",
      perModel: result.perModel,
      reportedCostUsd: result.costUsd > 0 ? result.costUsd : undefined,
      steps: result.usage.steps,
      toolCalls: result.usage.toolCalls,
      latencyMs: result.latencyMs,
      ok,
      error,
      attempt: args.attempt,
    });
  }
  if (!ok || !parsed?.success) {
    log("warn", "agent_run_fallback", { purpose: "research", status: result.status, error, sessionRef: result.sessionRef }, "worker");
    return { ok: false, reason: error ?? "The agent run did not finish." };
  }
  const models = [...new Set(result.perModel.map((m) => m.model))].join("+") || "unknown model";
  return { ok: true, data: parsed.data as z.output<S>, label: `OpenCode researcher agent (${models})`, notes: result.proposals.length, sessionRef: result.sessionRef };
}
