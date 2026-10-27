import { z } from "zod";
import { completeValidated, AIError, extractJSON } from "@/lib/ai/provider";
import { CHANNEL_META, isChannel, isFormatFor, type Channel } from "@/lib/formats";

export const videoExtrasSchema = z.object({
  hook: z.string().min(3),
  script: z.string().min(20),
  scenes: z.array(z.object({ scene: z.string().min(1), visual: z.string().min(1) })).min(1).max(12),
  onScreenText: z.string().default(""),
  caption: z.string().default(""),
  cta: z.string().default(""),
});

export type VideoExtras = z.infer<typeof videoExtrasSchema>;

export const PLAN_SCHEMA = z.object({
  positioning: z.string().min(10).max(500),
  contentThemes: z.array(z.string().min(5).max(120)).min(3).max(3),
  channelFocus: z.array(z.enum(["x", "linkedin", "shortvideo"])).min(1).max(3),
  initialCampaign: z.object({
    name: z.string().min(3).max(80),
    keyMessage: z.string().min(10).max(300),
    cta: z.string().min(3).max(120),
  }),
  experiments: z.array(
    z.object({
      title: z.string().min(3).max(100),
      hypothesis: z.string().min(10).max(400),
      variable: z.string().min(3).max(200),
    })
  ).min(1).max(3),
  assumptions: z.array(z.string()).default([]),
});

export type DraftPlan = z.infer<typeof PLAN_SCHEMA>;

export async function generateDraftPlan(input: {
  productName: string;
  productDescription: string;
  problem: string;
  valueProp: string;
  stage: string;
  audience: string;
  audiencePain: string;
  audienceOutcome: string;
  goal: string;
  goalTarget?: number | null;
  channels: string[];
}): Promise<{ plan: DraftPlan; provider: string; isFallback: boolean; label: string }> {
  const system = [
    "You are Banyan.ai's distribution strategist. You produce honest, evidence-respecting plans.",
    "Every suggestion MUST be framed as a hypothesis to test — the product has no invented research data.",
    "Never fabricate metrics, competitors' results, or market statistics.",
    'Respond with ONLY a JSON object matching: {"positioning": string, "contentThemes": [string x3], "channelFocus": [channel keys], "initialCampaign": {"name", "keyMessage", "cta"}, "experiments": [{"title","hypothesis","variable"}], "assumptions": [string]}',
    'channelFocus keys: "x", "linkedin", "shortvideo".',
  ].join("\n");

  const user = [
    `Product: ${input.productName}`,
    `Description: ${input.productDescription}`,
    `Problem solved: ${input.problem}`,
    `Value proposition: ${input.valueProp}`,
    `Stage: ${input.stage}`,
    `Target audience: ${input.audience}`,
    `Audience pain point: ${input.audiencePain}`,
    `Desired customer outcome: ${input.audienceOutcome}`,
    `Distribution goal: ${input.goal}${input.goalTarget ? ` (target: ${input.goalTarget})` : ""}`,
    `Selected channels: ${input.channels.join(", ")}`,
  ].join("\n");

  try {
    const { data, usage } = await completeValidated<string>({
      system,
      user,
      maxTokens: 1200,
      temperature: 0.6,
      schema: z.string(),
    });
    const plan = PLAN_SCHEMA.parse(extractJSON(data));
    return { plan, provider: usage.provider, isFallback: usage.isFallback, label: usage.label };
  } catch {
    // Live provider missing, malformed, or failed: fall back to a clearly
    // labeled template plan rather than silently pretending it was generated.
    return { plan: templatePlan(input), provider: "template-fallback", isFallback: true, label: "Template fallback (no usable model response)" };
  }
}

function templatePlan(input: { productName: string; audience: string; audiencePain: string; goal: string; channels: string[] }): DraftPlan {
  const focus = (input.channels.length ? input.channels : ["x", "linkedin"]).filter(isChannel).slice(0, 3);
  return {
    positioning: `Hypothesis: ${input.audience || "our audience"} needs a clearer path from "${input.audiencePain || "their current pain"}" to a working outcome, and ${input.productName} is positioned as the ${input.goal === "first_users" ? "easiest way to get started" : "practical way to get there"}. Validate this wording with real conversations before committing.`,
    contentThemes: [
      `Hypothesis theme: the problem ${input.audience || "our audience"} struggles with most`,
      `Hypothesis theme: how ${input.productName} works in practice (build in public)`,
      `Hypothesis theme: small experiments and honest results from early distribution`,
    ],
    channelFocus: focus,
    initialCampaign: {
      name: `First wave: ${input.audience || "early users"}`,
      keyMessage: `Hypothesis: "${input.productName}" helps ${input.audience || "our audience"} overcome "${input.audiencePain || "their blocker"}" so they can ${input.goal.replace(/_/g, " ")}.`,
      cta: "Try the product and tell us what's missing",
    },
    experiments: [
      {
        title: "Problem-first vs product-first openings",
        hypothesis: "Hypothesis: posts that open with the audience's problem get more engagement than posts that open with the product.",
        variable: "Opening angle (problem vs product)",
      },
    ],
    assumptions: [
      `Assumption: ${input.audience || "our audience"} is reachable on the selected channels.`,
      `Assumption: the stated pain (${input.audiencePain || "unvalidated"}) is the one worth leading with — confirm in real conversations.`,
      "Assumption: this plan is a hypothesis-driven starting point, not a validated strategy.",
    ],
  };
}

// --- Content generation ---

export type ContentGenRequest = {
  channel: Channel;
  format: string;
  campaign?: {
    name: string;
    objective: string;
    targetAudience: string;
    keyMessage: string;
    evidence: string;
    cta: string;
  } | null;
  profile: {
    name: string;
    description: string;
    valueProp: string;
    audience: string;
    positioning?: string;
  };
  brandVoice: {
    tone?: string;
    language?: string;
    themes?: string;
    avoid?: string;
    cta?: string;
  };
  instruction?: string; // for improve-hook / shorten / change-tone / adapt operations
};

export async function generateContent(req: ContentGenRequest): Promise<{ body: string; videoExtras?: VideoExtras; provider: string; isFallback: boolean; label: string }> {
  if (!isFormatFor(req.channel, req.format)) {
    throw new AIError(`Format "${req.format}" is not valid for channel "${req.channel}".`);
  }
  const meta = CHANNEL_META[req.channel];
  const system = [
    "You are Banyan.ai's content drafting assistant. You draft channel-appropriate content for founders.",
    "Rules:",
    "- Use ONLY the facts provided. Do not invent testimonials, metrics, traction, or research.",
    "- Respect any topics to avoid.",
    "- Write in the requested language.",
    "- Never claim results that were not given to you.",
    req.channel === "shortvideo"
      ? 'Respond with ONLY JSON: {"hook": string (first 3 seconds line), "script": string (full spoken script), "scenes": [{"scene": string, "visual": string}], "onScreenText": string, "caption": string, "cta": string}. On-screen text is the text overlay. Caption is the accompanying post caption.'
      : "Respond with ONLY the post text. No meta commentary, no titles, no markdown headings.",
  ].join("\n");

  const context = [
    `Product: ${req.profile.name} — ${req.profile.description}`,
    req.profile.valueProp ? `Value proposition: ${req.profile.valueProp}` : "",
    req.profile.positioning ? `Positioning: ${req.profile.positioning}` : "",
    `Audience: ${req.profile.audience}`,
    req.campaign ? `Campaign: ${req.campaign.name} (objective: ${req.campaign.objective})` : "",
    req.campaign?.targetAudience ? `Campaign audience: ${req.campaign.targetAudience}` : "",
    req.campaign?.keyMessage ? `Key message: ${req.campaign.keyMessage}` : "",
    req.campaign?.evidence ? `Supporting evidence (the only claims allowed): ${req.campaign.evidence}` : "",
    `Call to action: ${req.brandVoice.cta || req.campaign?.cta || "Try the product"}`,
    `Brand voice — tone: ${req.brandVoice.tone || "direct, plain-spoken"}, language: ${req.brandVoice.language || "English"}`,
    req.brandVoice.themes ? `Content themes: ${req.brandVoice.themes}` : "",
    req.brandVoice.avoid ? `Topics to avoid: ${req.brandVoice.avoid}` : "",
    `Channel: ${meta.label}; format: ${req.format}`,
    req.instruction ? `Special instruction: ${req.instruction}` : "",
  ].filter(Boolean).join("\n");

  const { data, usage } = await completeValidated<string>({
    system,
    user: context,
    maxTokens: req.channel === "shortvideo" ? 1600 : 800,
    temperature: 0.8,
    // Structured output validated against the catalog: output must be
    // non-empty, within channel limits, and correct JSON shape for video.
    schema: z.string(),
  });

  if (req.channel === "shortvideo") {
    const extras = videoExtrasSchema.parse(extractJSON(data));
    return { body: extras.script, videoExtras: extras, provider: usage.provider, isFallback: usage.isFallback, label: usage.label };
  }
  // Plain-posts channel validation: enforce channel length limits server-side.
  let body = data.trim();
  const limit = req.channel === "x" ? 280 : 3000;
  if (req.format === "thread" && req.channel === "x") {
    // Threads keep full text (numbered posts validated below in UI rendering)
    body = data.trim().slice(0, 10_000);
  } else if (body.length > limit * (req.channel === "x" ? 4 : 1)) {
    body = body.slice(0, limit * (req.channel === "x" ? 10 : 1));
  }
  if (!body) throw new AIError("Model returned empty content. Please regenerate.");
  return { body, provider: usage.provider, isFallback: usage.isFallback, label: usage.label };
}

/** JSON-safety wrapper used by plan generation. */
export { extractJSON };
