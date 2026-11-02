import { describe, expect, it } from "vitest";
import { attentionFor } from "@/components/app-nav";

describe("what the rail says needs the founder", () => {
  const a = { approvals: 3, failedPosts: 2, brokenConnections: 1 };

  it("marks decisions on Approvals and problems where they get fixed", () => {
    expect(attentionFor("/app/approvals", a)).toEqual({ n: 3, tone: "decision" });
    expect(attentionFor("/app/publishing", a)).toEqual({ n: 2, tone: "problem" });
    expect(attentionFor("/app/connections", a)).toEqual({ n: 1, tone: "problem" });
  });

  it("shows nothing anywhere else, and nothing when all is well", () => {
    expect(attentionFor("/app/content", a)).toBeNull();
    expect(attentionFor("/app/approvals", { approvals: 0 })).toBeNull();
    expect(attentionFor("/app/publishing", { approvals: 0, failedPosts: 0 })).toBeNull();
  });
});
