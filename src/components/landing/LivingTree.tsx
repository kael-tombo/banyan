"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck, LineChart, Pause, PenLine, Play, SearchCheck, Share2, ShieldCheck, Users,
} from "lucide-react";
import { BRANCHES } from "@/components/landing/branches";

/**
 * LivingTree — the landing page's signature interactive visualization.
 *
 * One banyan tree tells the whole product story in five phases, looping:
 *
 *   0 OBJECTIVE      a seed takes root at the base — the single business goal
 *   1 PLAN           energy climbs the trunk — the objective becomes a plan
 *   2 ORCHESTRATION  branches grow to five specialized workstreams
 *   3 EXECUTION      aerial roots drop to connected platform nodes
 *   4 DELIVERABLES   outputs bloom at the crown; measured results flow back
 *
 * Every element is gated by a `data-phase` attribute on the wrapper; CSS in
 * globals.css owns all motion (no JS animation loop). The phase timer:
 *   - pauses when the tree leaves the viewport or the tab is hidden,
 *   - never starts under prefers-reduced-motion (renders the finished tree),
 *   - yields to manual selection from the phase rail.
 *
 * The tree also carries the philosophy, not just the mechanics:
 *   - APPROVAL GATES sit where each aerial root leaves the trunk. They appear
 *     dashed while the plan is being made (phase 1) and turn solid fig-gold
 *     only in the execution phase — nothing drops toward a platform until it
 *     has passed the gate. Planning is not executing; the tree says so.
 *   - GROWTH RINGS accumulate in the trunk, one per completed loop, and are
 *     the only thing that never fades at cycle restart — learning compounds.
 *     The first cycle honestly has none.
 *   - A NEW-GROUND ROOT appears where measured results touch down, because a
 *     banyan puts down new roots where its branches reach the ground.
 *
 * Branch exploration: each workstream tip is focusable/activatable in the SVG
 * AND mirrored as real HTML buttons below it — keyboard and touch never rely
 * on hover. The detail panel states the problem, the coordinated work, the
 * deliverables, the connected tools, and what requires approval — grounded in
 * the capability registry (Postiz publishing, managed model, manual handoff).
 */

const PHASES = [
  { key: "objective", label: "Objective", caption: "A single objective takes root in your context — everything grows from it." },
  { key: "plan", label: "Plan", caption: "The trunk turns the objective into a coordinated plan with owners and gates." },
  { key: "orchestration", label: "Orchestration", caption: "Branches carry the plan to specialized workstreams." },
  { key: "execution", label: "Execution", caption: "Only approved work passes the gate and reaches your connected platforms." },
  { key: "deliverables", label: "Deliverables", caption: "Deliverables land, measured results flow back — and the trunk keeps a growth ring of what was learned." },
] as const;

/** Phase hold times (ms) before auto-advancing. */
const PHASE_MS = [2800, 2800, 3200, 3200, 4800];

const BRANCH_ICONS = [SearchCheck, PenLine, Share2, Users, LineChart] as const;

/* ————— SVG geometry ————— */

const TIPS = [
  { x: 152, y: 262, lx: 152, ly: 320, anchor: "middle" as const },
  { x: 234, y: 180, lx: 234, ly: 128, anchor: "middle" as const },
  { x: 380, y: 144, lx: 380, ly: 98, anchor: "middle" as const },
  { x: 526, y: 180, lx: 526, ly: 128, anchor: "middle" as const },
  { x: 608, y: 262, lx: 608, ly: 320, anchor: "middle" as const },
];

const BRANCH_PATHS = [
  "M378 302 C330 278 250 262 152 262",
  "M379 294 C332 254 282 210 234 180",
  "M380 290 C380 246 380 192 380 144",
  "M381 294 C428 254 478 210 526 180",
  "M382 302 C430 278 510 262 608 262",
];
const BRANCH_LENS = [250, 210, 155, 210, 250];

const ROOT_PATHS = [
  "M366 332 C358 396 312 436 288 470",
  "M394 332 C402 396 448 436 472 470",
];
const ROOT_LENS = [160, 160];

/* Approval gates sit at the origin of each aerial root — where work leaves the
   trunk. Dashed while planned, solid fig once the execution phase opens. */
const GATES = [
  { x: 366, y: 332 },
  { x: 394, y: 332 },
] as const;

/* Growth rings: one shallow arc per completed loop, stacked up the tapering
   trunk. The only element that survives the loop restart. */
const MAX_RINGS = 4;
const RING_PATHS = [
  "M360 454 Q380 462 400 454",
  "M364 444 Q380 451 396 444",
  "M368 434 Q380 440 392 434",
  "M370 425 Q380 430 390 425",
] as const;

const PLATFORM_NODES = [
  { x: 280, w: 118, label: "X — Postiz", solid: true },
  { x: 480, w: 158, label: "LinkedIn — Postiz", solid: true },
  { x: 104, w: 156, label: "Short-video script", solid: false },
  { x: 656, w: 168, label: "Copy-ready handoff", solid: false },
];

const DELIVERABLES = [
  { x: 92, label: "Research brief" },
  { x: 236, label: "Content asset" },
  { x: 380, label: "Publishing schedule" },
  { x: 524, label: "Execution record" },
  { x: 668, label: "Analytics summary" },
];

const RETURN_PATH = "M668 96 C716 210 706 372 436 462";
const RETURN_LEN = 620;

function drawProps(len: number, delay: number) {
  return { "--lt-len": len, "--lt-delay": `${delay}s` } as React.CSSProperties;
}

export function LivingTree() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [active, setActive] = useState(0);
  const [loops, setLoops] = useState(0);

  /* Motion-disabled users (or missing observers) get the finished tree, static —
     with two growth rings already kept, as a tree that has lived would have. */
  useEffect(() => {
    try {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce || typeof IntersectionObserver === "undefined") {
        setPhase(PHASES.length - 1);
        setPlaying(false);
        setLoops(2);
      }
    } catch {
      setPhase(PHASES.length - 1);
      setPlaying(false);
      setLoops(2);
    }
  }, []);

  /* Pause the loop whenever the tree is off-screen or the tab is hidden. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* The phase timer: one timeout per phase, gated on play state + visibility.
     Wrapping past the last phase completes a loop — the trunk keeps a ring. */
  useEffect(() => {
    if (!playing || !inView || !pageVisible) return;
    if (typeof window === "undefined") return;
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    } catch { /* treat as motion-allowed */ }
    const t = window.setTimeout(() => {
      if (phase === PHASES.length - 1) setLoops((n) => n + 1);
      setPhase((phase + 1) % PHASES.length);
    }, PHASE_MS[phase]);
    return () => window.clearTimeout(t);
  }, [phase, playing, inView, pageVisible]);

  function jumpTo(i: number) {
    setPhase(i);
    setPlaying(false);
  }

  function onBranchKey(e: React.KeyboardEvent, i: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActive(i);
    }
  }

  const branch = BRANCHES[active];

  return (
    <div ref={wrapRef} className="lt" data-phase={phase}>
      <div className="grid gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-start lg:gap-10">
        {/* ————— The tree ————— */}
        <div className="min-w-0">
          <svg
            viewBox="0 0 760 600"
            fill="none"
            role="img"
            aria-label="Interactive banyan tree: a business objective takes root, the trunk plans, branches reach five workstreams, aerial roots pass an approval gate before reaching connected platforms, and deliverables bloom while measured results flow back — each completed cycle leaves a growth ring of learning in the trunk."
            className="h-auto w-full"
          >
            <defs>
              <radialGradient id="lt-halo-grad" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="var(--color-moss)" stopOpacity="0.14" />
                <stop offset="1" stopColor="var(--color-moss)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="lt-trunk-grad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="var(--color-forest-deep)" />
                <stop offset="1" stopColor="var(--color-forest)" />
              </linearGradient>
              <marker id="lt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" fill="var(--color-moss)" />
              </marker>
            </defs>

            {/* Halo — the tree is alive. */}
            <ellipse className="lt-halo" cx="380" cy="252" rx="232" ry="152" fill="url(#lt-halo-grad)" />

            {/* Ground hairline + soft shadow. */}
            <path d="M84 470 C260 474 500 474 676 470" stroke="var(--color-bark)" strokeOpacity="0.26" strokeWidth="1.4" strokeLinecap="round" />
            <ellipse cx="380" cy="474" rx="200" ry="7" fill="var(--color-forest-deep)" opacity="0.05" />

            {/* PHASE 0 — the seed and the objective it stands for. */}
            <g className="lt-seed">
              <circle className="lt-seedpulse" cx="380" cy="462" r="10" fill="none" stroke="var(--color-fig)" strokeWidth="1.4" />
              <ellipse cx="380" cy="462" rx="9" ry="11" fill="var(--color-fig)" />
              <g className="lt-objective">
                <rect x="295" y="516" width="170" height="30" rx="15" fill="var(--color-paper)" stroke="var(--color-fig)" strokeOpacity="0.5" />
                <text x="380" y="535" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-fig-deep)">
                  One business objective
                </text>
              </g>
            </g>

            {/* The trunk — central intelligence; always present once grown. */}
            <g className="lt-trunk">
              <path
                d="M352 470 C366 466 372 440 374 400 C375 364 372 330 372 300 L388 300 C388 330 385 364 386 400 C388 440 394 466 408 470 C392 474 368 474 352 470 Z"
                fill="url(#lt-trunk-grad)"
              />
            </g>

            {/* Growth rings — one per completed loop, never fading. The first
                cycle honestly has none: nothing has been learned yet. */}
            {RING_PATHS.slice(0, Math.min(loops, MAX_RINGS)).map((d, i) => (
              <path
                key={`ring-${i}`}
                className="lt-ring"
                style={{ animationDelay: `${0.5 + i * 0.2}s` }}
                d={d}
                stroke="var(--color-fig)"
                strokeWidth="1.4"
                strokeLinecap="round"
                aria-hidden="true"
              />
            ))}

            {/* PHASE 1 — planning: energy climbs the trunk; plan nodes appear. */}
            <g className="lt-plan" aria-hidden="true">
              <path className="lt-spine" d="M380 466 C380 420 380 360 380 302" stroke="var(--color-fig)" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
              {[440, 404, 368].map((cy, i) => (
                <circle key={cy} className="lt-plannode" style={{ transitionDelay: `${0.25 + i * 0.18}s` }} cx="380" cy={cy} r="3.6" fill="var(--color-fig)" />
              ))}
            </g>
            <circle className="lt-agent lt-agent-trunk" r="3.4" fill="var(--color-fig)" aria-hidden="true"
              style={{ "--lt-path": 'path("M380 466 L380 302")', "--lt-dur": "1.8s" } as React.CSSProperties} />

            {/* PHASE 2 — orchestration: five branches, five workstreams. */}
            <g className="lt-canopy" aria-hidden="true">
              {TIPS.map((t, i) => (
                <g key={i} className="lt-cluster" style={{ transitionDelay: `${0.35 + i * 0.14}s` }}>
                  <ellipse cx={t.x - 13} cy={t.y + 7} rx="26" ry="17" fill="var(--color-moss)" />
                  <ellipse cx={t.x + 11} cy={t.y - 3} rx="30" ry="20" fill="var(--color-forest)" />
                  <ellipse cx={t.x - 2} cy={t.y - 15} rx="21" ry="14" fill="var(--color-sage)" />
                </g>
              ))}
            </g>
            {BRANCH_PATHS.map((d, i) => (
              <path
                key={i}
                className={`lt-branch ${active === i ? "is-active" : ""}`}
                style={drawProps(BRANCH_LENS[i], i * 0.14)}
                d={d}
                stroke="var(--color-forest-deep)"
                strokeWidth="4.4"
                strokeLinecap="round"
              />
            ))}
            {TIPS.map((t, i) => (
              <g
                key={`lbl-${i}`}
                className={`lt-label ${active === i ? "is-active" : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={active === i}
                aria-label={`${BRANCHES[i].label} workstream — show details`}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onBranchKey(e, i)}
                onFocus={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
              >
                {/* Generous invisible hit target for touch and cursor. */}
                <circle cx={t.x} cy={t.y} r="30" fill="transparent" className="lt-hit" />
                <circle cx={t.x} cy={t.y} r="4" className="lt-tipdot" />
                <text x={t.lx} y={t.ly} textAnchor={t.anchor} fontSize="12.5" fontWeight="600" className="lt-labeltext">
                  {BRANCHES[i].label}
                </text>
              </g>
            ))}
            <circle className="lt-agent lt-agent-branch" r="3" fill="var(--color-forest)" aria-hidden="true"
              style={{ "--lt-path": `path("${BRANCH_PATHS[1]}")`, "--lt-dur": "3.2s" } as React.CSSProperties} />
            <circle className="lt-agent lt-agent-branch" r="2.6" fill="var(--color-moss)" aria-hidden="true"
              style={{ "--lt-path": `path("${BRANCH_PATHS[3]}")`, "--lt-dur": "3.6s", animationDelay: "1.1s" } as React.CSSProperties} />

            {/* PHASE 3 — execution: aerial roots drop to connected platforms. */}
            {ROOT_PATHS.map((d, i) => (
              <path
                key={`root-${i}`}
                className="lt-root"
                style={drawProps(ROOT_LENS[i], 0.15 + i * 0.2)}
                d={d}
                stroke="var(--color-moss)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            ))}
            <g className="lt-platforms">
              {PLATFORM_NODES.map((n, i) => (
                <g key={n.label} className="lt-pnode" style={{ transitionDelay: `${0.2 + i * 0.14}s` }}>
                  <line x1={n.x} y1="470" x2={n.x} y2="476" stroke="var(--color-bark)" strokeOpacity="0.25" strokeWidth="1.2" />
                  <rect
                    x={n.x - n.w / 2} y="476" width={n.w} height="26" rx="13"
                    fill={n.solid ? "var(--color-paper)" : "transparent"}
                    stroke={n.solid ? "var(--color-forest)" : "var(--color-bark)"}
                    strokeOpacity={n.solid ? 0.55 : 0.4}
                    strokeDasharray={n.solid ? undefined : "3 3"}
                  />
                  <circle cx={n.x - n.w / 2 + 12} cy="489" r="2.6" fill={n.solid ? "var(--color-forest)" : "var(--color-bark)"} fillOpacity={n.solid ? 1 : 0.55} />
                  <text x={n.x + 4} y="493" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-charcoal-soft)">
                    {n.label}
                  </text>
                </g>
              ))}
            </g>
            <circle className="lt-agent lt-agent-root" r="3" fill="var(--color-moss)" aria-hidden="true"
              style={{ "--lt-path": `path("${ROOT_PATHS[1]}")`, "--lt-dur": "2.4s" } as React.CSSProperties} />

            {/* Approval gates — work leaves the trunk only through them. Dashed
                while the plan exists, solid fig once execution is approved. */}
            <g className="lt-gates" aria-hidden="true">
              {GATES.map((g) => (
                <circle key={g.x} className="lt-gate" cx={g.x} cy={g.y} r="4.5" />
              ))}
            </g>

            {/* New ground — where measured results touch down, a banyan puts
                down its next root. Appears only once the return line lands. */}
            <g className="lt-newground" aria-hidden="true">
              <line x1="436" y1="462" x2="436" y2="473" stroke="var(--color-fig)" strokeOpacity="0.65" strokeWidth="1.6" strokeLinecap="round" />
              <ellipse cx="436" cy="474" rx="4.5" ry="1.8" fill="var(--color-fig)" fillOpacity="0.55" />
            </g>

            {/* PHASE 4 — deliverables bloom; measured results flow back. */}
            <g className="lt-deliver">
              {DELIVERABLES.map((d, i) => (
                <g key={d.label} className="lt-card" style={{ transitionDelay: `${i * 0.1}s` }}>
                  <path
                    className="lt-connector"
                    d={`M${d.x} 76 C${d.x} 120 ${TIPS[i].x} ${TIPS[i].y - 60} ${TIPS[i].x} ${TIPS[i].y - 22}`}
                    stroke="var(--color-bark)" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2 4"
                  />
                  <rect x={d.x - 68} y="34" width="136" height="38" rx="10" fill="var(--color-paper)" stroke="var(--color-bark)" strokeOpacity="0.22" />
                  <circle cx={d.x - 54} cy="53" r="2.6" fill="var(--color-forest)" />
                  <text x={d.x + 4} y="57" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--color-charcoal)">
                    {d.label}
                  </text>
                </g>
              ))}
              <path
                className="lt-return"
                style={drawProps(RETURN_LEN, 0.7)}
                d={RETURN_PATH}
                stroke="var(--color-moss)"
                strokeOpacity="0.75"
                strokeWidth="1.6"
                strokeDasharray="5 5"
                markerEnd="url(#lt-arrow)"
              />
              <text className="lt-returnlabel" x="560" y="550" textAnchor="middle" fontSize="10.5" fill="var(--color-charcoal-soft)" fillOpacity="0.75">
                measured results flow back
              </text>
            </g>
          </svg>

          <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs leading-relaxed text-charcoal-soft/85">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-forest" aria-hidden="true" /> Publishes through your configured connection
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-dashed border-bark/60" aria-hidden="true" /> Prepared as a copy-ready handoff — never faked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-fig" aria-hidden="true" /> One growth ring per cycle — learning is kept
            </span>
          </p>
        </div>

        {/* ————— Phase rail + branch explorer ————— */}
        <div className="min-w-0">
          {/* Phase rail: the living loop — objective → plan → orchestration →
              execution → deliverables → (ring) → back to objective. */}
          <div className="rounded-2xl border border-bark/12 bg-mist/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-charcoal-soft">
                The living loop
                <span
                  className="rounded-full bg-forest/8 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-forest-deep"
                  aria-hidden="true"
                >
                  Cycle {loops + 1}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-bark/15 bg-white px-3 py-1.5 text-xs font-semibold text-forest-deep transition-colors hover:border-forest/40"
                aria-label={playing ? "Pause the animated walkthrough" : "Play the animated walkthrough"}
              >
                {playing ? <Pause size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
                {playing ? "Pause" : "Play"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Animation phases">
              {PHASES.map((p, i) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => jumpTo(i)}
                  aria-current={phase === i ? "step" : undefined}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    phase === i
                      ? "bg-forest-deep text-white"
                      : "border border-bark/15 bg-white text-charcoal-soft hover:border-forest/40 hover:text-forest-deep"
                  }`}
                >
                  {i + 1}. {p.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-charcoal-soft" aria-live="polite">
              {PHASES[phase].caption}
            </p>
          </div>

          {/* Branch chips — the hover/focus/select surface that works everywhere. */}
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Explore a workstream branch">
            {BRANCHES.map((b, i) => {
              const Icon = BRANCH_ICONS[i];
              return (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={active === i}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all ${
                    active === i
                      ? "bg-forest-deep text-white shadow-[0_8px_20px_-10px_rgba(18,48,40,0.55)]"
                      : "border border-bark/15 bg-white text-charcoal-soft hover:border-forest/40 hover:text-forest-deep"
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {b.label}
                </button>
              );
            })}
          </div>

          {/* Detail panel: problem → work → deliverables → tools → approval. */}
          <aside aria-live="polite" className="mt-4 rounded-2xl border border-bark/12 bg-white p-5 card-shadow sm:p-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fig-deep">Workstream branch</span>
            <h3 className="tight mt-1.5 text-xl font-semibold text-forest-deep">{branch.label}</h3>
            <p className="mt-3 border-l-2 border-clay/40 pl-3 text-sm italic leading-relaxed text-charcoal-soft">
              {branch.problem}
            </p>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-soft">What Banyan coordinates</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-charcoal">{branch.work}</p>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-soft">Deliverables</h4>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {branch.deliverables.map((d) => (
                <li key={d} className="rounded-full border border-forest/25 bg-forest/6 px-2.5 py-1 text-xs font-medium text-forest">{d}</li>
              ))}
            </ul>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-soft">Connected tools</h4>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {branch.tools.map((t) => (
                <li key={t} className="rounded-full border border-bark/15 bg-mist px-2.5 py-1 text-xs font-medium text-charcoal-soft">{t}</li>
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-fig/8 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-fig-deep">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {branch.approval}
            </p>
          </aside>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-charcoal-soft/80">
            <BadgeCheck size={13} className="shrink-0 text-forest" aria-hidden="true" />
            Workstreams reflect what Banyan ships today — illustrative wording, real capabilities.
          </p>
        </div>
      </div>
    </div>
  );
}
