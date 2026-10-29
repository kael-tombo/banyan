import { describe, it, expect } from "vitest";
import {
  buildBanyanNetwork,
  edgePointAt,
  edgeWidthAt,
  mulberry32,
  type VNetwork,
} from "@/components/landing/vascularGeometry";

const EPS = 1e-9;

function build(): VNetwork {
  return buildBanyanNetwork(8);
}

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(8);
    const b = mulberry32(8);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(1234);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("buildBanyanNetwork — determinism", () => {
  it("produces the identical tree for the same seed", () => {
    expect(JSON.stringify(buildBanyanNetwork(8))).toBe(JSON.stringify(buildBanyanNetwork(8)));
  });

  it("produces a different tree for a different seed", () => {
    expect(JSON.stringify(buildBanyanNetwork(8))).not.toBe(JSON.stringify(buildBanyanNetwork(9)));
  });
});

describe("buildBanyanNetwork — graph integrity", () => {
  const net = build();

  it("has ids in creation order and consistent parent/child links", () => {
    net.edges.forEach((e, i) => {
      expect(e.id).toBe(i);
      if (e.parent >= 0) {
        const p = net.edges[e.parent];
        expect(p).toBeDefined();
        expect(p.children).toContain(e.id);
      }
    });
    // No duplicate children entries.
    net.edges.forEach((e) => {
      expect(new Set(e.children).size).toBe(e.children.length);
    });
  });

  it("attaches every child to the exact point it declares on its parent", () => {
    net.edges.forEach((e) => {
      if (e.parent < 0) return;
      const p = net.edges[e.parent];
      const anchor = edgePointAt(p, e.attachT * p.len);
      expect(e.pts[0].x).toBeCloseTo(anchor.x, 6);
      expect(e.pts[0].y).toBeCloseTo(anchor.y, 6);
    });
  });

  it("has positive, monotonically increasing arc-length tables", () => {
    net.edges.forEach((e) => {
      expect(e.len).toBeGreaterThan(0);
      expect(e.cum[0]).toBe(0);
      for (let i = 1; i < e.cum.length; i++) {
        expect(e.cum[i]).toBeGreaterThan(e.cum[i - 1]);
      }
      expect(Math.abs(e.cum[e.cum.length - 1] - e.len)).toBeLessThan(EPS);
    });
  });

  it("contains no NaN or infinite coordinates", () => {
    net.edges.forEach((e) => {
      e.pts.forEach((p) => {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      });
    });
  });
});

describe("buildBanyanNetwork — organic plausibility", () => {
  const net = build();

  it("keeps all pathways inside the composition frame (with margin)", () => {
    net.edges.forEach((e) => {
      e.pts.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(-0.01);
        expect(p.x).toBeLessThanOrEqual(1.01);
        expect(p.y).toBeGreaterThanOrEqual(-0.01);
        expect(p.y).toBeLessThanOrEqual(1.01);
      });
    });
  });

  it("tapers outward — children never start thicker than their parent ends", () => {
    net.edges.forEach((e) => {
      if (e.parent < 0) return;
      const p = net.edges[e.parent];
      const parentEnd = edgeWidthAt(p, e.attachT);
      expect(e.w0).toBeLessThanOrEqual(parentEnd * 1.05 + 1e-6);
      expect(e.w1).toBeLessThanOrEqual(e.w0 + 1e-6);
    });
  });

  it("has a full banyan inventory: canopy endpoints, intake roots, aerial roots", () => {
    expect(net.terminals.length).toBeGreaterThanOrEqual(14);
    expect(net.terminals.length).toBeLessThanOrEqual(48);
    expect(net.rootTips.length).toBeGreaterThanOrEqual(6);
    expect(net.aerialTips.length).toBeGreaterThanOrEqual(1);
    expect(net.edges.filter((e) => e.kind === "trunk").length).toBe(1);
    expect(net.edges.filter((e) => e.kind === "root").length).toBeGreaterThanOrEqual(5);
  });

  it("drops aerial roots all the way to the ground line", () => {
    net.aerialTips.forEach((id) => {
      const e = net.edges[id];
      const tip = e.pts[e.pts.length - 1];
      expect(tip.y).toBeGreaterThanOrEqual(net.groundY - 0.01);
    });
  });

  it("keeps underground root tips below the ground line", () => {
    net.rootTips.forEach((id) => {
      const e = net.edges[id];
      const tip = e.pts[e.pts.length - 1];
      expect(tip.y).toBeGreaterThan(net.groundY - 0.02);
    });
  });

  it("keeps the canopy above the ground line", () => {
    net.terminals.forEach((id) => {
      const e = net.edges[id];
      const tip = e.pts[e.pts.length - 1];
      expect(tip.y).toBeLessThan(net.groundY - 0.08);
    });
  });
});

describe("edgePointAt", () => {
  const net = build();

  it("returns the start point at d=0 and the end point at d=len", () => {
    net.edges.forEach((e) => {
      const s = edgePointAt(e, 0);
      const t = edgePointAt(e, e.len);
      expect(s.x).toBeCloseTo(e.pts[0].x, 9);
      expect(s.y).toBeCloseTo(e.pts[0].y, 9);
      expect(t.x).toBeCloseTo(e.pts[e.pts.length - 1].x, 9);
      expect(t.y).toBeCloseTo(e.pts[e.pts.length - 1].y, 9);
    });
  });

  it("clamps out-of-range distances", () => {
    const e = net.edges[net.trunkBase];
    expect(edgePointAt(e, -5).y).toBeCloseTo(e.pts[0].y, 9);
    expect(edgePointAt(e, 99).y).toBeCloseTo(e.pts[e.pts.length - 1].y, 9);
  });
});
