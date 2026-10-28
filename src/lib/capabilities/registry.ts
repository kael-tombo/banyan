import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { fastlaneAdapter } from "@/lib/capabilities/fastlane";
import type { CapabilityAdapter, CapabilityDescriptor, CapabilityHealth } from "@/lib/capabilities/types";

/**
 * Capability registry — the single place where external capabilities are
 * described and discovered. Workflows and the UI ask the registry what is
 * actually usable; adapters answer honestly, per workspace.
 */

class PostizCapability implements CapabilityAdapter {
  readonly id = "postiz";
  readonly kind = "publishing" as const;
  readonly label = "Postiz (publishing to X and LinkedIn)";

  capabilities(): string[] {
    return ["publish.x", "publish.linkedin", "publish.schedule", "publish.immediate"];
  }

  describe(): CapabilityDescriptor {
    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      capabilities: this.capabilities(),
      status: "available",
      detail:
        "Publishing runs through a Postiz connection configured per workspace in Publishing. Without a connection, publications are recorded as blocked with setup guidance — never faked.",
      docsUrl: "https://postiz.com/docs",
      untested: false,
    };
  }

  async health(workspaceId: string): Promise<CapabilityHealth> {
    const count = await prisma.channelConnection.count({ where: { workspaceId, status: { not: "error" } } });
    return count > 0
      ? { ok: true, detail: `${count} configured channel connection(s).` }
      : { ok: false, detail: "No Postiz connection configured for this workspace yet. Add one in Publishing, or record manual publications with the live URL." };
  }
}

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
    return ["publish.socialflow.handoff"];
  }

  describe(): CapabilityDescriptor {
    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      capabilities: this.capabilities(),
      status: "unavailable",
      detail:
        "No verified API exists for SocialFlow.ai (socialflow.ai is a parked domain as of October 28 2026 — no developer documentation, auth model, or endpoints). Banyan does not fabricate integrations: the supported path today is the manual handoff — Banyan formats approved content into a copy-ready package, you publish/schedule it in SocialFlow.ai (or any tool), and record the live URL as a user-confirmed manual publication. The adapter slot, required capability list and activation checklist are ready in docs/SOCIALFLOW_INTEGRATION.md for when a real API appears.",
      untested: false,
    };
  }

  async health(): Promise<CapabilityHealth> {
    return {
      ok: false,
      detail: "No verifiable SocialFlow.ai API (parked domain, checked 2026-10-28). Use the manual handoff + manual publication recording.",
    };
  }
}

const ADAPTERS: CapabilityAdapter[] = [
  new PostizCapability(),
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
