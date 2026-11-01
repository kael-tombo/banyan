import { describe, it, expect } from "vitest";
import { definePrompt, getPrompt, hasPrompt, listPrompts, promptKey, renderPrompt, UnknownPromptError } from "@/lib/ai/prompts";
import { analyzeProduct, PROMPT_VERSION, type Completer, type Fetcher } from "@/lib/product/analyze";

describe("prompt registry (US-045)", () => {
  it("registers product-analysis.v1 and uses it as the analysis version", () => {
    expect(hasPrompt({ name: "product-analysis", version: 1 })).toBe(true);
    expect(PROMPT_VERSION).toBe("product-analysis.v1");
    expect(listPrompts()).toContainEqual({ name: "product-analysis", version: 1 });
  });

  it("rejects an unknown version", () => {
    expect(() => getPrompt({ name: "product-analysis", version: 99 })).toThrow(UnknownPromptError);
  });

  it("refuses to change a shipped version", () => {
    const base = { name: "test-shipped", version: 1, description: "t", system: "A", build: () => "x", maxTokens: 10, temperature: 0 };
    definePrompt(base);
    expect(() => definePrompt(base)).not.toThrow(); // the same definition reloading is fine
    expect(() => definePrompt({ ...base, system: "B" })).toThrow(/add version 2/);
  });

  it("validates names and versions", () => {
    expect(() => definePrompt({ name: "Bad Name", version: 1, description: "", system: "", build: () => "", maxTokens: 1, temperature: 0 })).toThrow();
    expect(() => definePrompt({ name: "ok", version: 0, description: "", system: "", build: () => "", maxTokens: 1, temperature: 0 })).toThrow();
  });

  it("renders system, user and the reference together", () => {
    const def = definePrompt<{ who: string }>({ name: "test-render", version: 2, description: "", system: "S", build: ({ who }) => `hi ${who}`, maxTokens: 5, temperature: 0.1 });
    expect(renderPrompt(def, { who: "Ada" })).toEqual({ system: "S", user: "hi Ada", maxTokens: 5, temperature: 0.1, ref: { name: "test-render", version: 2 } });
    expect(promptKey(def)).toBe("test-render.v2");
  });
});

describe("analysis reports prompt, attempt and schema validity per call", () => {
  const page = `<!doctype html><html><head><title>Ledgerline</title></head><body><h1>Ledgerline</h1><p>Send invoices from anywhere, even offline. Built for freelancers who work on the move.</p></body></html>`;
  const fetcher: Fetcher = async () => ({ status: 200, headers: new Headers({ "content-type": "text/html" }), text: page, truncated: false });
  const valid = JSON.stringify({
    product_name: "Ledgerline", description: "Invoicing that works offline.", value_proposition: "Send invoices from anywhere.",
    features: [], target_audience: [], problems_solved: [], differentiators: [], missing_information: [], provenance: {},
  });

  it("marks the invalid first attempt and the valid retry", async () => {
    const calls: { attempt: number; prompt: string; valid?: boolean }[] = [];
    const complete: Completer = async ({ attempt, prompt }) => {
      const entry: { attempt: number; prompt: string; valid?: boolean } = { attempt, prompt: promptKey(prompt) };
      calls.push(entry);
      return { text: attempt === 1 ? '{"product_name": 42}' : valid, live: true, report: (v) => { entry.valid = v; } };
    };
    const out = await analyzeProduct("https://ledgerline.app", { fetch: fetcher, complete });
    expect(out.method).toBe("model");
    expect(calls).toEqual([
      { attempt: 1, prompt: "product-analysis.v1", valid: false },
      { attempt: 2, prompt: "product-analysis.v1", valid: true },
    ]);
  });

  it("reports unparseable output as invalid", async () => {
    const seen: boolean[] = [];
    const complete: Completer = async () => ({ text: "not json at all", live: true, report: (v) => { seen.push(v); } });
    const out = await analyzeProduct("https://ledgerline.app", { fetch: fetcher, complete });
    expect(out.method).toBe("basic");
    expect(seen).toEqual([false, false]);
  });
});
