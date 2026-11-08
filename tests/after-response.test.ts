import { describe, it, expect } from "vitest";
import { finishAfterResponse } from "@/lib/runtime/after-response";

describe("finishAfterResponse", () => {
  it("outside a request (worker, scripts) the task still runs to the end, and nothing throws", async () => {
    let done = false;
    expect(() => finishAfterResponse(new Promise((r) => setTimeout(() => { done = true; r(null); }, 10)))).not.toThrow();
    await new Promise((r) => setTimeout(r, 30));
    expect(done).toBe(true);
  });

  it("a failing task never surfaces as an unhandled rejection", async () => {
    expect(() => finishAfterResponse(Promise.reject(new Error("boom")))).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});
