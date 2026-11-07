import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/log", () => ({ log: () => {} }));

const { digestLines, isoWeekKey } = await import("@/lib/autonomy/digest-email");
const { buildDigest } = await import("@/lib/autonomy/policy");
const { parseEmailPrefs, readUnsubscribeToken, unsubscribeToken } = await import("@/lib/email/preferences");
const { renderEmail } = await import("@/lib/email/templates");

const at = new Date("2026-11-03T09:00:00Z");
const ev = (decision: "auto_approved" | "escalated" | "scheduled" | "not_scheduled", channel = "linkedin", reasons: string[] = []) =>
  ({ createdAt: at, decision, channel, title: "t", reasons });

describe("weekly autopilot summary", () => {
  it("says what the autopilot did and what waits, in plain sentences", () => {
    const digest = buildDigest(
      [ev("auto_approved"), ev("auto_approved", "x"), ev("scheduled"), ev("escalated", "linkedin", ["It mentions “pricing”, a topic you asked to see yourself."])],
      new Date(0),
    );
    const { done, waiting } = digestLines({ digest, waitingApprovals: 1, spotChecks: 2, slipping: ["x"], paused: false });
    expect(done[0]).toBe("Approved 2 routine drafts within your rules (1 on LinkedIn, 1 on X).");
    expect(done[1]).toBe("Scheduled 1 of them into the next slots your rules allow.");
    expect(done[2]).toContain("Sent 1 draft back to you; most often because: It mentions “pricing”");
    expect(waiting).toEqual([
      "1 draft waiting for your review.",
      "2 spot checks: posts Banyan approved on its own, for you to confirm or stop.",
      "X's record slipped (a rejection, flagged claim or failed post). Banyan suggests approving each X draft again until it is clean.",
    ]);
  });

  it("has nothing to say in a quiet week, so nothing is sent", () => {
    const { done, waiting } = digestLines({ digest: buildDigest([], new Date(0)), waitingApprovals: 0, spotChecks: 0, slipping: [], paused: false });
    expect(done).toEqual([]);
    expect(waiting).toEqual([]);
  });

  it("keys weeks the ISO way, in UTC", () => {
    expect(isoWeekKey(new Date("2026-11-02T00:00:00Z"))).toBe("2026-W45"); // a Monday
    expect(isoWeekKey(new Date("2026-11-08T23:59:59Z"))).toBe("2026-W45"); // the Sunday after
    expect(isoWeekKey(new Date("2026-11-09T00:00:00Z"))).toBe("2026-W46");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53"); // belongs to the previous ISO year
  });

  it("renders with the unsubscribe link and a one-click header URL", () => {
    const r = renderEmail("autonomy_digest", {
      name: "Ada Lovelace", product: "Ledgerline", period: "27 Oct to 3 Nov",
      done: ["Approved 2 routine drafts within your rules (2 on LinkedIn)."], waiting: ["1 draft waiting for your review."],
      link: "https://app/app/autonomy", unsubscribe: "https://app/unsubscribe?t=x", oneClick: "https://app/api/email/unsubscribe?t=x",
    });
    expect(r.subject).toBe("Ledgerline: 1 thing waiting on you this week");
    expect(r.text).toContain("Hi Ada,");
    expect(r.text).toContain("- 1 draft waiting for your review.");
    expect(r.text).toContain("Stop these weekly summaries: https://app/unsubscribe?t=x");
    expect(r.listUnsubscribe).toBe("https://app/api/email/unsubscribe?t=x");
    expect(renderEmail("verify_email", { name: "A", link: "l" }).listUnsubscribe).toBeUndefined();
  });
});

describe("email preferences", () => {
  it("defaults to on and survives garbage", () => {
    expect(parseEmailPrefs(null)).toEqual({ autonomyDigest: true });
    expect(parseEmailPrefs("nope")).toEqual({ autonomyDigest: true });
    expect(parseEmailPrefs('{"autonomyDigest":false}')).toEqual({ autonomyDigest: false });
  });

  it("unsubscribe tokens are signed per user and kind", () => {
    const t = unsubscribeToken("user_1", "autonomyDigest");
    expect(readUnsubscribeToken(t)).toEqual({ userId: "user_1", key: "autonomyDigest" });
    expect(readUnsubscribeToken(t.replace("user_1", "user_2"))).toBeNull();
    expect(readUnsubscribeToken(t.slice(0, -2) + "xx")).toBeNull();
    expect(readUnsubscribeToken("user_1.somethingElse." + t.split(".")[2])).toBeNull();
    expect(readUnsubscribeToken("garbage")).toBeNull();
  });
});
