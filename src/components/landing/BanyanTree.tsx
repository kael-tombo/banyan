/**
 * BanyanTree — the hero's one orchestrated visual, redrawn modern.
 *
 * A geometric banyan: filled tapered trunk, crisp layered canopy discs,
 * and aerial roots that drop to channel nodes on the ground line. Small
 * agent dots travel real branch and root paths (CSS motion-path) — the
 * runtime, visible. Growth order still tells the product story:
 *
 *   1. trunk        the workspace, rising from the ground
 *   2. branches     the workflow spreading wide
 *   3. canopy       shelter, in crisp organic layers
 *   4. aerial roots descend and thicken into load-bearing trunks
 *   5. channel nodes land where the roots touch ground
 *
 * Pure CSS animation; every rule collapses to the final static tree under
 * prefers-reduced-motion (agent dots hide entirely).
 */
const DRAW_EASE = "cubic-bezier(0.4, 0, 0.2, 1)" as const;

function drawProps(len: number, delay: number, dur = 1) {
  return { "--draw-len": len, "--draw-delay": `${delay}s`, animationDuration: `${dur}s`, animationTimingFunction: DRAW_EASE } as React.CSSProperties;
}

function bloomProps(delay: number, opacity = 1) {
  return { "--bloom-delay": `${delay}s`, "--bloom-opacity": opacity } as React.CSSProperties;
}

function fadeProps(delay: number, opacity = 1) {
  return { "--fade-delay": `${delay}s`, "--fade-opacity": opacity } as React.CSSProperties;
}

function agentProps(path: string, dur: number, delay: number, opacity = 0.95) {
  return { "--agent-path": `path("${path}")`, "--agent-dur": `${dur}s`, "--agent-delay": `${delay}s`, "--agent-opacity": opacity } as React.CSSProperties;
}

function nodeProps(delay: number) {
  return { "--node-delay": `${delay}s` } as React.CSSProperties;
}

function leafProps(x: number, y: number, r: number, dur: number, delay: number, opacity = 0.7) {
  return {
    "--leaf-x": `${x}px`,
    "--leaf-y": `${y}px`,
    "--leaf-r": `${r}deg`,
    "--leaf-dur": `${dur}s`,
    "--leaf-delay": `${delay}s`,
    "--leaf-opacity": opacity,
  } as React.CSSProperties;
}

/* Aerial roots: from the canopy underside down to the ground line (y=512). */
const AERIAL_ROOTS = [
  { d: "M262 372 C254 412 248 460 246 512", thicken: "M250 452 C248 472 247 492 246 512" },
  { d: "M320 384 C316 424 312 468 310 512", thicken: null },
  { d: "M448 386 C454 426 460 470 462 512", thicken: "M456 456 C459 476 461 494 462 512" },
  { d: "M508 372 C522 412 538 462 548 512", thicken: "M540 458 C543 478 546 496 548 512" },
  { d: "M380 392 C378 432 377 472 377 512", thicken: null },
] as const;

/* Channel nodes land where load-bearing roots touch ground. */
const CHANNEL_NODES = [
  { x: 246, label: "X", w: 52, delay: 2.65 },
  { x: 374, label: "LinkedIn", w: 82, delay: 2.8 },
  { x: 468, label: "Short video", w: 92, delay: 2.95 },
  { x: 548, label: "Video", w: 58, delay: 3.1 },
] as const;

export function BanyanTree({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 760 560"
      fill="none"
      role="img"
      aria-label="Geometric illustration of a banyan tree: one tapered trunk, a layered canopy, and aerial roots descending to become channel trunks on the ground."
      className={className}
    >
      <defs>
        <linearGradient id="trunk-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-forest)" />
          <stop offset="1" stopColor="var(--color-forest-deep)" />
        </linearGradient>
        <radialGradient id="halo-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--color-moss)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--color-moss)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Halo — the tree is alive: a soft pulse of light behind the crown. */}
      <ellipse className="tree-halo" cx="380" cy="268" rx="220" ry="140" fill="url(#halo-grad)" />

      {/* Ground shadow + hairline */}
      <ellipse
        className="tree-fade"
        style={fadeProps(0.25, 0.06)}
        cx="380" cy="519" rx="205" ry="8"
        fill="var(--color-forest-deep)"
      />
      <path
        className="tree-draw"
        style={drawProps(640, 0.1, 1.1)}
        d="M84 512 C260 516 500 516 676 512"
        stroke="var(--color-bark)"
        strokeOpacity="0.28"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* Trunk — the workspace: one filled, tapered, flared form. */}
      <g className="tree-trunk" style={{ "--trunk-delay": "0.15s" } as React.CSSProperties}>
        <path
          d="M310 512 C330 510 346 504 352 484 C357 462 359 424 364 384 C366 368 367 358 367 348 L393 348 C393 358 394 368 396 384 C401 424 403 462 408 484 C414 504 430 510 450 512 C420 517 340 517 310 512 Z"
          fill="url(#trunk-grad)"
        />
      </g>
      {/* Sun-side highlight sliver */}
      <path
        className="tree-fade"
        style={fadeProps(0.95, 0.4)}
        d="M391 496 C394 456 395 414 391 372"
        stroke="var(--color-sage)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Branches — the workflow, spreading wide under the crown. */}
      {[
        { d: "M372 356 C338 338 296 330 242 324", len: 145, delay: 0.5 },
        { d: "M386 356 C420 336 462 328 516 322", len: 145, delay: 0.62 },
        { d: "M370 368 C336 366 306 372 276 382", len: 100, delay: 0.74 },
        { d: "M388 366 C420 364 450 370 478 382", len: 100, delay: 0.84 },
        { d: "M380 352 C376 324 374 298 378 272", len: 85, delay: 0.56 },
      ].map((b, i) => (
        <path
          key={`branch-${i}`}
          className="tree-draw"
          style={drawProps(b.len, b.delay, 0.85)}
          d={b.d}
          stroke="var(--color-forest-deep)"
          strokeOpacity="0.92"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
      ))}

      {/* Canopy — shelter, in crisp organic layers (no blur: modern flat). */}
      <g className="tree-breathe">
        <g className="tree-sway">
          {/* deep back layer */}
          {[
            [380, 246, 92, 66], [262, 296, 66, 48], [496, 292, 68, 50],
            [196, 338, 44, 33], [560, 342, 42, 31], [380, 196, 56, 40],
          ].map(([cx, cy, rx, ry], i) => (
            <ellipse key={`cb-${i}`} className="tree-bloom" style={bloomProps(0.9 + i * 0.09, 0.95)} cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-forest-deep)" />
          ))}
          {/* forest mid layer */}
          {[
            [312, 274, 60, 46], [452, 268, 58, 44], [232, 326, 48, 36],
            [524, 328, 46, 34], [380, 300, 66, 48],
          ].map(([cx, cy, rx, ry], i) => (
            <ellipse key={`cm-${i}`} className="tree-bloom" style={bloomProps(1.35 + i * 0.09, 0.97)} cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-forest)" />
          ))}
          {/* moss front layer */}
          {[
            [350, 322, 56, 40], [268, 350, 40, 30], [472, 358, 38, 28],
            [322, 350, 36, 27], [424, 344, 34, 25],
          ].map(([cx, cy, rx, ry], i) => (
            <ellipse key={`cf-${i}`} className="tree-bloom" style={bloomProps(1.8 + i * 0.08, 1)} cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-moss)" />
          ))}
          {/* sage highlights — sun caught at the crown's edge */}
          {[
            [330, 258, 17, 12], [412, 232, 13, 9], [286, 300, 10, 7],
          ].map(([cx, cy, rx, ry], i) => (
            <ellipse key={`ch-${i}`} className="tree-bloom" style={bloomProps(2.15 + i * 0.08, 0.85)} cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-sage)" />
          ))}
        </g>
      </g>

      {/* Canopy texture — tiny leaf flecks on the silhouette's edge. */}
      {[
        [352, 168, "var(--color-sage)"], [420, 176, "var(--color-moss)"],
        [208, 270, "var(--color-moss)"], [180, 318, "var(--color-sage)"],
        [546, 286, "var(--color-sage)"], [578, 334, "var(--color-moss)"],
        [240, 356, "var(--color-sage)"], [500, 372, "var(--color-moss)"],
        [300, 368, "var(--color-sage)"], [450, 352, "var(--color-paper)"],
      ].map(([cx, cy, fill], i) => (
        <circle
          key={`fleck-${i}`}
          className="tree-fade"
          style={fadeProps(2.05 + (i % 5) * 0.07, 0.8)}
          cx={cx as number} cy={cy as number} r={2.4}
          fill={fill as string}
        />
      ))}

      {/* Aerial roots — the signature: thin drops from the branches... */}
      {AERIAL_ROOTS.map((r, i) => (
        <path
          key={`root-thin-${i}`}
          className="tree-draw"
          style={drawProps(220, 1.5 + i * 0.14, 1.05)}
          d={r.d}
          stroke="var(--color-moss)"
          strokeOpacity="0.9"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      ))}
      {/* ...that touch ground and thicken into load-bearing trunks. */}
      {AERIAL_ROOTS.map((r, i) =>
        r.thicken ? (
          <path
            key={`root-thick-${i}`}
            className="tree-thicken"
            style={fadeProps(2.35 + i * 0.14, 1)}
            d={r.thicken}
            stroke="var(--color-moss)"
            strokeWidth="6.5"
            strokeLinecap="round"
          />
        ) : null,
      )}

      {/* Channel nodes where the roots touch ground. */}
      {CHANNEL_NODES.map((c) => (
        <g key={c.label} className="tree-node" style={nodeProps(c.delay)}>
          <line
            x1={c.x} y1="514" x2={c.x} y2="530"
            stroke="var(--color-bark)" strokeOpacity="0.25" strokeWidth="1.2"
          />
          <rect
            x={c.x - c.w / 2} y="530"
            width={c.w} height="26" rx="13"
            fill="var(--color-paper)"
            stroke="var(--color-bark)" strokeOpacity="0.22"
          />
          <circle cx={c.x - c.w / 2 + 11} cy="543" r="2.5" fill="var(--color-fig)" />
          <text
            x={c.x + 5} y="547"
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="var(--color-charcoal-soft)"
          >
            {c.label}
          </text>
        </g>
      ))}

      {/* Agent dots — the runtime, visible: small signals travelling the
          real branch and root paths. Hidden entirely under reduced motion. */}
      <circle r="3.5" className="tree-agent" style={agentProps("M386 356 C420 336 462 328 516 322", 6, 3.1)} fill="var(--color-fig)" />
      <circle r="3" className="tree-agent" style={agentProps("M372 356 C338 338 296 330 242 324", 7, 3.9, 0.85)} fill="var(--color-sage)" />
      <circle r="3" className="tree-agent" style={agentProps("M448 386 C454 426 460 470 462 512", 4.5, 4.3, 0.9)} fill="var(--color-forest)" />
      <circle r="2.6" className="tree-agent" style={agentProps("M380 512 C380 460 380 400 380 356", 5, 3.5, 0.7)} fill="var(--color-moss)" />

      {/* Leaves travelling through the light — inside the crown. */}
      <g transform="translate(468, 238)">
        <path
          className="leaf-drift"
          style={leafProps(26, 150, 160, 10, 4)}
          d="M0 0 C5 -7 14 -7 19 0 C14 7 5 7 0 0 Z"
          fill="var(--color-moss)"
        />
      </g>
      <g transform="translate(296, 226)">
        <path
          className="leaf-drift"
          style={leafProps(-20, 170, -130, 13, 8.5, 0.55)}
          d="M0 0 C4 -6 12 -6 16 0 C12 6 4 6 0 0 Z"
          fill="var(--color-forest)"
        />
      </g>
    </svg>
  );
}
