import { describe, it, expect } from "vitest";
import { securityHeaders } from "@/lib/security-headers";

const map = (p: boolean) => Object.fromEntries(securityHeaders(p).map((h) => [h.key, h.value]));

describe("security headers (BOS-065)", () => {
  it("always sends the safe headers", () => {
    for (const env of [true, false]) {
      expect(map(env)).toMatchObject({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
      expect(map(env)["Permissions-Policy"]).toContain("camera=()");
    }
  });
  it("forbids framing and pins https in production", () => {
    const p = map(true);
    expect(p["X-Frame-Options"]).toBe("DENY");
    expect(p["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(p["Strict-Transport-Security"]).toContain("max-age=31536000");
  });
  it("leaves framing open in development so the Ship Studio preview can embed the app", () => {
    const d = map(false);
    expect(d["X-Frame-Options"]).toBeUndefined();
    expect(d["Content-Security-Policy"]).toBeUndefined();
    expect(d["Strict-Transport-Security"]).toBeUndefined();
  });
});
