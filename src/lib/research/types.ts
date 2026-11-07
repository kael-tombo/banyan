/**
 * The market side of onboarding's 360° read: who else solves this, where
 * people talk about it, who is asking for it, and what to do first.
 *
 * Provenance is part of every type. A competitor is either named on the
 * founder's own site or suggested (by the model), and is "verified" only when
 * Banyan read its website. Conversations and lead signals are public posts
 * with their link and author; nothing in them is generated. Opportunities are
 * recommendations and must cite the evidence they rest on.
 */

export type CompetitorSource = "named_on_site" | "suggested" | "added";

export type Competitor = {
  id: string;
  name: string;
  url: string;
  source: CompetitorSource;
  /** Why it competes, in one line (the site's words, or the model's reason). */
  reason: string;
  /** True when Banyan read the competitor's home page. */
  verified: boolean;
  tagline: string;
  description: string;
  pricing: string;
  cta: string;
  logo: string;
};

export type ConversationSource = "hacker_news" | "stack_overflow";

export type Conversation = {
  id: string;
  source: ConversationSource;
  title: string;
  url: string;
  author: string;
  points: number;
  comments: number;
  createdAt: string;
  /** The search that found it. */
  query: string;
};

export type LeadIntent = "looking_for_tool" | "alternative_to" | "comparing" | "frustrated" | "asking_how";

export type LeadSignal = {
  id: string;
  source: ConversationSource;
  author: string;
  excerpt: string;
  url: string;
  createdAt: string;
  intent: LeadIntent;
  /** The competitor or topic the post is about. */
  about: string;
};

export type OpportunityKind = "conversation" | "competitor_gap" | "positioning" | "proof" | "channel" | "content";

export type Opportunity = {
  id: string;
  kind: OpportunityKind;
  title: string;
  rationale: string;
  /** A concrete first step the founder can take this week. */
  firstStep: string;
  /** What the opportunity rests on: labels with an optional link. */
  evidence: { label: string; url?: string }[];
  confidence: "low" | "medium" | "high";
};

export type MarketResearch = {
  method: "model" | "basic";
  queries: string[];
  competitors: Competitor[];
  conversations: Conversation[];
  leads: LeadSignal[];
  opportunities: Opportunity[];
  /** Sources that answered, and those that could not be reached. */
  sources: { name: string; ok: boolean }[];
  generatedAt: string;
};

export const EMPTY_RESEARCH: MarketResearch = {
  method: "basic",
  queries: [],
  competitors: [],
  conversations: [],
  leads: [],
  opportunities: [],
  sources: [],
  generatedAt: "",
};
