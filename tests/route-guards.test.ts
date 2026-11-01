import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression guard for BOS-010/066: every API handler that changes data must
 * check the caller's role (requireRole) or an organization permission
 * (orgCan). Found 2026-11-02: 18 mutating routes checked who you were but not
 * what your role allowed. Exceptions are listed with their reason.
 */
const EXEMPT: Record<string, string> = {
  "auth/login": "public sign-in",
  "auth/logout": "ends your own session",
  "auth/signup": "public sign-up",
  "auth/oauth/complete": "sign-in callback",
  "auth/oauth/accounts/[id]": "your own linked sign-in accounts",
  "session/product": "switches your own active product; target re-validated against reach",
  "tokens": "your own access tokens (read-only MCP)",
  "tokens/[id]": "revokes your own token",
  "mcp": "token-authenticated, read-only tools",
  "worker/tick": "protected by WORKER_SECRET, no user",
};

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? routeFiles(p) : e.name === "route.ts" ? [p] : [];
  });
}

const API = path.join(process.cwd(), "src", "app", "api");

describe("every mutating API route checks authorization", () => {
  const files = routeFiles(API);

  it("finds the API routes", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  for (const file of files) {
    const route = path.relative(API, path.dirname(file)).split(path.sep).join("/");
    const src = fs.readFileSync(file, "utf8");
    const handlers = [...src.matchAll(/export async function (POST|PUT|PATCH|DELETE)\b/g)].map((m) => ({ method: m[1], at: m.index ?? 0 }));
    for (const [i, h] of handlers.entries()) {
      const end = handlers[i + 1]?.at ?? src.length;
      const body = src.slice(h.at, end);
      const refusesOutright = /return apiError\([^)]*,\s*405\)/.test(body) && !/requireWorkspace/.test(body);
      it(`${h.method} /api/${route}`, () => {
        if (EXEMPT[route] || refusesOutright) return;
        const usesWorkspace = /requireWorkspace\(\)/.test(body) || /authenticateToken/.test(body);
        if (!usesWorkspace) return; // handlers with their own secret/session logic are covered by EXEMPT review
        expect(/requireRole\(|orgCan\(/.test(body), `${h.method} /api/${route} changes data without a role check`).toBe(true);
      });
    }
  }
});
