/**
 * Onboarding 360°: the market scan that follows the site read.
 *
 *   1. Competitor candidates: named on the founder's site, plus (with a model)
 *      suggestions. Each one is checked by reading its own home page.
 *   2. Conversations: recent, well-discussed Hacker News threads (and Stack
 *      Overflow questions for developer products) about the category.
 *   3. Lead signals: public comments where someone asks for a tool like this,
 *      wants an alternative to a competitor, or complains about one.
 *   4. Opportunities: what to do first, each citing the evidence above. With
 *      a model they are written against numbered evidence (and dropped if they
 *      cite none); without one, a fixed set of rules produces them.
 *
 * Everything external is best-effort and labelled: a source that fails is
 * reported as unavailable, never filled in. Fetchers and the model are
 * injected, so the whole scan is unit-tested offline.
 */

import { z } from "zod";
import type { SafeFetchResult } from "@/lib/net/safe-fetch";
import { extractJSON } from "@/lib/ai/provider";
import { promptKey, renderPrompt } from "@/lib/ai/prompts/registry";
import { marketScanV1 } from "@/lib/ai/prompts/market-scan.v1";
import { marketOpportunitiesV1 } from "@/lib/ai/prompts/market-opportunities.v1";
import type { Completer, ProductAnalysisResult } from "@/lib/product/analyze";
import { dedupeCandidates, readCompetitor, type CompetitorCandidate } from "./competitors";
import {
  hnCommentsUrl, hnStoriesUrl, parseHnLeads, parseHnStories, parseSoQuestions, soSearchUrl, titleRelevance, type JsonFetcher,
} from "./sources";
import type { Competitor, Conversation, LeadSignal, MarketResearch, Opportunity } from "./types";

export const SCAN_PROMPT_VERSION = promptKey(marketScanV1);
export const OPPORTUNITY_PROMPT_VERSION = promptKey(marketOpportunitiesV1);

const scanSchema = z.object({
  competitors: z
    .array(z.object({ name: z.string().trim().min(1).max(80), domain: z.string().trim().max(120).default(""), reason: z.string().trim().max(400).default("") }))
    .default([])
    .transform((a) => a.slice(0, 6)),
  search_queries: z.array(z.string().trim().min(2).max(60)).default([]).transform((a) => a.slice(0, 5)),
  developer_audience: z.boolean().default(false),
});

const opportunitiesSchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(140),
        rationale: z.string().trim().min(10).max(600),
        first_step: z.string().trim().max(300).default(""),
        kind: z.enum(["conversation", "competitor_gap", "positioning", "proof", "channel", "content"]).catch("content"),
        evidence_ids: z.array(z.string()).default([]),
        confidence: z.enum(["low", "medium", "high"]).catch("low"),
      }),
    )
    .default([]),
});

export type MarketDeps = {
  fetchPage: (url: string) => Promise<SafeFetchResult>;
  fetchJson: JsonFetcher;
  complete?: Completer;
};

const STOP_WORDS = new Set(["the", "and", "for", "with", "your", "you", "our", "that", "this", "from", "into", "every", "all", "more", "less", "best", "way", "who", "what", "are", "is", "a", "an", "to", "of", "in", "on", "it", "its", "be", "can"]);

/** Without a model: search terms from the category, tagline and first features. */
export function basicQueries(a: ProductAnalysisResult): string[] {
  const out: string[] = [];
  const own = a.product_name.toLowerCase();
  // Two words at most: without a model, a thread title must contain every word.
  const add = (s: string) => {
    const words = s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !FILLER.has(w) && !own.includes(w));
    const q = words.slice(0, 2).join(" ");
    if (q.length >= 4 && !out.includes(q)) out.push(q);
  };
  // Structured-data categories ("BusinessApplication") say little; prefer words.
  if (a.category && /\s/.test(a.category)) add(a.category);
  // Short feature names ("Booking pages", "Round robin") are the words people search.
  for (const f of a.features.filter((x) => x.split(/\s+/).length <= 3).slice(0, 3)) add(f);
  // A long hero line is where screenshot text hides ("Intro call 30m Booked 12:30 AM").
  if (a.tagline && a.tagline.split(/\s+/).length <= 8) add(a.tagline);
  return out.slice(0, 3);
}

const looksDeveloper = (a: ProductAnalysisResult) =>
  /\b(developers?|engineers?|api|sdk|cli|open[- ]source|devops|github)\b/i.test([a.category, a.description, a.target_audience.join(" ")].join(" "));

const FILLER = new Set(["software", "tool", "tools", "app", "apps", "platform", "solution", "solutions", "service", "online", "best", "saas", "simple", "alternative", "system", "free"]);

/** Drop filler words that no thread title contains. */
export function cleanQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/["']/g, "")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(" ")
    .trim();
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await p };
  } catch {
    return { ok: false };
  }
}

export type ResearchOverrides = {
  /** The founder's own search terms: replace the generated ones. */
  queries?: string[];
  /** The founder's edited competitor list: replaces candidates and suggestions. */
  competitors?: { name: string; domain?: string; source?: CompetitorCandidate["source"]; reason?: string }[];
};

export async function runMarketResearch(
  analysis: ProductAnalysisResult,
  ownUrl: string,
  deps: MarketDeps,
  overrides: ResearchOverrides = {},
): Promise<MarketResearch> {
  const sources: { name: string; ok: boolean }[] = [];
  let method: "model" | "basic" = "basic";

  // 1. Candidates and searches.
  const named: CompetitorCandidate[] = analysis.alternatives.map((name) => ({ name, source: "named_on_site", reason: "Your site compares itself to it." }));
  let candidates = named;
  let queries = basicQueries(analysis);
  let developer = looksDeveloper(analysis);
  const fixedQueries = overrides.queries?.map((q) => q.trim()).filter(Boolean).slice(0, 5);
  const fixedCompetitors = overrides.competitors?.filter((c) => c.name.trim()).map(
    (c): CompetitorCandidate => ({ name: c.name.trim(), domain: c.domain, reason: c.reason ?? "", source: c.source ?? "added" }),
  );
  if (fixedQueries?.length) queries = fixedQueries;
  if (fixedCompetitors) candidates = fixedCompetitors;
  // The model only suggests what the founder has not already decided.
  if (deps.complete && !(fixedQueries?.length && fixedCompetitors)) {
    const profile = [
      `Product: ${analysis.product_name}`,
      analysis.tagline && `Tagline: ${analysis.tagline}`,
      analysis.description && `Description: ${analysis.description}`,
      analysis.category && `Category: ${analysis.category}`,
      analysis.target_audience.length && `Audience: ${analysis.target_audience.join("; ")}`,
      analysis.problems_solved.length && `Problems: ${analysis.problems_solved.join("; ")}`,
      analysis.features.length && `Features: ${analysis.features.slice(0, 8).join("; ")}`,
      analysis.pricing && `Pricing: ${analysis.pricing}`,
      analysis.alternatives.length && `Compared on its site with: ${analysis.alternatives.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");
    const prompt = renderPrompt(marketScanV1, { profile, source: ownUrl });
    try {
      const res = await deps.complete({ system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens, temperature: prompt.temperature, prompt: prompt.ref, attempt: 1 });
      if (res.live) {
        let parsed: ReturnType<typeof scanSchema.safeParse> | null = null;
        try {
          parsed = scanSchema.safeParse(extractJSON(res.text));
        } finally {
          await res.report?.(Boolean(parsed?.success));
        }
        if (parsed?.success) {
          method = "model";
          const namedSlugs = new Set(analysis.alternatives.map((n) => n.toLowerCase()));
          if (!fixedCompetitors) candidates = [
            ...named.map((n) => ({ ...n, domain: parsed.data.competitors.find((c) => c.name.toLowerCase() === n.name.toLowerCase())?.domain })),
            ...parsed.data.competitors
              .filter((c) => !namedSlugs.has(c.name.toLowerCase()))
              .map((c): CompetitorCandidate => ({ name: c.name, domain: c.domain, reason: c.reason, source: "suggested" })),
          ];
          if (parsed.data.search_queries.length && !fixedQueries?.length) queries = parsed.data.search_queries;
          developer = parsed.data.developer_audience || developer;
        }
      }
    } catch {
      /* the scan continues without suggestions */
    }
  }

  // 2. Everything external in parallel.
  const picked = dedupeCandidates(candidates, analysis.product_name, ownUrl);
  // "meeting scheduling software" finds nothing; "meeting scheduling" finds the threads.
  const storyQueries = [...new Set(queries.map(cleanQuery).filter((q) => q.length >= 3))].slice(0, 3);
  const rivalNames = picked.slice(0, 4).map((c) => c.name);
  const [competitorsRes, storiesRes, leadRes, soRes] = await Promise.all([
    Promise.all(picked.map((c) => readCompetitor(c, deps.fetchPage))),
    Promise.all([
      ...storyQueries.map((q) => settle(deps.fetchJson(hnStoriesUrl(q)).then((b) => parseHnStories(b, q)))),
      // Threads about a competitor ("Show HN: an open-source X alternative") are this market's conversation.
      ...rivalNames.map((n) => settle(deps.fetchJson(hnStoriesUrl(n, 730)).then((b) => parseHnStories(b, n)))),
    ]),
    Promise.all([
      ...rivalNames.map((n) => settle(deps.fetchJson(hnCommentsUrl(`${n} alternative`)).then((b) => parseHnLeads(b, n)))),
      ...storyQueries.slice(0, 2).map((q) => settle(deps.fetchJson(hnCommentsUrl(q)).then((b) => parseHnLeads(b, q, "topic")))),
    ]),
    developer ? Promise.all(storyQueries.slice(0, 2).map((q) => settle(deps.fetchJson(soSearchUrl(q)).then((b) => parseSoQuestions(b, q))))) : Promise.resolve([]),
  ]);

  // A competitor whose site could not be read is kept only when its domain was given, not guessed.
  const competitors: Competitor[] = competitorsRes.filter((c, i) => c.verified || Boolean(picked[i]?.domain));
  if (picked.length) sources.push({ name: "Competitor websites", ok: competitors.some((c) => c.verified) });
  const hnCalls = [...storiesRes, ...leadRes];
  if (hnCalls.length) sources.push({ name: "Hacker News", ok: hnCalls.some((r) => r.ok) });
  if (soRes.length) sources.push({ name: "Stack Overflow", ok: soRes.some((r) => r.ok) });

  const seen = new Set<string>();
  const conversations: Conversation[] = [
    ...storiesRes.flatMap((r) => (r.ok ? r.value : [])).filter((c) => titleRelevance(c.title, c.query) >= (method === "model" ? 0.67 : 1)),
    ...soRes.flatMap((r) => (r.ok ? r.value.conversations : [])).filter((c) => titleRelevance(c.title, c.query) >= 0.67),
  ]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .sort((a, b) => b.points + b.comments * 2 - (a.points + a.comments * 2))
    .slice(0, 8);

  const leadSeen = new Set<string>();
  const leads: LeadSignal[] = [...leadRes.flatMap((r) => (r.ok ? r.value : [])), ...soRes.flatMap((r) => (r.ok ? r.value.leads : [])).filter((l) => titleRelevance(l.excerpt, l.about) >= 0.67)]
    .filter((l) => (leadSeen.has(l.id) ? false : (leadSeen.add(l.id), true)))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, 8);

  // 3. Opportunities.
  let opportunities: Opportunity[] = [];
  if (deps.complete) {
    opportunities = await modelOpportunities(analysis, ownUrl, competitors, conversations, leads, deps.complete);
    if (opportunities.length) method = "model";
  }
  if (opportunities.length === 0) opportunities = ruleOpportunities(analysis, ownUrl, competitors, conversations, leads);

  return { method, queries: storyQueries, competitors, conversations, leads, opportunities, sources, generatedAt: new Date().toISOString() };
}

type Evidence = { id: string; text: string; label: string; url?: string };

export function evidenceList(a: ProductAnalysisResult, ownUrl: string, competitors: Competitor[], conversations: Conversation[], leads: LeadSignal[]): Evidence[] {
  const ev: Evidence[] = [];
  const add = (text: string, label: string, url?: string) => {
    if (text.trim()) ev.push({ id: `E${ev.length + 1}`, text: text.trim().slice(0, 400), label, url });
  };
  add(a.value_proposition && `The product's value proposition: ${a.value_proposition}`, "Your value proposition", ownUrl);
  add(a.target_audience.length ? `Audience: ${a.target_audience.join("; ")}` : "", "Your audience", ownUrl);
  add(a.differentiators.length ? `Differentiators: ${a.differentiators.join("; ")}` : "", "Your differentiators", ownUrl);
  add(a.pricing && `The product's pricing: ${a.pricing}`, "Your pricing", ownUrl);
  add(a.proof.length ? `Proof on the product's site: ${a.proof.slice(0, 3).join(" | ")}` : "The product's site states no customers, numbers or testimonials.", "Proof on your site", ownUrl);
  if (a.missing_information.length) add(`The product's site does not say: ${a.missing_information.slice(0, 6).join(", ")}`, "What your site doesn't say", ownUrl);
  for (const c of competitors.filter((c) => c.verified)) {
    add(`Competitor ${c.name} (${c.url}): ${[c.tagline, c.description, c.pricing && `pricing ${c.pricing}`].filter(Boolean).join(" — ")}`, `${c.name}'s website`, c.url);
  }
  for (const c of conversations.slice(0, 6)) {
    add(`${c.source === "hacker_news" ? "Hacker News thread" : "Stack Overflow question"}: "${c.title}" (${c.points} points, ${c.comments} ${c.source === "hacker_news" ? "comments" : "answers"})`, c.title, c.url);
  }
  for (const l of leads.slice(0, 6)) {
    add(`Public post by ${l.author || "someone"} about ${l.about} (${l.intent.replace(/_/g, " ")}): "${l.excerpt}"`, `${l.author || "A post"} on ${l.source === "hacker_news" ? "Hacker News" : "Stack Overflow"}`, l.url);
  }
  return ev;
}

/** "alternatives [E7]–[E13], and [E14]" → "alternatives, and": the evidence chips already show the sources. */
export function stripRefs(s: string): string {
  return s
    .replace(/\s*\(?\[E\d+(?:\s*[-–,]\s*E?\d+)*\](?:\s*[-–,]\s*\[E\d+(?:\s*[-–,]\s*E?\d+)*\])*\)?/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function modelOpportunities(
  a: ProductAnalysisResult, ownUrl: string, competitors: Competitor[], conversations: Conversation[], leads: LeadSignal[], complete: Completer,
): Promise<Opportunity[]> {
  const ev = evidenceList(a, ownUrl, competitors, conversations, leads);
  const prompt = renderPrompt(marketOpportunitiesV1, { evidence: `Product: ${a.product_name}\n${ev.map((e) => `[${e.id}] ${e.text}`).join("\n")}`, source: ownUrl });
  try {
    const res = await complete({ system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens, temperature: prompt.temperature, prompt: prompt.ref, attempt: 1 });
    if (!res.live) return [];
    let parsed: ReturnType<typeof opportunitiesSchema.safeParse> | null = null;
    try {
      parsed = opportunitiesSchema.safeParse(extractJSON(res.text));
    } finally {
      await res.report?.(Boolean(parsed?.success));
    }
    if (!parsed?.success) return [];
    const byId = new Map(ev.map((e) => [e.id, e]));
    return parsed.data.opportunities
      .map((o, i): Opportunity | null => {
        const cited = o.evidence_ids.map((id) => byId.get(id.replace(/[[\]\s]/g, ""))).filter((e): e is Evidence => Boolean(e));
        if (cited.length === 0) return null; // an opportunity must rest on something real
        return {
          id: `o:${i + 1}`,
          kind: o.kind,
          title: stripRefs(o.title).slice(0, 90),
          rationale: stripRefs(o.rationale),
          firstStep: stripRefs(o.first_step),
          evidence: cited.map((e) => ({ label: e.label, url: e.url })),
          confidence: o.confidence,
        };
      })
      .filter((o): o is Opportunity => o !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
}

const INTENT_LABEL: Record<LeadSignal["intent"], string> = {
  alternative_to: "looking for an alternative",
  looking_for_tool: "asking for a recommendation",
  frustrated: "frustrated with their current tool",
  asking_how: "stuck on the problem",
  comparing: "comparing tools",
};

/** Opportunities from fixed rules, used without a model. Each cites what triggered it. */
export function ruleOpportunities(a: ProductAnalysisResult, ownUrl: string, competitors: Competitor[], conversations: Conversation[], leads: LeadSignal[]): Opportunity[] {
  const out: Opportunity[] = [];
  const push = (o: Omit<Opportunity, "id">) => out.push({ ...o, id: `o:${out.length + 1}` });

  if (leads.length) {
    const top = leads.slice(0, 3);
    push({
      kind: "conversation",
      title: `Reply to ${leads.length} ${leads.length === 1 ? "person" : "people"} already asking for this`,
      rationale: `Public posts where someone is ${INTENT_LABEL[top[0].intent]}${top[0].about ? ` (${top[0].about})` : ""}. A useful answer that mentions what you built reaches them at the moment of need.`,
      firstStep: "Open the first post, answer the question itself, then add one line on what you built and why.",
      evidence: top.map((l) => ({ label: `${l.author || "A post"} on ${l.source === "hacker_news" ? "Hacker News" : "Stack Overflow"}`, url: l.url })),
      confidence: "medium",
    });
  }
  const verified = competitors.filter((c) => c.verified);
  if (verified.length) {
    const c = verified[0];
    push({
      kind: "competitor_gap",
      title: `Publish an honest “${a.product_name} vs ${c.name}” page`,
      rationale: `People comparing tools search for this. ${c.name}'s own site says: “${(c.tagline || c.description).slice(0, 120)}”. Say plainly where you differ${a.differentiators[0] ? `, starting with “${a.differentiators[0]}”` : ""}.`,
      firstStep: `List three things a ${c.name} user would ask before switching, and answer each in one paragraph.`,
      evidence: [{ label: `${c.name}'s website`, url: c.url }, ...(a.differentiators[0] ? [{ label: "Your differentiators", url: ownUrl }] : [])],
      confidence: "medium",
    });
  }
  if (conversations.length) {
    const c = conversations[0];
    push({
      kind: "content",
      title: "Answer the question this market is already discussing",
      rationale: `“${c.title}” drew ${c.points} points and ${c.comments} ${c.source === "hacker_news" ? "comments" : "answers"}. A post that answers it from your experience rides interest that already exists.`,
      firstStep: "Read the thread's top comments and write the post that answers what they still disagree on.",
      evidence: conversations.slice(0, 2).map((x) => ({ label: x.title, url: x.url })),
      confidence: c.points + c.comments >= 50 ? "medium" : "low",
    });
  }
  if (a.proof.length === 0) {
    push({
      kind: "proof",
      title: "Add one piece of proof to your home page",
      rationale: "Your site states no customers, numbers or quotes, so posts can't cite any either. One real quote or count makes every post stronger.",
      firstStep: "Ask your three most active users for one sentence you may quote, with their name and role.",
      evidence: [{ label: "Proof on your site: none found", url: ownUrl }],
      confidence: "high",
    });
  }
  if (a.alternatives.length && a.differentiators.length) {
    push({
      kind: "positioning",
      title: `Lead every post with what ${a.alternatives[0]} doesn't do`,
      rationale: `Your site already compares you with ${a.alternatives.join(", ")}, and names “${a.differentiators[0]}” as the difference. Make that the first line, not the last.`,
      firstStep: "Rewrite your hero sub-headline so the difference comes first.",
      evidence: [{ label: "Your differentiators", url: ownUrl }],
      confidence: "medium",
    });
  }
  return out.slice(0, 5);
}
