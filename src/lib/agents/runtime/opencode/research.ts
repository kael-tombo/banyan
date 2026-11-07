import type { z, ZodTypeAny } from "zod";
import { extractJSON } from "@/lib/ai/provider";
import { log } from "@/lib/log";
import { checkRunQuota } from "@/lib/model/router";
import { modelsOf, runAgentTask } from "./agent-task";

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
    "At most 10 questions, 6 hypothesis angles and 10 sources.",
  ].join("\n");
}

export async function researchWithAgent<S extends ZodTypeAny>(args: { workspaceId: string; taskId: string; attempt: number; context: string; schema: S }): Promise<AgentResearch<z.output<S>>> {
  const quota = await checkRunQuota(args.workspaceId);
  if (!quota.allowed) return { ok: false, reason: quota.reason ?? "Daily model quota reached." };

  const parse = (summary: string) => args.schema.safeParse(clampLists(extractJSON(summary)));
  const result = await runAgentTask({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    runId: `attempt-${args.attempt}`,
    agent: "researcher",
    brief: researchBrief(args.context),
    purpose: "research",
    attempt: args.attempt,
    succeeded: (r) => r.status === "completed" && parse(r.summary).success,
  });

  const parsed = result.status === "completed" ? parse(result.summary) : null;
  if (!parsed?.success) {
    const error = result.status !== "completed" ? `Agent run ${result.status}: ${result.summary.slice(0, 200)}` : "The agent's final answer was not the research brief.";
    log("warn", "agent_run_fallback", { purpose: "research", status: result.status, error, answer: result.summary.slice(0, 300), sessionRef: result.sessionRef }, "worker");
    return { ok: false, reason: error };
  }
  return { ok: true, data: parsed.data as z.output<S>, label: `OpenCode researcher agent (${modelsOf(result)})`, notes: result.proposals.length, sessionRef: result.sessionRef };
}

/** Lists past the brief's limits are cut rather than discarded: the run that wrote them was paid for. */
export function clampLists(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const limits: Record<string, number> = { questions: 10, hypothesisAngles: 6, sourcesNeeded: 10 };
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [key, max] of Object.entries(limits)) if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).slice(0, max);
  return out;
}
