import { describe, expect, it } from "vitest";
import { outcomeFromStatus } from "@/lib/publishing/status-sync";

const ok = (state: string, url?: string) => ({ ok: true as const, value: { state, url } });

describe("publication status sync (BOS-027)", () => {
  it("confirms a post only when the provider says published, keeping its URL", () => {
    expect(outcomeFromStatus(ok("published", "https://x.com/i/web/status/1"), "p1")).toMatchObject({ ok: true, externalId: "p1", externalUrl: "https://x.com/i/web/status/1" });
  });

  it("keeps waiting while the provider still holds the post", () => {
    for (const state of ["queued", "scheduled", "unknown"]) {
      expect(outcomeFromStatus(ok(state), "p1")).toMatchObject({ ok: false, retryable: true, externalId: "p1" });
    }
  });

  it("ends honestly when the provider reports failed or cancelled", () => {
    expect(outcomeFromStatus(ok("failed"), "p1")).toMatchObject({ ok: false, retryable: false });
    expect(outcomeFromStatus(ok("cancelled"), "p1")).toMatchObject({ ok: false, retryable: false, error: expect.stringContaining("nothing was published") });
  });

  it("retries a transient status failure, and replays the idempotent publish when the status is inconclusive", () => {
    expect(outcomeFromStatus({ ok: false, error: { code: "timeout", message: "slow", retryable: true } }, "p1")).toMatchObject({ ok: false, retryable: true });
    expect(outcomeFromStatus({ ok: false, error: { code: "not_found", message: "gone", retryable: false } }, "p1")).toBeNull();
  });
});
