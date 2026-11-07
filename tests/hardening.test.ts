import { describe, expect, it } from "vitest";
import { logLine, redact, REDACTED } from "@/lib/log";
import { seedPasswordProblem, DEFAULT_SEED_PASSWORD } from "@/lib/bootstrap/seed-demo";
import { parseGrantArgs } from "../scripts/credits-grant";

describe("structured logs never carry secrets (blocker 10)", () => {
  it("redacts secret-named fields at any depth", () => {
    const out = redact({ user: "ada", password: "hunter2", nested: { apiKey: "x", accessToken: "y", ok: 1 }, headers: { Authorization: "Bearer abc", cookie: "s=1" } }) as Record<string, any>;
    expect(out.user).toBe("ada");
    expect(out.password).toBe(REDACTED);
    expect(out.nested).toEqual({ apiKey: REDACTED, accessToken: REDACTED, ok: 1 });
    expect(out.headers).toEqual({ Authorization: REDACTED, cookie: REDACTED });
  });

  it("redacts secret-looking values under innocent keys", () => {
    const line = logLine("error", "publish.failed", {
      error: "call failed with Bearer sfl_abcdefghijklmnopqrstuvwxyz and key sk-ABCDEFGHIJKLMNOPQRSTU",
      db: "postgresql://banyan:supersecret@db:5432/banyan",
    });
    expect(line).not.toContain("sfl_abcdefghijklmnop");
    expect(line).not.toContain("sk-ABCDEFGHIJ");
    expect(line).not.toContain("supersecret");
    expect(line).toContain("postgresql://banyan:[redacted]@db:5432/banyan");
    expect(JSON.parse(line)).toMatchObject({ level: "error", event: "publish.failed", service: "web" });
  });

  it("logs an Error as its name and a redacted message", () => {
    expect(redact(new Error("token sfl_abcdefghijklmnopqrstuvwxyz rejected"))).toEqual({ name: "Error", message: `token ${REDACTED} rejected` });
  });
});

describe("seed password in production (blocker 10)", () => {
  it("refuses the published default and weak passwords in production only", () => {
    expect(seedPasswordProblem(undefined, "production")).toMatch(/published default/);
    expect(seedPasswordProblem(DEFAULT_SEED_PASSWORD, "production")).toMatch(/published default/);
    expect(seedPasswordProblem("short", "production")).toMatch(/12 characters/);
    expect(seedPasswordProblem("a-long-unique-passphrase", "production")).toBeNull();
    expect(seedPasswordProblem(undefined, "development")).toBeNull();
  });
});

describe("operator credit grant arguments (blocker 11 interim)", () => {
  it("needs a product, a sane whole amount and a real reason", () => {
    expect(parseGrantArgs(["banyan", "100", "design", "partner", "cycle"])).toEqual({ target: "banyan", amount: 100, reason: "design partner cycle" });
    expect(parseGrantArgs(["banyan", "100"])).toHaveProperty("error");
    expect(parseGrantArgs(["banyan", "-5", "refund"])).toHaveProperty("error");
    expect(parseGrantArgs(["banyan", "2.5", "refund it"])).toHaveProperty("error");
    expect(parseGrantArgs(["banyan", "100000", "too many"])).toHaveProperty("error");
    expect(parseGrantArgs(["banyan", "10", "x"])).toHaveProperty("error");
  });
});
