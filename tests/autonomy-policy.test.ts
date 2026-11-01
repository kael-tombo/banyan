import { describe, it, expect } from "vitest";
import {
  buildDigest, decideApproval, DEFAULT_POLICY, describePolicy, isSupervised, nextSlot, parsePolicy,
  type AutonomyPolicy, type ApprovalCandidate,
} from "@/lib/autonomy/policy";

const policy = (over: Partial<AutonomyPolicy> = {}): AutonomyPolicy => ({
  ...DEFAULT_POLICY, level: "supervised", channels: ["linkedin", "x"], version: 3, setById: "u1", setAt: "2026-11-01T00:00:00Z", ...over,
});
const draft = (over: Partial<ApprovalCandidate> = {}): ApprovalCandidate => ({
  channel: "linkedin", status: "ready_for_review", flags: [], isFallback: false, channelHasPublished: true, ...over,
});

describe("policy parsing", () => {
  it("defaults to approve-each and survives garbage", () => {
    expect(parsePolicy(null)).toEqual(DEFAULT_POLICY);
    expect(parsePolicy("not json")).toEqual(DEFAULT_POLICY);
    expect(parsePolicy(JSON.stringify({ level: "full_auto" }))).toEqual(DEFAULT_POLICY);
    expect(isSupervised(DEFAULT_POLICY)).toBe(false);
  });

  it("is supervised only with a level, a channel and the founder who set it", () => {
    expect(isSupervised(policy())).toBe(true);
    expect(isSupervised(policy({ channels: [] }))).toBe(false);
    expect(isSupervised(policy({ setById: null }))).toBe(false);
  });
});

describe("decideApproval", () => {
  it("auto-approves a routine draft inside the policy, citing the version", () => {
    const d = decideApproval(draft(), policy());
    expect(d.auto).toBe(true);
    expect(d.reasons[0]).toContain("policy v3");
  });

  it("asks the founder for everything when supervision is off", () => {
    expect(decideApproval(draft(), DEFAULT_POLICY).auto).toBe(false);
  });

  it("escalates every non-negotiable case with its reason", () => {
    const p = policy({ channels: ["linkedin"] });
    const cases: [Partial<ApprovalCandidate>, RegExp][] = [
      [{ channel: "x" }, /not one of your autopilot channels/],
      [{ channel: "shortvideo" }, /always published by you/],
      [{ flags: [{ code: "unsupported_claim", kind: "metric", phrase: "40%", key: "k", message: "" }] }, /claim nothing in your evidence backs/],
      [{ flags: [{ code: "banned_term", term: "revolutionary", message: "" }] }, /brand voice/],
      [{ flags: [{ code: "over_limit", limit: 3000, length: 3100, message: "" }] }, /longer than the channel allows/],
      [{ isFallback: true }, /template fallback/],
      [{ channelHasPublished: false }, /first post on LinkedIn/],
      [{ status: "draft" }, /not waiting for review/],
    ];
    for (const [over, reason] of cases) {
      const d = decideApproval(draft(over), p);
      expect(d.auto, JSON.stringify(over)).toBe(false);
      expect(d.reasons.join(" ")).toMatch(reason);
    }
  });

  it("lists every reason, not just the first", () => {
    const d = decideApproval(draft({ isFallback: true, channelHasPublished: false }), policy());
    expect(d.reasons).toHaveLength(2);
  });
});

describe("nextSlot", () => {
  const tz = "Europe/Paris"; // UTC+1 in November
  const at = (iso: string) => new Date(iso);

  it("picks the next quarter hour at least 15 minutes out", () => {
    const s = nextSlot(at("2026-11-02T09:07:00Z"), policy({ quietHours: null }), tz, []);
    expect(s?.toISOString()).toBe("2026-11-02T09:30:00.000Z");
  });

  it("skips quiet hours in the founder's time zone, including across midnight", () => {
    // 21:30 Paris; quiet 21:00–08:00 → first slot is 08:00 Paris = 07:00 UTC next day.
    const s = nextSlot(at("2026-11-02T20:30:00Z"), policy({ quietHours: { start: 21, end: 8 } }), tz, []);
    expect(s?.toISOString()).toBe("2026-11-03T07:00:00.000Z");
  });

  it("respects the daily cap and the minimum gap", () => {
    const p = policy({ quietHours: null, maxPerDay: 1 });
    const s = nextSlot(at("2026-11-02T09:00:00Z"), p, tz, [at("2026-11-02T08:00:00Z")]);
    expect(s?.toISOString()).toBe("2026-11-02T23:00:00.000Z"); // 00:00 Paris on the next local day
    const p2 = policy({ quietHours: null, maxPerDay: 3 });
    const s2 = nextSlot(at("2026-11-02T09:00:00Z"), p2, tz, [at("2026-11-02T10:00:00Z")]);
    expect(s2?.toISOString()).toBe("2026-11-02T13:00:00.000Z"); // 3 h after the existing post
  });

  it("skips blackout dates", () => {
    const s = nextSlot(at("2026-11-02T09:00:00Z"), policy({ quietHours: null, blackoutDates: ["2026-11-02"] }), tz, []);
    expect(s?.toISOString()).toBe("2026-11-02T23:00:00.000Z");
  });

  it("returns null when nothing fits in 14 days", () => {
    const dates = Array.from({ length: 16 }, (_, i) => new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10));
    expect(nextSlot(at("2026-11-02T09:00:00Z"), policy({ quietHours: null, blackoutDates: dates }), "UTC", [])).toBeNull();
  });

  it("falls back to UTC for an invalid time zone", () => {
    expect(nextSlot(at("2026-11-02T09:07:00Z"), policy({ quietHours: null }), "Mars/Base", [])?.toISOString()).toBe("2026-11-02T09:30:00.000Z");
  });
});

describe("digest and description", () => {
  it("summarises the week's decisions and the most common escalation", () => {
    const since = new Date("2026-11-01T00:00:00Z");
    const e = (decision: "auto_approved" | "escalated" | "scheduled", channel: string, reasons: string[] = [], day = 2) =>
      ({ createdAt: new Date(Date.UTC(2026, 10, day)), decision, channel, title: "t", reasons });
    const d = buildDigest(
      [e("auto_approved", "linkedin"), e("scheduled", "linkedin"), e("escalated", "x", ["First post on X"]), e("escalated", "x", ["First post on X", "fallback"]), e("auto_approved", "x", [], 0)],
      since
    );
    expect(d).toMatchObject({ autoApproved: 1, escalated: 2, scheduled: 1 });
    expect(d.topEscalations[0]).toEqual({ reason: "First post on X", count: 2 });
    expect(d.byChannel).toEqual([{ channel: "linkedin", autoApproved: 1, escalated: 0 }, { channel: "x", autoApproved: 0, escalated: 2 }]);
  });

  it("describes a policy in plain language", () => {
    expect(describePolicy(DEFAULT_POLICY)).toBe("Approve each: every draft waits for you.");
    expect(describePolicy(policy({ autoPublish: true, maxPerDay: 2 }))).toBe(
      "Supervised: Banyan may approve and schedule routine LinkedIn and X posts, at most 2 per channel per day, never between 21:00 and 8:00."
    );
  });
});
