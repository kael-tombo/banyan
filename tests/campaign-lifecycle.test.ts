import { describe, it, expect } from "vitest";
import {
  decide, availableActions, holdsPublishing, deriveWorkState, shouldDerive, generationBlocked, legacyStatus, lifecycleForLegacy,
  LIFECYCLE_STATES, LIFECYCLE_LABEL, type Lifecycle,
} from "@/lib/campaign/lifecycle";

describe("campaign lifecycle decisions (US-046)", () => {
  it("walks the decision path to approval", () => {
    expect(decide("draft", "submit")).toEqual({ ok: true, to: "pending_approval" });
    expect(decide("pending_approval", "approve")).toEqual({ ok: true, to: "approved" });
    expect(decide("pending_approval", "reject")).toEqual({ ok: true, to: "strategy_generated" });
  });

  it("refuses invalid moves with a reason", () => {
    const d = decide("draft", "complete");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("A draft campaign cannot move to completed.");
    expect(decide("completed", "cancel").ok).toBe(false);
    expect(decide("cancelled", "submit").ok).toBe(false);
    expect(decide("pending_approval", "pause").ok).toBe(false);
  });

  it("pauses, remembers where it was, and resumes there", () => {
    expect(decide("publishing", "pause")).toEqual({ ok: true, to: "paused", pausedFrom: "publishing" });
    expect(decide("paused", "resume", "publishing")).toEqual({ ok: true, to: "publishing", pausedFrom: null });
    expect(decide("paused", "resume", "nonsense")).toEqual({ ok: true, to: "approved", pausedFrom: null });
    expect(decide("paused", "cancel")).toEqual({ ok: true, to: "cancelled", pausedFrom: null });
    expect(decide("approved", "resume").ok).toBe(false);
  });

  it("offers only the actions that are valid now", () => {
    expect(availableActions("pending_approval")).toEqual(["approve", "reject", "cancel"]);
    expect(availableActions("paused")).toEqual(["resume", "cancel"]);
    expect(availableActions("partially_failed")).toEqual(["pause", "complete", "cancel"]);
    expect(availableActions("completed")).toEqual([]);
  });

  it("has a label for every state", () => {
    for (const s of LIFECYCLE_STATES) expect(LIFECYCLE_LABEL[s]).toBeTruthy();
  });
});

describe("work states derive from content", () => {
  it("2 of 3 published and 1 failed is partially failed", () => {
    expect(deriveWorkState(["published", "published", "failed"])).toBe("partially_failed");
  });

  it("follows the content through review, distribution and publishing", () => {
    expect(deriveWorkState([])).toBeNull();
    expect(deriveWorkState(["ready_for_review", "approved"])).toBe("content_review");
    expect(deriveWorkState(["rejected", "published"])).toBe("content_review");
    expect(deriveWorkState(["approved", "approved"])).toBe("ready_to_distribute");
    expect(deriveWorkState(["approved", "scheduled"])).toBe("scheduled");
    expect(deriveWorkState(["scheduled", "publishing"])).toBe("publishing");
    expect(deriveWorkState(["published", "published"])).toBe("published");
    expect(deriveWorkState(["failed", "failed"])).toBe("failed");
    expect(deriveWorkState(["approved", "failed"])).toBe("partially_failed");
    expect(deriveWorkState(["archived", "published"])).toBe("published");
  });

  it("never moves a campaign the founder paused, cancelled, completed, or has not approved", () => {
    const frozen: Lifecycle[] = ["paused", "cancelled", "completed", "draft", "pending_approval", "strategy_generated"];
    for (const s of frozen) expect(shouldDerive(s)).toBe(false);
    expect(shouldDerive("approved")).toBe(true);
    expect(shouldDerive("partially_failed")).toBe(true);
  });
});

describe("generation guard", () => {
  it("refuses content generation while pending approval, paused, cancelled or completed", () => {
    expect(generationBlocked("pending_approval")).toMatch(/waiting on approval/);
    expect(generationBlocked("paused")).toMatch(/paused/);
    expect(generationBlocked("cancelled")).toBeTruthy();
    expect(generationBlocked("completed")).toBeTruthy();
    expect(generationBlocked("approved")).toBeNull();
    expect(generationBlocked("draft")).toBeNull();
  });
});

describe("legacy status stays in step", () => {
  it("maps both ways", () => {
    expect(legacyStatus("pending_approval")).toBe("draft");
    expect(legacyStatus("content_review")).toBe("planned");
    expect(legacyStatus("partially_failed")).toBe("in_progress");
    expect(legacyStatus("cancelled")).toBe("archived");
    expect(lifecycleForLegacy("planned")).toBe("approved");
    expect(lifecycleForLegacy("archived")).toBe("cancelled");
    expect(lifecycleForLegacy("in_progress")).toBeNull();
  });
});

describe("pause holds publishing (US-048)", () => {
  it("holds for paused and cancelled campaigns only", () => {
    expect(holdsPublishing("paused")).toMatch(/stays scheduled/);
    expect(holdsPublishing("cancelled")).toMatch(/will not run/);
    expect(holdsPublishing("publishing")).toBeNull();
    expect(holdsPublishing(null)).toBeNull();
  });
});
