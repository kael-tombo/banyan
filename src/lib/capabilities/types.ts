/**
 * Capability adapter architecture — the provider-independent boundary for
 * external capabilities (research, creative generation, publishing,
 * measurement, model access).
 *
 * Rules enforced here:
 *  - The core domain model never depends on a marketing vendor. Workflows see
 *    descriptors and typed results only.
 *  - Provider-specific schemas and behavior live inside adapters.
 *  - An adapter that cannot run reports honestly WHY (missing credentials,
 *    unverified API, outage). Nothing simulates success.
 *  - Capabilities are only claimed after their API surface has been verified
 *    from the vendor's own documentation; untested integrations are labeled
 *    as such until exercised with real credentials.
 */

export type CapabilityKind = "publishing" | "creative" | "research" | "analytics" | "model";

export type CapabilityStatus = "available" | "needs_credentials" | "unverified" | "unavailable";

export type CapabilityDescriptor = {
  id: string;
  kind: CapabilityKind;
  label: string;
  /** Typed capability keys, e.g. "publish.x", "creative.shortvideo", "metrics.posts". */
  capabilities: string[];
  status: CapabilityStatus;
  /** Honest, actionable status detail shown in the UI. */
  detail: string;
  docsUrl?: string;
  /** True when the integration is implemented against the vendor's documented API but has not been exercised with real credentials. */
  untested: boolean;
};

export type CapabilityHealth = {
  ok: boolean;
  detail: string;
};

/**
 * A capability adapter. `describe()` is static; `health()` may consult
 * credentials/connectivity for the requesting workspace.
 */
export interface CapabilityAdapter {
  readonly id: string;
  readonly kind: CapabilityKind;
  readonly label: string;
  capabilities(): string[];
  describe(): CapabilityDescriptor;
  health(workspaceId: string): Promise<CapabilityHealth>;
}

/** Registry of all known capability adapters. */
export function describeAll(adapters: CapabilityAdapter[]): CapabilityDescriptor[] {
  return adapters.map((a) => a.describe());
}

export function findByCapability(adapters: CapabilityAdapter[], capability: string): CapabilityAdapter | null {
  return adapters.find((a) => a.capabilities().includes(capability)) ?? null;
}
