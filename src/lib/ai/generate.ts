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

/** The subset of generation context needed to build a grounded video skeleton. */
type VideoContext = {
  profile: { name: string; description: string; valueProp: string; audience: string; positioning?: string };
  brandVoice: { cta?: string };
  campaign?: { cta?: string } | null;
};

function firstSentence(text: string): string {
  const line = text.split("\n").map((s) => s.trim()).find(Boolean) ?? text;
  const sentence = line.match(/^[^.!?]{3,}[.!?]?/)?.[0] ?? line;
  return sentence.trim();
}

/** A context-grounded skeleton — never invents claims, metrics or testimonials. */
function contextVideo(ctx: VideoContext): VideoExtras {
  const product = ctx.profile.name.trim() || "The product";
  const audience = ctx.profile.audience.trim() || "your audience";
  const problem = (ctx.profile.valueProp || ctx.profile.description || `${product} in one minute`).trim();
  const description = ctx.profile.description.trim();
  const cta = (ctx.brandVoice.cta || ctx.campaign?.cta || `Try ${product}`).trim();
  const hook = `A quick look at ${product} for ${audience}`.slice(0, 120);
  const script = [
    `If you're ${audience}, ${problem}`,
    description && description !== problem ? description : "",
    `That is what ${product} is for.`,
    cta,
  ].filter(Boolean).join(" ").slice(0, 6000);
  const safeScript = script.length >= 20 ? script : `${product} is built for ${audience}. ${cta}`;
  const sentences = safeScript.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const scenes = (sentences.length > 1 ? sentences.slice(1, 4) : [safeScript]).map((scene, i) => ({
    scene: scene.slice(0, 240),
    visual: i === 0 ? "Founder to camera or a product screen" : "Product screen or simple b-roll",
  }));
  return {
    hook: hook.length >= 3 ? hook : `A quick look at ${product}`,
    script: safeScript,
    scenes: scenes.length ? scenes : [{ scene: safeScript.slice(0, 240), visual: "Product screen" }],
    onScreenText: hook.slice(0, 120),
    caption: `${hook} ${cta}`.slice(0, 300),
    cta: cta.slice(0, 120),
  };
}

/**
 * Coerce model output into a valid video asset. Valid JSON is used directly;
 * prose is structured into scenes; an unusable response falls back to a
 * labeled, context-grounded skeleton. This prevents a malformed video response
 * from exhausting retries and blocking the whole distribution cycle.
 */
export function normalizeVideoExtras(
  raw: string,
  ctx: VideoContext,
  opts: { fallback: boolean }
): { extras: VideoExtras; mode: "json" | "prose" | "template" } {
  let parsed: unknown = null;
  try {
    parsed = extractJSON(raw);
  } catch {
    parsed = null;
  }

  const direct = videoExtrasSchema.safeParse(parsed);
  if (direct.success) return { extras: direct.data, mode: "json" };

  // A JSON object with a usable script but incomplete structure: keep the
  // model's words and supply the missing scene structure.
  const looseScript =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { script?: unknown }).script
      : null;
  const prose = typeof raw === "string" ? raw.trim() : "";
  const modelText =
    typeof looseScript === "string" && looseScript.trim().length >= 20
      ? looseScript.trim()
      : !opts.fallback && prose.length >= 20 && !prose.startsWith("{")
        ? prose
        : "";

  if (modelText) {
    const template = contextVideo(ctx);
    const hook = firstSentence(modelText).slice(0, 120);
    const sentences = modelText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const scenes = (sentences.length > 1 ? sentences.slice(0, 4) : [modelText]).map((scene, i) => ({
      scene: scene.slice(0, 240),
      visual: i === 0 ? "Founder to camera or product screen" : "Product screen or simple b-roll",
    }));
    return {
      extras: {
        hook: hook.length >= 3 ? hook : template.hook,
        script: modelText.slice(0, 6000),
        scenes: scenes.length ? scenes : template.scenes,
        onScreenText: (hook.length >= 3 ? hook : template.hook).slice(0, 120),
        caption: `${hook} ${template.cta}`.slice(0, 300),
        cta: template.cta,
      },
      mode: "prose",
    };
  }

  return { extras: contextVideo(ctx), mode: "template" };
}

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
  /** Concluded-experiment lines from priorLearningLines — the loop's memory. */
  learning?: string[];
  instruction?: string; // for improve-hook / shorten / change-tone / adapt operations
  /** The approved strategy's messaging angle this draft serves (US-044). */
  angle?: string;
};

function clipAtWord(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, Math.max(0, limit - 1)).replace(/\s+\S*$/, "").trim();
  return `${cut || clean.slice(0, Math.max(0, limit - 1))}…`;
}

/**
 * A context-grounded post for the no-credentials fallback. It uses only the
 * founder-provided profile and campaign fields (plus recorded campaign
 * evidence, when present) — never invented testimonials, metrics or traction.
 */
export function buildContextPost(req: ContentGenRequest): string {
  const product = req.profile.name.trim() || "Our product";
  const audience = req.profile.audience.trim() || "the people we build for";
  const value = req.profile.valueProp.trim() || req.profile.description.trim() || `${product} for ${audience}`;
  const description = req.profile.description.trim();
  const keyMessage = req.campaign?.keyMessage?.trim() || description;
  const evidence = req.campaign?.evidence?.trim();
  const cta = (req.brandVoice.cta || req.campaign?.cta || `Try ${product}`).trim();
  const lead = `${audience}: ${value}`;

  if (req.channel === "x" && req.format === "single") {
    const suffix = `\n\n${clipAtWord(cta, 80)}`;
    const hook = clipAtWord(lead, Math.max(40, 280 - suffix.length));
    return `${hook}${suffix}`.slice(0, 280);
  }

  if (req.channel === "x" && req.format === "thread") {
    const posts = [
      lead,
      keyMessage && keyMessage !== value ? keyMessage : "",
      evidence ? `What we can stand behind: ${evidence}` : "",
      cta,
    ].filter(Boolean);
    return posts.map((post, i) => `${i + 1}/ ${clipAtWord(post, 250)}`).join("\n\n").slice(0, 10_000);
  }

  const lines = [
    lead,
    keyMessage && keyMessage !== value ? keyMessage : "",
    evidence ? `What we can stand behind: ${evidence}` : "",
    `If that is the problem you are working on, ${cta}.`,
  ].filter(Boolean);
  return clipAtWord(lines.join("\n\n"), 3000);
}

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
    ...(req.learning && req.learning.length > 0
      ? [
          "Prior learning from concluded experiments in this workspace (recorded conclusions, not proof — apply the lesson, never restate an inconclusive result as a win):",
          ...req.learning.map((line) => `- ${line}`),
        ]
      : []),
    req.angle ? `Messaging angle this post serves (from the approved strategy): ${req.angle}` : "",
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
    const normalized = normalizeVideoExtras(data, req, { fallback: usage.isFallback });
    const label =
      usage.isFallback
        ? "Development fallback: context-built video skeleton (no model credentials). Edit before use."
        : normalized.mode === "json"
          ? usage.label
          : normalized.mode === "prose"
            ? "Model returned prose; adapted into a video script for review."
            : "Model returned unusable JSON; context-built video skeleton for review.";
    return {
      body: normalized.extras.script,
      videoExtras: normalized.extras,
      provider: usage.provider,
      isFallback: usage.isFallback || normalized.mode === "template",
      label,
    };
  }
  // Plain-posts channel validation: enforce channel length limits server-side.
  const trimmed = data.trim();
  const isTemplate = usage.isFallback || /^TEMPLATE DRAFT/i.test(trimmed);
  if (isTemplate || !trimmed) {
    return {
      body: buildContextPost(req),
      provider: usage.provider,
      isFallback: true,
      label: isTemplate
        ? "Development fallback: context-built post from your profile and campaign (no model credentials). Edit before use."
        : "Model returned empty content; context-built post for review.",
    };
  }
  let body = trimmed;
  const limit = req.channel === "x" ? 280 : 3000;
  if (req.format === "thread" && req.channel === "x") {
    // Threads keep full text (numbered posts validated below in UI rendering)
    body = trimmed.slice(0, 10_000);
  } else if (body.length > limit * (req.channel === "x" ? 4 : 1)) {
    body = body.slice(0, limit * (req.channel === "x" ? 10 : 1));
  }
  return { body, provider: usage.provider, isFallback: usage.isFallback, label: usage.label };
}

/** JSON-safety wrapper used by plan generation. */
export { extractJSON };
