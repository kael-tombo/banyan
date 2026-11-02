import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, policyInput } from "@/lib/autonomy/policy";
import { narrowedPolicy, proposedPolicy, trustRecord, trustVerdict, type ReviewedDraft } from "@/lib/autonomy/trust";

const draft = (over: Partial<ReviewedDraft> = {}): ReviewedDraft => ({
  channel: "linkedin", status: "published", edited: false, approvedByPolicy: false, flagged: false, publishedLive: true, failed: false, ...over,
});
const clean = (n: number, over: Partial<ReviewedDraft> = {}) => Array.from({ length: n }, () => draft(over));

describe("earned autonomy", () => {
  it("proposes supervising a channel only on a clean record", () => {
    const v = trustVerdict(trustRecord("linkedin", clean(6)), DEFAULT_POLICY);
    expect(v.state).toBe("ready");
    expect(v.checks.every((c) => c.met)).toBe(true);
    expect(v.summary).toMatch(/approved 6 of your last 6 LinkedIn drafts as written/);
  });

  it("needs enough decisions and enough live posts", () => {
    expect(trustVerdict(trustRecord("linkedin", clean(4)), DEFAULT_POLICY).state).toBe("not_yet");
    expect(trustVerdict(trustRecord("linkedin", clean(6, { publishedLive: false })), DEFAULT_POLICY).state).toBe("not_yet");
  });

  it("is held back by edits, rejections, flagged claims and failures", () => {
    const base = clean(6);
    for (const bad of [
      [...base.slice(0, 4), draft({ edited: true }), draft({ edited: true })], // 67% as written
      [...base.slice(0, 5), draft({ status: "rejected", publishedLive: false })],
      [...base.slice(0, 5), draft({ flagged: true })],
      [...base.slice(0, 5), draft({ failed: true })],
    ]) {
      expect(trustVerdict(trustRecord("linkedin", bad), DEFAULT_POLICY).state).toBe("not_yet");
    }
  });

  it("never counts drafts the policy approved itself", () => {
    const record = trustRecord("linkedin", [...clean(2), ...clean(10, { approvedByPolicy: true })]);
    expect(record.reviewed).toBe(2);
  });

  it("only looks at the latest decisions on that channel", () => {
    const record = trustRecord("linkedin", [...clean(10), ...clean(5, { status: "rejected" }), ...clean(3, { channel: "x", failed: true })]);
    expect(record).toMatchObject({ reviewed: 10, rejected: 0, failed: 0 });
  });

  it("says a channel is already supervised instead of proposing it again", () => {
    const policy = { ...DEFAULT_POLICY, level: "supervised" as const, channels: ["linkedin" as const] };
    expect(trustVerdict(trustRecord("linkedin", clean(6)), policy).state).toBe("supervised");
  });

  it("says when a supervised channel's record slips, and proposes taking it back", () => {
    const policy = { ...DEFAULT_POLICY, level: "supervised" as const, channels: ["linkedin" as const, "x" as const], autoPublish: true };
    const v = trustVerdict(trustRecord("linkedin", [...clean(5), draft({ failed: true })]), policy);
    expect(v.state).toBe("slipping");
    expect(v.summary).toMatch(/1 failed to publish/);
    const narrowed = narrowedPolicy(policy, "linkedin");
    expect(policyInput.safeParse(narrowed).success).toBe(true);
    expect(narrowed).toMatchObject({ level: "supervised", channels: ["x"], autoPublish: true });
    expect(narrowedPolicy({ ...policy, channels: ["linkedin"] }, "linkedin")).toMatchObject({ level: "approve_each", channels: [], autoPublish: false });
  });

  it("does not call a supervised channel slipping just because history is short", () => {
    const policy = { ...DEFAULT_POLICY, level: "supervised" as const, channels: ["linkedin" as const] };
    expect(trustVerdict(trustRecord("linkedin", clean(2)), policy).state).toBe("supervised");
  });

  it("proposes the founder's own policy plus one channel, valid and without new auto-publishing", () => {
    const p = proposedPolicy(DEFAULT_POLICY, "x");
    expect(policyInput.safeParse(p).success).toBe(true);
    expect(p).toMatchObject({ level: "supervised", channels: ["x"], autoPublish: false, maxPerDay: DEFAULT_POLICY.maxPerDay });
    const widened = proposedPolicy({ ...DEFAULT_POLICY, level: "supervised", channels: ["linkedin"], autoPublish: true }, "x");
    expect(widened.channels.sort()).toEqual(["linkedin", "x"]);
    expect(widened.autoPublish).toBe(true); // kept as the founder set it, never switched on by a proposal
  });
});
