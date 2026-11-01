import { isFormatFor, type Channel } from "@/lib/formats";
import type { StrategyBody } from "@/lib/strategy/generate";

/**
 * Which drafts an approved strategy asks for — US-044. Pure.
 *
 * One draft per channel and format, in strategy priority order, each
 * assigned a messaging angle round-robin so the angles are all tried.
 * Capped so one click cannot run up a large generation bill.
 */

export const MAX_DRAFTS_PER_RUN = 6;

export type PlannedDraft = { channel: Channel; format: string; angle: string };

export function planDrafts(body: StrategyBody, max = MAX_DRAFTS_PER_RUN): PlannedDraft[] {
  const angles = body.messaging_angles.map((a) => a.angle).filter(Boolean);
  const out: PlannedDraft[] = [];
  for (const c of [...body.channels].sort((a, b) => a.priority - b.priority)) {
    for (const format of c.formats) {
      if (!isFormatFor(c.channel, format)) continue;
      out.push({ channel: c.channel, format, angle: angles.length ? angles[out.length % angles.length] : "" });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Drafts already written for this strategy count as done, unless they were thrown away. */
export function draftKey(d: { channel: string; format: string }) {
  return `${d.channel}:${d.format}`;
}

export const DISCARDED_STATUSES = ["rejected", "archived"];
