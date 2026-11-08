import { describe, it, expect } from "vitest";
import { scoreWorkspace, summarise, type WorkspaceActivationInput } from "@/lib/activation";

const T0 = new Date("2026-11-01T08:00:00Z");
const h = (n: number) => new Date(T0.getTime() + n * 3_600_000);

const ws = (at: WorkspaceActivationInput["at"], providerPublications = 0, id = "w1"): WorkspaceActivationInput => ({
  workspaceId: id, name: id, isSelf: false, at: { workspace_created: T0, ...at }, providerPublications,
});
const check = (r: ReturnType<typeof scoreWorkspace>, label: string) => r.checks.find((c) => c.label === label)!;

describe("activation scoring", () => {
  it("passes every measurable §11 threshold for a complete fast cycle", () => {
    const r = scoreWorkspace(
      ws({ url_submitted: h(1), first_asset_approved: h(5), first_publication: h(6), first_provider_publication: h(6), first_tracked_visit: h(30) }, 2),
      h(48)
    );
    expect(check(r, "Time to first approved asset")).toMatchObject({ result: "pass", detail: "4 h" });
    expect(check(r, "Live publications").result).toBe("pass");
    expect(check(r, "Tracked outcome")).toMatchObject({ result: "pass", detail: "24 h after first publication" });
    expect(check(r, "Founder active time").result).toBe("not_measured");
    expect(r.timeToFirstPublicationHours).toBe(5);
  });

  it("times from intake, falling back to workspace creation", () => {
    expect(scoreWorkspace(ws({ first_asset_approved: h(30) }), h(31)).timeToFirstApprovedAssetHours).toBe(30);
    expect(check(scoreWorkspace(ws({ first_asset_approved: h(30) }), h(31)), "Time to first approved asset").result).toBe("fail");
  });

  it("is pending inside the 24 h window and fails after it with nothing approved", () => {
    expect(check(scoreWorkspace(ws({ url_submitted: h(0) }), h(10)), "Time to first approved asset").result).toBe("pending");
    expect(check(scoreWorkspace(ws({ url_submitted: h(0) }), h(25)), "Time to first approved asset").result).toBe("fail");
  });

  it("only counts an outcome within 7 days of the first publication", () => {
    const late = scoreWorkspace(ws({ first_publication: h(0), first_attributed_signup: h(24 * 8) }), h(24 * 9));
    expect(check(late, "Tracked outcome")).toMatchObject({ result: "fail", detail: "first outcome came after the 7-day window" });
    const open = scoreWorkspace(ws({ first_publication: h(0) }), h(24 * 3));
    expect(check(open, "Tracked outcome").result).toBe("pending");
    const none = scoreWorkspace(ws({ first_publication: h(0) }), h(24 * 8));
    expect(check(none, "Tracked outcome")).toMatchObject({ result: "fail", detail: "none in 7 days" });
  });

  it("does not treat manual publications as provider-confirmed", () => {
    const r = scoreWorkspace(ws({ first_publication: h(2) }, 0), h(3));
    expect(check(r, "Live publications")).toMatchObject({ result: "pending", detail: "0 provider-confirmed" });
  });
});

describe("funnel summary", () => {
  it("reports reach per stage, medians, and primary activation beside any-path publication", () => {
    const now = h(100);
    const rows = [
      scoreWorkspace(ws({ url_submitted: h(0), first_asset_approved: h(2), first_publication: h(3), first_provider_publication: h(3) }, 2, "a"), now),
      scoreWorkspace(ws({ url_submitted: h(0), first_asset_approved: h(6), first_publication: h(10) }, 0, "b"), now),
      scoreWorkspace(ws({ url_submitted: h(0) }, 0, "c"), now),
    ];
    const s = summarise(rows);
    expect(s.workspaces).toBe(3);
    expect(s.stages.find((x) => x.key === "url_submitted")).toMatchObject({ reached: 3, percent: 100 });
    expect(s.stages.find((x) => x.key === "first_asset_approved")).toMatchObject({ reached: 2, percent: 66.7 });
    expect(s.medianHoursToFirstApprovedAsset).toBe(4);
    expect(s.medianHoursToFirstPublication).toBe(6.5);
    expect(s.primaryActivationPercent).toBe(33.3);
    expect(s.anyPathPublicationPercent).toBe(66.7);
  });

  it("handles no workspaces without dividing by zero", () => {
    expect(summarise([])).toMatchObject({ workspaces: 0, primaryActivationPercent: 0, medianHoursToFirstPublication: null });
  });
});
