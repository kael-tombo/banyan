import { describe, it, expect } from "vitest";
import { can, productRole, PRODUCT_ROLES, requireRole, type Capability } from "@/lib/permissions";

const CAPS: Capability[] = ["read", "write", "approve", "control", "manage"];
const EXPECTED: Record<string, Capability[]> = {
  PRODUCT_ADMIN: CAPS,
  MARKETING_MANAGER: ["read", "write", "approve", "control"],
  CONTENT_EDITOR: ["read", "write"],
  ANALYST: ["read"],
  VIEWER: ["read"],
};

describe("product roles (BOS-010)", () => {
  for (const role of PRODUCT_ROLES) {
    it(`${role} has exactly its capabilities`, () => {
      for (const c of CAPS) expect(can(role, c), `${role} ${c}`).toBe(EXPECTED[role].includes(c));
    });
  }

  it("maps the roles stored before BOS-010 so nobody's rights change", () => {
    expect(productRole("owner")).toBe("PRODUCT_ADMIN");
    expect(productRole("member")).toBe("MARKETING_MANAGER");
    expect(productRole("viewer")).toBe("VIEWER");
    for (const c of CAPS) {
      expect(can("owner", c)).toBe(true);
      expect(can("member", c)).toBe(c !== "manage");
    }
  });

  it("grants nothing to unknown roles, organization roles or no role", () => {
    for (const r of ["OWNER", "ADMIN", "BILLING_MANAGER", "superuser", "", null, undefined]) {
      for (const c of CAPS) expect(can(r as string, c)).toBe(false);
    }
  });

  it("an editor drafts but cannot approve or publish; an analyst only reads", () => {
    expect(requireRole("CONTENT_EDITOR", "write")).toBeNull();
    expect(requireRole("CONTENT_EDITOR", "approve")).toMatch(/product admins and marketing managers/);
    expect(requireRole("CONTENT_EDITOR", "control")).toMatch(/run or publish/);
    expect(requireRole("ANALYST", "write")).toMatch(/write access/);
  });
});
