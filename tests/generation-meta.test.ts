import { describe, it, expect } from "vitest";
import { generationChip, generationMetaJson, readGenerationMeta } from "@/lib/content/generation-meta";

describe("generation meta", () => {
  it("round-trips a live draft with its model and keeps path ids", () => {
    const raw = generationMetaJson({ provider: "openai-compat", model: "glm-5.3-flash", isFallback: false, label: "Live model: glm-5.3-flash" }, { taskId: "t1" });
    expect(JSON.parse(raw).taskId).toBe("t1");
    const m = readGenerationMeta(raw);
    expect(m).toMatchObject({ provider: "openai-compat", model: "glm-5.3-flash", isFallback: false, label: "Live model: glm-5.3-flash" });
    expect(m.generatedAt).toMatch(/^\d{4}-/);
    expect(generationChip(m)).toEqual({ text: "glm-5.3-flash", tone: "live" });
  });

  it("never names a model for the template", () => {
    const m = readGenerationMeta(generationMetaJson({ provider: "template-fallback", model: "banyan-template-1", isFallback: true, label: "Development fallback" }));
    expect(m.model).toBeNull();
    expect(generationChip(m)).toEqual({ text: "Template draft", tone: "template" });
  });

  it("reads older agent rows that kept the label in `note`", () => {
    const m = readGenerationMeta(JSON.stringify({ provider: "openai-compat", isFallback: false, note: "Live model: gpt-4o-mini", taskId: "x" }));
    expect(m.label).toBe("Live model: gpt-4o-mini");
    expect(m.model).toBe("gpt-4o-mini");
  });

  it("reads older editor rows that put the label in `model`", () => {
    const m = readGenerationMeta(JSON.stringify({ provider: "opencode-session", model: "Experimental brain (OpenCode): opencode/glm-5.3-flash", isFallback: false }));
    expect(m.label).toBe("Experimental brain (OpenCode): opencode/glm-5.3-flash");
    expect(m.model).toBe("opencode/glm-5.3-flash");
  });

  it("treats empty or broken meta as written by hand", () => {
    for (const raw of ["{}", "", null, "not json", "[]"]) {
      expect(generationChip(readGenerationMeta(raw))).toEqual({ text: "Written by hand", tone: "none" });
    }
  });
});
