import { describe, it, expect } from "vitest";
import { buildCycleReport, type ReportInput } from "@/lib/cycle-report";

const NOW = new Date("2026-11-15T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function base(over: Partial<ReportInput> = {}): ReportInput {
  return {
    now: NOW,
    goal: { objective: "20 signups in 14 days", successMetric: "signups", metricTarget: 20, metricUnit: null, deadline: day(3), createdAt: day(-11) },
    items: [
      { id: "li", channel: "linkedin", format: "post", title: "Insight post", status: "published", approvedAt: day(-10), approvedBy: "Ada" },
      { id: "x", channel: "x", format: "thread", title: "Thread", status: "published", approvedAt: day(-10), approvedBy: "Ada" },
      { id: "vid", channel: "shortvideo", format: "script", title: "Script", status: "approved", approvedAt: day(-10), approvedBy: "Ada" },
    ],
    publications: [
      { contentItemId: "li", status: "published", manual: false, externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:1/", publishedAt: day(-9) },
      { contentItemId: "x", status: "failed", manual: false, externalUrl: null, publishedAt: null },
      { contentItemId: "x", status: "published", manual: false, externalUrl: "https://x.com/i/web/status/1", publishedAt: day(-9) },
    ],
    links: [
      { id: "l1", slug: "li-1", contentItemId: "li", clicks: 40 },
      { id: "l2", slug: "x-1", contentItemId: "x", clicks: 12 },
    ],
    linkSignups: { l1: 3, l2: 1 },
    metrics: [],
    recommendation: null,
    isManualChannel: (c) => c === "shortvideo",
    ...over,
  };
}

describe("cycle report", () => {
  it("lists what shipped with its live URL and link, the confirmed publication winning over a failed attempt", () => {
    const r = buildCycleReport(base());
    expect(r.shipped.map((s) => [s.contentId, s.state])).toEqual([["li", "provider"], ["x", "provider"], ["vid", "handoff"]]);
    expect(r.shipped[1].url).toBe("https://x.com/i/web/status/1");
    expect(r.shipped[0].link).toEqual({ slug: "li-1", clicks: 40, signups: 3 });
    expect(r.shipped[0].approvedBy).toBe("Ada");
  });

  it("counts only recorded rows and measures the objective against them", () => {
    const r = buildCycleReport(base());
    expect(r.produced).toMatchObject({ visits: 52, trackedSignups: 4 });
    expect(r.objective).toMatchObject({ actual: 4, target: 20, status: "in_progress" });
    expect(r.objective.basis).toBe("4 through tracked links");
  });

  it("adds signups recorded by hand and says so", () => {
    const r = buildCycleReport(base({ metrics: [{ metric: "Signups", value: 17, source: "manual", recordedAt: day(-1) }] }));
    expect(r.objective).toMatchObject({ actual: 21, status: "met" });
    expect(r.objective.basis).toBe("4 through tracked links + 17 recorded by hand");
  });

  it("marks the objective missed only once the window has closed", () => {
    const open = buildCycleReport(base());
    const closed = buildCycleReport(base({ now: day(4) }));
    expect(open.final).toBe(false);
    expect(closed.final).toBe(true);
    expect(closed.objective.status).toBe("missed");
    expect(closed.window.daysRemaining).toBe(0);
  });

  it("shows 'not measured' (null), never zero, when there is no tracked link", () => {
    const r = buildCycleReport(base({ links: [], linkSignups: {} }));
    expect(r.produced.visits).toBeNull();
    expect(r.produced.trackedSignups).toBeNull();
    expect(r.objective.actual).toBeNull();
    expect(r.objective.status).toBe("unmeasured");
    expect(r.notAttributable.filter((s) => s.includes("without a tracked link"))).toHaveLength(2);
  });

  it("keeps a measured zero as zero and explains why no signup counts", () => {
    const r = buildCycleReport(base({ links: [{ id: "l1", slug: "a", contentItemId: "li", clicks: 0 }], linkSignups: {} }));
    expect(r.produced.visits).toBe(0);
    expect(r.objective.actual).toBe(0);
    expect(r.notAttributable.some((s) => s.startsWith("No signup has been recorded"))).toBe(true);
  });

  it("names everything that cannot be attributed", () => {
    const r = buildCycleReport(
      base({
        items: [
          ...base().items,
          { id: "m", channel: "linkedin", format: "post", title: "By hand", status: "published", approvedAt: day(-5), approvedBy: "Ada" },
          { id: "u", channel: "x", format: "post", title: "Waiting", status: "approved", approvedAt: day(-2), approvedBy: "Ada" },
        ],
        publications: [...base().publications, { contentItemId: "m", status: "published", manual: true, externalUrl: "https://www.linkedin.com/x", publishedAt: day(-4) }],
      })
    );
    const text = r.notAttributable.join("\n");
    expect(text).toContain("Short-form video script was prepared for you to publish");
    expect(text).toContain("LinkedIn post was published by hand");
    expect(text).toContain("X post is approved but not published");
    expect(text).toContain("Platform engagement");
    expect(text).toContain("3 days left");
  });

  it("measures a non-standard objective only from metrics recorded under that name", () => {
    const r = buildCycleReport(
      base({
        goal: { ...base().goal, successMetric: "demo calls", metricTarget: 5 },
        metrics: [{ metric: "demo_calls", value: 2, source: "manual", recordedAt: day(-1) }],
      })
    );
    expect(r.objective).toMatchObject({ actual: 2, status: "in_progress", basis: "recorded demo calls" });
  });

  it("carries the recommendation with its evidence, or says plainly there is none", () => {
    const rec = { title: "Lead with getting paid", rationale: "LinkedIn signups talked about payment", confidence: "low", uncertainty: "4 signups is small", evidence: [{ source: "tracked_link", ref: "li-1", summary: "3 signups" }] };
    expect(buildCycleReport(base({ recommendation: rec })).next).toEqual({ kind: "proposal", ...rec });
    const none = buildCycleReport(base({ links: [], linkSignups: {} })).next;
    expect(none.kind).toBe("none");
    if (none.kind === "none") expect(none.reason).toMatch(/^Not enough data/);
  });

  it("cannot be final without an end date", () => {
    const r = buildCycleReport(base({ goal: { ...base().goal, deadline: null } }));
    expect(r.final).toBe(false);
    expect(r.window.daysRemaining).toBeNull();
    expect(r.notAttributable).toContain("This cycle has no end date, so the report can never be final.");
  });

  it("does not count an unapproved draft as shipped", () => {
    const r = buildCycleReport(base({ items: [{ id: "d", channel: "x", format: "post", title: "Draft", status: "draft", approvedAt: null, approvedBy: null }], publications: [], links: [] }));
    expect(r.shipped[0].state).toBe("not_approved");
    expect(r.notAttributable.some((s) => s.includes("Draft"))).toBe(false);
  });
});

describe("strategy KPI names", () => {
  it("reads tracked_visits as visits and publications from what shipped", () => {
    const visits = buildCycleReport(base({ goal: { ...base().goal, successMetric: "tracked_visits", metricTarget: 50 } }));
    expect(visits.objective).toMatchObject({ actual: 52, status: "met" });
    const pubs = buildCycleReport(base({ goal: { ...base().goal, successMetric: "publications", metricTarget: 3 } }));
    expect(pubs.objective).toMatchObject({ actual: 2, status: "in_progress", basis: "2 published (confirmed by the platform or recorded by you)" });
  });
});
