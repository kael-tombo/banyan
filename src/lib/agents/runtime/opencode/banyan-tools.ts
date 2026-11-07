import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { contextBlock, loadBusinessContext, safeJSON } from "@/lib/agents/handlers/common";
import { FORMAT_GUIDE } from "@/lib/ai/generate";
import { bannedTerms, checkDraft, CRITIC_KINDS, formatDraft, parseFlags, X_POST_LIMIT, type CriticKind, type DraftFlag } from "@/lib/content/checks";
import { CHANNEL_LIMITS, CHANNEL_META, isChannel, isFormatFor, type Channel } from "@/lib/formats";

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

// ---- Drafting (R3): a writer proposes one post per task, a critic flags it ----

/** What a drafting task is about. Comes from the task, never from the model. */
export type DraftTask = { taskId: string; channel?: string; format?: string; campaignId?: string };

type Voice = { tone?: string; language?: string; avoid?: string; cta?: string };

function draftTarget(task: DraftTask): { channel: Channel; format: string } {
  if (!task.channel || !isChannel(task.channel) || !task.format || !isFormatFor(task.channel, task.format)) {
    throw new ToolRefused("This task has no valid channel and format.");
  }
  return { channel: task.channel, format: task.format };
}

const draftLimit = (channel: Channel, format: string) => (channel === "x" && format !== "thread" ? X_POST_LIMIT : CHANNEL_LIMITS[channel]);
const sourceRef = (taskId: string) => `task:${taskId}`;

export async function channelRules(workspaceId: string, task: DraftTask): Promise<string> {
  await assertAgentsMayAct(workspaceId);
  const { channel, format } = draftTarget(task);
  const [profile, campaign] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId } }),
    task.campaignId ? prisma.campaign.findFirst({ where: { id: task.campaignId, workspaceId } }) : null,
  ]);
  const voice = safeJSON<Voice>(profile?.brandVoice ?? "{}", {});
  const banned = bannedTerms(voice.avoid);
  return [
    `Channel: ${CHANNEL_META[channel].label}; format: ${format}.`,
    `Format guide: ${FORMAT_GUIDE[channel]?.[format] ?? "write natively for this channel and format."}`,
    `Length limit: ${draftLimit(channel, format)} characters${channel === "x" && format === "thread" ? " per post; separate posts with a blank line" : ""}.`,
    `Brand voice: tone ${voice.tone || "direct, plain-spoken"}; language ${voice.language || "English"}.`,
    banned.length ? `Never use these terms: ${banned.join(", ")}.` : "",
    `Call to action: ${voice.cta || campaign?.cta || "Try the product"}.`,
    campaign ? `Campaign: ${campaign.name} (objective: ${campaign.objective}).` : "",
    campaign?.keyMessage ? `Key message: ${campaign.keyMessage}` : "",
    campaign?.evidence ? `Supporting evidence, the only claims allowed: ${campaign.evidence}` : "",
    "Use only facts from the context. No numbers, prices, testimonials or results that are not given. No URLs, @handles or placeholders; Banyan adds the link. Name the product at least once.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Saves the task's draft, or revises it while it is still the agent's. One draft per task, found by
 * its source, so a repeated or resumed call updates instead of adding a second. Returns the checks
 * the founder will see, so the writer can fix them before finishing.
 */
export async function proposeDraft(workspaceId: string, task: DraftTask, input: { body: string }): Promise<{ id: string; length: number; checks: string[] }> {
  const { channel, format } = draftTarget(task);
  const body = formatDraft(channel, format, input.body ?? "");
  if (body.length < 20) throw new ToolRefused("A draft needs at least a full sentence.");
  const limit = draftLimit(channel, format);
  if (!(channel === "x" && format === "thread") && body.length > limit) {
    throw new ToolRefused(`The draft is ${body.length} characters; the limit is ${limit}. Shorten it and save again.`);
  }
  await assertAgentsMayAct(workspaceId);
  const existing = await prisma.contentItem.findFirst({ where: { workspaceId, sourceRef: sourceRef(task.taskId) }, select: { id: true, status: true } });
  if (existing && existing.status !== "draft") throw new ToolRefused("This task's draft was already submitted for review. Finish now.");
  let id = existing?.id;
  if (id) {
    await prisma.contentItem.update({ where: { id }, data: { body } });
  } else {
    const campaign = task.campaignId ? await prisma.campaign.findFirst({ where: { id: task.campaignId, workspaceId }, select: { id: true, name: true } }) : null;
    const created = await prisma.contentItem.create({
      data: {
        workspaceId,
        campaignId: campaign?.id ?? null,
        channel,
        format,
        title: `${campaign?.name ?? "Standalone"} — ${channel} ${format}`.slice(0, 160),
        body,
        // Not in the review queue yet: the task finishes it after the critic has looked.
        status: "draft",
        sourceRef: sourceRef(task.taskId),
      },
      select: { id: true },
    });
    id = created.id;
  }
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId }, select: { brandVoice: true } });
  const checks = checkDraft({ channel, format, body, banned: bannedTerms(safeJSON<Voice>(profile?.brandVoice ?? "{}", {}).avoid) }).map((f) => f.message);
  return { id, length: body.length, checks };
}

/** The draft a drafting task produced, if any. */
export function findTaskDraft(workspaceId: string, taskId: string) {
  return prisma.contentItem.findFirst({ where: { workspaceId, sourceRef: sourceRef(taskId) } });
}

export const MAX_CRITIC_FLAGS = 10;
const CRITIC_LABEL: Record<CriticKind, string> = {
  unsupported_claim: "an unsupported claim",
  off_voice: "off-voice copy",
  banned_term: "a banned term",
  risky_topic: "a risky topic",
  unchecked: "nothing: it could not review the draft",
};

/** Flags on one draft are read, changed and written back; calls in one model turn run in parallel, so they queue. */
const flagQueues = new Map<string, Promise<unknown>>();

export async function flagDraft(workspaceId: string, task: DraftTask, input: { kind: string; excerpt: string; note: string }): Promise<{ flags: number }> {
  if (!(CRITIC_KINDS as readonly string[]).includes(input.kind) || input.kind === "unchecked") {
    throw new ToolRefused(`kind must be one of: ${CRITIC_KINDS.filter((k) => k !== "unchecked").join(", ")}.`);
  }
  const excerpt = (input.excerpt ?? "").trim().slice(0, 200);
  const note = (input.note ?? "").trim().slice(0, 300);
  if (!excerpt || !note) throw new ToolRefused("Quote the exact words (excerpt) and say why (note).");
  await assertAgentsMayAct(workspaceId);
  const kind = input.kind as CriticKind;
  return addCriticFlag(workspaceId, task.taskId, { code: "critic", kind, excerpt, message: `The critic flagged ${CRITIC_LABEL[kind]}: "${excerpt}". ${note}` });
}

/** Also used by the task itself to record that the critic could not review the draft. */
export async function addCriticFlag(workspaceId: string, taskId: string, flag: Extract<DraftFlag, { code: "critic" }>): Promise<{ flags: number }> {
  const item = await findTaskDraft(workspaceId, taskId);
  if (!item) throw new ToolRefused("There is no draft for this task yet.");
  const previous = flagQueues.get(item.id) ?? Promise.resolve();
  const next = previous.then(async () => {
    const current = await prisma.contentItem.findUnique({ where: { id: item.id }, select: { checks: true } });
    const flags = parseFlags(current?.checks);
    const same = (f: DraftFlag) => f.code === "critic" && f.kind === flag.kind && f.excerpt.toLowerCase() === flag.excerpt.toLowerCase();
    if (!flags.some(same)) {
      if (flags.filter((f) => f.code === "critic").length >= MAX_CRITIC_FLAGS) throw new ToolRefused(`The draft already has ${MAX_CRITIC_FLAGS} flags. Finish now.`);
      flags.push(flag);
      await prisma.contentItem.update({ where: { id: item.id }, data: { checks: JSON.stringify(flags) } });
    }
    return { flags: flags.filter((f) => f.code === "critic").length };
  });
  flagQueues.set(item.id, next.catch(() => {}));
  return next;
}
