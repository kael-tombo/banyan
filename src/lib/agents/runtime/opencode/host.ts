import { mkdirSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { buildOpenCodeConfig, modelTiers } from "../roster";
import { readContext, recordNote, ToolRefused, type NoteInput } from "./banyan-tools";
import { OpenCodeAgentRuntime, taskForSession, type OpenCodeHost } from "./runtime";

/**
 * One embedded OpenCode host per process (ADR-006 §1), loaded only when the opencode runtime
 * is selected. The SDK needs Node 24, so it is imported by a name the bundlers leave alone, and
 * a process on an older Node never loads it.
 */

export const OPENCODE_SDK_VERSION = "2.2.6";

export function nodeSupportsOpenCode(version = process.versions.node): boolean {
  return Number(version.split(".")[0]) >= 24;
}

/** One database per live process: a second host on the same file duplicates live runs (conformance V08). */
export function databasePath(): string {
  return resolve(env.AGENT_OPENCODE_DB || join(".data", `opencode-${hostname()}.db`));
}

type Sdk = { OpenCode: { create(options: unknown): Promise<OpenCodeHost & { close(): Promise<void> }> } };
type EffectSchema = { Schema: Record<string, (...args: never[]) => unknown> };

let hostPromise: Promise<OpenCodeHost> | null = null;
let runtime: OpenCodeAgentRuntime | null = null;

/** Tools as the plugin registers them. Exported for tests and the live check. */
export function banyanToolDefinitions(workspaceId: string, hostRef: () => OpenCodeHost | null) {
  const taskOf = async (sessionID: string): Promise<string> => {
    const known = taskForSession(sessionID);
    if (known) return known.taskId;
    // Resumed by the host after a restart, before any worker reattached: the session says which task.
    const session = await hostRef()?.sessions.get({ sessionID });
    const taskId = session?.metadata?.taskId;
    if (typeof taskId !== "string") throw new ToolRefused("This session has no Banyan task.");
    return taskId;
  };
  const refusal = (err: unknown) => {
    if (err instanceof ToolRefused) return { refused: err.message };
    throw err;
  };
  return {
    banyan_read_context: async () => readContext(workspaceId).catch((err) => `Refused: ${refusal(err).refused}`),
    banyan_record_note: async (input: NoteInput, context: { sessionID: string }) => {
      try {
        return JSON.stringify(await recordNote(workspaceId, await taskOf(context.sessionID), input));
      } catch (err) {
        return JSON.stringify(refusal(err));
      }
    },
  };
}

async function createHost(): Promise<OpenCodeHost> {
  // Variables keep webpack and esbuild from bundling the SDK; Node resolves it at runtime.
  const sdkName = "@opencode/sdk";
  const effectName = "effect";
  const { OpenCode } = (await import(/* webpackIgnore: true */ sdkName)) as Sdk;
  const { Schema } = (await import(/* webpackIgnore: true */ effectName)) as EffectSchema;
  const S = Schema as unknown as {
    Struct(fields: Record<string, unknown>): unknown;
    String: unknown;
    Literals(values: readonly string[]): unknown;
    optionalKey(schema: unknown): unknown;
  };

  const { tiers, warnings } = modelTiers(env, { production: env.NODE_ENV === "production" });
  for (const warning of warnings) log("warn", "agent_runtime_config", { warning }, "worker");
  const sandbox = join(tmpdir(), `banyan-agents-${hostname()}`);
  mkdirSync(sandbox, { recursive: true });
  const database = databasePath();
  mkdirSync(dirname(database), { recursive: true });
  // No keys here: OpenCode reads each provider's own environment variable, so no secret enters a config.
  const config = {
    ...buildOpenCodeConfig(tiers, { webResearch: false }),
    model: tiers.strong,
    share: "disabled",
    update: "disable",
    ...(env.AGENT_OPENCODE_PROVIDERS ? { providers: JSON.parse(env.AGENT_OPENCODE_PROVIDERS) } : {}),
  };

  let host: (OpenCodeHost & { close(): Promise<void> }) | null = null;
  const plugin = (workspaceId: string) => ({
    id: "banyan",
    async setup(ctx: { tool: { transform(fn: (tools: { add(tool: unknown): void }) => void): Promise<unknown> } }) {
      const impl = banyanToolDefinitions(workspaceId, () => host);
      await ctx.tool.transform((tools) => {
        tools.add({
          name: "banyan_read_context",
          options: { codemode: false },
          description: "Read this product's approved profile, its facts with their provenance, and the learning from concluded experiments.",
          input: S.Struct({}),
          output: S.Struct({ text: S.String }),
          execute: async () => {
            const text = await impl.banyan_read_context();
            return { output: { text }, content: text };
          },
        });
        tools.add({
          name: "banyan_record_note",
          options: { codemode: false },
          description: "Record one research finding with its provenance. Use hypothesis unless you have a source; an external observation must name its source.",
          input: S.Struct({ text: S.String, provenance: S.Literals(["hypothesis", "external_observation"]), source: S.optionalKey(S.String) }),
          output: S.Struct({ text: S.String }),
          execute: async (input: NoteInput, context: { sessionID: string }) => {
            const text = await impl.banyan_record_note(input, context);
            return { output: { text }, content: text };
          },
        });
      });
    },
  });

  host = await OpenCode.create({
    config: { directory: sandbox, project: false, content: JSON.stringify(config) },
    models: { fetch: true },
    fs: { filewatcher: false },
    database: { path: database },
    instances: {
      key: (session: { metadata?: Record<string, unknown> }) => String(session.metadata?.workspaceId ?? "none"),
      configure: (workspaceId: string) => ({ plugins: [plugin(workspaceId)] }),
    },
  });
  log("info", "agent_runtime_started", { runtime: "opencode", sdk: OPENCODE_SDK_VERSION, database }, "worker");
  return host;
}

export function getOpenCodeRuntime(): OpenCodeAgentRuntime {
  if (!nodeSupportsOpenCode()) throw new Error(`The OpenCode runtime needs Node 24 or later; this is Node ${process.versions.node}.`);
  runtime ??= new OpenCodeAgentRuntime({
    host: () => {
      hostPromise ??= createHost().catch((err) => {
        hostPromise = null; // let a later task retry a failed start
        throw err;
      });
      return hostPromise;
    },
    sandbox: join(tmpdir(), `banyan-agents-${hostname()}`),
    replica: hostname(),
    timeoutMs: env.AGENT_RUN_TIMEOUT_MS,
  });
  return runtime;
}
