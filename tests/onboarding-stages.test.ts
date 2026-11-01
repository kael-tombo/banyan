import { describe, it, expect } from "vitest";
import { computeProgress, canSkip, isStageKey, STAGES } from "@/lib/onboarding/stages";

describe("onboarding stages (US-018)", () => {
  it("has the brief's nine stages in order", () => {
    expect(STAGES.map((s) => s.key)).toEqual([
      "account", "workspace", "business", "product_url", "brand", "connection", "preferences", "first_campaign", "activation",
    ]);
  });

  it("a new workspace has its account done and resumes at the workspace stage", () => {
    const p = computeProgress({});
    expect(p.stages[0].status).toBe("done");
    expect(p.current).toBe("workspace");
    expect(p.requiredComplete).toBe(false);
  });

  it("resumes at the first stage that is neither done nor skipped", () => {
    const p = computeProgress({ workspace: "done", business: "done" });
    expect(p.current).toBe("product_url");
  });

  it("skipped optional stages are passed over when resuming", () => {
    const p = computeProgress({ workspace: "done", business: "done", product_url: "skipped", brand: "skipped" });
    expect(p.current).toBe("connection");
    expect(p.stages.find((s) => s.key === "brand")?.status).toBe("skipped");
  });

  it("is onboarded once every required stage is done, even with optional stages open", () => {
    const p = computeProgress({ workspace: "done", business: "done", preferences: "done" });
    expect(p.requiredComplete).toBe(true);
    expect(p.current).toBe("product_url");
  });

  it("reports progress as the share of settled stages", () => {
    expect(computeProgress({}).percent).toBe(11); // 1 of 9
    expect(computeProgress({ workspace: "done", business: "done", product_url: "skipped" }).percent).toBe(44); // 4 of 9
  });

  it("refuses to skip a required stage", () => {
    expect(canSkip("business", "not_started")).toMatchObject({ ok: false });
  });

  it("allows skipping an optional stage, but not one already done", () => {
    expect(canSkip("brand", "not_started")).toEqual({ ok: true });
    expect(canSkip("brand", "done")).toMatchObject({ ok: false });
  });

  it("recognises only known stage keys", () => {
    expect(isStageKey("brand")).toBe(true);
    expect(isStageKey("billing")).toBe(false);
  });
});

import { isValidTimeZone } from "@/lib/onboarding/stages";

describe("time zone validation (US-019)", () => {
  it("accepts IANA zones", () => {
    expect(isValidTimeZone("Africa/Nairobi")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("GMT+99")).toBe(false);
  });
});
