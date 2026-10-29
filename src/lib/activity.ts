import { prisma } from "@/lib/db";

export type ActivityType =
  | "content_created"
  | "content_generated"
  | "approval"
  | "rejection"
  | "publication_attempt"
  | "publication_retry_scheduled"
  | "publication_success"
  | "publication_failed"
  | "publication_blocked"
  | "signup"
  | "visit"
  | "onboarding_complete"
  | "experiment_update"
  | "recommendation"
  | "connection"
  | "metric"
  | "campaign"
  // Agentic execution runtime
  | "goal"
  | "plan"
  | "task";

export async function recordActivity(input: {
  workspaceId: string;
  type: ActivityType;
  actorType?: "user" | "system" | "ai";
  actorSummary?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  return prisma.activityEvent.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      actorType: input.actorType ?? "user",
      actorSummary: input.actorSummary ?? null,
      summary: input.summary,
      meta: JSON.stringify(input.meta ?? {}),
    },
  });
}

export async function recordMetricEvent(input: {
  workspaceId: string;
  type: "visit" | "signup" | "onboarding_complete";
  campaignId?: string | null;
  linkId?: string | null;
  visitorId?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
}) {
  return prisma.metricEvent.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      campaignId: input.campaignId ?? null,
      linkId: input.linkId ?? null,
      visitorId: input.visitorId ?? null,
      userId: input.userId ?? null,
      meta: JSON.stringify(input.meta ?? {}),
    },
  });
}
