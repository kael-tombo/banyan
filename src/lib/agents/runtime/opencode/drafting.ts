import { log } from "@/lib/log";
import { checkRunQuota } from "@/lib/model/router";
import { addCriticFlag, findTaskDraft } from "./banyan-tools";
import { modelsOf, runAgentTask } from "./agent-task";

/**
 * A content draft as two agent runs (roadmap R3). The writer saves one post with
 * banyan_propose_draft; a critic from another model family reads it and records flags with
 * banyan_flag. Fan-out stays with the workflow, one task per channel, rather than a creator
 * agent starting writers: the review of 2026-11-06 asked for bounded fan-out.
 *
 * The draft stays in "draft" until the task finishes it. If the critic fails, the draft carries
 * an "unchecked" flag, which keeps it from being approved automatically.
 */

export type AgentDraft =
  | { ok: true; itemId: string; label: string; model: string; criticFlags: number; reviewed: boolean }
  | { ok: false; reason: string; itemId: string | null; stopped: boolean };

export function writerBrief(context: string, channel: string, format: string): string {
  return [
    context,
    "",
    `Write one ${channel} ${format} for this product.`,
    "First read this channel's rules with banyan_channel_rules. Then save the post with banyan_propose_draft.",
    "If the save reports checks (a banned term, a length problem), fix them and save again.",
    'When it is saved, finish with one line: "Saved."',
  ].join("\n");
}

export function criticBrief(context: string, draft: string): string {
  return [
    context,
    "",
    "Review this draft before the founder sees it:",
    "<draft>",
    draft,
    "</draft>",
    "",
    "Use banyan_read_context if you need the product's facts. Flag each real problem with banyan_flag, quoting the exact words.",
    "Flag a claim only when nothing in the context backs it. If the draft is fine, flag nothing.",
    'Finish with one line: "Reviewed."',
  ].join("\n");
}

export async function draftWithAgents(args: { workspaceId: string; taskId: string; attempt: number; channel: string; format: string; campaignId: string | null; context: string }): Promise<AgentDraft> {
  // Two runs, two quota units: check both are available before starting either.
  const quota = await checkRunQuota(args.workspaceId);
  if (!quota.allowed || quota.remaining < 1) return { ok: false, reason: quota.reason ?? "Daily model quota reached.", itemId: null, stopped: false };

  const context = { channel: args.channel, format: args.format, ...(args.campaignId ? { campaignId: args.campaignId } : {}) };
  const writer = await runAgentTask({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    runId: `attempt-${args.attempt}`,
    agent: "writer",
    brief: writerBrief(args.context, args.channel, args.format),
    purpose: "content_draft",
    attempt: args.attempt,
    context,
  });
  const draft = await findTaskDraft(args.workspaceId, args.taskId);
  // R4: a writer stopped at its limit spends nothing more. With a saved draft the critic still reviews it;
  // without one, the caller uses the free template.
  if (!draft) return { ok: false, reason: `The writer did not save a draft (${writer.status}).`, itemId: null, stopped: writer.stopped !== null };
  if (writer.status !== "completed" && writer.stopped === null) return { ok: false, reason: `The writer run ${writer.status}.`, itemId: draft.id, stopped: false };

  let reviewed = false;
  let criticModels = "";
  try {
    const critic = await runAgentTask({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      runId: `attempt-${args.attempt}-critic`,
      agent: "critic",
      brief: criticBrief(args.context, draft.body),
      purpose: "content_review",
      attempt: args.attempt,
      context,
    });
    reviewed = critic.status === "completed";
    criticModels = modelsOf(critic);
  } catch (err) {
    log("warn", "critic_run_failed", { taskId: args.taskId, error: (err as Error).message.slice(0, 300) }, "worker");
  }
  if (!reviewed) {
    await addCriticFlag(args.workspaceId, args.taskId, {
      code: "critic",
      kind: "unchecked",
      excerpt: "",
      message: "The critic could not review this draft, so it waits for you.",
    });
  }
  const after = await findTaskDraft(args.workspaceId, args.taskId);
  const flags = (() => {
    try {
      return (JSON.parse(after?.checks ?? "[]") as { code?: string; kind?: string }[]).filter((f) => f.code === "critic" && f.kind !== "unchecked").length;
    } catch {
      return 0;
    }
  })();
  const label = `OpenCode writer agent (${modelsOf(writer)}${writer.stopped ? ", stopped at its limit" : ""})${reviewed ? `, checked by the critic (${criticModels})` : ", not checked: the critic failed"}`;
  return { ok: true, itemId: draft.id, label, model: modelsOf(writer), criticFlags: flags, reviewed };
}
