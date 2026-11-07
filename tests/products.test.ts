import { describe, it, expect } from "vitest";
import { pickActiveProduct, type AccessibleProduct } from "@/lib/products";

const product = (id: string, status = "active", via: AccessibleProduct["via"] = "membership"): AccessibleProduct => ({
  workspace: { id, status, organizationId: "org1", name: id } as AccessibleProduct["workspace"],
  role: "owner",
  via,
  membership: null,
});

describe("active product (BOS-009)", () => {
  const mine = [product("a"), product("b"), product("c", "active", "organization")];

  it("uses the preferred product when the user can reach it", () => {
    expect(pickActiveProduct(mine, "b")?.workspace.id).toBe("b");
    expect(pickActiveProduct(mine, "c")?.workspace.id).toBe("c");
  });

  it("ignores a preference for a product the user cannot reach (forged or revoked cookie)", () => {
    expect(pickActiveProduct(mine, "someone-elses-product")?.workspace.id).toBe("a");
    expect(pickActiveProduct(mine, "")?.workspace.id).toBe("a");
    expect(pickActiveProduct(mine, null)?.workspace.id).toBe("a");
  });

  it("falls back past archived products, but still honours an explicit archived choice", () => {
    const withArchived = [product("old", "archived"), product("new")];
    expect(pickActiveProduct(withArchived, null)?.workspace.id).toBe("new");
    expect(pickActiveProduct(withArchived, "old")?.workspace.id).toBe("old");
    expect(pickActiveProduct([product("only", "archived")], null)?.workspace.id).toBe("only");
  });

  it("returns null when the user can reach nothing", () => {
    expect(pickActiveProduct([], "a")).toBeNull();
  });
});
