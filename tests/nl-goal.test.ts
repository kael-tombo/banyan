import { describe, expect, it } from "vitest";
import { parseGoalInput, extractDeadline } from "@/lib/agents/nl-goal";

describe("natural-language goal parsing", () => {
  it("extracts metric, target and channel from a typical founder sentence", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    const parsed = parseGoalInput("Get 50 signups from LinkedIn in the next 6 weeks", now);
    expect(parsed.successMetric).toBe("signups");
    expect(parsed.metricTarget).toBe(50);
    expect(parsed.channels).toContain("linkedin");
    expect(parsed.deadline).toBe("2026-12-09"); // 6 weeks after Oct 28
  });

  it("parses deadlines expressed as 'by <Month> <day>'", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    const parsed = parseGoalInput("Reach 1000 followers on X by December 15", now);
    expect(parsed.metricTarget).toBe(1000);
    expect(parsed.successMetric).toBe("followers");
    expect(parsed.deadline).toBe("2026-12-15");
  });

  it("rolls ambiguous month-day dates forward to next year", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    const d = extractDeadline("by January 10", now);
    expect(d?.iso).toBe("2027-01-10");
  });

  it("understands relative weeks/months and quarter targets", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    expect(extractDeadline("in 3 days", now)?.iso).toBe("2026-10-31");
    expect(extractDeadline("in 2 weeks", now)?.iso).toBe("2026-11-11");
    expect(extractDeadline("in 1 month", now)?.iso).toBe("2026-11-28");
    expect(extractDeadline("Q1 2027", now)?.iso).toBe("2027-03-31");
  });

  it("captures organic-only constraints", () => {
    const parsed = parseGoalInput("Get 20 leads without paid ads, organic only");
    expect(parsed.constraints.join(" ")).toMatch(/paid ads/i);
    expect(parsed.successMetric).toBe("qualified_leads");
  });

  it("falls back to a signups metric with no invented target", () => {
    const parsed = parseGoalInput("Grow awareness for the launch");
    expect(parsed.successMetric).toBe("signups");
    expect(parsed.metricTarget).toBeNull();
    expect(parsed.deadline).toBeNull();
  });

  it("never invents a target the user did not state", () => {
    const parsed = parseGoalInput("More signups from LinkedIn please");
    expect(parsed.metricTarget).toBeNull();
  });

  it("parses thousands separators and commas", () => {
    const parsed = parseGoalInput("1,500 visits from X");
    expect(parsed.metricTarget).toBe(1500);
    expect(parsed.successMetric).toBe("qualified_visits");
  });

  it("recognizes short-form video as a channel", () => {
    const parsed = parseGoalInput("Publish 10 short videos on TikTok");
    expect(parsed.channels).toContain("shortvideo");
    expect(parsed.successMetric).toBe("published_posts");
    expect(parsed.metricTarget).toBe(10);
  });
});
