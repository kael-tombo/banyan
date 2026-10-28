import { z } from "zod";
import type { TaskOutput, VerificationCriteria } from "@/lib/agents/types";

/**
 * Output verification — every agent task must pass verification before it is
 * allowed to be marked complete. Pure logic over already-parsed values.
 *
 * The registry of named schemas grows with the workflow; unknown schema names
 * FAIL verification (never silently pass).
 */

export const VERIFICATION_SCHEMAS: Record<string, z.ZodTypeAny> = {
  research_brief: z.object({
    questions: z.array(z.string().min(5)).min(1).max(10),
    hypothesisAngles: z.array(z.string().min(10)).min(1).max(6),
    sourcesNeeded: z.array(z.string()).max(10).default([]),
    labelledAs: z.literal("hypothesis"),
  }),
  strategy: z.object({
    positioning: z.string().min(10),
    contentThemes: z.array(z.string().min(5)).min(1).max(5),
    channelFocus: z.array(z.enum(["x", "linkedin", "shortvideo"])).min(1).max(3),
    rationale: z.string().min(10),
    labelledAs: z.literal("hypothesis"),
  }),
  campaign_plan: z.object({
    campaignId: z.string().min(1),
    campaignName: z.string().min(3),
    channels: z.array(z.enum(["x", "linkedin", "shortvideo"])).min(1),
    formats: z.array(z.string()).min(1),
    keyMessage: z.string().min(10),
    cta: z.string().min(3),
    successMetric: z.string().min(3),
  }),
  content_draft: z.object({
    contentItemId: z.string().min(1),
    channel: z.enum(["x", "linkedin", "shortvideo"]),
    format: z.string().min(2),
  }),
  publish_result: z.object({
    publicationId: z.string().min(1),
    publicationStatus: z.enum(["published", "blocked", "failed", "retry_scheduled"]),
    externalUrl: z.string().optional(),
    trackedLinkSlug: z.string().optional(),
  }),
  measurement: z.object({
    confirmedPublications: z.number().int().min(0),
    trackedClicks: z.number().int().min(0),
    events: z.record(z.number().int().min(0)),
    metrics: z.array(z.object({ metric: z.string(), value: z.number(), source: z.string() })),
    dataLimitations: z.array(z.string()),
  }),
  evaluation: z.object({
    experimentId: z.string().min(1),
    verdict: z.enum(["not_enough_data", "evidence_against", "evidence_for", "inconclusive"]),
    observations: z.array(z.string()).min(1),
  }),
  recommendation: z.object({
    recommendationId: z.string().min(1),
    confidence: z.enum(["low", "medium", "high"]),
  }),
  plan_draft: z.object({
    planId: z.string().min(1),
    status: z.enum(["planned", "approved", "rejected", "superseded"]),
  }),
};

export type VerifyResult = { ok: true } | { ok: false; error: string };

/** Verify a handler output against declared criteria. */
export function verifyOutput(criteria: VerificationCriteria, output: TaskOutput | null | undefined): VerifyResult {
  if (!output || typeof output.summary !== "string" || output.summary.trim().length === 0) {
    return { ok: false, error: "Task produced no result summary." };
  }
  switch (criteria.kind) {
    case "nonempty":
      return output.summary.trim().length > 0 ? { ok: true } : { ok: false, error: "Output summary is empty." };
    case "provider_confirmed": {
      const status = output.data?.publicationStatus ?? output.refs?.publicationStatus;
      return status === "published"
        ? { ok: true }
        : { ok: false, error: "Provider did not confirm the publication; task cannot be marked complete." };
    }
    case "json_schema": {
      const schema = VERIFICATION_SCHEMAS[criteria.schema];
      if (!schema) return { ok: false, error: `Unknown verification schema "${criteria.schema}".` };
      const parsed = schema.safeParse({ ...(output.data ?? {}), ...(output.refs ?? {}) });
      if (!parsed.success) {
        return { ok: false, error: `Output failed schema "${criteria.schema}": ${parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ").slice(0, 300)}` };
      }
      return { ok: true };
    }
  }
}

/** Parse a JSON blob into a TaskOutput-shaped value (used on resumption). */
export function coerceTaskOutput(json: string | null): TaskOutput | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as TaskOutput;
    if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
