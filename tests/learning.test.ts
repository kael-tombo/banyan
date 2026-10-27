import { describe, it, expect } from "vitest";
import { summarizeObservations } from "@/lib/learning";

const emptyObservation = { label: "Recorded outcomes", clicks: 0, publications: 0, metrics: [] };

describe("summarizeObservations", () => {
  it("refuses to conclude without enough data", () => {
    const summary = summarizeObservations("Problem-first posts earn more clicks", [emptyObservation], { clicks: 0 });
    expect(summary.verdict).toBe("not_enough_data");
    expect(summary.interpretationDraft).toContain("Not enough evidence");
    expect(summary.limitationsDraft).toContain("No comparison group");
  });

  it("does not claim proof even with data", () => {
    const summary = summarizeObservations(
      "Problem-first posts earn more clicks",
      [{ label: "Recorded outcomes", clicks: 120, publications: 4, metrics: [] }],
      { clicks: 120 }
    );
    expect(summary.verdict).toBe("inconclusive");
    expect(summary.interpretationDraft).toContain("correlation, not proof");
    expect(summary.limitationsDraft).toContain("no A/B randomization");
  });

  it("reports explicit zeros when values are known to be zero", () => {
    const summary = summarizeObservations("Hypothesis", [emptyObservation], { clicks: 0 });
    expect(summary.observations[0]).toContain("0 confirmed publication(s)");
    expect(summary.observations[0]).toContain("0 tracked click(s)");
  });

  it("says so explicitly when no outcome field was provided at all", () => {
    const summary = summarizeObservations("Hypothesis", [{ label: "Recorded outcomes", metrics: [] }], { clicks: 0 });
    expect(summary.observations[0]).toContain("no recorded outcomes yet");
  });
});
