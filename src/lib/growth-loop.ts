/**
 * Growth-loop computation helpers — pure functions shared by the dashboard and
 * the Connections page. Every value they return is derived from recorded data;
 * gaps are reported as "needs setup" or "stalled", never estimated or faked.
 */

// ---------------------------------------------------------------------------
// Growth loop setup — the five real slots of Banyan's loop
// ---------------------------------------------------------------------------

export type LoopSlotStatus = "connected" | "needs_setup";

export type LoopSlot = {
  key: string;
  label: string;
  description: string;
  status: LoopSlotStatus;
  /** Honest detail of what was actually checked. */
  detail: string;
  href: string;
  cta: string;
};

export type LoopSetupInput = {
  profileName: string | null;
  contextFacts: number;
  publishingConnections: number;
  trackedLinks: number;
  experiments: number;
};

export type LoopSetup = { slots: LoopSlot[]; connected: number; total: number };

export function computeLoopSetup(input: LoopSetupInput): LoopSetup {
  const slots: LoopSlot[] = [
    {
      key: "profile",
      label: "Product profile",
      description: "What you sell, for whom, and why it matters — the ground every plan stands on.",
      status: input.profileName ? "connected" : "needs_setup",
      detail: input.profileName
        ? `Recorded for "${input.profileName}".`
        : "No product profile recorded yet.",
      href: "/app/workspace",
      cta: input.profileName ? "Review" : "Add product",
    },
    {
      key: "context",
      label: "Context & audience",
      description: "Verified facts and audience insights the agents cite as evidence.",
      status: input.contextFacts > 0 ? "connected" : "needs_setup",
      detail:
        input.contextFacts > 0
          ? `${input.contextFacts} context fact(s) on record.`
          : "No context facts recorded — generation runs ungrounded until you add them.",
      href: "/app/context",
      cta: input.contextFacts > 0 ? "Review facts" : "Add context",
    },
    {
      key: "publishing",
      label: "Publishing",
      description: "Approved content distributed through a real provider, or recorded manually.",
      status: input.publishingConnections > 0 ? "connected" : "needs_setup",
      detail:
        input.publishingConnections > 0
          ? `${input.publishingConnections} channel connection(s) configured.`
          : "No provider connection. Manual recording with a live URL is always available.",
      href: "/app/publishing",
      cta: input.publishingConnections > 0 ? "Manage" : "Connect",
    },
    {
      key: "tracking",
      label: "Link tracking",
      description: "UTM-tagged tracked links tie visits and signups back to the content that earned them.",
      status: input.trackedLinks > 0 ? "connected" : "needs_setup",
      detail:
        input.trackedLinks > 0
          ? `${input.trackedLinks} tracked link(s) recording first-party events.`
          : "No tracked links — attribution stays empty until content ships with them.",
      href: "/app/campaigns",
      cta: input.trackedLinks > 0 ? "Review links" : "Set up tracking",
    },
    {
      key: "experiments",
      label: "Experiment loop",
      description: "One variable at a time, with a pre-declared metric and drafted conclusions.",
      status: input.experiments > 0 ? "connected" : "needs_setup",
      detail:
        input.experiments > 0
          ? `${input.experiments} experiment(s) defined.`
          : "No experiments yet — the loop does not close without them.",
      href: "/app/experiments",
      cta: input.experiments > 0 ? "Review" : "Create experiment",
    },
  ];

  const connected = slots.filter((s) => s.status === "connected").length;
  return { slots, connected, total: slots.length };
}

// ---------------------------------------------------------------------------
// Data flow — how the recorded pieces connect, with honest health per step
// ---------------------------------------------------------------------------

export type FlowHealth = "flowing" | "stalled" | "not_started";

export type FlowStep = {
  key: string;
  label: string;
  sub: string;
  count: number;
  health: FlowHealth;
};

export type DataFlowInput = {
  approvedCount: number;
  publishedCount: number;
  visitCount: number;
  attributedSignups: number;
  activatedCount: number;
  concludedExperiments: number;
};

/**
 * Health is computed left to right: a step with events is "flowing"; a step
 * with zero events whose predecessor has events is "stalled" (a real break in
 * the loop worth investigating); a step with zero events and no upstream is
 * simply "not started".
 */
export function computeDataFlow(input: DataFlowInput): FlowStep[] {
  const defs: { key: string; label: string; sub: string; count: number }[] = [
    { key: "approved", label: "Approved asset", sub: "Human-approved content", count: input.approvedCount },
    { key: "published", label: "Published", sub: "Via provider or recorded manually", count: input.publishedCount },
    { key: "visit", label: "Tracked visit", sub: "UTM-tagged link click", count: input.visitCount },
    { key: "signup", label: "Attributed signup", sub: "Linked to a tracked source", count: input.attributedSignups },
    { key: "activated", label: "Activation", sub: "Onboarding completed", count: input.activatedCount },
    { key: "learning", label: "Experiment learning", sub: "Conclusion drafted from outcomes", count: input.concludedExperiments },
  ];

  return defs.map((def, i) => {
    let health: FlowHealth;
    if (def.count > 0) {
      health = "flowing";
    } else {
      const upstream = defs.slice(0, i).some((d) => d.count > 0);
      health = upstream ? "stalled" : "not_started";
    }
    return { ...def, health };
  });
}

// ---------------------------------------------------------------------------
// Attribution coverage — share of signups traceable to a tracked source
// ---------------------------------------------------------------------------

/**
 * Returns 0..100, or null when there are no signups at all (unknown, not 0% —
 * an honest "not enough data" beats a fabricated percentage).
 */
export function attributionCoverage(totalSignups: number, attributedSignups: number): number | null {
  if (totalSignups <= 0) return null;
  const clamped = Math.min(Math.max(attributedSignups, 0), totalSignups);
  return Math.round((clamped / totalSignups) * 100);
}

// ---------------------------------------------------------------------------
// Activity feed — evidence links resolved from recorded event metadata
// ---------------------------------------------------------------------------

export type ActivityEvidenceLink = { href: string; label: string };

const EVIDENCE_LABELS: Record<string, string> = {
  contentItemId: "View content",
  experimentId: "View experiment",
  campaignId: "View campaign",
  goalId: "View goal",
  taskId: "View task",
  planId: "View plan",
  connectionId: "View connection",
  factId: "View fact",
  publicationId: "View publication",
  recommendationId: "View opportunity",
  strategyId: "View strategy",
};

const EVIDENCE_HREFS: Record<string, (id: string) => string> = {
  contentItemId: (id) => `/app/content/${id}`,
  experimentId: () => `/app/experiments`,
  campaignId: (id) => `/app/campaigns/${id}`,
  goalId: (id) => `/app/goals/${id}`,
  taskId: (id) => `/app/approvals`,
  planId: (id) => `/app/goals`,
  connectionId: () => `/app/publishing`,
  factId: () => `/app/context`,
  publicationId: () => `/app/publishing`,
  recommendationId: () => `/app/opportunities`,
  strategyId: () => `/app/strategy`,
};

/**
 * Resolve the first actionable evidence link from an activity event's meta.
 * Keys are checked in a fixed priority order so the most specific surface
 * wins. Returns null when nothing resolvable is recorded — never a guessed
 * link.
 */
export function resolveActivityEvidence(metaJson: string): ActivityEvidenceLink | null {
  let meta: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(metaJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      meta = parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  const order = [
    "contentItemId",
    "experimentId",
    "campaignId",
    "goalId",
    "publicationId",
    "connectionId",
    "taskId",
    "planId",
    "factId",
    "recommendationId",
    "strategyId",
  ];
  for (const key of order) {
    const value = meta[key];
    if (typeof value === "string" && value) {
      return { href: EVIDENCE_HREFS[key](value), label: EVIDENCE_LABELS[key] };
    }
  }
  return null;
}

/** Relative time for activity feeds: "just now", "N min ago", "N h ago", "N d ago". */
export function timeAgo(d: Date, now: Date = new Date()): string {
  const ms = now.getTime() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`;
  return `${Math.floor(ms / 86_400_000)} d ago`;
}

// ---------------------------------------------------------------------------
// Connection catalog — what each integration slot is, honestly
// ---------------------------------------------------------------------------

export type CatalogStatus = "available" | "first_party" | "not_available";

export type CatalogEntry = {
  key: string;
  name: string;
  provider: string;
  category: string;
  status: CatalogStatus;
  whatYouGet: string;
  useCases: string;
  /** What is actually true today — no roadmap dressing. */
  howToday: string;
  href: string;
  cta: string;
};

export const CONNECTION_CATALOG: CatalogEntry[] = [
  {
    key: "publishing",
    name: "Publishing",
    provider: "SocialFlow.ai",
    category: "Distribution",
    status: "not_available",
    whatYouGet: "Publish approved content to connected social channels; read back post status and confirmations.",
    useCases: "Ship approved posts without leaving the approval gate; keep a provider-confirmed publication record.",
    howToday: "SocialFlow.ai has no API Banyan can verify yet. Today: export approved posts, publish them yourself, and record the live URL.",
    href: "/app/publishing",
    cta: "See export mode",
  },
  {
    key: "analytics",
    name: "Website analytics",
    provider: "First-party + your analytics tool",
    category: "Measurement",
    status: "first_party",
    whatYouGet: "Tracked-link visits, attributed signups and onboarding completions, recorded in your own database.",
    useCases: "Attribute traffic to content and campaigns; measure the funnel without third-party cookies.",
    howToday: "Works out of the box through tracked links (/t/…). External tools (Plausible, GA4) are not imported — Banyan shows its own records only.",
    href: "/app/analytics",
    cta: "See analytics",
  },
  {
    key: "crm",
    name: "CRM",
    provider: "HubSpot or CSV (not built yet)",
    category: "Outcomes",
    status: "not_available",
    whatYouGet: "When built: signup-to-trial-to-deal linkage so campaigns can be judged on pipeline, not clicks.",
    useCases: "Attribute qualified trials and revenue to the content that earned them.",
    howToday: "No CRM sync exists today. Record outcomes as context facts and campaign metrics — honestly labelled manual.",
    href: "/app/context",
    cta: "Record outcomes manually",
  },
  {
    key: "payments",
    name: "Payments",
    provider: "Stripe (not built yet)",
    category: "Outcomes",
    status: "not_available",
    whatYouGet: "When built: paid conversions and revenue per campaign, straight from the billing source.",
    useCases: "Measure CAC and payback per experiment.",
    howToday: "No billing integration exists today. Record revenue metrics manually against campaigns.",
    href: "/app/campaigns",
    cta: "Record metrics manually",
  },
  {
    key: "ads",
    name: "Ads",
    provider: "Google / Meta (not built yet)",
    category: "Acquisition",
    status: "not_available",
    whatYouGet: "When built: spend, clicks and conversions from ad platforms next to organic results.",
    useCases: "Compare paid and organic distribution in one honest ledger.",
    howToday: "No ad platform connection exists today. Record spend manually where you track it.",
    href: "/app/analytics",
    cta: "Record spend manually",
  },
];

// ---------------------------------------------------------------------------
// Agent team — live per-role status derived from the AgentTask audit trail
// ---------------------------------------------------------------------------

export type AgentRole =
  | "planner"
  | "researcher"
  | "strategist"
  | "creator"
  | "publisher"
  | "analyst";

export const AGENT_ROLES: AgentRole[] = ["planner", "researcher", "strategist", "creator", "publisher", "analyst"];

export const AGENT_META: Record<AgentRole, { name: string; blurb: string }> = {
  planner: { name: "Planner Agent", blurb: "Drafts reviewable plans from goals" },
  researcher: { name: "Research Agent", blurb: "Gathers citable external evidence" },
  strategist: { name: "Strategist Agent", blurb: "Turns evidence into positioning and bets" },
  creator: { name: "Creator Agent", blurb: "Drafts content for approval" },
  publisher: { name: "Publisher Agent", blurb: "Runs approval gates and publishing" },
  analyst: { name: "Analyst Agent", blurb: "Measures, evaluates, recommends" },
};

export type AgentRoleStatus = "working" | "awaiting" | "blocked" | "queued" | "idle" | "offline";

export type AgentTeamEntry = {
  role: AgentRole;
  status: AgentRoleStatus;
  /** Latest action summary from the audit trail — verbatim task title. */
  latestAction: string | null;
  at: Date | null;
  href: string;
};

export type AgentTaskLite = {
  agentRole: string;
  status: string;
  title: string;
  goalId: string | null;
  updatedAt: Date;
};

const ROLE_STATUS_PRIORITY: Record<AgentRoleStatus, number> = {
  blocked: 0,
  awaiting: 1,
  working: 2,
  queued: 3,
  idle: 4,
  offline: 5,
};

/**
 * Derive each agent role's live status from recorded tasks. Status is honest:
 * "working" means a task is ready/running right now; "awaiting" means a human
 * gate is open; "blocked" means the workflow is stuck; "queued" means tasks
 * exist but none has started; "idle" means the last task completed; "offline"
 * means the role has never run in this workspace.
 */
export function computeAgentTeam(tasks: AgentTaskLite[]): AgentTeamEntry[] {
  const byRole = new Map<AgentRole, AgentTaskLite[]>();
  for (const t of tasks) {
    if (!(AGENT_ROLES as string[]).includes(t.agentRole)) continue;
    const role = t.agentRole as AgentRole;
    const list = byRole.get(role) ?? [];
    list.push(t);
    byRole.set(role, list);
  }

  return AGENT_ROLES.map((role) => {
    const list = (byRole.get(role) ?? []).slice().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const latest = list[0] ?? null;

    let status: AgentRoleStatus;
    if (!latest) {
      status = "offline";
    } else if (list.some((t) => t.status === "blocked" || t.status === "failed")) {
      status = "blocked";
    } else if (list.some((t) => t.status === "waiting_approval")) {
      status = "awaiting";
    } else if (list.some((t) => t.status === "ready" || t.status === "running")) {
      status = "working";
    } else if (list.some((t) => t.status === "pending")) {
      status = "queued";
    } else {
      status = "idle";
    }

    return {
      role,
      status,
      latestAction: latest?.title ?? null,
      at: latest?.updatedAt ?? null,
      href: latest?.goalId ? `/app/goals/${latest.goalId}` : "/app/goals",
    };
  }).sort((a, b) => {
    // Live and actionable roles first; roles that never ran sink to the bottom.
    const pa = ROLE_STATUS_PRIORITY[a.status];
    const pb = ROLE_STATUS_PRIORITY[b.status];
    if (pa !== pb) return pa - pb;
    return (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0);
  });
}
