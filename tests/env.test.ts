import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * env.ts is evaluated at import time, so each scenario re-imports the module
 * with a controlled process.env. This pins two launch guarantees:
 *  1. The dev-default WORKER_SECRET is rejected in production (it guards
 *     POST /api/worker/tick, which can drive every workspace's orchestrator).
 *  2. APP_SECRET must be 64 hex chars — no silent insecure fallback.
 */
const REAL_ENV = process.env;
const HEX64 = "a".repeat(64);

function withEnv(overrides: Record<string, string>) {
  process.env = {
    ...REAL_ENV,
    DATABASE_URL: REAL_ENV.DATABASE_URL || "file:./test.db",
    APP_SECRET: HEX64,
    NODE_ENV: "production",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

afterEach(() => {
  process.env = REAL_ENV;
  vi.resetModules();
});

describe("environment validation", () => {
  it("accepts a production config with a unique WORKER_SECRET", async () => {
    withEnv({ WORKER_SECRET: "prod-secret-9f8a7b" });
    const mod = await import("@/lib/env");
    expect(mod.env.WORKER_SECRET).toBe("prod-secret-9f8a7b");
    expect(mod.isProd).toBe(true);
  });

  it("rejects the development-default WORKER_SECRET in production", async () => {
    withEnv({ WORKER_SECRET: "banyan-worker-dev-secret" });
    await expect(import("@/lib/env")).rejects.toThrow(/WORKER_SECRET/);
  });

  it("rejects the development-default WORKER_SECRET even when unset in production", async () => {
    withEnv({ WORKER_SECRET: "" });
    delete process.env.WORKER_SECRET; // schema default would apply → must still throw
    await expect(import("@/lib/env")).rejects.toThrow(/WORKER_SECRET/);
  });

  it("allows a non-production environment to run without WORKER_SECRET", async () => {
    process.env = {
      ...REAL_ENV,
      DATABASE_URL: REAL_ENV.DATABASE_URL || "file:./test.db",
      APP_SECRET: HEX64,
      NODE_ENV: "development",
      WORKER_SECRET: "",
    } as NodeJS.ProcessEnv;
    const mod = await import("@/lib/env");
    expect(mod.isProd).toBe(false);
  });

  it("rejects a malformed APP_SECRET in any environment", async () => {
    withEnv({ APP_SECRET: "too-short", WORKER_SECRET: "prod-secret-9f8a7b" });
    await expect(import("@/lib/env")).rejects.toThrow(/APP_SECRET/);
  });
});
