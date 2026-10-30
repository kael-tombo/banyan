import { describe, expect, it } from "vitest";
import {
  isConcludedLearning,
  learningAt,
  learningLine,
  learningMemory,
  orderConcludedLearning,
  priorLearningLines,
  type LearningExperiment,
} from "@/lib/learning-memory";
import { contextBlock, type BusinessContext } from "@/lib/agents/handlers/common";

/**
 * Learning memory is the loop's ability to compound: only a complete,
 * interpreted experiment is reusable context. These tests pin the honesty
 * rules — no conclusion, no memory; no invented number, no upgrade of an
 * inconclusive result into proof.
 */

const at = (iso: string) => new Date(iso);

function experiment(overrides: Partial<LearningExperiment> = {}): LearningExperiment {
  return {
    id: "exp-1",
    title: "Problem-first thread",
    hypothesis: "Leading with the audience's problem earns more clicks than leading with the product.",
    variable: "Opening angle",
    successMetric: "tracked clicks",
    status: "complete",
    results: "12 tracked clicks",
    interpretation: "Problem-first openings got more clicks, but the sample is small.",
    limitations: "No control group; one channel.",
    nextAction: "Repeat with a pre-declared threshold.",
    decidedAt: at("2026-10-20T10:00:00Z"),
    updatedAt: at("2026-10-21T10:00:00Z"),
    ...overrides,
  };
}

describe("isConcludedLearning", () => {
  it("accepts only a complete experiment with a recorded interpretation", () => {
    expect(isConcludedLearning(experiment())).toBe(true);
  });

  it("rejects running, planned and abandoned experiments even with text", () => {
    for (const status of ["planned", "running", "abandoned"]) {
      expect(isConcludedLearning(experiment({ status }))).toBe(false);
    }
  });

  it("rejects a complete experiment whose interpretation is empty or whitespace", () => {
    expect(isConcludedLearning(experiment({ interpretation: null }))).toBe(false);
    expect(isConcludedLearning(experiment({ interpretation: "   \n " }))).toBe(false);
  });
});

describe("orderConcludedLearning", () => {
  it("keeps concluded experiments, newest decision first, and drops non-memory rows", () => {
    const older = experiment({ id: "older", decidedAt: at("2026-10-01T09:00:00Z") });
    const newer = experiment({ id: "newer", decidedAt: at("2026-10-25T09:00:00Z") });
    const running = experiment({ id: "running", status: "running" });
    const uninterpreted = experiment({ id: "uninterpreted", interpretation: null });
    const noDecision = experiment({ id: "no-decision", decidedAt: null, updatedAt: at("2026-10-10T09:00:00Z") });
    const ordered = orderConcludedLearning([older, running, noDecision, uninterpreted, newer]);
    expect(ordered.map((e) => e.id)).toEqual(["newer", "no-decision", "older"]);
  });

  it("falls back to updatedAt when decidedAt is absent", () => {
    expect(learningAt(experiment({ decidedAt: null }))).toBe(at("2026-10-21T10:00:00Z").getTime());
  });

  it("is deterministic when conclusions share a timestamp", () => {
    const a = experiment({ id: "aaa", decidedAt: at("2026-10-20T10:00:00Z") });
    const b = experiment({ id: "bbb", decidedAt: at("2026-10-20T10:00:00Z") });
    expect(orderConcludedLearning([b, a]).map((e) => e.id)).toEqual(["aaa", "bbb"]);
  });

  it("bounds the memory and treats a non-positive limit as none", () => {
    const rows = [
      experiment({ id: "1", decidedAt: at("2026-10-01T00:00:00Z") }),
      experiment({ id: "2", decidedAt: at("2026-10-02T00:00:00Z") }),
      experiment({ id: "3", decidedAt: at("2026-10-03T00:00:00Z") }),
    ];
    expect(orderConcludedLearning(rows, 2).map((e) => e.id)).toEqual(["3", "2"]);
    expect(orderConcludedLearning(rows, 0)).toEqual([]);
    expect(orderConcludedLearning(rows, -5)).toEqual([]);
  });
});

describe("learningLine", () => {
  it("states the recorded conclusion, variable, metric, limits and next action", () => {
    const line = learningLine(experiment());
    expect(line).toContain("Problem-first thread");
    expect(line).toContain("tested: Leading with the audience's problem");
    expect(line).toContain("variable: Opening angle");
    expect(line).toContain("metric: tracked clicks");
    expect(line).toContain("conclusion: Problem-first openings got more clicks");
    expect(line).toContain("limits: No control group; one channel.");
    expect(line).toContain("next: Repeat with a pre-declared threshold.");
  });

  it("names absent limits and next actions instead of inventing them", () => {
    const line = learningLine(experiment({ limitations: null, nextAction: null }));
    expect(line).toContain("limits: none recorded");
    expect(line).toContain("next: not recorded");
    expect(line).not.toContain("statistically significant");
  });

  it("normalises whitespace so a prompt line stays one line", () => {
    const line = learningLine(
      experiment({ interpretation: "First line.\n\nSecond   line.", title: "  Spaced\n title  " })
    );
    expect(line).toContain('"Spaced title"');
    expect(line).toContain("conclusion: First line. Second line.");
    expect(line).not.toContain("\n");
  });

  it("bounds long text rather than letting one conclusion dominate the prompt", () => {
    const line = learningLine(experiment({ hypothesis: "x".repeat(400), interpretation: "y".repeat(900), limitations: "z".repeat(400) }));
    expect(line.length).toBeLessThanOrEqual(460);
    expect(line.endsWith("…")).toBe(true);
    expect(line).not.toMatch(/\|\s*…$/); // no dangling separator at the cut
  });
});

describe("priorLearningLines", () => {
  it("returns the newest conclusions as prompt lines, bounded by the limit", () => {
    const rows = [
      experiment({ id: "a", title: "First", decidedAt: at("2026-10-01T00:00:00Z") }),
      experiment({ id: "b", title: "Second", decidedAt: at("2026-10-02T00:00:00Z") }),
      experiment({ id: "c", title: "Third", decidedAt: at("2026-10-03T00:00:00Z") }),
      experiment({ id: "d", title: "Draft", status: "running" }),
    ];
    const lines = priorLearningLines(rows, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Third");
    expect(lines[1]).toContain("Second");
  });
});

describe("agent context", () => {
  const ctxWith = (experiments: LearningExperiment[]): BusinessContext =>
    ({ profile: null, facts: [], experiments } as unknown as BusinessContext);

  it("injects concluded learning into the prompt context, labelled as recorded conclusions", () => {
    const block = contextBlock(ctxWith([experiment()]), null);
    expect(block).toContain("Prior learning from concluded experiments");
    expect(block).toContain("not proof");
    expect(block).toContain("Problem-first thread");
    expect(block).toContain("conclusion: Problem-first openings got more clicks");
  });

  it("omits the section when nothing has been concluded", () => {
    const block = contextBlock(ctxWith([experiment({ status: "running" }), experiment({ interpretation: null })]), null);
    expect(block).not.toContain("Prior learning");
  });
});

describe("learningMemory", () => {
  it("returns an inspectable shape with a real decision date", () => {
    const rows = [experiment({ id: "a", decidedAt: null, updatedAt: at("2026-09-09T00:00:00Z") })];
    const memory = learningMemory(rows);
    expect(memory).toHaveLength(1);
    expect(memory[0].id).toBe("a");
    expect(memory[0].decidedAt).toEqual(at("2026-09-09T00:00:00Z"));
    expect(memory[0].interpretation).toContain("Problem-first openings");
  });

  it("keeps only conclusions and respects the limit", () => {
    const rows = [
      experiment({ id: "1", decidedAt: at("2026-10-01T00:00:00Z") }),
      experiment({ id: "2", decidedAt: at("2026-10-02T00:00:00Z") }),
      experiment({ id: "3", decidedAt: at("2026-10-03T00:00:00Z") }),
      experiment({ id: "4", status: "planned" }),
    ];
    expect(learningMemory(rows, 2).map((e) => e.id)).toEqual(["3", "2"]);
  });
});
