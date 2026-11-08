import { describe, expect, it } from "vitest";
import { resolveRuntimeSelection } from "@/lib/agents/runtime/select";

/**
 * ADR-006's fallback rule as a tested decision (ADR-007 decision 5):
 * requesting the OpenCode runtime before it exists degrades to `direct`
 * with a labelled reason — never silently, never a crash.
 */

describe("resolveRuntimeSelection", () => {
  it("serves direct by default and says so", () => {
    const s = resolveRuntimeSelection({ agentRuntime: "direct", opencodeAvailable: false, strongModelConfigured: false });
    expect(s.runtime).toBe("direct");
    expect(s.reason).toMatch(/direct/i);
  });

  it("degrades to direct with a labelled reason on a Node too old for the embedded runtime", () => {
    const s = resolveRuntimeSelection({ agentRuntime: "opencode", opencodeAvailable: false, strongModelConfigured: true });
    expect(s.runtime).toBe("direct");
    expect(s.reason).toMatch(/Node 24/);
    expect(s.reason).toMatch(/degradation/);
  });

  it("degrades to direct when the strong tier is missing", () => {
    const s = resolveRuntimeSelection({ agentRuntime: "opencode", opencodeAvailable: true, strongModelConfigured: false });
    expect(s.runtime).toBe("direct");
    expect(s.reason).toMatch(/AGENT_MODEL_STRONG/);
  });

  it("selects opencode only when it is requested, built and configured", () => {
    const s = resolveRuntimeSelection({ agentRuntime: "opencode", opencodeAvailable: true, strongModelConfigured: true });
    expect(s.runtime).toBe("opencode");
  });

  it("always carries a reason a founder could read (no silent selection)", () => {
    for (const agentRuntime of ["direct", "opencode"] as const) {
      for (const opencodeAvailable of [false, true]) {
        for (const strongModelConfigured of [false, true]) {
          const s = resolveRuntimeSelection({ agentRuntime, opencodeAvailable, strongModelConfigured });
          expect(s.reason.length).toBeGreaterThan(10);
        }
      }
    }
  });
});
