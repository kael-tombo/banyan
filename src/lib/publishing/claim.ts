/**
 * Which publications may be executed right now.
 *
 * Pure decision used before the atomic claim in executePublication. It keeps
 * stale queue jobs harmless: a delayed job that fires for a publication that
 * was cancelled, already published, or rescheduled to a later time does
 * nothing. The database claim (a conditional update on status + attempts)
 * then guarantees that only one caller proceeds.
 */

export type ClaimInput = {
  status: string;
  scheduledFor: Date | null;
  attempts: number;
};

export type ClaimDecision = { claimable: true } | { claimable: false; reason: string };

/** A job may fire slightly early (clock skew, delay rounding). */
export const EARLY_TOLERANCE_MS = 5_000;

export function claimDecision(p: ClaimInput, now: Date = new Date()): ClaimDecision {
  switch (p.status) {
    case "scheduled":
      if (p.scheduledFor && p.scheduledFor.getTime() > now.getTime() + EARLY_TOLERANCE_MS) {
        return { claimable: false, reason: `Publication is scheduled for ${p.scheduledFor.toISOString()}, not yet due.` };
      }
      return { claimable: true };
    case "attempting":
      // Created for an immediate attempt and not yet claimed by anyone.
      return p.attempts === 0
        ? { claimable: true }
        : { claimable: false, reason: "Another worker is already attempting this publication." };
    case "published":
      return { claimable: false, reason: "Publication already finalized or missing." };
    default:
      return { claimable: false, reason: `Publication is ${p.status}; nothing to attempt.` };
  }
}
