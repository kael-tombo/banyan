import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { contextBlock, loadBusinessContext } from "@/lib/agents/handlers/common";

/**
 * What Banyan's tools do when an agent calls them (ADR-006 §3). The host binds each to one
 * workspace through the session's metadata, so no input names a workspace or a task.
 *
 * Every write is idempotent. OpenCode's recovery is at-least-once: after a crash a model
 * may call a tool again (conformance V07), and the second call must change nothing.
 */

export class ToolRefused extends Error {}

/** Re-checked on every call, so a pause or an archive stops a running agent at its next tool call. */
async function assertAgentsMayAct(workspaceId: string): Promise<void> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { status: true, agentsPausedAt: true } });
  if (!ws) throw new ToolRefused("This product no longer exists.");
  if (ws.status === "archived") throw new ToolRefused("This product is archived; its agents have stopped.");
  if (ws.agentsPausedAt) throw new ToolRefused("The founder paused this product's agents.");
}

export async function readContext(workspaceId: string): Promise<string> {
  await assertAgentsMayAct(workspaceId);
  return contextBlock(await loadBusinessContext(workspaceId));
}

export type NoteInput = { text: string; provenance: "hypothesis" | "external_observation"; source?: string };

/** A task records at most this many notes; past it, the agent is told to finish. */
export const MAX_NOTES_PER_TASK = 12;

export function noteKey(taskId: string, text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return `note:${taskId.slice(-8)}:${createHash("sha256").update(normalized).digest("hex").slice(0, 12)}`;
}

export async function recordNote(workspaceId: string, taskId: string, input: NoteInput): Promise<{ id: string; key: string }> {
  const text = input.text.trim().replace(/\s+/g, " ");
  if (text.length < 10) throw new ToolRefused("A note needs at least one full sentence.");
  if (text.length > 600) throw new ToolRefused("A note is at most 600 characters. Split it.");
  if (input.provenance === "external_observation" && !input.source?.trim()) {
    throw new ToolRefused("An external observation needs its source. Without one, record it as a hypothesis.");
  }
  await assertAgentsMayAct(workspaceId);
  const key = noteKey(taskId, text);
  const existing = await prisma.profileFact.findUnique({ where: { workspaceId_category_key: { workspaceId, category: "research", key } }, select: { id: true } });
  if (existing) return { id: existing.id, key };
  const count = await prisma.profileFact.count({ where: { workspaceId, category: "research", source: { endsWith: `task:${taskId}` } } });
  if (count >= MAX_NOTES_PER_TASK) throw new ToolRefused(`This task already has ${MAX_NOTES_PER_TASK} notes. Finish with your answer.`);
  const row = await prisma.profileFact.upsert({
    where: { workspaceId_category_key: { workspaceId, category: "research", key } },
    create: {
      workspaceId,
      category: "research",
      key,
      value: text,
      provenance: input.provenance,
      confidence: "low",
      source: input.source?.trim() ? `${input.source.trim().slice(0, 200)} · task:${taskId}` : `task:${taskId}`,
      createdBy: `agent:researcher task:${taskId}`,
    },
    update: {},
    select: { id: true },
  });
  return { id: row.id, key };
}
