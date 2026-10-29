/*
 * The Living Vascular Tree — network geometry.
 *
 * A seeded, deterministic procedural model of a banyan tree as a transport
 * network. Every pathway is an edge in a graph: a polyline with arc-length
 * tables, a width taper, and a parent/child relationship. Particles (in
 * VascularTree.tsx) traverse this graph, so information always follows valid
 * connected pathways — never floating freely through space.
 *
 * Biological organization, per the design brief:
 *   roots / rootlets — the intake interface (underground, dim)
 *   trunk            — the primary transport corridor (stout, tapered)
 *   branch           — progressively distributed pathways (two depths)
 *   twig             — terminal pathways; their ends are the connected
 *                      endpoints (tools, channels, services, pipelines)
 *   aerial           — banyan aerial roots dropping from the canopy to the
 *                      ground: new ground the tree reaches into
 *
 * Coordinates are normalized to a 1×1 box (y grows downward, ground at
 * `groundY`); the renderer scales by min(canvasWidth, canvasHeight). No DOM,
 * no randomness outside the seeded PRNG — the same seed always produces the
 * same tree, so the composition is stable across renders and reloads.
 */

export interface VPt {
  x: number;
  y: number;
}

export type VEdgeKind = "root" | "rootlet" | "trunk" | "branch" | "twig" | "aerial";

export interface VEdge {
  id: number;
  kind: VEdgeKind;
  /** Polyline from the edge's start (junction with parent) to its end. */
  pts: VPt[];
  /** Cumulative arc length at each point; cum[0] = 0, strictly increasing. */
  cum: number[];
  /** Total arc length (normalized units). */
  len: number;
  /** Stroke width at start / end (normalized; multiply by render scale). */
  w0: number;
  w1: number;
  /** Parent edge id, or -1 for the two roots of the graph (trunk, roots). */
  parent: number;
  /** Where along the parent (0..1 of its length) this edge attaches. */
  attachT: number;
  /** Downstream edges, in creation order. */
  children: number[];
}

export interface VNetwork {
  edges: VEdge[];
  /** Childless canopy edges — the connected endpoints (activation sites). */
  terminals: number[];
  /** Underground root edges — intake spawn sites at their far (tip) end. */
  rootTips: number[];
  /** Aerial-root edges — their ground end is a "new ground" endpoint. */
  aerialTips: number[];
  /** The lowest trunk edge; its start junction is the base of the tree. */
  trunkBase: number;
  /** Normalized ground line. */
  groundY: number;
}

/** Small, fast, seedable PRNG (mulberry32). Deterministic across engines. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interpolate a point at distance `d` along an edge's polyline. */
export function edgePointAt(e: VEdge, d: number): VPt {
  const dd = d < 0 ? 0 : d > e.len ? e.len : d;
  let lo = 0;
  let hi = e.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (e.cum[mid] <= dd) lo = mid;
    else hi = mid;
  }
  const span = e.cum[hi] - e.cum[lo] || 1e-9;
  const k = (dd - e.cum[lo]) / span;
  return {
    x: e.pts[lo].x + (e.pts[hi].x - e.pts[lo].x) * k,
    y: e.pts[lo].y + (e.pts[hi].y - e.pts[lo].y) * k,
  };
}

/** Local direction (unit vector, start→end order) at distance `d`. */
export function edgeDirAt(e: VEdge, d: number): VPt {
  const dd = d < 0 ? 0 : d > e.len ? e.len : d;
  let lo = 0;
  let hi = e.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (e.cum[mid] <= dd) lo = mid;
    else hi = mid;
  }
  const dx = e.pts[hi].x - e.pts[lo].x;
  const dy = e.pts[hi].y - e.pts[lo].y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/** Width of an edge at parameter u ∈ [0,1] (linear taper). */
export function edgeWidthAt(e: VEdge, u: number): number {
  return e.w0 + (e.w1 - e.w0) * (u < 0 ? 0 : u > 1 ? 1 : u);
}

/**
 * Build the banyan. All randomness flows from `seed`; the call order is
 * fixed, so geometry is fully reproducible.
 */
export function buildBanyanNetwork(seed: number): VNetwork {
  const rng = mulberry32(seed);
  const rand = (min: number, max: number) => min + rng() * (max - min);
  const groundY = 0.9;

  const edges: VEdge[] = [];

  /**
   * Grow one edge as a polyline: `segs` steps of `length/segs`, starting at
   * `start` heading `angle0` (radians; -π/2 is up), curving by `curl` total,
   * with per-segment jitter. A soft boundary field nudges paths back into
   * the frame so the composition stays composed without hard clipping.
   */
  const grow = (
    kind: VEdgeKind,
    parent: number,
    attachT: number,
    start: VPt,
    angle0: number,
    length: number,
    segs: number,
    curl: number,
    w0: number,
    w1: number,
  ): VEdge => {
    const pts: VPt[] = [{ x: start.x, y: start.y }];
    let x = start.x;
    let y = start.y;
    let a = angle0;
    const step = length / segs;
    const underground = kind === "root" || kind === "rootlet";
    for (let i = 0; i < segs; i++) {
      a += curl / segs + rand(-0.09, 0.09);
      // Soft boundaries: steer back toward the frame instead of clipping.
      if (x < 0.06) a += (0.06 - x) * 3.2;
      else if (x > 0.94) a += (0.94 - x) * 3.2;
      if (y < 0.07) a += (y - 0.07) * -3.2;
      else if (!underground && y > groundY - 0.06) {
        a += (groundY - 0.06 - y) * 2.6;
      } else if (y > 0.945) {
        // Strong pull for steep underground roots so they never leave the frame.
        a += (0.945 - y) * (underground ? 16 : 3.2);
      }
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push({ x, y });
    }
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const edge: VEdge = {
      id: edges.length,
      kind,
      pts,
      cum,
      len: cum[cum.length - 1],
      w0,
      w1,
      parent,
      attachT,
      children: [],
    };
    edges.push(edge);
    if (parent >= 0) edges[parent].children.push(edge.id);
    return edge;
  };

  const pointOn = (e: VEdge, t: number): VPt => edgePointAt(e, t * e.len);

  /* ————— Trunk: the primary transport corridor, one stout tapered spine. ————— */
  const trunk = grow(
    "trunk", -1, 0,
    { x: 0.5, y: groundY },
    -Math.PI / 2 + rand(-0.05, 0.05),
    0.62, 10,
    rand(-0.12, 0.12),
    0.052, 0.02,
  );

  /* ————— Canopy: main branches off the trunk's upper half. —————
     Lower branches spread wide and lift; upper ones arch outward — the
     layered, enormous canopy of a mature banyan, never radial spokes. */
  const attachTs = [0.46, 0.58, 0.70, 0.80, 0.89, 0.97];
  const mains: VEdge[] = [];
  attachTs.forEach((t, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const tier = Math.floor(i / 2); // 0 = lower pair · 1 = mid pair · 2 = crown
    /* Monotonic spread per tier gives the classic banyan dome — lower
       branches reach wide and horizontal, the crown arches upward — so
       same-side branches fan out without crossing each other. */
    const spread = tier === 0 ? rand(0.85, 1.1) : tier === 1 ? rand(0.6, 0.85) : rand(0.22, 0.45);
    const angle = -Math.PI / 2 + side * spread;
    const curl = tier === 2 ? side * rand(0.18, 0.4) : -side * rand(0.08, 0.3);
    const w0 = edgeWidthAt(trunk, t) * rand(0.62, 0.75);
    const len = tier === 0 ? rand(0.18, 0.26) : tier === 1 ? rand(0.15, 0.22) : rand(0.12, 0.18);
    mains.push(
      grow(
        "branch", trunk.id, t,
        pointOn(trunk, t),
        angle,
        len, 6,
        curl,
        w0, w0 * rand(0.55, 0.65),
      ),
    );
  });

  /* ————— Secondary pathways: each main branch divides again. —————
     Angles stay relative to the parent's end direction so pathways fork
     like living wood instead of crossing it. */
  const secondaries: VEdge[] = [];
  const endAngle = (e: VEdge) => {
    const n = e.pts.length;
    return Math.atan2(e.pts[n - 1].y - e.pts[n - 2].y, e.pts[n - 1].x - e.pts[n - 2].x);
  };
  mains.forEach((b) => {
    const ts = [0.45, 0.72, 1.0];
    ts.forEach((t) => {
      if (rng() < 0.18) return; // not every junction divides — organic rhythm
      const side = rng() < 0.5 ? -1 : 1;
      const angle = endAngle(b) + side * rand(0.22, 0.5);
      const w0 = edgeWidthAt(b, t) * rand(0.7, 0.82);
      secondaries.push(
        grow(
          "branch", b.id, t,
          pointOn(b, t),
          angle,
          rand(0.06, 0.115), 4,
          side * rand(-0.15, 0.28),
          w0, w0 * 0.55,
        ),
      );
    });
  });

  /* ————— Twigs: the fine terminal pathways — connected endpoints. ————— */
  secondaries.forEach((s) => {
    const ts = [0.55, 1.0];
    ts.forEach((t) => {
      if (rng() < 0.3) return;
      const side = rng() < 0.5 ? -1 : 1;
      const w0 = edgeWidthAt(s, t) * rand(0.7, 0.9);
      grow(
        "twig", s.id, t,
        pointOn(s, t),
        endAngle(s) + side * rand(0.12, 0.38),
        rand(0.028, 0.055), 3,
        side * rand(-0.18, 0.28),
        w0, w0 * 0.5,
      );
    });
  });

  /* ————— Aerial roots: the banyan's signature — new ground. —————
     Dropped from lower-canopy branch junctions, they fall until they meet
     the ground, where they become delivery endpoints (and, over time,
     load-bearing structure). Drop sites are chosen by scanning each lower
     branch for the attachment closest to mid-canopy height, so a drop is
     always well-placed — then two or three become aerial roots. */
  const aerialTips: number[] = [];
  const aerialCandidates: { b: VEdge; t: number; yDist: number }[] = [];
  mains.forEach((b, i) => {
    if (i < 1 || i > 4) return;
    let bestT = 0.5;
    let bestDist = Infinity;
    for (let k = 0; k <= 20; k++) {
      const t = 0.45 + (k / 20) * 0.45;
      const y = pointOn(b, t).y;
      const d = Math.abs(y - 0.55);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    aerialCandidates.push({ b, t: bestT, yDist: bestDist });
  });
  aerialCandidates.sort((c1, c2) => c1.yDist - c2.yDist);
  const dropCount = 2 + (rng() < 0.5 ? 1 : 0);
  for (const c of aerialCandidates) {
    if (aerialTips.length >= dropCount) break;
    if (aerialTips.length >= 2 && rng() < 0.5) continue;
    const b = c.b;
    const t = c.t;
    const start = pointOn(b, t);
    const pts: VPt[] = [{ x: start.x, y: start.y }];
    let x = start.x;
    let y = start.y;
    let a = Math.PI / 2 + rand(-0.16, 0.16);
    const step = 0.034;
    for (let i2 = 0; i2 < 34; i2++) {
      a += rand(-0.05, 0.05);
      if (Math.abs(x - 0.5) > 0.36) a += (0.5 - x) * 0.22;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push({ x, y });
      if (y >= groundY - 0.003) break;
    }
    // Guarantee ground contact: extend the last leg straight down if needed.
    while (pts[pts.length - 1].y < groundY - 0.003) {
      const last = pts[pts.length - 1];
      pts.push({ x: last.x, y: last.y + 0.02 });
    }
    const cum: number[] = [0];
    for (let i2 = 1; i2 < pts.length; i2++) {
      cum.push(cum[i2 - 1] + Math.hypot(pts[i2].x - pts[i2 - 1].x, pts[i2].y - pts[i2 - 1].y));
    }
    const edge: VEdge = {
      id: edges.length,
      kind: "aerial",
      pts,
      cum,
      len: cum[cum.length - 1],
      w0: Math.max(0.0055, edgeWidthAt(b, t) * 0.65),
      w1: 0.004,
      parent: b.id,
      attachT: t,
      children: [],
    };
    edges.push(edge);
    edges[b.id].children.push(edge.id);
    aerialTips.push(edge.id);
  }

  /* ————— Root system: the intake interface, underground and dim. ————— */
  const rootTips: number[] = [];
  const roots: VEdge[] = [];
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const angle = Math.PI / 2 + side * rand(0.22, 1.02);
    const w0 = 0.024 * rand(0.8, 1.15);
    const r = grow(
      "root", -1, 0,
      { x: 0.5, y: groundY },
      angle,
      rand(0.10, 0.17), 5,
      side * rand(-0.25, 0.25),
      w0, 0.0028,
    );
    roots.push(r);
    rootTips.push(r.id);
  }
  // Fine rootlets: the hairline intake network.
  roots.forEach((r) => {
    if (rng() < 0.4) return;
    const side = rng() < 0.5 ? -1 : 1;
    const t = rand(0.55, 1.0);
    const w0 = edgeWidthAt(r, t) * rand(0.45, 0.6);
    const rl = grow(
      "rootlet", r.id, t,
      pointOn(r, t),
      Math.atan2(r.pts[r.pts.length - 1].y - r.pts[0].y, r.pts[r.pts.length - 1].x - r.pts[0].x) + side * rand(0.2, 0.55),
      rand(0.035, 0.07), 3,
      side * rand(-0.2, 0.3),
      w0, w0 * 0.45,
    );
    rootTips.push(rl.id);
  });

  /* ————— Final safety pass: keep every point inside the frame. —————
     The soft boundary makes overshoots rare; this makes them impossible.
     Degenerate (zero-length) segments produced by clamping are dropped and
     the arc-length table is rebuilt so the graph stays traversal-safe. */
  edges.forEach((e) => {
    let clamped = false;
    e.pts.forEach((p) => {
      const cy = p.y > 0.985 ? 0.985 : p.y;
      const cx = p.x < 0.04 ? 0.04 : p.x > 0.96 ? 0.96 : p.x;
      if (cx !== p.x || cy !== p.y) {
        p.x = cx;
        p.y = cy;
        clamped = true;
      }
    });
    if (clamped) {
      const pts: VPt[] = [e.pts[0]];
      for (let i = 1; i < e.pts.length; i++) {
        const prev = pts[pts.length - 1];
        if (Math.hypot(e.pts[i].x - prev.x, e.pts[i].y - prev.y) > 1e-7) pts.push(e.pts[i]);
      }
      e.pts = pts;
      const cum: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      e.cum = cum;
      e.len = cum[cum.length - 1];
    }
  });

  /* Re-snap children to their parent's post-clamp anchors. Parents always
     have lower ids, so one pass in id order restores the exact-anchor
     invariant (rigid translation preserves every polyline's shape). */
  edges.forEach((e) => {
    if (e.parent < 0) return;
    const p = edges[e.parent];
    const anchor = edgePointAt(p, e.attachT * p.len);
    const dx = anchor.x - e.pts[0].x;
    const dy = anchor.y - e.pts[0].y;
    if (dx !== 0 || dy !== 0) {
      e.pts.forEach((pt) => {
        pt.x += dx;
        pt.y += dy;
      });
    }
  });

  /* ————— Index the graph. ————— */
  const terminals: number[] = [];
  edges.forEach((e) => {
    if (e.children.length === 0 && (e.kind === "twig" || e.kind === "branch")) terminals.push(e.id);
  });

  return {
    edges,
    terminals,
    rootTips,
    aerialTips,
    trunkBase: trunk.id,
    groundY,
  };
}
