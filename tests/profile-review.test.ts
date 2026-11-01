import { describe, it, expect } from "vitest";
import { mergeAnalysis, markUserFields, approvalState, editBump, approvalBlockers, parseSources } from "@/lib/product/profile-review";
import type { ProductAnalysisResult } from "@/lib/product/analyze";

const analysis: ProductAnalysisResult = {
  product_name: "Ledgerline",
  description: "Invoicing that works offline.",
  value_proposition: "Send invoices from anywhere.",
  features: ["Offline invoicing"],
  target_audience: ["Freelance designers", "Freelance developers"],
  problems_solved: ["Invoices delayed by missing signal"],
  differentiators: [],
  missing_information: ["differentiators", "pricing"],
  provenance: {},
};

describe("mergeAnalysis (US-023, US-020)", () => {
  it("fills an empty profile and marks every filled field as from the analysis", () => {
    const m = mergeAnalysis(null, analysis);
    expect(m.data.name).toBe("Ledgerline");
    expect(m.data.audience).toBe("Freelance designers; Freelance developers");
    expect(JSON.parse(m.data.features)).toEqual(["Offline invoicing"]);
    expect(m.sources.name).toBe("analysis");
    expect(JSON.parse(m.data.missingInformation)).toEqual(["differentiators", "pricing"]);
  });

  it("never overwrites what the founder wrote", () => {
    const current = { name: "Ledgerline Pro", description: "", fieldSources: JSON.stringify({ name: "user" }) };
    const m = mergeAnalysis(current, analysis);
    expect(m.data.name).toBeUndefined();
    expect(m.kept).toContain("name");
    expect(m.sources.name).toBe("user");
    expect(m.data.description).toBe("Invoicing that works offline.");
  });

  it("replaces an earlier analysis value with the new one", () => {
    const current = { valueProp: "old", fieldSources: JSON.stringify({ valueProp: "analysis" }) };
    expect(mergeAnalysis(current, analysis).data.valueProp).toBe("Send invoices from anywhere.");
  });

  it("does not replace text with an empty analysis field", () => {
    const current = { differentiators: JSON.stringify(["Works offline on every plan"]), fieldSources: "{}" };
    expect(mergeAnalysis(current, analysis).data.differentiators).toBeUndefined();
  });
});

describe("approval (US-023)", () => {
  it("a profile with analysis fields needs approval before strategy", () => {
    const s = approvalState({ fieldSources: JSON.stringify({ name: "analysis", audience: "user" }), approvedAt: null });
    expect(s.needsApproval).toBe(true);
    expect(s.reason).toMatch(/name came from the website analysis/);
  });

  it("a profile written by the founder needs no extra approval", () => {
    expect(approvalState({ fieldSources: JSON.stringify({ name: "user" }), approvedAt: null }).needsApproval).toBe(false);
  });

  it("an approved profile is approved", () => {
    expect(approvalState({ fieldSources: JSON.stringify({ name: "analysis" }), approvedAt: new Date() })).toMatchObject({ approved: true, needsApproval: false });
  });

  it("editing an approved profile starts a new version and clears the approval", () => {
    expect(editBump({ approvedAt: new Date(), version: 2 })).toEqual({ version: 3, approvedAt: null, approvedById: null });
    expect(editBump({ approvedAt: null, version: 2 })).toEqual({});
  });

  it("refuses to approve a profile without a name or description", () => {
    expect(approvalBlockers({ name: "", description: "" })).toHaveLength(2);
    expect(approvalBlockers({ name: "Ledgerline", description: "Invoicing that works offline." })).toEqual([]);
  });

  it("marks edited fields as the founder's", () => {
    expect(parseSources(markUserFields(JSON.stringify({ name: "analysis" }), ["name", "valueProp"]))).toEqual({ name: "user", valueProp: "user" });
  });

  it("ignores malformed source records", () => {
    expect(parseSources("not json")).toEqual({});
    expect(parseSources(JSON.stringify({ name: "robot" }))).toEqual({});
  });
});
