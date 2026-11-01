import { decryptSecret } from "@/lib/crypto";
import type { Credentials, DistributionProvider } from "@/lib/distribution/types";

/**
 * Registered distribution providers.
 *
 * Empty on purpose: SocialFlow.ai is the only intended provider (ADR-003) and
 * it has no verifiable API yet (docs/SOCIALFLOW_INTEGRATION_AUDIT.md). US-031
 * adds the SocialFlow adapter here; it stays disabled until its live smoke
 * test passes. Postiz was removed (US-028) and must not be re-added.
 */
const PROVIDERS: DistributionProvider[] = [];

export function registerProvider(provider: DistributionProvider): void {
  if (PROVIDERS.some((p) => p.id === provider.id)) throw new Error(`Provider "${provider.id}" is already registered.`);
  PROVIDERS.push(provider);
}

/** The provider with this id, only if it is enabled on this deployment. */
export function providerFor(id: string): DistributionProvider | null {
  const provider = PROVIDERS.find((p) => p.id === id);
  return provider && provider.enabled() ? provider : null;
}

/** Ids of providers that can actually be used right now. */
export function enabledProviderIds(): string[] {
  return PROVIDERS.filter((p) => p.enabled()).map((p) => p.id);
}

export function credentialsFromConnection(connection: { configEncrypted: string }): Credentials {
  try {
    const parsed: unknown = JSON.parse(decryptSecret(connection.configEncrypted) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Credentials) : {};
  } catch {
    return {};
  }
}

/** The single honest message for "nothing can publish automatically yet". */
export const EXPORT_MODE_MESSAGE =
  "Automated publishing is not available yet: SocialFlow.ai has no API Banyan can verify. Export the approved post, publish it yourself, and record the live URL — it is stored as a manual publication.";
