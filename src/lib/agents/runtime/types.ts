/**
 * The agent runtime seam (ADR-006, docs/architecture/AGENT_ORCHESTRATION.md).
 *
 * Banyan's orchestrator decides which task runs, when, under which budget and
 * policy. An AgentRuntime runs the inner loop of one task and hands back
 * proposals; it never approves, publishes or changes anything else.
 *
 *   direct   — one model call per task (today's handlers; also the fallback)
 *   opencode — an embedded OpenCode host: tool use and subagents (R2, Node 24)
 */

export const RUNTIME_AGENTS = ["planner", "strategist", "researcher", "creator", "writer", "critic", "analyst"] as const;
export type RuntimeAgent = (typeof RUNTIME_AGENTS)[number];

export type Budget = {
  /** Model-loop iterations for the root agent; subagents have their own cap in the roster. */
  maxSteps: number;
  /** Total tokens (input + output) across the session tree before the run is stopped. */
  maxTokens: number;
};

export type ProposalRef = { kind: "draft" | "strategy" | "recommendation" | "note" | "flag" | "question"; id: string };

export type AgentUsage = { inputTokens: number; outputTokens: number; steps: number; toolCalls: number; subagents: number };

export type AgentRunResult = {
  status: "completed" | "waiting_input" | "budget_exhausted" | "failed";
  proposals: ProposalRef[];
  usage: AgentUsage;
  /** Where the run lives, so a lease takeover on the same replica can resume it. */
  sessionRef: string | null;
  summary: string;
  /** Which runtime produced it; a fallback to `direct` says so. */
  runtime: "direct" | "opencode";
};

export type AgentTaskSpec = {
  workspaceId: string;
  taskId: string;
  runId: string;
  agent: RuntimeAgent;
  brief: string;
  budget: Budget;
};

export interface AgentRuntime {
  readonly name: "direct" | "opencode";
  run(task: AgentTaskSpec): Promise<AgentRunResult>;
  resume?(task: AgentTaskSpec, sessionRef: string): Promise<AgentRunResult>;
  cancel(sessionRef: string): Promise<void>;
}
