import { prisma } from "@/lib/db";
import { routeComplete, type ModelPurpose } from "@/lib/model/router";
import { extractJSON } from "@/lib/ai/provider";
import type { ZodSchema } from "zod";
import type { TaskSpec } from "@/lib/agents/workflow-template";
import type { HandlerContext } from "@/lib/agents/types";
import { LEARNING_MEMORY_LIMIT, priorLearningLines } from "@/lib/learning-memory";

/**
 * Shared handler infrastructure: business-context assembly with explicit
 * provenance labels, routed structured model calls with honest fallbacks,
 * and idempotent downstream task creation.
 */

export type BusinessContext = Awaited<ReturnType<typeof loadBusinessContext>>;

export async function loadBusinessContext(workspaceId: string) {
  const [profile, facts, experiments] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId } }),
    prisma.profileFact.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 60 }),
    // The loop's memory: concluded, interpreted experiments are read at prompt
    // time so a user-recorded conclusion and an agent-evaluated one are the
    // same source of truth. No duplicated "learning facts" to drift.
    prisma.experiment.findMany({
      where: { workspaceId, status: "complete" },
      orderBy: [{ decidedAt: "desc" }, { updatedAt: "desc" }],
      take: LEARNING_MEMORY_LIMIT * 2,
    }),
  ]);
  return { profile, facts, experiments };
}

const PROVENANCE_LABEL: Record<string, string> = {
  verified: "verified fact",
  user_provided: "user-provided",
  external_observation: "external observation",
  hypothesis: "hypothesis (unvalidated)",
};

/**
 * Render the persisted business context for a model prompt. Every line is
 * labeled with its provenance so the model can never present an unvalidated
 * hypothesis as a fact — and neither can we.
 */
export function contextBlock(ctx: BusinessContext, goal?: { objective: string; successMetric: string; metricTarget: number | null; deadline: Date | null; constraints: string } | null): string {
  const lines: string[] = [];
  const p = ctx.profile;
  if (p) {
    if (p.name) lines.push(`Product (user-provided): ${p.name} — ${p.description}`);
    if (p.valueProp) lines.push(`Value proposition (user-provided): ${p.valueProp}`);
    if (p.positioning) lines.push(`Positioning (user-provided): ${p.positioning}`);
    if (p.audience) lines.push(`Audience (user-provided): ${p.audience}`);
    if (p.audiencePain) lines.push(`Audience pain (user-provided): ${p.audiencePain}`);
    if (p.audienceOutcome) lines.push(`Desired outcome (user-provided): ${p.audienceOutcome}`);
    if (p.stage) lines.push(`Stage (user-provided): ${p.stage}`);
    const voice = safeJSON<Record<string, string>>(p.brandVoice, {});
    if (voice.tone) lines.push(`Brand voice (user-provided): tone ${voice.tone}, language ${voice.language || "English"}${voice.avoid ? `, avoid: ${voice.avoid}` : ""}`);
  } else {
    lines.push("Business profile: not yet configured.");
  }
  if (ctx.facts.length) {
    lines.push("Recorded context (provenance labeled — treat hypotheses as unvalidated):");
    for (const f of ctx.facts.slice(0, 40)) {
      lines.push(`- [${PROVENANCE_LABEL[f.provenance] ?? f.provenance}] ${f.category}/${f.key}: ${f.value.slice(0, 300)}`);
    }
  }
  // Prior learning must reach the next plan, not just the results page.
  const learning = priorLearningLines(ctx.experiments, LEARNING_MEMORY_LIMIT);
  if (learning.length > 0) {
    lines.push(
      "Prior learning from concluded experiments in this workspace (recorded conclusions, not proof — apply them and respect their limits):"
    );
    for (const line of learning) lines.push(`- ${line}`);
  }
  if (goal) {
    lines.push(
      `Active goal: ${goal.objective}`,
      `Success metric: ${goal.successMetric}${goal.metricTarget != null ? ` (target ${goal.metricTarget})` : ""}`,
      goal.deadline ? `Deadline: ${goal.deadline.toISOString().slice(0, 10)}` : "Deadline: none set",
      goal.constraints ? `Constraints: ${goal.constraints}` : ""
    );
  }
  return lines.filter(Boolean).join("\n");
}

export function safeJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Routed structured generation with an honest fallback: when no live model is
 * usable (or its output fails validation), the template builder serves — and
 * the result is labeled so it can never pass as live model output.
 */
export async function routedStructured<T>(args: {
  workspaceId: string;
  purpose: ModelPurpose;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  schema: ZodSchema<T>;
  template: () => T;
}): Promise<{ data: T; label: string; isFallback: boolean }> {
  const res = await routeComplete({
    workspaceId: args.workspaceId,
    purpose: args.purpose,
    system: args.system,
    user: args.user,
    maxTokens: args.maxTokens,
    temperature: args.temperature,
  });
  try {
    const parsed = args.schema.parse(extractJSON(res.text));
    return { data: parsed, label: res.usage.label, isFallback: res.usage.isFallback };
  } catch {
    const data = args.template();
    return { data, label: `Template fallback (model output missing or invalid). ${res.usage.isFallback ? res.usage.label : "Live model returned unusable output."}`, isFallback: true };
  }
}

/**
 * Idempotent downstream task creation. Specs reference dependencies by
 * dedupe key; after insertion the keys are resolved to task ids. Unique
 * dedupe-key violations (task already exists from a previous run) are
 * silently adopted — re-planning never duplicates work.
 */
export async function createTasksFromSpecs(
  specs: TaskSpec[],
  ctx: { workspaceId: string; goalId: string | null; campaignId?: string | null }
): Promise<string[]> {
  for (const spec of specs) {
    try {
      await prisma.agentTask.create({
        data: {
          workspaceId: ctx.workspaceId,
          goalId: ctx.goalId,
          campaignId: ctx.campaignId ?? null,
          dedupeKey: spec.dedupeKey,
          type: spec.type,
          title: spec.title,
          agentRole: spec.agentRole,
          status: spec.status,
          inputs: JSON.stringify(spec.inputs ?? {}),
          expectedOutput: spec.expectedOutput,
          verification: JSON.stringify(spec.verification),
          requiresApproval: spec.requiresApproval,
          dependsOn: "[]",
          maxAttempts: spec.maxAttempts,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  // Resolve dependency dedupe keys to concrete task ids.
  const keys = Array.from(new Set(specs.flatMap((s) => s.dependsOn)));
  const createdKeys = specs.map((s) => s.dedupeKey);
  const deps = await prisma.agentTask.findMany({
    where: { workspaceId: ctx.workspaceId, dedupeKey: { in: Array.from(new Set([...keys, ...createdKeys])) } },
    select: { id: true, dedupeKey: true },
  });
  const byKey = new Map(deps.map((d) => [d.dedupeKey, d.id]));
  let resolved = 0;
  for (const spec of specs) {
    const depIds = spec.dependsOn.map((k) => byKey.get(k)).filter((v): v is string => !!v);
    const selfId = byKey.get(spec.dedupeKey);
    if (!selfId || depIds.length === 0) continue;
    const existing = await prisma.agentTask.findUnique({ where: { id: selfId }, select: { dependsOn: true } });
    if (!existing) continue;
    const current = safeJSON<string[]>(existing.dependsOn, []);
    const merged = Array.from(new Set([...current, ...depIds]));
    if (merged.length !== current.length) {
      await prisma.agentTask.update({ where: { id: selfId }, data: { dependsOn: JSON.stringify(merged) } });
      resolved++;
    }
  }
  void resolved;
  return specs.map((s) => byKey.get(s.dedupeKey)).filter((v): v is string => !!v);
}

/** Standard handler log helper bound to a run's log array. */
export function makeLogger(ctx: Pick<HandlerContext, "log">) {
  const entries: { at: string; step: string; detail?: string }[] = [];
  return {
    push(step: string, detail?: string) {
      entries.push({ at: new Date().toISOString(), step, detail });
      ctx.log(step, detail);
    },
    entries,
  };
}
