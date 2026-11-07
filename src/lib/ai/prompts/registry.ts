/**
 * Prompt registry — US-045.
 *
 * Every prompt that reaches a model is defined once, under a name and an
 * integer version, in src/lib/ai/prompts/<name>.v<N>.ts. Changing a prompt's
 * wording means adding the next version, never editing a shipped one, so a
 * stored output can always be traced to the exact instructions that produced
 * it (ModelCall.promptName + promptVersion).
 *
 * Pure module: no database or provider imports, so it is unit-testable.
 */

export type PromptRef = { name: string; version: number };

export type PromptDefinition<Input> = PromptRef & {
  /** One line on what the prompt is for (shown on the usage page). */
  description: string;
  system: string;
  /** Builds the user message. Untrusted input must already be fenced. */
  build: (input: Input) => string;
  maxTokens: number;
  temperature: number;
};

export class UnknownPromptError extends Error {
  constructor(ref: PromptRef) {
    super(`Unknown prompt ${promptKey(ref)}`);
  }
}

const REGISTRY = new Map<string, PromptDefinition<never>>();

export const promptKey = (ref: PromptRef) => `${ref.name}.v${ref.version}`;

const NAME = /^[a-z][a-z0-9-]*$/;

export function definePrompt<Input>(def: PromptDefinition<Input>): PromptDefinition<Input> {
  if (!NAME.test(def.name)) throw new Error(`Prompt name "${def.name}" must be lower-case kebab-case`);
  if (!Number.isInteger(def.version) || def.version < 1) throw new Error(`Prompt ${def.name} needs a positive integer version`);
  const key = promptKey(def);
  const existing = REGISTRY.get(key);
  // Re-registering the very same definition (module reload) is fine; a
  // different definition under a shipped version is not.
  if (existing && (existing.system !== def.system || existing.build.toString() !== def.build.toString())) {
    throw new Error(`Prompt ${key} is already defined with different content; add version ${def.version + 1} instead`);
  }
  REGISTRY.set(key, def as PromptDefinition<never>);
  return def;
}

export function getPrompt<Input = unknown>(ref: PromptRef): PromptDefinition<Input> {
  const def = REGISTRY.get(promptKey(ref));
  if (!def) throw new UnknownPromptError(ref);
  return def as unknown as PromptDefinition<Input>;
}

export function hasPrompt(ref: PromptRef): boolean {
  return REGISTRY.has(promptKey(ref));
}

export function listPrompts(): PromptRef[] {
  return [...REGISTRY.values()].map(({ name, version }) => ({ name, version })).sort((a, b) => a.name.localeCompare(b.name) || a.version - b.version);
}

/** Render a prompt into the system/user pair a provider takes. */
export function renderPrompt<Input>(def: PromptDefinition<Input>, input: Input) {
  return { system: def.system, user: def.build(input), maxTokens: def.maxTokens, temperature: def.temperature, ref: { name: def.name, version: def.version } };
}
