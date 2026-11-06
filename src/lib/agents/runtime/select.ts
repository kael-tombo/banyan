import { env } from "@/lib/env";
import type { AgentRuntime } from "./types";

/**
 * Runtime selection (ADR-006's fallback rule, ADR-007 decision 5).
 *
 * `AGENT_RUNTIME=opencode` requests the embedded OpenCode host; until roadmap
 * R2 builds it, the selection resolves to `direct` *with a labelled reason* —
 * never silently, never a crash. Handlers record the reason on the run so a
 * degraded deployment says what serves it, the same way the template
 * fallback labels itself.
 */

export type RuntimeSelection = {
  runtime: AgentRuntime["name"];
  /** Why this runtime serves tasks; always set, safe to surface (no secrets). */
  reason: string;
};

/** Pure: decide the runtime from configuration. Tests pin every branch. */
export function resolveRuntimeSelection(cfg: {
  agentRuntime: "direct" | "opencode";
  /** True once the embedded OpenCode runtime exists in this build (R2). */
  opencodeAvailable: boolean;
  /** True when the strong tier is configured, as env validation requires for opencode. */
  strongModelConfigured: boolean;
}): RuntimeSelection {
  if (cfg.agentRuntime === "opencode") {
    if (!cfg.opencodeAvailable) {
      return {
        runtime: "direct",
        reason:
          "AGENT_RUNTIME=opencode, but the embedded OpenCode runtime is not built yet (roadmap R2). Serving single-shot direct calls, labelled as a degradation.",
      };
    }
    if (!cfg.strongModelConfigured) {
      return {
        runtime: "direct",
        reason:
          'AGENT_RUNTIME=opencode, but AGENT_MODEL_STRONG is not configured ("provider/model"). Serving single-shot direct calls until the tier is set.',
      };
    }
    return { runtime: "opencode", reason: "AGENT_RUNTIME=opencode: tasks run as embedded OpenCode sessions." };
  }
  return { runtime: "direct", reason: "AGENT_RUNTIME=direct (default): one model call per task." };
}

/** This deployment's selection. `opencodeAvailable` flips to true in R2. */
export function currentRuntimeSelection(): RuntimeSelection {
  return resolveRuntimeSelection({
    agentRuntime: env.AGENT_RUNTIME,
    opencodeAvailable: false,
    strongModelConfigured: env.AGENT_MODEL_STRONG !== "",
  });
}
