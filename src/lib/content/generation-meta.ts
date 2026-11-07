/**
 * Who wrote a draft, stored on ContentItem.generationMeta. Written in one
 * shape by every path that drafts (agents, strategy, the editor's generate
 * button) and read back through `readGenerationMeta`, which also understands
 * the older shapes still in the database.
 */

export type GenerationMeta = {
  provider: string | null;
  /** Model id, e.g. "glm-5.3-flash"; null for the template. */
  model: string | null;
  isFallback: boolean;
  /** Human sentence, e.g. "Live model: glm-5.3-flash" or the fallback explanation. */
  label: string | null;
  generatedAt: string | null;
};

type Written = {
  provider: string;
  model?: string | null;
  isFallback: boolean;
  label: string;
};

/** JSON for ContentItem.generationMeta. `extra` keeps path-specific ids (taskId, strategyId, action). */
export function generationMetaJson(result: Written, extra: Record<string, string | null | undefined> = {}): string {
  return JSON.stringify({
    ...extra,
    provider: result.provider,
    model: result.isFallback ? null : result.model ?? null,
    isFallback: result.isFallback,
    label: result.label,
    generatedAt: new Date().toISOString(),
  });
}

const LABELISH = /\s|:/;

export function readGenerationMeta(raw: string | null | undefined): GenerationMeta {
  let m: Record<string, unknown> = {};
  try {
    const v: unknown = JSON.parse(raw || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) m = v as Record<string, unknown>;
  } catch {
    /* unreadable meta reads as "not generated" */
  }
  const str = (k: string) => (typeof m[k] === "string" && (m[k] as string).trim() ? (m[k] as string).trim() : null);
  const provider = str("provider");
  let model = str("model");
  // Older editor rows stored the label in `model`; older agent rows stored it in `note`.
  const misplaced = model && LABELISH.test(model) ? model : null;
  if (misplaced) model = null;
  const label = str("label") ?? str("note") ?? misplaced;
  if (!model && label) model = label.match(/^(?:Live model|Experimental brain \(OpenCode\)):\s*(\S+)/)?.[1] ?? null;
  const isFallback = m.isFallback === true || provider === "template-fallback";
  return { provider, model: isFallback ? null : model, isFallback, label, generatedAt: str("generatedAt") };
}

/** Short chip text for lists: which model wrote it, or that it is a template. */
export function generationChip(meta: GenerationMeta): { text: string; tone: "live" | "template" | "none" } {
  if (meta.isFallback) return { text: "Template draft", tone: "template" };
  if (meta.model) return { text: meta.model, tone: "live" };
  if (meta.provider) return { text: "Model draft", tone: "live" };
  return { text: "Written by hand", tone: "none" };
}
