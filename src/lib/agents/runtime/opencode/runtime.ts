import { createHash } from "node:crypto";
import type { RunModelUsage } from "@/lib/model/agent-run";
import type { AgentRunResult, AgentRuntime, AgentTaskSpec, ProposalRef } from "../types";

/**
 * The embedded OpenCode runtime (ADR-006, roadmap R2): one Banyan task attempt is one
 * OpenCode V2 session. Behaviour this relies on is pinned against @opencode/sdk 2.2.6 by
 * the probes in central-brain-agent-platform's scripts/conformance-v2 (the V numbers).
 *
 *  - Steps are a hard limit in V2 (V03), so the roster's `steps` bound each agent.
 *  - Tokens and time are not: this runtime polls and interrupts (V14).
 *  - A session created with the same id returns the existing one, so an attempt resumed
 *    on the same replica continues its session instead of starting a second. A restarted
 *    host resumes interrupted sessions by itself (V06), at least once: a tool may run
 *    again (V07), so every Banyan tool is idempotent.
 */

export type V2Content = { type: string; text?: string; name?: string; state?: { status?: string; input?: Record<string, unknown>; content?: { type: string; text?: string }[] } };
export type V2Message = {
  id: string;
  type: string;
  text?: string;
  model?: { id: string; providerID: string };
  content?: V2Content[];
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };
  cost?: number;
  outcome?: string;
};
export type V2Session = { id: string; outcome?: string; metadata?: Record<string, unknown>; tokens?: V2Message["tokens"] };

/** The slice of @opencode/sdk this runtime uses, so tests can stand in for it. */
export interface OpenCodeHost {
  sessions: {
    create(input: { id: string; agent: string; title: string; location: { directory: string }; metadata: Record<string, string> }): Promise<V2Session>;
    get(input: { sessionID: string }): Promise<V2Session>;
    prompt(input: { sessionID: string; text: string }): Promise<unknown>;
    interrupt(input: { sessionID: string }): Promise<unknown>;
  };
  message: { list(input: { sessionID: string; order?: "asc" | "desc"; limit?: number }): Promise<{ data: V2Message[] }> };
  experimental: { session: { wait(input: { sessionID: string }): Promise<unknown> } };
}

/** Why a run was stopped from outside: OpenCode enforces neither limit itself. */
export type StopReason = "budget" | "timeout";
export type OpenCodeRunResult = AgentRunResult & {
  perModel: RunModelUsage[];
  costUsd: number;
  latencyMs: number;
  stopped: StopReason | null;
  tokens: number;
  /** The question the agent asked the founder in this run, if any (banyan_ask_founder). */
  question: string | null;
};

type Options = {
  host: () => Promise<OpenCodeHost>;
  /** An empty directory: OpenCode's file, shell and web tools are denied, so nothing reads it. */
  sandbox: string;
  /** Names this process in `sessionRef`; another replica cannot resume this session. */
  replica: string;
  timeoutMs: number;
  pollMs?: number;
};

/** Stable per attempt: the same attempt on the same replica reattaches, a new attempt starts fresh. */
export function sessionIdFor(spec: Pick<AgentTaskSpec, "taskId" | "runId">): string {
  return `ses_banyan_${createHash("sha256").update(`${spec.taskId}:${spec.runId}`).digest("hex").slice(0, 24)}`;
}

/** Which Banyan task a session serves. Tools read it, since their input never names a task or workspace. */
export type SessionTask = { workspaceId: string; taskId: string; context: Record<string, string> };
const tasksBySession = new Map<string, SessionTask>();
export function taskForSession(sessionID: string) {
  return tasksBySession.get(sessionID);
}

const tokenTotal = (t?: V2Message["tokens"]) => (t?.input ?? 0) + (t?.output ?? 0) + (t?.reasoning ?? 0) + (t?.cache?.read ?? 0) + (t?.cache?.write ?? 0);
const textOf = (m: V2Message) => (m.content ?? []).filter((c) => c.type === "text" && c.text).map((c) => c.text).join("").trim();

export class OpenCodeAgentRuntime implements AgentRuntime {
  readonly name = "opencode" as const;

  constructor(private readonly opts: Options) {}

  private async messages(host: OpenCodeHost, sessionID: string): Promise<V2Message[]> {
    const res = await host.message.list({ sessionID, order: "asc", limit: 200 });
    return res.data ?? [];
  }

  async run(spec: AgentTaskSpec): Promise<OpenCodeRunResult> {
    const started = Date.now();
    const host = await this.opts.host();
    const sessionID = sessionIdFor(spec);
    tasksBySession.set(sessionID, { workspaceId: spec.workspaceId, taskId: spec.taskId, context: spec.context ?? {} });
    try {
      await host.sessions.create({
        id: sessionID,
        agent: spec.agent,
        title: `${spec.agent} ${spec.taskId}`,
        location: { directory: this.opts.sandbox },
        metadata: { ...spec.context, workspaceId: spec.workspaceId, taskId: spec.taskId, runId: spec.runId },
      });
      // A resumed attempt already has its prompt: sending it again would ask for the work twice.
      const users = (await this.messages(host, sessionID)).filter((m) => m.type === "user");
      if (!users.length) {
        await host.sessions.prompt({ sessionID, text: spec.followUp ? `${spec.brief}

${spec.followUp}` : spec.brief });
      } else if (spec.followUp && !users.some((m) => m.text === spec.followUp)) {
        // The same session continues with the answer, so the agent keeps everything it already read.
        await host.sessions.prompt({ sessionID, text: spec.followUp });
      }
      const stop = await this.follow(host, sessionID, spec, started);
      return this.result(host, sessionID, stop, started);
    } finally {
      tasksBySession.delete(sessionID);
    }
  }

  /** Same as run: the session id is derived from the attempt, so this reattaches. */
  resume(spec: AgentTaskSpec): Promise<OpenCodeRunResult> {
    return this.run(spec);
  }

  async cancel(sessionRef: string): Promise<void> {
    const sessionID = sessionRef.split(":").at(-1)!;
    await (await this.opts.host()).sessions.interrupt({ sessionID });
  }

  /** Wait for the session to go idle, interrupting it past its token budget or the deadline. */
  private async follow(host: OpenCodeHost, sessionID: string, spec: AgentTaskSpec, started: number): Promise<"idle" | "budget" | "timeout"> {
    let settled = false;
    // `wait` returns as soon as nothing runs. After a restart that can be before the host resumes the
    // session (conformance V06), so the run is over only when the session ends in a terminal entry.
    const idle = (async () => {
      for (;;) {
        await host.experimental.session.wait({ sessionID });
        if (settled || (await this.messages(host, sessionID)).at(-1)?.type === "idle") return "idle" as const;
        await new Promise((r) => setTimeout(r, this.opts.pollMs ?? 2000));
      }
    })();
    idle.catch(() => {}).finally(() => (settled = true));
    const watch = (async () => {
      while (!settled) {
        await new Promise((r) => setTimeout(r, this.opts.pollMs ?? 2000));
        if (settled) break;
        if (Date.now() - started > this.opts.timeoutMs) return "timeout" as const;
        const session = await host.sessions.get({ sessionID }).catch(() => null);
        if (session && tokenTotal(session.tokens) > spec.budget.maxTokens) return "budget" as const;
      }
      return "idle" as const;
    })();
    const outcome = await Promise.race([idle, watch]);
    if (outcome !== "idle") await host.sessions.interrupt({ sessionID }).catch(() => {});
    settled = true;
    return outcome;
  }

  private async result(host: OpenCodeHost, sessionID: string, stop: "idle" | "budget" | "timeout", started: number): Promise<OpenCodeRunResult> {
    const messages = await this.messages(host, sessionID);
    const assistants = messages.filter((m) => m.type === "assistant");
    const byModel = new Map<string, RunModelUsage>();
    let costUsd = 0;
    let toolCalls = 0;
    const proposals: ProposalRef[] = [];
    let question: string | null = null;
    // Only this turn's question counts: one asked before the last prompt has been answered.
    const lastUser = messages.map((m) => m.type).lastIndexOf("user");
    for (const [index, m] of messages.entries()) {
      if (m.type !== "assistant") continue;
      const model = m.model ? `${m.model.providerID}/${m.model.id}` : "unknown";
      const row = byModel.get(model) ?? { model, inputTokens: 0, outputTokens: 0 };
      row.inputTokens += (m.tokens?.input ?? 0) + (m.tokens?.cache?.read ?? 0) + (m.tokens?.cache?.write ?? 0);
      row.outputTokens += (m.tokens?.output ?? 0) + (m.tokens?.reasoning ?? 0);
      byModel.set(model, row);
      costUsd += typeof m.cost === "number" ? m.cost : 0;
      for (const c of m.content ?? []) {
        if (c.type !== "tool") continue;
        toolCalls++;
        if (c.name === "banyan_ask_founder" && c.state?.status === "completed" && index > lastUser && typeof c.state.input?.question === "string") {
          question = c.state.input.question;
          proposals.push({ kind: "question", id: sessionID });
        }
        if (c.name === "banyan_record_note" && c.state?.status === "completed") {
          const id = noteIdFrom(c.state.content);
          if (id && !proposals.some((p) => p.id === id)) proposals.push({ kind: "note", id });
        }
      }
    }
    const last = [...messages].reverse().find((m) => m.type === "idle");
    const summary = assistants.length ? textOf(assistants[assistants.length - 1]!) : "";
    const status: AgentRunResult["status"] =
      stop === "budget" ? "budget_exhausted" : stop === "idle" && last?.outcome === "succeeded" && summary ? "completed" : "failed";
    const perModel = [...byModel.values()];
    return {
      status,
      proposals,
      usage: {
        inputTokens: perModel.reduce((s, m) => s + m.inputTokens, 0),
        outputTokens: perModel.reduce((s, m) => s + m.outputTokens, 0),
        steps: assistants.length,
        toolCalls,
        subagents: 0,
      },
      sessionRef: `${this.opts.replica}:${sessionID}`,
      summary: stop === "timeout" ? `Stopped after ${Math.round(this.opts.timeoutMs / 1000)}s.` : summary,
      runtime: "opencode",
      perModel,
      costUsd,
      latencyMs: Date.now() - started,
      stopped: stop === "idle" ? null : stop,
      question,
      tokens: perModel.reduce((s, m) => s + m.inputTokens + m.outputTokens, 0),
    };
  }
}

function noteIdFrom(content?: { type: string; text?: string }[]): string | null {
  const text = (content ?? []).map((c) => c.text ?? "").join("");
  try {
    const id = (JSON.parse(text) as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}
