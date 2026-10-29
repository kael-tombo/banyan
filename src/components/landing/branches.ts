/**
 * Landing workstream content — shared between the LivingTree client component
 * (branch explorer) and the server-rendered "One intelligence, many branches"
 * section, so the two can never drift apart.
 *
 * Honesty rule: every claim here is grounded in the capability registry
 * (src/lib/capabilities/registry.ts) and the shipping feature set — publishing
 * through Postiz (X, LinkedIn), manual handoff for everything else,
 * hypothesis-labeled research, schema-validated generation, tracked links,
 * experiments, and evidence-backed recommendations.
 */

export type Branch = {
  label: string;
  problem: string;
  work: string;
  deliverables: string[];
  tools: string[];
  approval: string;
};

export const BRANCHES: Branch[] = [
  {
    label: "Strategy & research",
    problem: "Founders guess at positioning and audience because the research never gets done.",
    work: "Turns your goal and workspace context into a structured plan — audience segments, positioning options, and research hypotheses, each carrying its evidence and confidence.",
    deliverables: ["Audience segment readouts", "Positioning options", "Hypothesis-labeled research briefs"],
    tools: ["Provenance-tracked workspace context", "Managed model access"],
    approval: "You accept, edit, or reject every strategy before work proceeds.",
  },
  {
    label: "Content creation",
    problem: "Writing for every channel eats the week — and the voice drifts.",
    work: "Drafts channel-native content in your voice — X posts and threads, LinkedIn posts, short-video scripts — revised against your edits, with every version preserved.",
    deliverables: ["Post and thread drafts", "Short-video scripts", "Captions, hooks, and CTAs"],
    tools: ["Brand voice from workspace context", "Schema-validated agent hand-offs"],
    approval: "Every draft waits in review until you approve it.",
  },
  {
    label: "Distribution",
    problem: "Scheduling across platforms is tab-juggling, and failures surface days later.",
    work: "Publishes approved content through your Postiz connection, schedules with retry and backoff, and shows the provider's real response — success, failure, or blocked with setup guidance.",
    deliverables: ["Scheduled and published posts (X, LinkedIn)", "Copy-ready handoff packages", "Execution records per attempt"],
    tools: ["Postiz connection (your credentials)", "Publishing worker with bounded retry"],
    approval: "Nothing publishes without a recorded human approval — stored with who and when.",
  },
  {
    label: "Customer engagement",
    problem: "Conversations happen where you are not, and follow-ups fall through.",
    work: "Prepares discussion starters and reply drafts from your audience context, and tracks which links your audience actually follows — so outreach starts informed, not cold.",
    deliverables: ["Discussion starters", "Reply drafts for your review", "Tracked links with first-party clicks"],
    tools: ["Audience segments", "First-party link tracking"],
    approval: "You post and reply yourself — Banyan prepares the words and measures the response.",
  },
  {
    label: "Analytics & learning",
    problem: "Teams ship volume and never learn which piece actually worked.",
    work: "Records what was published and observed, runs one-variable experiments, and turns results into recommendations with evidence and named confidence.",
    deliverables: ["Experiment readouts", "Tracked-link metrics", "Evidence-backed recommendations"],
    tools: ["First-party metrics", "Per-workspace usage ledger"],
    approval: "When data is thin it says so — not_enough_data instead of an invented insight.",
  },
];
