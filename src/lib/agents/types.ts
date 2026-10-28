import type { AgentRole, TaskType } from "@/lib/state-machines";

/**
 * Shared shapes for the agent runtime. DB rows are serialized JSON columns,
 * so the runtime works on these typed envelopes and (de)serializes at the edge.
 */

export type TaskInput = Record<string, unknown>;

export type TaskEnvelope = {
  id: string;
  workspaceId: string;
  goalId: string | null;
  campaignId: string | null;
  dedupeKey: string;
  type: TaskType;
  title: string;
  agentRole: AgentRole;
  status: string;
  inputs: TaskInput;
  expectedOutput: string;
  output: TaskOutput | null;
  verification: VerificationCriteria;
  requiresApproval: boolean;
  dependsOn: string[];
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  leasedUntil: Date | null;
  startedAt: Date | null;
};

export type VerificationCriteria =
  | { kind: "nonempty" }
  | { kind: "json_schema"; schema: string } // named schema in verify.ts registry
  | { kind: "provider_confirmed" };

export type TaskOutput = {
  /** Human-readable result summary shown in execution records. */
  summary: string;
  /** Structured payload consumed by downstream tasks (JSON-serializable). */
  data?: Record<string, unknown>;
  /** Produced entity references, e.g. { contentItemId, publicationId }. */
  refs?: Record<string, string>;
  /** Label of the model/provider that produced generated content. */
  generatedLabel?: string;
  isFallback?: boolean;
};

export type HandlerContext = {
  task: TaskEnvelope;
  workspaceId: string;
  goalId: string | null;
  userId: string | null; // acting user when triggered by a session request
  log: (step: string, detail?: string) => void;
};

export type HandlerResult =
  | { outcome: "completed"; output: TaskOutput }
  | { outcome: "waiting_approval"; note: string; output?: TaskOutput }
  | { outcome: "blocked"; reason: string; actionable: string; output?: TaskOutput }
  | { outcome: "failed"; error: string; retryable: boolean; output?: TaskOutput };

export type TaskHandler = (ctx: HandlerContext) => Promise<HandlerResult>;

export function parseTaskEnvelope(row: {
  id: string;
  workspaceId: string;
  goalId: string | null;
  campaignId: string | null;
  dedupeKey: string;
  type: string;
  title: string;
  agentRole: string;
  status: string;
  inputs: string;
  expectedOutput: string;
  output: string | null;
  verification: string;
  requiresApproval: boolean;
  dependsOn: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  leasedUntil: Date | null;
  startedAt: Date | null;
}): TaskEnvelope {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    goalId: row.goalId,
    campaignId: row.campaignId,
    dedupeKey: row.dedupeKey,
    type: row.type as TaskType,
    title: row.title,
    agentRole: row.agentRole as AgentRole,
    status: row.status,
    inputs: safeParse(row.inputs, {}),
    expectedOutput: row.expectedOutput,
    output: row.output ? safeParse<TaskOutput | null>(row.output, null) : null,
    verification: safeParse<VerificationCriteria>(row.verification, { kind: "nonempty" }),
    requiresApproval: row.requiresApproval,
    dependsOn: safeParse<string[]>(row.dependsOn, []),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    leasedUntil: row.leasedUntil,
    startedAt: row.startedAt,
  };
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
