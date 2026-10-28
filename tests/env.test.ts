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

  it("build phase succeeds with zero secrets — build machines evaluate page modules without runtime config", async () => {
    // Simulates a Vercel/CI build machine: production NODE_ENV, NEXT_PHASE
    // set, and none of DATABASE_URL / APP_SECRET / WORKER_SECRET present.
    process.env = {
      ...REAL_ENV,
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
    } as NodeJS.ProcessEnv;
    delete process.env.DATABASE_URL;
    delete process.env.APP_SECRET;
    delete process.env.WORKER_SECRET;
    const mod = await import("@/lib/env");
    expect(mod.env.DATABASE_URL).toBe("file:./build-placeholder.db");
    expect(mod.env.APP_SECRET).toBe("0".repeat(64));
  });

  it("build phase tolerates the dev-default WORKER_SECRET (it is a runtime-only guard)", async () => {
    withEnv({ WORKER_SECRET: "banyan-worker-dev-secret", NEXT_PHASE: "phase-production-build" });
    const mod = await import("@/lib/env");
    expect(mod.env.WORKER_SECRET).toBe("banyan-worker-dev-secret");
  });

  it("production runtime without DATABASE_URL still fails fast (no silent placeholder leaks out of build)", async () => {
    process.env = {
      ...REAL_ENV,
      NODE_ENV: "production",
      APP_SECRET: HEX64,
      WORKER_SECRET: "prod-secret-9f8a7b",
    } as NodeJS.ProcessEnv;
    delete process.env.DATABASE_URL;
    delete process.env.NEXT_PHASE;
    await expect(import("@/lib/env")).rejects.toThrow(/DATABASE_URL/);
  });
});
