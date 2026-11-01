import { describe, it, expect } from "vitest";
import { bannedTerms, findBannedTerms, formatThread, chunkText, checkDraft, X_POST_LIMIT } from "@/lib/content/checks";
import { planDrafts, MAX_DRAFTS_PER_RUN } from "@/lib/content/plan";
import type { StrategyBody } from "@/lib/strategy/generate";

describe("banned terms (US-044)", () => {
  it("reads the brand voice avoid list", () => {
    expect(bannedTerms("Guaranteed, revolutionary;  10x\nAI-powered, a, guaranteed")).toEqual(["guaranteed", "revolutionary", "10x", "ai-powered"]);
    expect(bannedTerms(undefined)).toEqual([]);
  });

  it("matches whole words only, case-insensitively", () => {
    expect(findBannedTerms("Free for one client.", ["free"])).toEqual(["free"]);
    expect(findBannedTerms("Built for freelancers.", ["free"])).toEqual([]);
    expect(findBannedTerms("Our AI-Powered invoices", ["ai-powered"])).toEqual(["ai-powered"]);
    expect(findBannedTerms("10x faster? No.", ["10x"])).toEqual(["10x"]);
  });

  it("flags banned terms before review", () => {
    const flags = checkDraft({ channel: "linkedin", format: "insight", body: "Guaranteed results for every freelancer.", banned: ["guaranteed"] });
    expect(flags).toEqual([{ code: "banned_term", term: "guaranteed", message: 'Contains "guaranteed", which your brand voice says to avoid.' }]);
  });
});

describe("platform formatting", () => {
  const long = "Freelancers lose days of cash flow when they cannot send an invoice without signal. ".repeat(6).trim();

  it("splits an over-long thread post into numbered posts within the limit", () => {
    const thread = formatThread(`1/ ${long}\n\n2/ Ledgerline sends it the moment you are back online.`);
    const posts = thread.split("\n\n");
    expect(posts.length).toBeGreaterThan(2);
    expect(posts.every((p, i) => p.startsWith(`${i + 1}/ `) && p.length <= X_POST_LIMIT)).toBe(true);
    expect(checkDraft({ channel: "x", format: "thread", body: thread, banned: [] })).toEqual([]);
  });

  it("flags a single X post over 280 instead of cutting it", () => {
    const flags = checkDraft({ channel: "x", format: "single", body: long, banned: [] });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "over_limit", limit: 280 });
  });

  it("breaks a sentence with no punctuation at word boundaries", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(words, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(" ")).toBe(words);
  });
});

describe("draft plan from an approved strategy", () => {
  const body: StrategyBody = {
    channels: [
      { channel: "x", priority: 2, rationale: "r".repeat(20), formats: ["thread", "single"], cites: ["F1"], publishing: "export", scheduling: false },
      { channel: "linkedin", priority: 1, rationale: "r".repeat(20), formats: ["insight", "not_a_format"], cites: ["F1"], publishing: "export", scheduling: false },
    ],
    messaging_angles: [{ angle: "Get paid without Wi-Fi" }, { angle: "Invoices that wait for no one" }],
    objectives: ["o"],
    frequency: [],
    kpis: [],
    assumptions: [],
    labelled_as: "hypothesis",
  };

  it("writes one draft per channel and valid format, priority first, angles round-robin", () => {
    expect(planDrafts(body)).toEqual([
      { channel: "linkedin", format: "insight", angle: "Get paid without Wi-Fi" },
      { channel: "x", format: "thread", angle: "Invoices that wait for no one" },
      { channel: "x", format: "single", angle: "Get paid without Wi-Fi" },
    ]);
  });

  it("caps a run", () => {
    expect(planDrafts(body, 2)).toHaveLength(2);
    expect(MAX_DRAFTS_PER_RUN).toBe(6);
  });
});
