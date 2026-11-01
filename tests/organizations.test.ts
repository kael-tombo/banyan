import { describe, it, expect } from "vitest";
import { orgCan, ORG_ROLES, orgSlug, productTypeLabel, type OrgAction } from "@/lib/organizations";

const ACTIONS: OrgAction[] = ["products.access_all", "products.create", "products.archive", "members.invite", "members.change_role", "settings.edit", "billing.view", "billing.manage"];

describe("organization policy (BOS-003)", () => {
  const expected: Record<string, OrgAction[]> = {
    OWNER: ACTIONS,
    ADMIN: ACTIONS.filter((a) => a !== "billing.manage"),
    MEMBER: [],
    BILLING_MANAGER: ["billing.view", "billing.manage"],
  };
  for (const role of ORG_ROLES) {
    it(`${role} is allowed exactly its actions`, () => {
      for (const action of ACTIONS) expect(orgCan(role, action), `${role} ${action}`).toBe(expected[role].includes(action));
    });
  }

  it("grants nothing to product roles, unknown roles or no role", () => {
    for (const role of ["owner", "member", "viewer", "PRODUCT_ADMIN", "", null, undefined]) {
      for (const action of ACTIONS) expect(orgCan(role as string, action)).toBe(false);
    }
  });
});

describe("organization helpers", () => {
  it("makes unique, safe slugs", () => {
    const a = orgSlug("Kael's Studio — Lab!");
    expect(a).toMatch(/^kael-s-studio-lab-[a-z0-9]{6}$/);
    expect(orgSlug("Kael's Studio — Lab!")).not.toBe(a);
    expect(orgSlug("***")).toMatch(/^org-[a-z0-9]{6}$/);
  });
  it("labels product types, falling back to Other", () => {
    expect(productTypeLabel("mobile_app")).toBe("Mobile application");
    expect(productTypeLabel("spaceship")).toBe("Other");
  });
});
