import { describe, it, expect } from "vitest";
import { assembleOverview } from "@/lib/org-overview";

const m = (o: Record<string, number>) => new Map(Object.entries(o));
const products = [
  { id: "a", name: "A", productType: "saas", status: "active" },
  { id: "b", name: "B", productType: "mobile_app", status: "active" },
  { id: "c", name: "C", productType: "ecommerce", status: "active" },
];

describe("founder command center (BOS-014)", () => {
  const o = assembleOverview(14, products, {
    waiting: m({ a: 3, b: 1 }),
    cycles: new Map([["a", { id: "g1", objective: "20 signups", progress: 50, deadline: null }]]),
    published: m({ a: 2 }),
    failures: m({ b: 1 }),
    measured: new Set(["a", "b"]),
    visits: m({ a: 40 }),
    signups: m({ a: 3 }),
    credits: m({ a: 44, b: 50 }),
  });

  it("gives each product its own numbers", () => {
    expect(o.products.find((p) => p.id === "a")).toMatchObject({ waiting: 3, published: 2, visits: 40, signups: 3, credits: 44 });
    expect(o.products.find((p) => p.id === "b")).toMatchObject({ waiting: 1, failures: 1, visits: 0, signups: 0, cycle: null });
  });

  it("keeps 'not measured' (null) apart from a measured zero", () => {
    const c = o.products.find((p) => p.id === "c")!;
    expect(c.visits).toBeNull();
    expect(c.signups).toBeNull();
    expect(c.credits).toBeNull();
  });

  it("totals only what was measured", () => {
    expect(o.totals).toEqual({ products: 3, waiting: 4, activeCycles: 1, published: 2, failures: 1, visits: 40, signups: 3, credits: 94 });
  });

  it("has null totals when no product measures anything", () => {
    const none = assembleOverview(7, products.slice(2), { waiting: m({}), cycles: new Map(), published: m({}), failures: m({}), measured: new Set(), visits: m({}), signups: m({}), credits: m({}) });
    expect(none.totals).toMatchObject({ visits: null, signups: null, credits: null, waiting: 0 });
  });
});
