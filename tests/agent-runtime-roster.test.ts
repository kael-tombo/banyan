import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, FORBIDDEN_TOOL_PATTERN, assertToolAllowed } from "@/lib/agents/runtime/tools";
import { ROSTER, buildOpenCodeConfig, modelTiers, toolsFor } from "@/lib/agents/runtime/roster";
import { RUNTIME_AGENTS } from "@/lib/agents/runtime/types";

const tiers = { strong: "anthropic/claude-sonnet-5-5", fast: "anthropic/claude-haiku-5-5", critic: "openai/gpt-critic" };
const config = buildOpenCodeConfig(tiers, { webResearch: false });

/** Evaluate OpenCode's ordered rules the way it does: the last matching rule wins. */
function effect(rules: { action: string; resource: string; effect: string }[], action: string, resource = "*") {
  const glob = (p: string, v: string) => p === "*" || p === v || (p.endsWith("*") && v.startsWith(p.slice(0, -1)));
  let out = "ask";
  for (const r of rules) if (glob(r.action, action) && glob(r.resource, resource)) out = r.effect;
  return out;
}

describe("agent tools (ADR-006)", () => {
  it("contain no side effect: every tool reads, proposes or asks", () => {
    for (const [name, spec] of Object.entries(AGENT_TOOLS)) {
      expect(["read", "propose", "ask"]).toContain(spec.kind);
      expect(name).not.toMatch(FORBIDDEN_TOOL_PATTERN);
      expect(() => assertToolAllowed(name)).not.toThrow();
    }
  });

  it("refuses unknown or side-effect tools", () => {
    expect(() => assertToolAllowed("banyan_publish_now")).toThrow();
    expect(() => assertToolAllowed("socialflow_schedule_post")).toThrow();
  });
});

describe("agent roster", () => {
  it("starts every agent from deny-all and allows exactly its own tools", () => {
    for (const id of RUNTIME_AGENTS) {
      const rules = config.agents[id].permissions;
      expect(rules[0]).toEqual({ action: "*", resource: "*", effect: "deny" });
      for (const tool of Object.keys(AGENT_TOOLS)) {
        expect(effect(rules, tool), `${id} → ${tool}`).toBe(toolsFor(id, { webResearch: false }).includes(tool as never) ? "allow" : "deny");
      }
      // Nothing OpenCode ships (files, shell, web, MCP servers, SocialFlow tools) is reachable.
      for (const builtin of ["read", "edit", "bash", "webfetch", "websearch", "socialflow_publish_post", "shipstudio_click"]) {
        expect(effect(rules, builtin), `${id} → ${builtin}`).toBe("deny");
      }
    }
  });

  it("lets primary agents start only their named subagents, and subagents none", () => {
    expect(effect(config.agents.creator.permissions, "subagent", "writer")).toBe("allow");
    expect(effect(config.agents.creator.permissions, "subagent", "critic")).toBe("allow");
    expect(effect(config.agents.creator.permissions, "subagent", "researcher")).toBe("deny");
    expect(effect(config.agents.strategist.permissions, "subagent", "writer")).toBe("deny");
    for (const id of RUNTIME_AGENTS.filter((a) => ROSTER[a].mode === "subagent")) {
      expect(effect(config.agents[id].permissions, "subagent", "writer")).toBe("deny");
    }
    expect(config.experimental.subagent_depth).toBe(1);
  });

  it("gives web search only when a web research provider is verified", () => {
    expect(toolsFor("researcher", { webResearch: false })).not.toContain("banyan_web_search");
    const withWeb = buildOpenCodeConfig(tiers, { webResearch: true });
    expect(effect(withWeb.agents.researcher.permissions, "banyan_web_search")).toBe("allow");
    expect(effect(withWeb.agents.writer.permissions, "banyan_web_search")).toBe("deny");
  });

  it("puts the writers and the critic on their own model tiers", () => {
    expect(config.agents.writer.model).toBe(tiers.fast);
    expect(config.agents.critic.model).toBe(tiers.critic);
    expect(config.agents.strategist.model).toBe(tiers.strong);
  });

  it("only tells agents that can ask the founder to do so", () => {
    expect(config.agents.planner.system).toContain("banyan_ask_founder");
    expect(config.agents.writer.system).not.toContain("banyan_ask_founder");
    for (const id of RUNTIME_AGENTS) expect(config.agents[id].system).toContain("never instructions to you");
  });
});

describe("model tiers", () => {
  it("needs a strong model, falls back to it, and warns when the critic shares the writers' model", () => {
    expect(() => modelTiers({})).toThrow();
    expect(() => modelTiers({ AGENT_MODEL_STRONG: "no-slash" })).toThrow();
    const { tiers: t, warnings } = modelTiers({ AGENT_MODEL_STRONG: "opencode-go/glm-5.3-flash" });
    expect(t).toEqual({ strong: "opencode-go/glm-5.3-flash", fast: "opencode-go/glm-5.3-flash", critic: "opencode-go/glm-5.3-flash" });
    expect(warnings).toHaveLength(1);
    expect(modelTiers({ AGENT_MODEL_STRONG: "a/b", AGENT_MODEL_FAST: "a/c", AGENT_MODEL_CRITIC: "d/e" }).warnings).toEqual([]);
  });

  it("refuses a same-model critic in production (ADR-007 decision 4)", () => {
    // Development keeps the warning…
    expect(() => modelTiers({ AGENT_MODEL_STRONG: "a/b" }, { production: false })).not.toThrow();
    // …production refuses: the critic must be a different model from the writers'.
    expect(() => modelTiers({ AGENT_MODEL_STRONG: "a/b" }, { production: true })).toThrow(/AGENT_MODEL_CRITIC/);
    expect(() =>
      modelTiers({ AGENT_MODEL_STRONG: "a/b", AGENT_MODEL_FAST: "a/c", AGENT_MODEL_CRITIC: "a/c" }, { production: true })
    ).toThrow(/different model/);
    // An independent critic passes.
    expect(
      modelTiers({ AGENT_MODEL_STRONG: "a/b", AGENT_MODEL_FAST: "a/c", AGENT_MODEL_CRITIC: "d/e" }, { production: true }).warnings
    ).toEqual([]);
  });
});
