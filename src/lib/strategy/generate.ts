import { z } from "zod";
import { CHANNELS, CHANNEL_FORMATS, CHANNEL_META, type Channel } from "@/lib/formats";
import { extractJSON } from "@/lib/ai/provider";
import { renderPrompt, type PromptRef } from "@/lib/ai/prompts/registry";
import { strategyV1 } from "@/lib/ai/prompts/strategy.v1";

/**
 * Structured distribution strategy — US-042 (Workflow B).
 *
 * Pure: the caller supplies the profile facts, preferences, verified channel
 * capabilities and a model completer. Three rules keep the output honest:
 *
 * 1. Every channel recommendation cites facts from the approved profile by
 *    id, and every cited id must exist.
 * 2. The model never decides what a channel can do. Publishing and
 *    scheduling come from verified capabilities and overwrite whatever the
 *    model says, so an unverified provider is never assumed.
 * 3. KPIs are limited to what Banyan measures itself (first-party tracked
 *    visits, signups, activations, publications). No reach or impressions.
 *
 * When there is no live model, or its output fails validation twice, a
 * deterministic strategy built from the same facts is returned and labelled.
 */

export const KPI_METRICS = ["tracked_visits", "signups", "activations", "publications"] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export const KPI_LABEL: Record<KpiMetric, string> = {
  tracked_visits: "Tracked visits",
  signups: "Signups",
  activations: "Activated accounts",
  publications: "Publications",
};

export type PublishingMode = "socialflow" | "export" | "manual";

export type ChannelCapability = {
  channel: Channel;
  publishing: PublishingMode;
  /** True only when automated scheduling through the provider is verified. */
  scheduling: boolean;
};

export type ProfileFact = { id: string; label: string; text: string };

export type StrategyInput = {
  facts: ProfileFact[];
  objective: string;
  /** Channels the founder prefers; empty means any channel Banyan supports. */
  preferredChannels: Channel[];
  capabilities: ChannelCapability[];
  tone?: string;
};

/** The shape a model (or an edit) must produce before the rule checks. */
export const strategyDraftSchema = z.object({
  channels: z
    .array(
      z.object({
        channel: z.enum(CHANNELS),
        priority: z.number().int().min(1).max(3),
        rationale: z.string().min(20).max(600),
        formats: z.array(z.string()).min(1).max(4),
        cites: z.array(z.string()).min(1).max(6),
      }),
    )
    .min(1)
    .max(3),
  messaging_angles: z.array(z.object({ angle: z.string().min(5).max(200), example_hook: z.string().max(280).optional() })).min(1).max(5),
  objectives: z.array(z.string().min(5).max(200)).min(1).max(3),
  frequency: z.array(z.object({ channel: z.enum(CHANNELS), posts_per_week: z.number().int().min(1).max(7) })).min(1),
  kpis: z.array(z.object({ metric: z.enum(KPI_METRICS), target: z.number().int().min(1).max(1_000_000).nullable().optional(), why: z.string().max(200).optional() })).min(1).max(4),
  assumptions: z.array(z.string().max(300)).max(5).default([]),
});

export type StrategyChannel = {
  channel: Channel;
  priority: number;
  rationale: string;
  formats: string[];
  cites: string[];
  publishing: PublishingMode;
  scheduling: boolean;
};

export type StrategyBody = {
  channels: StrategyChannel[];
  messaging_angles: { angle: string; example_hook?: string }[];
  objectives: string[];
  frequency: { channel: Channel; posts_per_week: number }[];
  kpis: { metric: KpiMetric; target: number | null; why?: string; source: "first_party" }[];
  assumptions: string[];
  labelled_as: "hypothesis";
};

export type StrategyOutcome = {
  body: StrategyBody;
  method: "model" | "template";
  prompt: PromptRef | null;
  /** Why the model output was not used, when it was not. */
  fallbackReason: string | null;
};

export type StrategyCompleter = (args: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  prompt: PromptRef;
  attempt: number;
}) => Promise<{ text: string; live: boolean; report?: (schemaValid: boolean) => Promise<void> | void }>;

export class StrategyInputError extends Error {}

export function allowedChannels(input: Pick<StrategyInput, "preferredChannels" | "capabilities">): Channel[] {
  const capable = input.capabilities.map((c) => c.channel);
  const preferred = input.preferredChannels.filter((c) => capable.includes(c));
  return preferred.length > 0 ? preferred : capable;
}

/**
 * Check the model's draft against the rules the schema cannot express, and
 * attach verified capabilities. Returns the problems found, or the body.
 */
export function finalizeStrategy(draft: z.infer<typeof strategyDraftSchema>, input: StrategyInput): { ok: true; body: StrategyBody } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const allowed = allowedChannels(input);
  const factIds = new Set(input.facts.map((f) => f.id));
  const seen = new Set<Channel>();

  const channels: StrategyChannel[] = [];
  for (const c of draft.channels) {
    if (!allowed.includes(c.channel)) problems.push(`channel ${c.channel} is not available`);
    if (seen.has(c.channel)) problems.push(`channel ${c.channel} listed twice`);
    seen.add(c.channel);
    const validFormats = CHANNEL_FORMATS[c.channel].map((f) => f.key);
    const formats = c.formats.filter((f) => validFormats.includes(f));
    if (formats.length === 0) problems.push(`no valid format for ${c.channel}`);
    const unknown = c.cites.filter((id) => !factIds.has(id));
    if (unknown.length) problems.push(`${c.channel} cites unknown facts ${unknown.join(", ")}`);
    const cap = input.capabilities.find((x) => x.channel === c.channel);
    channels.push({
      channel: c.channel,
      priority: c.priority,
      rationale: c.rationale.trim(),
      formats,
      cites: c.cites,
      publishing: cap?.publishing ?? "export",
      scheduling: cap?.scheduling ?? false,
    });
  }
  const frequency = draft.frequency.filter((f) => seen.has(f.channel));
  for (const c of channels) if (!frequency.some((f) => f.channel === c.channel)) problems.push(`no frequency for ${c.channel}`);

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    body: {
      channels: channels.sort((a, b) => a.priority - b.priority),
      messaging_angles: draft.messaging_angles,
      objectives: draft.objectives,
      frequency,
      kpis: dedupeKpis(draft.kpis.map((k) => ({ metric: k.metric, target: k.target ?? null, why: k.why, source: "first_party" as const }))),
      assumptions: draft.assumptions,
      labelled_as: "hypothesis",
    },
  };
}

function dedupeKpis<T extends { metric: KpiMetric }>(kpis: T[]): T[] {
  return kpis.filter((k, i) => kpis.findIndex((x) => x.metric === k.metric) === i);
}

const fact = (input: StrategyInput, ...labels: string[]) => input.facts.find((f) => labels.includes(f.label));

/** Quote profile text instead of splicing it into a sentence it was not written for. */
const quote = (text: string) => `“${text.trim().replace(/[.\s]+$/, "").slice(0, 120)}”`;

/** A strategy built only from the facts, for when no model output is usable. */
export function templateStrategy(input: StrategyInput): StrategyBody {
  const channels = allowedChannels(input).filter((c) => c !== "shortvideo").slice(0, 2);
  const picked = channels.length > 0 ? channels : allowedChannels(input).slice(0, 1);
  const audience = fact(input, "Audience");
  const problem = fact(input, "Problem", "Audience pain");
  const value = fact(input, "Value proposition", "Description");
  const cites = [audience, problem, value].filter((f): f is ProfileFact => Boolean(f)).map((f) => f.id);

  return {
    channels: picked.map((channel, i) => {
      const cap = input.capabilities.find((c) => c.channel === channel);
      return {
        channel,
        priority: i + 1,
        rationale:
          channel === "linkedin"
            ? "Professional, text-first audience where a problem-first story can be told in full, with room for the reasoning behind it."
            : channel === "x"
              ? "Fast iteration: short posts and threads let each messaging angle be tested within days."
              : `${CHANNEL_META[channel].label} reaches the audience in the format it already uses.`,
        formats: CHANNEL_FORMATS[channel].slice(0, 2).map((f) => f.key),
        cites: cites.length ? cites : input.facts.slice(0, 1).map((f) => f.id),
        publishing: cap?.publishing ?? "export",
        scheduling: cap?.scheduling ?? false,
      };
    }),
    messaging_angles: [
      ...(problem ? [{ angle: `Lead with the problem: ${quote(problem.text)}` }] : []),
      ...(value ? [{ angle: `Show what changes: ${quote(value.text)}` }] : []),
      ...(!problem && !value ? [{ angle: "Lead with the problem the product solves, in the words customers use" }] : []),
    ],
    objectives: [input.objective || "Reach the first people who have this problem and learn which message brings them in"],
    frequency: picked.map((channel) => ({ channel, posts_per_week: channel === "x" ? 3 : 2 })),
    kpis: [
      { metric: "tracked_visits", target: null, why: "Shows which posts bring people to the product", source: "first_party" },
      { metric: "signups", target: null, why: "The outcome the posts exist for", source: "first_party" },
    ],
    assumptions: ["Targets are left empty until there is a first week of recorded data."],
    labelled_as: "hypothesis",
  };
}

export async function generateStrategy(input: StrategyInput, complete?: StrategyCompleter): Promise<StrategyOutcome> {
  if (input.facts.length === 0) throw new StrategyInputError("The product profile has no facts to build a strategy from.");
  if (allowedChannels(input).length === 0) throw new StrategyInputError("No channel is available to recommend.");

  let reason: string | null = complete ? null : "No model provider configured.";
  if (complete) {
    const prompt = renderPrompt(strategyV1, input);
    for (let attempt = 1; attempt <= 2; attempt++) {
      let res: Awaited<ReturnType<StrategyCompleter>>;
      try {
        res = await complete({ system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens, temperature: prompt.temperature, prompt: prompt.ref, attempt });
      } catch (err) {
        reason = `Model call failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`;
        continue;
      }
      if (!res.live) {
        reason = "No live model available.";
        break;
      }
      let valid = false;
      try {
        const parsed = strategyDraftSchema.safeParse(extractJSON(res.text));
        if (!parsed.success) {
          reason = `Model output did not match the strategy schema (${parsed.error.issues[0]?.path.join(".") || "root"}).`;
        } else {
          const checked = finalizeStrategy(parsed.data, input);
          if (checked.ok) {
            valid = true;
            return { body: checked.body, method: "model", prompt: prompt.ref, fallbackReason: null };
          }
          reason = `Model output broke a strategy rule: ${checked.problems[0]}.`;
        }
      } catch {
        reason = "Model output was not JSON.";
      } finally {
        await res.report?.(valid);
      }
    }
  }
  return { body: templateStrategy(input), method: "template", prompt: null, fallbackReason: reason };
}
