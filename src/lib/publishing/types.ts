/**
 * Publishing adapter boundary. Provider-specific logic lives behind this
 * interface; application code never touches vendor APIs directly.
 */

export type PublishingCapabilities = {
  provider: string;
  channels: string[];
  immediatePublish: boolean;
  schedule: boolean;
  metrics: boolean;
  externalUrl: boolean;
};

export type ConnectionConfig = {
  baseUrl: string;
  apiKey: string;
  // channel -> integration ids within the provider account
  integrationIds: Record<string, string[]>;
};

export type PublishResult = {
  ok: boolean;
  externalId?: string;
  externalUrl?: string;
  raw: unknown; // always stored for the audit trail
  error?: string;
};

export interface PublishingAdapter {
  readonly provider: string;
  capabilities(): PublishingCapabilities;
  validateConnection(cfg: ConnectionConfig): Promise<{ ok: boolean; detail: string; channels: string[] }>;
  publish(args: {
    cfg: ConnectionConfig;
    channel: string;
    text: string;
    title?: string;
    scheduledFor?: Date | null;
  }): Promise<PublishResult>;
  checkStatus(args: { cfg: ConnectionConfig; externalId: string }): Promise<{ state: string; raw: unknown }>;
  metricsSupported(): boolean;
}
