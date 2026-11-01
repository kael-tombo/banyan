import { env } from "@/lib/env";
import { fastlaneAdapter } from "@/lib/capabilities/fastlane";
import type { CapabilityAdapter, CapabilityDescriptor, CapabilityHealth } from "@/lib/capabilities/types";
import { enabledProviderIds } from "@/lib/distribution/providers";

/**
 * Capability registry — the single place where external capabilities are
 * described and discovered. Workflows and the UI ask the registry what is
 * actually usable; adapters answer honestly, per workspace.
 */

class ManagedModelCapability implements CapabilityAdapter {
  readonly id = "managed-model";
  readonly kind = "model" as const;
  readonly label = "Managed model access (OpenAI-compatible)";

  capabilities(): string[] {
    return ["model.completion", "model.structured_output", "model.usage_tracking"];
  }

  describe(): CapabilityDescriptor {
    const live = !!env.OPENAI_API_KEY && env.AI_PROVIDER !== "none";
    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      capabilities: this.capabilities(),
      status: live ? "available" : "unavailable",
      detail: live
        ? `Live model access via ${env.OPENAI_MODEL}, executed server-side with per-workspace daily quotas and a usage ledger.`
        : "No managed model credentials on this deployment. Generation uses the clearly labeled template fallback; nothing pretends to be live model output.",
      untested: false,
    };
  }

  async health(): Promise<CapabilityHealth> {
    const live = !!env.OPENAI_API_KEY && env.AI_PROVIDER !== "none";
    return live
      ? { ok: true, detail: "Managed provider configured." }
      : { ok: false, detail: "No OPENAI_API_KEY configured; template fallback is active." };
  }
}

class WebResearchCapability implements CapabilityAdapter {
  readonly id = "web-research";
  readonly kind = "research" as const;
  readonly label = "External research (web/market data)";

  capabilities(): string[] {
    return ["research.web_search", "research.market_data"];
  }

  describe(): CapabilityDescriptor {
    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      capabilities: this.capabilities(),
      status: "unavailable",
      detail:
        "No external research provider is verified for this deployment, so live market data is NOT used. Research tasks produce clearly labeled hypothesis briefs grounded in your business context — assumptions to validate, never invented market facts.",
      untested: false,
    };
  }

  async health(): Promise<CapabilityHealth> {
    return { ok: false, detail: "Not implemented: no verified external research provider. See docs/AGENTIC_RUNTIME.md." };
  }
}

class SocialFlowCapability implements CapabilityAdapter {
  readonly id = "socialflow";
  readonly kind = "publishing" as const;
  readonly label = "SocialFlow.ai (distribution execution)";

  capabilities(): string[] {
    return ["publish.x", "publish.linkedin", "publish.schedule", "publish.immediate", "publish.socialflow.handoff"];
  }

  private live(): boolean {
    return enabledProviderIds().includes(this.id);
  }

  describe(): CapabilityDescriptor {
    const live = this.live();
    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      capabilities: this.capabilities(),
      status: live ? "available" : "unavailable",
      detail: live
        ? "SocialFlow.ai publishing is enabled and verified on this deployment."
        : process.env.SOCIALFLOW_API_URL
          ? "A SocialFlow API is configured on this deployment but has not yet passed the live test with real LinkedIn and X accounts, so automated publishing stays off. Until it does, use export mode: Banyan prepares the approved post, you publish it, and the live URL is recorded as a manual publication."
          : "No SocialFlow API is set up on this deployment, so automated publishing is off. Use export mode: Banyan prepares the approved post, you publish it, and the live URL is recorded as a manual publication. See docs/SOCIALFLOW_INTEGRATION_AUDIT.md.",
      untested: !live,
    };
  }

  async health(): Promise<CapabilityHealth> {
    return this.live()
      ? { ok: true, detail: "SocialFlow.ai provider enabled and verified." }
      : { ok: false, detail: "No verifiable SocialFlow.ai API (audited 2026-11-01). Use export mode and record the live URL." };
  }
}

const ADAPTERS: CapabilityAdapter[] = [
  new ManagedModelCapability(),
  new WebResearchCapability(),
  new SocialFlowCapability(),
  fastlaneAdapter,
];

export function allCapabilities(): CapabilityDescriptor[] {
  return ADAPTERS.map((a) => a.describe());
}

export function capabilityById(id: string): CapabilityAdapter | null {
  return ADAPTERS.find((a) => a.id === id) ?? null;
}

export function capabilityFor(capability: string): CapabilityAdapter | null {
  return ADAPTERS.find((a) => a.capabilities().includes(capability)) ?? null;
}

/** Workspace-scoped capability status: what can THIS workspace actually use right now? */
export async function workspaceCapabilities(workspaceId: string): Promise<(CapabilityDescriptor & { health: CapabilityHealth })[]> {
  return Promise.all(
    ADAPTERS.map(async (a) => ({ ...a.describe(), health: await a.health(workspaceId) }))
  );
}
