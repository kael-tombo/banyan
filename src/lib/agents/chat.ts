/**
 * Command center chat — grounding and persona.
 *
 * The chat is a real conversation with the workspace's growth agent, not a
 * simulated one ("no simulated chat" is a project rule). Two properties make
 * it honest:
 *
 *  1. Grounded — every reply is conditioned on a WORKSPACE BRIEF assembled
 *     from records only (profile, goal, approvals, funnel events, links,
 *     connections). A zero in the brief is a true zero; anything unmeasured
 *     is named as such.
 *  2. Labeled — when no live model is configured (or quota is exhausted),
 *     the route serves a template reply built from the same brief, and the
 *     UI shows the fallback label. The fallback never pretends to be
 *     generated copy.
 *
 * Everything here is pure and synchronous so it can be unit-tested without a
 * database; the API route maps Prisma rows onto the plain input types.
 */

export type ChatProfileBrief = {
  name: string;
  stage: string;
  valueProp: string;
  audience: string | null;
};

export type ChatGoalBrief = {
  objective: string;
  successMetric: string;
  metricTarget: number | null;
  metricUnit: string | null;
  progress: number;
  status: string;
  deadline: string | null;
};

export type ChatConnectionBrief = { channel: string; status: string };

export type ChatBriefInput = {
  profile: ChatProfileBrief | null;
  activeGoal: ChatGoalBrief | null;
  goalsInFlight: number;
  pendingApprovals: number;
  runningTasks: number;
  blockedTasks: number;
  connections: ChatConnectionBrief[];
  last14Days: { trackedClicks: number; visits: number; signups: number };
  topOpenRecommendation: string | null;
};

/** History entry handed to the model — role is "user" | "assistant". */
export type ChatHistoryItem = { role: "user" | "assistant"; content: string };

const num = (n: number) => n.toLocaleString("en-US");

/**
 * Assemble the workspace brief from records only. Absent data is stated as
 * absent; zeros are true zeros — never softened, never estimated.
 */
export function buildWorkspaceBrief(input: ChatBriefInput): string {
  const lines: string[] = [];

  // Product
  if (input.profile) {
    lines.push(
      `Product: ${input.profile.name} (stage: ${input.profile.stage}). Value proposition: ${input.profile.valueProp}.` +
        (input.profile.audience ? ` Audience: ${input.profile.audience}.` : " Audience: not defined yet.")
    );
  } else {
    lines.push("Product profile: not completed yet — plans and drafts have nothing to ground in.");
  }

  // Goal
  if (input.activeGoal) {
    const g = input.activeGoal;
    const target =
      g.metricTarget != null ? `, target ${num(g.metricTarget)}${g.metricUnit ? ` ${g.metricUnit}` : ""}` : "";
    const deadline = g.deadline ? `, deadline ${g.deadline}` : "";
    lines.push(
      `Goal in motion: "${g.objective}" (status ${g.status}, progress ${Math.round(g.progress)}%, success metric ${g.successMetric}${target}${deadline}).`
    );
  } else {
    lines.push(
      input.goalsInFlight > 0
        ? `No goal currently in motion (${input.goalsInFlight} goal(s) exist in other states).`
        : "No goal set yet — the workflow has nothing to execute against."
    );
  }

  // Human gates + agent activity
  lines.push(
    `Awaiting your approval: ${num(input.pendingApprovals)} content item(s) at the approval gate. ` +
      `Agent tasks running: ${num(input.runningTasks)}. Blocked/failed: ${num(input.blockedTasks)}.`
  );

  // Connections — the honest publish-vs-handoff distinction
  if (input.connections.length === 0) {
    lines.push("Publishing connections: none connected — publishing is copy-ready handoff only.");
  } else {
    const healthy = input.connections.filter((c) => c.status !== "error");
    const errored = input.connections.filter((c) => c.status === "error");
    lines.push(
      `Publishing connections: ${healthy.map((c) => `${c.channel} (${c.status})`).join(", ") || "none healthy"}` +
        (errored.length > 0 ? `. Errored: ${errored.map((c) => c.channel).join(", ")}.` : ".")
    );
  }

  // First-party numbers, last 14 days — true zeros included
  lines.push(
    `Last 14 days (first-party records): ${num(input.last14Days.visits)} tracked visit(s), ` +
      `${num(input.last14Days.signups)} attributed signup(s), ${num(input.last14Days.trackedClicks)} tracked link click(s) in total. ` +
      `If a number is 0, it is a true zero from the records — not an estimate.`
  );

  if (input.topOpenRecommendation) {
    lines.push(`Highest-leverage open recommendation: "${input.topOpenRecommendation}".`);
  }

  return lines.join("\n");
}

/**
 * The Banyan agent persona, grounded in the brief. Rules encode the product
 * philosophy: evidence over invention, proposals over unilateral action.
 */
export function chatSystemPrompt(brief: string): string {
  return [
    "You are Banyan, the growth agent serving this workspace inside the Banyan product distribution layer.",
    "You are chatting with a member of the team in the command center. You know their workspace from the records below.",
    "",
    "Rules — these are product philosophy, not style hints:",
    "1. Ground every factual claim in the WORKSPACE BRIEF or in what the user tells you. Never estimate or invent numbers; if something is unmeasured, say so plainly. A zero in the brief is a true zero.",
    "2. You propose; humans approve. You cannot publish anything — publishing requires a recorded human approval at the approval gate. If asked to post or publish directly, say what you can do instead (draft, prepare, queue for approval) and point to the right surface.",
    "3. Be concise and plain-spoken: at most ~180 words unless the user asks for depth. Lead with the answer, not the preamble.",
    "4. End with one concrete next action when one exists, naming the exact surface (e.g. Approvals, Experiments, Goals, Connections).",
    "5. The platform supports X, LinkedIn, and short video; publishing via connections, or copy-ready handoff when no connection exists. If asked about anything the platform cannot do yet, say so plainly.",
    "6. Do not fabricate experiment results, metrics, or customer quotes. If the brief lacks the data, name what should be measured.",
    "",
    "WORKSPACE BRIEF (from records only):",
    brief,
  ].join("\n");
}

/**
 * Flatten conversation history into the single user payload the provider
 * boundary accepts (system + user). Keeps a bounded window so the prompt
 * stays small and recent turns dominate.
 */
export function flattenChatPayload(history: ChatHistoryItem[], currentMessage: string, maxTurns = 12): string {
  const window = trimHistory(history, maxTurns);
  if (window.length === 0) return currentMessage;
  const transcript = window.map((m) => `${m.role === "user" ? "User" : "Banyan"}: ${m.content}`).join("\n\n");
  return `Conversation so far:\n\n${transcript}\n\n—\nNew user message (respond to this):\n${currentMessage}`;
}

/** Keep the most recent `max` entries, preserving chronological order. */
export function trimHistory(history: ChatHistoryItem[], max: number): ChatHistoryItem[] {
  if (max <= 0) return [];
  return history.slice(Math.max(0, history.length - max));
}

/**
 * Honest template reply for when no live model served the request. States
 * plainly that it is not generated copy, then reflects real records so the
 * reply is still useful for orientation. The route attaches the fallback
 * label on the persisted message — the UI renders it.
 */
export function fallbackChatReply(input: ChatBriefInput, userMessage: string): string {
  const lines: string[] = [
    "Template reply — no live model is configured on this deployment, so this is assembled from your workspace records, not generated copy.",
    "",
  ];
  if (input.activeGoal) {
    lines.push(
      `Goal in motion: "${input.activeGoal.objective}" at ${Math.round(input.activeGoal.progress)}% progress.`
    );
  } else {
    lines.push("No goal is in motion yet. Set one in Goals — one sentence is enough to start the workflow.");
  }
  if (input.pendingApprovals > 0) {
    lines.push(
      `${num(input.pendingApprovals)} item(s) are waiting at the approval gate — nothing publishes until you record a decision in Approvals.`
    );
  }
  lines.push(
    `Last 14 days from records: ${num(input.last14Days.visits)} tracked visit(s), ${num(input.last14Days.signups)} attributed signup(s). Zeros are true zeros.`
  );
  if (input.topOpenRecommendation) {
    lines.push(`Open recommendation to consider: "${input.topOpenRecommendation}" — see Experiments.`);
  }
  lines.push(
    "",
    `Your message — "${userMessage.slice(0, 140)}" — needs a live model for a generated answer. Configure model credentials on the deployment, or use the surfaces above; every number shown here comes from records.`
  );
  return lines.join("\n");
}
