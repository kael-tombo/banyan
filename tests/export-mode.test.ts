import { describe, it, expect } from "vitest";
import { renderExport } from "@/lib/distribution/export";

const item = {
  id: "c1",
  workspaceId: "ws1",
  campaignId: "camp1",
  title: "Offline mode launch thread",
  channel: "x",
  format: "thread",
  body: "You finish the job on the train. No signal.\n\nLedgerline works offline, on every plan.",
  status: "approved",
  approvedById: "u1",
  videoExtras: null,
  scheduledFor: null,
};

describe("export package (US-034)", () => {
  it("carries the post's tracked link in the package, the text and the Markdown", () => {
    const link = "https://banyan.example/t/abc123";
    const out = renderExport(item, link);
    expect(out.pkg.trackedLink).toBe(link);
    expect(out.text).toContain(link);
    expect(out.markdown).toContain(`Tracked link: ${link}`);
  });

  it("explains how to get a tracked link when the product URL is missing, instead of inventing one", () => {
    const out = renderExport(item, null);
    expect(out.pkg.trackedLink).toBeNull();
    expect(out.markdown).toMatch(/add your product URL/i);
    expect(out.text).not.toMatch(/\/t\//);
  });

  it("includes the exact approved copy", () => {
    expect(renderExport(item, null).markdown).toContain(item.body);
  });

  it("never claims the post is published; recording the live URL is the last step", () => {
    const { markdown, pkg } = renderExport(item, "https://banyan.example/t/x");
    expect(markdown).not.toMatch(/status:\s*published/i);
    expect(markdown).not.toMatch(/has been published/i);
    expect(pkg.checklist.at(-1)).toMatch(/record it in Banyan as a manual publication/i);
    expect(markdown).toMatch(/you publish this/i);
  });

  it("names SocialFlow.ai only as a future path, not as where to paste today", () => {
    const { pkg } = renderExport(item, null);
    expect(pkg.checklist.join(" ")).toMatch(/publish the content below yourself/i);
    expect(pkg.checklist.join(" ")).not.toMatch(/paste the content below into SocialFlow/i);
  });
});
