import { describe, it, expect } from "vitest";
import { recommendFromReport } from "@/lib/cycle-recommend";
import type { CycleReport, ShippedRow } from "@/lib/cycle-report";

const row = (channel: string, state: ShippedRow["state"], clicks: number | null): ShippedRow => ({
  contentId: channel, channel, format: "post", title: channel, state, approvedBy: "Ada", url: null, publishedAt: null,
  link: clicks === null ? null : { slug: channel, clicks, signups: 0 },
});

function report(over: Partial<CycleReport> = {}): CycleReport {
  return {
    window: { start: new Date(), end: new Date(), daysRemaining: 0, closed: true },
    final: true,
    shipped: [row("linkedin", "provider", 30), row("x", "provider", 5)],
    produced: { visits: 35, trackedSignups: 1, recorded: [] },
    objective: { metric: "signups", target: 20, unit: null, actual: 1, basis: "", status: "missed" },
    notAttributable: [],
    next: { kind: "none", reason: "" },
    ...over,
  };
}

describe("recommendFromReport", () => {
  it("asks to publish first when nothing went live", () => {
    const r = recommendFromReport(report({ shipped: [row("linkedin", "approved_unpublished", null)], produced: { visits: null, trackedSignups: null, recorded: [] } }));
    expect(r.title).toMatch(/^Publish the approved posts/);
    expect(r.confidence).toBe("low");
  });

  it("asks for tracked links when posts went live unmeasured", () => {
    expect(recommendFromReport(report({ shipped: [row("linkedin", "manual", null)], produced: { visits: null, trackedSignups: null, recorded: [] } })).title).toBe("Attach a tracked link to every post next cycle");
  });

  it("keeps a winning message and adds a channel", () => {
    expect(recommendFromReport(report({ objective: { ...report().objective, actual: 22, status: "met" } })).title).toBe("Keep the message and add one channel");
  });

  it("leads with a channel that clearly outperformed, citing the numbers", () => {
    const r = recommendFromReport(report());
    expect(r.title).toBe("Lead with LinkedIn next cycle");
    expect(r.rationale).toContain("30 tracked visits against 5 from X");
    expect(r.evidence.map((e) => e.source)).toEqual(["publications", "tracked_links", "signups"]);
  });

  it("waits while the window is open and the sample is small", () => {
    const r = recommendFromReport(report({ window: { start: new Date(), end: new Date(), daysRemaining: 6, closed: false }, shipped: [row("linkedin", "provider", 4), row("x", "provider", 3)], produced: { visits: 7, trackedSignups: 0, recorded: [] }, objective: { ...report().objective, status: "in_progress" } }));
    expect(r.title).toBe("Let the current posts run until the window closes");
  });

  it("otherwise changes exactly one variable on the strongest channel", () => {
    const r = recommendFromReport(report({ shipped: [row("linkedin", "provider", 12), row("x", "provider", 9)], produced: { visits: 21, trackedSignups: 0, recorded: [] } }));
    expect(r.title).toBe("Test a different opening hook on LinkedIn");
  });
});
