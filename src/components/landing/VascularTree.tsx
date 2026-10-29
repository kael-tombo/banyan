"use client";

/*
 * The Living Vascular Tree — a canvas visualization of Banyan's philosophy.
 *
 * A banyan at night whose vascular system is visible: luminous information
 * flows are drawn in at the root tips, transported up the trunk of the
 * central intelligence, distributed through the branching workstreams,
 * activate the connected endpoints (tools, channels, services, pipelines),
 * and return as measured results — fig gold — along valid connected paths
 * back to the trunk and down into the roots, feeding the next plan.
 *
 * Engineering notes
 * -----------------
 * - Zero dependencies. One 2D canvas; no animation libraries.
 * - The static tree (bark, tissue, vascular channels, foliage, atmosphere)
 *   is pre-rendered once to an offscreen canvas; each frame draws that image
 *   and then only the moving elements (≤ ~140 sprites). No per-frame React
 *   state; nothing that would block the headline or CTAs.
 * - Particles live on the seeded graph from vascularGeometry.ts and always
 *   follow valid connected pathways, in both directions. The tree never
 *   regenerates per frame; the same seed draws the same tree.
 * - The loop is continuous and overlapping (Phases A–F run concurrently);
 *   activity is deliberately uneven so the whole tree never glows at once.
 * - Respects prefers-reduced-motion (renders a stable static composition),
 *   pauses when off-screen or when the tab is hidden, adapts particle
 *   density to viewport size and device capability, and caps devicePixelRatio.
 */

import { useEffect, useRef } from "react";
import {
  buildBanyanNetwork,
  edgeDirAt,
  edgePointAt,
  mulberry32,
  type VEdge,
  type VNetwork,
} from "./vascularGeometry";

const DEFAULT_LABEL =
  "Illustrative animation: information flowing through a banyan tree — intake at the roots, " +
  "coordination through the trunk, distribution through the branches, activation at the " +
  "connected endpoints, and measured results flowing back in fig gold to feed the roots.";

type Particle = {
  e: number; // edge id
  d: number; // distance along edge (normalized units)
  dir: 1 | -1; // +1 outward (base→tip), -1 inward (tip→base)
  v: number; // speed, normalized units per second
  size: number; // sprite scale multiplier
  a: number; // alpha multiplier
  kind: 0 | 1; // 0 outbound (green, solid) · 1 return (fig gold, hollow)
};

type Pulse = {
  x: number;
  y: number;
  r0: number;
  r1: number;
  age: number;
  dur: number;
  max: number;
  lw: number;
  color: string;
};

type Band = { d: number; v: number; a: number };

/* Palette — the dark botanical room. Light is the information signal. */
const INK = {
  barkTrunk: "#1B4132",
  barkBranch: "#17382a",
  barkTwig: "#143023",
  barkRoot: "#1a3526",
  barkAerial: "#1B4030",
  barkRim: "rgba(154, 214, 178, 0.15)",
  tissue: (a: number) => `rgba(72, 150, 106, ${a})`,
  vessel: (a: number) => `rgba(123, 231, 165, ${a})`,
  vesselSolid: "#7BE7A5",
  vesselCore: "#D8F9E4",
  fig: (a: number) => `rgba(214, 168, 84, ${a})`,
  figSolid: "#E3BE72",
  foliage: "rgba(35, 110, 70, 0.15)",
  atmosphere: "rgba(35, 110, 70, 0.085)",
  canopyLight: "rgba(53, 184, 117, 0.05)",
  endpoint: "rgba(177, 242, 199, 0.6)",
  canopyMass: "rgba(30, 96, 60, 0.09)",
};

function makeGlowSprite(halo: string, core: string, ring = false): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, halo);
  grad.addColorStop(0.55, halo.replace(/[\d.]+\)$/, "0.28)"));
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  if (ring) {
    g.strokeStyle = core;
    g.lineWidth = 4.5;
    g.beginPath();
    g.arc(32, 32, 9.5, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.fillStyle = core;
    g.beginPath();
    g.arc(32, 32, 6.5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function VascularTree({
  seed = 8,
  className = "",
  label = DEFAULT_LABEL,
}: {
  seed?: number;
  className?: string;
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // no 2D context (test DOM / exotic browsers) — stay inert

    /* ————— Geometry: one seeded banyan, stable for the component's life. ————— */
    const net: VNetwork = buildBanyanNetwork(seed);
    const edges = net.edges;
    const terminals = net.terminals;
    const heat = new Float32Array(terminals.length);
    const terminalIndex = new Map<number, number>();
    terminals.forEach((id, i) => terminalIndex.set(id, i));

    /* Deterministic decor decisions, independent of the geometry stream. */
    const decor = mulberry32(seed * 7919 + 13);
    const drand = (min: number, max: number) => min + decor() * (max - min);

    /* ————— Runtime state ————— */
    let w = 0;
    let h = 0;
    let dpr = 1;
    let S = 1;
    let ox = 0;
    let oy = 0;
    let staticCanvas: HTMLCanvasElement | null = null;
    let greenSprite: HTMLCanvasElement | null = null;
    let ringSprite: HTMLCanvasElement | null = null;

    const particles: Particle[] = [];
    const pulses: Pulse[] = [];
    const bands: Band[] = [];
    const occ = new Uint8Array(edges.length);
    const CAP_CANOPY = 4;
    const CAP_ROOT = 3;
    const CAP_TRUNK = 7;
    const MAX_PULSES = 40;

    let density = 1;
    let reduced = false;
    let inView = true;
    let pageHidden = false;
    let raf = 0;
    let lastT = 0;
    let resizeQueued = false;

    type Spawner = { e: number; next: number; gapMin: number; gapMax: number };
    const spawners: Spawner[] = [];

    const capFor = (e: VEdge) =>
      e.id === net.trunkBase ? CAP_TRUNK : e.kind === "root" || e.kind === "rootlet" || e.kind === "aerial" ? CAP_ROOT : CAP_CANOPY;

    const px = (x: number) => ox + x * S;
    const py = (y: number) => oy + y * S;

    /* ————— Static layer: the tree itself, pre-rendered once per size. ————— */
    const strokeTapered = (
      g: CanvasRenderingContext2D,
      e: VEdge,
      width: (u: number, absW: number) => number,
      color: string,
      alpha: number,
    ) => {
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (let i = 0; i < e.pts.length - 1; i++) {
        const u = i / (e.pts.length - 1);
        const absW = (e.w0 + (e.w1 - e.w0) * u) * S;
        g.lineWidth = Math.max(0.55, width(u, absW));
        g.beginPath();
        g.moveTo(px(e.pts[i].x), py(e.pts[i].y));
        g.lineTo(px(e.pts[i + 1].x), py(e.pts[i + 1].y));
        g.stroke();
      }
      g.globalAlpha = 1;
    };

    const renderStatic = (withHints: boolean) => {
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(w * dpr));
      off.height = Math.max(1, Math.round(h * dpr));
      const g = off.getContext("2d");
      if (!g) return;
      g.scale(dpr, dpr);

      /* Quiet atmosphere: canopy light pools + depth haze. */
      const blob = (bx: number, by: number, r: number, color: string) => {
        const grad = g.createRadialGradient(px(bx), py(by), 0, px(bx), py(by), r * S);
        grad.addColorStop(0, color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(px(bx), py(by), r * S, 0, Math.PI * 2);
        g.fill();
      };
      for (let i = 0; i < 6; i++) {
        blob(drand(0.18, 0.82), drand(0.06, 0.42), drand(0.07, 0.15), INK.atmosphere);
      }
      blob(0.5, 0.3, 0.34, INK.canopyLight);

      /* The ground line and soil shadow. */
      const gy = py(net.groundY);
      const soil = g.createLinearGradient(0, gy - 4, 0, gy + 26);
      soil.addColorStop(0, "rgba(4, 10, 7, 0)");
      soil.addColorStop(0.4, "rgba(4, 10, 7, 0.42)");
      soil.addColorStop(1, "rgba(4, 10, 7, 0)");
      g.fillStyle = soil;
      g.fillRect(px(0.02), gy - 6, (0.96 * S), 32);
      g.strokeStyle = INK.vessel(0.13);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px(0.08), gy);
      g.lineTo(px(0.92), gy);
      g.stroke();

      /* Distant branches for depth (atmospheric perspective). */
      const silhouettes = edges.filter((e) => e.kind === "branch" && e.parent === net.trunkBase);
      for (let i = 0; i < Math.min(2, silhouettes.length); i++) {
        const e = silhouettes[Math.floor(drand(0, silhouettes.length))];
        g.strokeStyle = "#0d2118";
        g.globalAlpha = 0.55;
        g.lineCap = "round";
        g.lineWidth = Math.max(1.5, e.w0 * S * 0.55);
        g.beginPath();
        e.pts.forEach((p, j) => {
          const X = px(p.x) + S * 0.02;
          const Y = py(p.y) - S * 0.014;
          if (j === 0) g.moveTo(X, Y);
          else g.lineTo(X, Y);
        });
        g.stroke();
        g.globalAlpha = 1;
      }

      /* Bark — the outer organic silhouette, segment-tapered. */
      edges.forEach((e) => {
        const color =
          e.kind === "trunk"
            ? INK.barkTrunk
            : e.kind === "branch"
              ? INK.barkBranch
              : e.kind === "twig"
                ? INK.barkTwig
                : e.kind === "aerial"
                  ? INK.barkAerial
                  : INK.barkRoot;
        const alpha = e.kind === "root" || e.kind === "rootlet" ? 1 : 0.98;
        strokeTapered(g, e, (_u, absW) => absW, color, alpha);
      });

      /* Rim light — a single soft highlight so trunks read as cylinders,
         not wires: the tree keeps its bark. */
      edges.forEach((e) => {
        if (e.kind !== "trunk" && e.kind !== "branch") return;
        strokeTapered(g, e, (_u, absW) => absW * 0.42, INK.barkRim, 1);
      });

      /* Inner tissue — the semi-transparent living interior. */
      edges.forEach((e) => {
        if (e.kind === "root" || e.kind === "rootlet") return;
        const a = e.kind === "trunk" ? 0.24 : e.kind === "branch" ? 0.17 : 0.11;
        strokeTapered(g, e, (_u, absW) => absW * 0.58, INK.tissue(a), 1);
      });

      /* Vascular pathways — the transport network, visible beneath the bark. */
      edges.forEach((e) => {
        const a =
          e.kind === "trunk"
            ? 0.2
            : e.kind === "branch"
              ? 0.12
              : e.kind === "twig"
                ? 0.09
                : e.kind === "aerial"
                  ? 0.18
                  : 0.28;
        strokeTapered(g, e, (_u, absW) => absW * 2.4, INK.vessel(0.05), 1); // halo
        strokeTapered(
          g,
          e,
          (_u, absW) => Math.max(1.1, Math.min(2.6, absW * 0.16)),
          INK.vessel(a),
          1,
        );
      });

      /* Foliage — soft clusters that keep the tree a tree: mass at the
         terminals, along the outer pathways, and pooled in the canopy. */
      terminals.forEach((id) => {
        const e = edges[id];
        const tip = e.pts[e.pts.length - 1];
        for (let i = 0; i < 4; i++) {
          blob(tip.x + drand(-0.028, 0.028), tip.y + drand(-0.035, 0.015), drand(0.022, 0.058), INK.foliage);
        }
      });
      edges.forEach((e) => {
        if (e.kind !== "branch") return;
        const tip = e.pts[e.pts.length - 1];
        if (decor() < 0.5) blob(tip.x, tip.y + drand(-0.01, 0.01), drand(0.03, 0.06), INK.foliage);
      });
      for (let i = 0; i < 8; i++) {
        blob(drand(0.16, 0.84), drand(0.1, 0.45), drand(0.06, 0.12), INK.canopyMass);
      }

      /* Endpoints — the connected tools, channels, services, pipelines. */
      terminals.forEach((id) => {
        const e = edges[id];
        const tip = e.pts[e.pts.length - 1];
        const X = px(tip.x);
        const Y = py(tip.y);
        const halo = g.createRadialGradient(X, Y, 0, X, Y, 7);
        halo.addColorStop(0, INK.endpoint.replace("0.5", "0.14"));
        halo.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = halo;
        g.beginPath();
        g.arc(X, Y, 7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = INK.endpoint;
        g.beginPath();
        g.arc(X, Y, 1.7, 0, Math.PI * 2);
        g.fill();
      });

      /* Root tips (intake) and aerial ground contacts (new ground). */
      net.rootTips.forEach((id) => {
        const e = edges[id];
        const tip = e.pts[e.pts.length - 1];
        g.fillStyle = INK.vessel(0.35);
        g.beginPath();
        g.arc(px(tip.x), py(tip.y), 1.4, 0, Math.PI * 2);
        g.fill();
      });
      net.aerialTips.forEach((id) => {
        const e = edges[id];
        const tip = e.pts[e.pts.length - 1];
        g.fillStyle = INK.fig(0.4);
        g.beginPath();
        g.arc(px(tip.x), py(tip.y), 1.7, 0, Math.PI * 2);
        g.fill();
      });

      /* Reduced motion: the same composition, with the flows frozen as light. */
      if (withHints) {
        g.lineCap = "round";
        for (let i = 0; i < 16; i++) {
          const e = edges[Math.floor(drand(0, edges.length))];
          const d0 = drand(0, Math.max(0.01, e.len * 0.8));
          const p0 = edgePointAt(e, d0);
          const p1 = edgePointAt(e, d0 + e.len * drand(0.06, 0.16));
          g.strokeStyle = INK.vessel(drand(0.3, 0.55));
          g.lineWidth = Math.max(1.4, e.w0 * S * 0.22);
          g.beginPath();
          g.moveTo(px(p0.x), py(p0.y));
          g.lineTo(px(p1.x), py(p1.y));
          g.stroke();
        }
        terminals.forEach((id, i) => {
          if (i % 3 !== 0) return;
          const e = edges[id];
          const tip = e.pts[e.pts.length - 1];
          blob(tip.x, tip.y, 0.014, INK.vessel(0.35));
        });
        for (let i = 0; i < 3; i++) {
          const e = edges[terminals[Math.floor(drand(0, terminals.length))]];
          const tip = e.pts[e.pts.length - 1];
          g.strokeStyle = INK.fig(0.55);
          g.lineWidth = 1.4;
          g.beginPath();
          g.arc(px(tip.x), py(tip.y), drand(5, 9), 0, Math.PI * 2);
          g.stroke();
        }
      }

      staticCanvas = off;
    };

    /* ————— Particle engine ————— */

    const pickChild = (e: VEdge): number | -1 => {
      const open = e.children.filter((c) => occ[c] < capFor(edges[c]));
      if (open.length === 0) return -1;
      return open[Math.floor(Math.random() * open.length)];
    };

    const addPulse = (p: Pulse) => {
      if (pulses.length >= MAX_PULSES) pulses.shift();
      pulses.push(p);
    };

    const kill = (p: Particle) => {
      occ[p.e] = Math.max(0, occ[p.e] - 1);
      p.e = -1;
    };

    const transfer = (p: Particle, e: number, d: number) => {
      occ[p.e] = Math.max(0, occ[p.e] - 1);
      p.e = e;
      p.d = d;
      occ[e] = Math.min(255, occ[e] + 1);
    };

    const spawnOutbound = (tipId: number, vScale = 1) => {
      if (occ[tipId] >= capFor(edges[tipId])) return;
      const p: Particle = {
        e: tipId,
        d: edges[tipId].len,
        dir: -1,
        v: (0.06 + Math.random() * 0.07) * vScale,
        size: 0.55 + Math.random() * 0.75,
        a: 0.5 + Math.random() * 0.45,
        kind: 0,
      };
      occ[tipId] += 1;
      particles.push(p);
    };

    const step = (p: Particle, dt: number) => {
      if (p.e < 0) return;
      const e = edges[p.e];
      p.d += p.dir * p.v * dt;

      if (p.dir > 0 && p.d >= e.len) {
        /* — outward end: junctions route onward, endpoints activate — */
        if (e.children.length > 0) {
          const c = pickChild(e);
          if (c < 0) {
            kill(p);
            return;
          }
          const nx = edges[c];
          const jx = e.pts[e.pts.length - 1];
          transfer(p, c, 0);
          p.v = Math.min(0.34, Math.max(0.035, p.v * (nx.kind === "twig" ? 0.75 : nx.kind === "aerial" ? 0.85 : 1.05)));
          if (Math.random() < 0.16 && pulses.length < MAX_PULSES) {
            addPulse({
              x: jx.x, y: jx.y, r0: 0.8, r1: 4 + Math.random() * 3,
              age: 0, dur: 0.5, max: 0.3, lw: 1,
              color: p.kind === 1 ? INK.fig(1) : INK.vessel(1),
            });
          }
          return;
        }
        const tIdx = terminalIndex.get(e.id);
        if (tIdx !== undefined) {
          /* Endpoint activation — Phase D. */
          heat[tIdx] = 1;
          const tip = e.pts[e.pts.length - 1];
          addPulse({
            x: tip.x, y: tip.y, r0: 1.5, r1: 9 + Math.random() * 6,
            age: 0, dur: 1.1, max: 0.55, lw: 1.4, color: INK.vessel(1),
          });
        } else {
          /* Aerial ground contact or underground root tip — fig flash. */
          const tip = e.pts[e.pts.length - 1];
          addPulse({
            x: tip.x, y: tip.y, r0: 1, r1: 6 + Math.random() * 4,
            age: 0, dur: 0.9, max: 0.42, lw: 1.2, color: INK.fig(1),
          });
        }
        if (p.kind === 0 && Math.random() < 0.5) {
          /* Half the arrivals become return flows — Phase E. */
          p.kind = 1;
          p.dir = -1;
          p.d = e.len;
          p.v = Math.min(0.3, p.v * 0.9);
          p.size = 0.5 + Math.random() * 0.5;
        } else {
          kill(p);
        }
        return;
      }

      if (p.dir < 0 && p.d <= 0) {
        /* — inward end: converge on the trunk, then feed the roots — */
        if (e.kind === "root" || e.kind === "rootlet") {
          const tb = edges[net.trunkBase];
          if (occ[tb.id] >= CAP_TRUNK) {
            kill(p);
            return;
          }
          transfer(p, tb.id, 0);
          p.dir = 1;
          p.v = Math.min(0.34, p.v * (1.6 + Math.random() * 0.8));
          return;
        }
        if (e.id === net.trunkBase) {
          if (p.kind === 1 && Math.random() < 0.55) {
            /* Measured results feed the root system. */
            const roots = net.rootTips.map((id) => edges[id]);
            const open = roots.filter((r) => occ[r.id] < capFor(r));
            if (open.length > 0) {
              const r = open[Math.floor(Math.random() * open.length)];
              transfer(p, r.id, 0);
              p.dir = 1;
              p.v = Math.max(0.05, p.v * 0.8);
              return;
            }
          }
          const base = e.pts[0];
          addPulse({
            x: base.x, y: base.y, r0: 1.5, r1: 8,
            age: 0, dur: 1.2, max: 0.4, lw: 1.3, color: INK.fig(1),
          });
          kill(p);
          return;
        }
        if (e.parent >= 0) {
          const par = edges[e.parent];
          if (occ[par.id] >= capFor(par)) {
            kill(p);
            return;
          }
          transfer(p, par.id, e.attachT * par.len);
          p.v = Math.min(0.34, Math.max(0.035, p.v * 1.02));
          return;
        }
        kill(p);
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!inView || pageHidden || reduced || !staticCanvas) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
      lastT = now;

      /* Spawning — the root intake interface, always softly busy. */
      for (const s of spawners) {
        if (now >= s.next) {
          spawnOutbound(s.e);
          s.next = now + ((s.gapMin + Math.random() * (s.gapMax - s.gapMin)) / density) * 1000;
        }
      }

      /* Trunk transport bands — slow light moving under the bark. */
      const tb = edges[net.trunkBase];
      for (const b of bands) {
        b.d += b.v * dt;
        if (b.d > tb.len) {
          b.d = -Math.random() * 3;
          b.a = 0.035 + Math.random() * 0.035;
          b.v = 0.08 + Math.random() * 0.07;
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        step(p, dt);
        if (p.e < 0) {
          const last = particles.pop()!;
          if (i < particles.length) particles[i] = last;
        }
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].age += dt;
        if (pulses[i].age >= pulses[i].dur) {
          pulses[i] = pulses[pulses.length - 1];
          pulses.pop();
        }
      }

      for (let i = 0; i < heat.length; i++) {
        if (heat[i] > 0) heat[i] = Math.max(0, heat[i] - dt * 0.65);
      }

      /* ————— Draw ————— */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(staticCanvas, 0, 0, w, h);
      const gSprite = greenSprite;
      const rSprite = ringSprite;
      if (!gSprite || !rSprite) return;

      /* Trunk bands beneath the particles. */
      for (const b of bands) {
        if (b.d < 0) continue;
        const pos = edgePointAt(tb, b.d);
        const dir = edgeDirAt(tb, b.d);
        ctx.save();
        ctx.globalAlpha = b.a;
        ctx.translate(px(pos.x), py(pos.y));
        ctx.rotate(Math.atan2(dir.y, dir.x));
        ctx.scale(3.4, 1);
        ctx.drawImage(gSprite, -12, -12, 24, 24);
        ctx.restore();
      }

      /* Particles — information in motion. */
      for (const p of particles) {
        if (p.e < 0) continue;
        const e = edges[p.e];
        const pos = edgePointAt(e, p.d);
        const size = 10 + p.size * 13;
        ctx.globalAlpha = p.a;
        ctx.drawImage(p.kind === 1 ? rSprite : gSprite, px(pos.x) - size / 2, py(pos.y) - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      /* Endpoint heat — activation lingering, fading. */
      terminals.forEach((id, i) => {
        if (heat[i] <= 0.02) return;
        const tip = edges[id].pts[edges[id].pts.length - 1];
        const size = 12 + heat[i] * 20;
        ctx.globalAlpha = 0.25 + heat[i] * 0.6;
        ctx.drawImage(gSprite, px(tip.x) - size / 2, py(tip.y) - size / 2, size, size);
      });
      ctx.globalAlpha = 1;

      /* Pulses — junction shimmers, endpoint activations, ground returns. */
      for (const p of pulses) {
        const k = p.age / p.dur;
        const ease = 1 - (1 - k) * (1 - k);
        ctx.globalAlpha = Math.max(0, (1 - k) * p.max);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.lw * (1 - k * 0.4);
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), p.r0 + (p.r1 - p.r0) * ease, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf === 0 && !reduced && inView && !pageHidden && staticCanvas) {
        lastT = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    /* ————— Sizing ————— */
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const nw = Math.round(rect.width);
      const nh = Math.round(rect.height);
      if (nw < 10 || nh < 10) return;
      w = nw;
      h = nh;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      S = Math.min(w, h);
      ox = (w - S) / 2;
      oy = (h - S) / 2;

      density = Math.min(1, Math.max(0.5, (w * h) / (520 * 580)));
      const nav = navigator as Navigator & { deviceMemory?: number };
      if ((navigator.hardwareConcurrency || 8) <= 4) density *= 0.7;
      if (nav.deviceMemory && nav.deviceMemory <= 4) density *= 0.8;

      renderStatic(reduced);

      if (spawners.length === 0) {
        const now = performance.now();
        net.rootTips.forEach((id) => {
          spawners.push({ e: id, next: now + Math.random() * 2400, gapMin: 900, gapMax: 2600 });
        });
        net.aerialTips.forEach((id) => {
          spawners.push({ e: id, next: now + 2000 + Math.random() * 4000, gapMin: 3400, gapMax: 8000 });
        });
        /* Pre-warm: the tree is alive on first paint. */
        const warm = Math.round(34 * density);
        for (let i = 0; i < warm; i++) {
          const e = edges[Math.floor(Math.random() * edges.length)];
          if (occ[e.id] >= capFor(e)) continue;
          const p: Particle = {
            e: e.id,
            d: Math.random() * e.len,
            dir: Math.random() < 0.6 ? 1 : -1,
            v: 0.05 + Math.random() * 0.12,
            size: 0.5 + Math.random() * 0.8,
            a: 0.45 + Math.random() * 0.5,
            kind: Math.random() < 0.22 ? 1 : 0,
          };
          occ[e.id] += 1;
          particles.push(p);
        }
        for (let i = 0; i < 3; i++) {
          bands.push({ d: Math.random() * edges[net.trunkBase].len, v: 0.08 + Math.random() * 0.07, a: 0.035 + Math.random() * 0.035 });
        }
      }

      if (reduced) {
        /* One stable, fully composed frame. */
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, w, h);
      } else {
        start();
      }
    };
    const requestResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        resize();
      });
    };

    /* ————— Environment ————— */
    const reducedMq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    reduced = !!reducedMq?.matches;
    const onMq = () => {
      const wasReduced = reduced;
      reduced = !!reducedMq?.matches;
      if (reduced && !wasReduced) {
        stop();
        resize();
      } else if (!reduced && wasReduced) {
        resize();
        start();
      }
    };
    reducedMq?.addEventListener?.("change", onMq);

    const onVisibility = () => {
      pageHidden = document.hidden;
      if (pageHidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          inView = entries[0]?.isIntersecting ?? true;
          if (inView) start();
          else stop();
        },
        { rootMargin: "140px", threshold: 0 },
      );
      io.observe(wrap);
    }

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(requestResize);
      ro.observe(wrap);
    } else {
      window.addEventListener("resize", requestResize);
    }

    greenSprite = makeGlowSprite("rgba(123, 231, 165, 0.85)", INK.vesselCore);
    ringSprite = makeGlowSprite("rgba(214, 168, 84, 0.75)", INK.figSolid, true);

    resize();

    return () => {
      stop();
      reducedMq?.removeEventListener?.("change", onMq);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", requestResize);
      particles.length = 0;
      pulses.length = 0;
      bands.length = 0;
      spawners.length = 0;
      staticCanvas = null;
    };
  }, [seed]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full" />
    </div>
  );
}
