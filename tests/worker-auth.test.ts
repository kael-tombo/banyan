import { describe, it, expect } from "vitest";
import { tickAuthorized } from "@/lib/worker-auth";

const workerSecret = "worker-secret-value-123";
const cronSecret = "cron-secret-value-4567";

describe("maintenance tick authorization", () => {
  it("accepts the worker secret, and the Vercel Cron secret when one is set", () => {
    expect(tickAuthorized(`Bearer ${workerSecret}`, { workerSecret })).toBe(true);
    expect(tickAuthorized(`Bearer ${cronSecret}`, { workerSecret, cronSecret })).toBe(true);
  });

  it("refuses everything else", () => {
    expect(tickAuthorized(null, { workerSecret, cronSecret })).toBe(false);
    expect(tickAuthorized(workerSecret, { workerSecret })).toBe(false); // no Bearer prefix
    expect(tickAuthorized(`Bearer ${cronSecret}`, { workerSecret })).toBe(false); // cron secret not configured
    expect(tickAuthorized("Bearer ", { workerSecret, cronSecret: "" })).toBe(false);
    expect(tickAuthorized(`Bearer ${workerSecret}x`, { workerSecret })).toBe(false);
  });

  it("ignores a cron secret too short to be a real one", () => {
    expect(tickAuthorized("Bearer short", { workerSecret, cronSecret: "short" })).toBe(false);
  });
});
