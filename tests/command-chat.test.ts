import { describe, expect, it } from "vitest";
import {
  buildWorkspaceBrief,
  chatSystemPrompt,
  fallbackChatReply,
  flattenChatPayload,
  trimHistory,
  type ChatBriefInput,
  type ChatHistoryItem,
} from "@/lib/agents/chat";
import { parseExtraHeaders } from "@/lib/ai/provider";

// Command center chat — grounding, persona, and honesty rules. The chat is
// real (records in, labeled model out); these tests pin the parts that make
// it trustworthy: true zeros, named absences, approval-gate language, and
// bounded history.

const fullBrief: ChatBriefInput = {
  profile: { name: "Acme Compass", stage: "launched", valueProp: "Field notes for solo founders", audience: "Solo B2B founders" },
  activeGoal: {
    objective: "Get 50 signups from LinkedIn and X in 6 weeks",
    successMetric: "attributed signups",
    metricTarget: 50,
    metricUnit: "signups",
    progress: 24,
    status: "active",
    deadline: "2026-11-30",
  },
  goalsInFlight: 0,
  pendingApprovals: 2,
  runningTasks: 3,
  blockedTasks: 1,
  connections: [{ channel: "x", status: "connected" }, { channel: "linkedin", status: "error" }],
  last14Days: { trackedClicks: 132, visits: 96, signups: 7 },
  topOpenRecommendation: "Test a behind-the-build thread on X",
  recentLearnings: [
    "\"Problem-first thread\" | tested: leading with the problem earns more clicks | variable: Opening angle | metric: tracked clicks | conclusion: more clicks, small sample | limits: no control group | next: repeat with a threshold",
  ],
};

describe("buildWorkspaceBrief", () => {
  it("states the grounded facts, including the publish-vs-handoff split", () => {
    const brief = buildWorkspaceBrief(fullBrief);
    expect(brief).toContain("Acme Compass");
    expect(brief).toContain("progress 24%");
    expect(brief).toContain("target 50 signups");
    expect(brief).toContain("Awaiting your approval: 2");
    expect(brief).toContain("x (connected)");
    expect(brief).toContain("Errored: linkedin");
    expect(brief).toContain("96 tracked visit(s)");
    expect(brief).toContain("Test a behind-the-build thread on X");
  });

  it("treats a zero as a true zero and names absent data instead of inventing it", () => {
    const empty: ChatBriefInput = {
      profile: null,
      activeGoal: null,
      goalsInFlight: 0,
      pendingApprovals: 0,
      runningTasks: 0,
      blockedTasks: 0,
      connections: [],
      last14Days: { trackedClicks: 0, visits: 0, signups: 0 },
      topOpenRecommendation: null,
      recentLearnings: [],
    };
    const brief = buildWorkspaceBrief(empty);
    expect(brief).toContain("not completed yet");
    expect(brief).toContain("No goal set yet");
    expect(brief).toContain("none connected — publishing is copy-ready handoff only");
    expect(brief).toContain("0 tracked visit(s)");
    expect(brief).toContain("a true zero from the records");
    expect(brief).toContain("not an estimate");
  });

  it("mentions goals that exist in other states when none is in motion", () => {
    const brief = buildWorkspaceBrief({ ...fullBrief, activeGoal: null, goalsInFlight: 2 });
    expect(brief).toContain("2 goal(s) exist in other states");
  });

  it("carries concluded learning into the brief and labels its absence honestly", () => {
    const withLearning = buildWorkspaceBrief(fullBrief);
    expect(withLearning).toContain("Prior learning from concluded experiments");
    expect(withLearning).toContain("Problem-first thread");
    expect(withLearning).toContain("not proof");

    const without = buildWorkspaceBrief({ ...fullBrief, recentLearnings: [] });
    expect(without).toContain("no concluded experiment with a recorded interpretation yet");
    expect(without).toContain("no measured learning to reuse");
  });
});

describe("chatSystemPrompt", () => {
  it("encodes the philosophy: grounded facts, approval gates, no invented numbers", () => {
    const prompt = chatSystemPrompt(buildWorkspaceBrief(fullBrief));
    expect(prompt).toContain("WORKSPACE BRIEF");
    expect(prompt).toContain("Never estimate or invent numbers");
    expect(prompt).toContain("humans approve");
    expect(prompt).toContain("approval gate");
    expect(prompt).toContain("Acme Compass"); // the brief is embedded
  });
});

describe("trimHistory", () => {
  const turns: ChatHistoryItem[] = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg ${i}`,
  }));

  it("keeps the most recent entries in chronological order", () => {
    const trimmed = trimHistory(turns, 4);
    expect(trimmed.map((t) => t.content)).toEqual(["msg 16", "msg 17", "msg 18", "msg 19"]);
  });

  it("returns nothing for a zero window and everything when under the cap", () => {
    expect(trimHistory(turns, 0)).toEqual([]);
    expect(trimHistory(turns.slice(0, 3), 12)).toHaveLength(3);
  });
});

describe("flattenChatPayload", () => {
  it("wraps bounded history and marks the new message", () => {
    const payload = flattenChatPayload(
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi — grounded answer" },
      ],
      "What now?"
    );
    expect(payload).toContain("Conversation so far:");
    expect(payload).toContain("User: hello");
    expect(payload).toContain("Banyan: hi — grounded answer");
    expect(payload).toContain("New user message (respond to this):\nWhat now?");
  });

  it("returns the bare message when there is no history", () => {
    expect(flattenChatPayload([], "Only message")).toBe("Only message");
  });
});

describe("fallbackChatReply", () => {
  it("labels itself as a template and reflects real records, not generated copy", () => {
    const reply = fallbackChatReply(fullBrief, "Should I launch on ProductHunt?");
    expect(reply).toContain("Template reply");
    expect(reply).toContain("no live model");
    expect(reply).toContain("Get 50 signups from LinkedIn and X in 6 weeks");
    expect(reply).toContain("24% progress");
    expect(reply).toContain("2 item(s) are waiting at the approval gate");
    expect(reply).toContain("Should I launch on ProductHunt?");
  });

  it("points to goal creation when nothing is in motion", () => {
    const reply = fallbackChatReply({ ...fullBrief, activeGoal: null, goalsInFlight: 0 }, "hello");
    expect(reply).toContain("No goal is in motion yet");
  });

  it("surfaces the latest concluded learning when the model is unavailable", () => {
    const reply = fallbackChatReply(fullBrief, "What did we learn from the last experiment?");
    expect(reply).toContain("Latest concluded experiment:");
    expect(reply).toContain("Problem-first thread");
  });
});

describe("parseExtraHeaders", () => {
  it("parses a JSON object of headers and stringifies primitive values", () => {
    expect(parseExtraHeaders('{"X-Z-AI-From":"Z","X-Attempt":2}')).toEqual({ "X-Z-AI-From": "Z", "X-Attempt": "2" });
  });

  it("is forgiving: empty, invalid, or non-object input yields no headers", () => {
    expect(parseExtraHeaders("")).toEqual({});
    expect(parseExtraHeaders("   ")).toEqual({});
    expect(parseExtraHeaders("{not json")).toEqual({});
    expect(parseExtraHeaders('["array"]')).toEqual({});
    expect(parseExtraHeaders('"string"')).toEqual({});
    expect(parseExtraHeaders('{"Drop":null}')).toEqual({});
  });
});
