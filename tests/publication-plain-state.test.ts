import { describe, expect, it } from "vitest";
import { describePublication, causeOf, type PublicationLike } from "@/lib/publishing/plain-state";

const pub = (over: Partial<PublicationLike>): PublicationLike => ({
  status: "scheduled", provider: "socialflow", manual: false, externalId: null, externalUrl: null, attempts: 0, lastError: null, scheduledFor: null, ...over,
});

describe("publication states in plain words (blocker 09)", () => {
  it("calls a post live only when it is published", () => {
    expect(describePublication(pub({ status: "published", externalUrl: "https://x.com/i/web/status/1" }))).toMatchObject({ label: "Live", tone: "good" });
    expect(describePublication(pub({ status: "published" })).label).toBe("Live, link pending");
    expect(describePublication(pub({ status: "published", manual: true, provider: "manual" })).detail).toMatch(/Published by you/);
    for (const status of ["scheduled", "attempting", "failed", "blocked"]) {
      expect(describePublication(pub({ status })).label).not.toMatch(/^Live/);
    }
  });

  it("says when SocialFlow holds a post that is not confirmed yet", () => {
    const s = describePublication(pub({ externalId: "p1", scheduledFor: "2026-11-02T10:00:00Z" }));
    expect(s.label).toBe("Waiting for confirmation");
    expect(s.detail).toMatch(/only when SocialFlow.ai confirms/);
  });

  it("shows a transient retry with its reason", () => {
    expect(describePublication(pub({ attempts: 2, lastError: "SocialFlow.ai is unavailable." }))).toMatchObject({ label: "Retrying", tone: "warn" });
  });

  it("gives a failed post the one next step that fixes it", () => {
    expect(describePublication(pub({ status: "failed", lastError: "Provider responded 401: unauthorized" })).next).toEqual({ kind: "reconnect", href: "/app/connections" });
    expect(describePublication(pub({ status: "failed", lastError: "Provider responded 422: text too long" })).next.kind).toBe("review");
    expect(describePublication(pub({ status: "failed", lastError: "accepted, not confirmed Banyan stopped waiting; SocialFlow.ai may still publish it, so a retry first checks its outcome." })).label).toBe("Unconfirmed");
    expect(describePublication(pub({ status: "failed", lastError: "Provider request timed out." })).next.kind).toBe("retry");
  });

  it("explains a stopped post", () => {
    expect(describePublication(pub({ status: "blocked", lastError: "Schedule cancelled by user." })).label).toBe("Cancelled");
    expect(describePublication(pub({ status: "blocked", lastError: "Content lost approval before the attempt; publishing refused." })).next.kind).toBe("review");
    expect(describePublication(pub({ status: "blocked", lastError: "Automated publishing is not available yet: …" })).next.kind).toBe("record_url");
  });

  it("reads causes from the messages Banyan itself writes", () => {
    expect(causeOf("… Banyan stopped waiting and cancelled it in SocialFlow.ai, so a retry cannot post it twice.")).toBe("unconfirmed_cancelled");
    expect(causeOf("Provider responded 429: rate limit exceeded")).toBe("rate");
    expect(causeOf(null)).toBe("unknown");
  });
});
