/**
 * SocialFlow.ai integration boundary.
 *
 * VERIFICATION STATUS (checked October 28, 2026 — evidence, not assumption):
 *  - https://socialflow.ai is a PARKED DOMAIN listed for sale ("make an
 *    offer"); it describes hypothetical use cases only.
 *  - No developer portal, API reference, auth model, endpoint list, media
 *    format spec, platform coverage table, rate-limit or error documentation
 *    could be found for SocialFlow.ai as a product (web search + direct
 *    fetch). Namesakes found are unrelated products (a Claude Code plugin,
 *    a legacy media-industry service, an open-source desktop tool).
 *  - Therefore NO API client is implemented here. Inventing endpoints would
 *    violate the product's honesty rules and the integration directive:
 *    "complete the integration boundary and a documented manual fallback
 *    without pretending the integration works."
 *
 * WHAT EXISTS INSTEAD (and works today):
 *  - The manual handoff below: Banyan formats approved content into a
 *    channel-specific, copy-ready package; the founder publishes/schedules
 *    it in SocialFlow.ai (or any tool) themselves; the live URL is recorded
 *    back as a user-confirmed manual publication (`recordManualPublication`).
 *  - The full approval, status, idempotency and audit machinery around it
 *    (see docs/SOCIALFLOW_INTEGRATION.md for the status mapping).
 *
 * WHEN A REAL API EXISTS: the SocialFlow adapter implements
 * DistributionProvider (src/lib/distribution/types.ts) against the contract in
 * docs/SOCIALFLOW_INTEGRATION_AUDIT.md §3, registers in
 * src/lib/distribution/providers.ts, and stays disabled until its live smoke
 * test passes (US-030, US-031, US-037). No workflow, model or UI changes
 * should be required beyond the connector UI.
 */

import type { PublishingCapabilities } from "@/lib/publishing/types";

/** The capabilities Banyan NEEDS from SocialFlow.ai once an API is verified. */
export const SOCIALFLOW_REQUIRED_CAPABILITIES: PublishingCapabilities = {
  provider: "socialflow",
  channels: ["x", "linkedin", "shortvideo"],
  immediatePublish: true,
  schedule: true,
  metrics: true,
  externalUrl: true,
};

/** Channel-specific execution notes for whoever operates the external tool. */
const CHANNEL_NOTES: Record<string, string> = {
  x: "X: watch the character limit; threads are posted in order; a tracked link should sit in the final post.",
  linkedin: "LinkedIn: first ~200 characters are the hook before 'see more'; line breaks survive; one tracked link maximum.",
  shortvideo:
    "Short-form video: the script is not the finished video — record/edit, add on-screen text and caption, publish natively, then record the live URL here.",
};

export type SocialFlowHandoff = {
  provider: "socialflow";
  mode: "manual_handoff";
  generatedAt: string;
  channel: string;
  format: string;
  title: string;
  body: string;
  /** Parsed short-form video extras (hook, scenes, on-screen text, caption, cta) when present. */
  videoExtras?: Record<string, unknown>;
  /** Suggested scheduling note from the campaign/goal context, if any. */
  suggestedSchedule?: string;
  /** What the operator must do out in the external tool, in order. */
  checklist: string[];
  /** Proof this came from Banyan (for the audit trail on the other side). */
  source: string;
};

export type HandoffInput = {
  id: string;
  title: string;
  channel: string;
  format: string;
  body: string;
  /** Raw JSON string stored on the ContentItem (short-form video extras). */
  videoExtras?: string | null;
  scheduledFor?: Date | null;
};

/** Parse the stored videoExtras JSON safely; garbage in, undefined out. */
export function parseVideoExtras(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && Object.keys(parsed).length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the manual handoff package for a piece of approved content.
 * Pure function — no DB, no network. The caller is responsible for
 * workspace authorization and for stating whether the item is approved.
 */
export function buildSocialFlowHandoff(input: HandoffInput): SocialFlowHandoff {
  const checklist = [
    "1. Confirm the item is approved in Banyan (this package is generated from the approved copy).",
    "2. Publish the content below yourself, natively or with any tool (SocialFlow.ai once its integration is available).",
    "3. Attach/create any media it references — Banyan does not deliver media files.",
    ...(input.scheduledFor
      ? ["4. Schedule it for the suggested time shown below."]
      : ["4. Publish now, or schedule it inside the external tool."]),
    "5. Copy the final live post URL and record it in Banyan as a manual publication — that is what marks this content published.",
  ];

  return {
    provider: "socialflow",
    mode: "manual_handoff",
    generatedAt: new Date().toISOString(),
    channel: input.channel,
    format: input.format,
    title: input.title,
    body: input.body,
    videoExtras: parseVideoExtras(input.videoExtras),
    suggestedSchedule: input.scheduledFor ? input.scheduledFor.toISOString() : undefined,
    checklist,
    source: `banyan:${input.id}`,
  };
}

/** Human-readable rendering for the clipboard / print. */
export function socialflowHandoffToText(h: SocialFlowHandoff): string {
  const lines: string[] = [
    `Banyan → SocialFlow.ai handoff (${h.mode})`,
    `Channel: ${h.channel} · Format: ${h.format}`,
    ``,
    `Title: ${h.title}`,
    ``,
    h.body,
  ];

  if (h.videoExtras) {
    lines.push(``, `— Short-form video script —`);
    for (const [key, value] of Object.entries(h.videoExtras)) {
      const rendered = typeof value === "string" ? value : JSON.stringify(value);
      if (rendered && rendered !== "{}" && rendered !== "[]") lines.push(`${key}: ${rendered}`);
    }
  }

  if (h.suggestedSchedule) lines.push(``, `Suggested schedule: ${h.suggestedSchedule}`);

  const note = CHANNEL_NOTES[h.channel];
  if (note) lines.push(``, `Channel note: ${note}`);

  lines.push(``, `— Checklist —`, ...h.checklist, ``, `Source: ${h.source}`);
  return lines.join("\n");
}
