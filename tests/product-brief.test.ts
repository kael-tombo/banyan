import { describe, expect, it } from "vitest";
import {
  bestProvenance,
  buildBriefCards,
  computeBriefCompleteness,
  buildEvidenceRows,
} from "../src/lib/product-brief";

const emptyProfile = {
  name: null,
  description: null,
  problem: null,
  valueProp: null,
  audience: null,
  market: null,
  positioning: null,
  goal: null,
};

describe("bestProvenance", () => {
  it("ranks verified above everything", () => {
    expect(bestProvenance(["hypothesis", "user_provided", "external_observation", "verified"])).toBe("verified");
  });

  it("degrades unknown provenance to hypothesis", () => {
    expect(bestProvenance(["mystery"])).toBe("hypothesis");
    expect(bestProvenance([])).toBe("hypothesis");
  });
});

describe("buildBriefCards", () => {
  it("cards backed only by profile-form data carry founder-input provenance", () => {
    const cards = buildBriefCards({ ...emptyProfile, name: "Acme", description: "Support copilot", problem: "Slow replies" }, []);
    const definition = cards.find((c) => c.key === "definition");
    expect(definition?.value).toBe("Acme — Support copilot");
    expect(definition?.provenance).toBe("user_provided");
    expect(definition?.sources).toBe(0);
  });

  it("verified facts outrank the profile form and are counted as sources", () => {
    const facts = [
      { category: "audience", value: "Shopify support leads", provenance: "user_provided" },
      { category: "audience", value: "Shopify support leads (2-20 agents)", provenance: "verified" },
    ];
    const cards = buildBriefCards({ ...emptyProfile, audience: "Something stale" }, facts);
    const customer = cards.find((c) => c.key === "customer");
    expect(customer?.provenance).toBe("verified");
    expect(customer?.sources).toBe(2);
  });

  it("proof points stay null until a metric or research fact is recorded — never invented", () => {
    const cards = buildBriefCards({ ...emptyProfile, valueProp: "Faster replies" }, []);
    const proof = cards.find((c) => c.key === "proof");
    expect(proof?.value).toBeNull();
    expect(proof?.provenance).toBe("hypothesis");

    const withProof = buildBriefCards(emptyProfile, [
      { category: "metric", value: "28% lower median response time (pilot, n=3)", provenance: "user_provided" },
    ]);
    expect(withProof.find((c) => c.key === "proof")?.value).toContain("28%");
  });

  it("alternatives join competitor facts", () => {
    const cards = buildBriefCards(emptyProfile, [
      { category: "competitor", value: "Gorgias macros", provenance: "verified" },
      { category: "competitor", value: "General AI assistants", provenance: "external_observation" },
    ]);
    expect(cards.find((c) => c.key === "alternatives")?.value).toBe("Gorgias macros · General AI assistants");
  });
});

describe("computeBriefCompleteness", () => {
  it("counts the profile sections plus one audience-insights unit", () => {
    const result = computeBriefCompleteness({
      profileValues: ["a", "b", "c", null, null, null, null, null],
      audienceInsightCount: 1,
      facts: [],
    });
    expect(result.totalUnits).toBe(9);
    expect(result.filledUnits).toBe(4);
    expect(result.percent).toBe(44);
  });

  it("counts hypothesis facts as items to validate and verified facts separately", () => {
    const result = computeBriefCompleteness({
      profileValues: [],
      audienceInsightCount: 0,
      facts: [{ provenance: "hypothesis" }, { provenance: "hypothesis" }, { provenance: "verified" }],
    });
    expect(result.assumptionsToValidate).toBe(2);
    expect(result.verifiedCount).toBe(1);
  });

  it("ignores whitespace-only values", () => {
    const result = computeBriefCompleteness({ profileValues: ["   "], audienceInsightCount: 0, facts: [] });
    expect(result.filledUnits).toBe(0);
  });
});

describe("buildEvidenceRows", () => {
  it("maps fact provenance to the right next step", () => {
    const rows = buildEvidenceRows(
      [
        { id: "1", category: "metric", value: "Conversion is 4.2%", provenance: "hypothesis", confidence: "high" },
        { id: "2", category: "product", value: "Support teams repeat lookups", provenance: "verified", source: "5 interviews" },
      ],
      [],
    );
    const assumption = rows.find((r) => r.key === "fact-1");
    expect(assumption?.nextStep?.label).toBe("Validate");
    expect(assumption?.confidence).toBe("high");
    const verified = rows.find((r) => r.key === "fact-2");
    expect(verified?.nextStep).toBeNull();
    expect(verified?.source).toBe("5 interviews");
  });

  it("maps audience-insight sources into the same status vocabulary", () => {
    const rows = buildEvidenceRows([], [
      { id: "i1", title: "Agencies may refer clients", source: "assumption", confidence: "low" },
      { id: "i2", title: "Leads search for automation", source: "research", confidence: "medium" },
    ]);
    expect(rows.find((r) => r.key === "insight-i1")?.status).toBe("hypothesis");
    expect(rows.find((r) => r.key === "insight-i2")?.status).toBe("external_observation");
  });
});
