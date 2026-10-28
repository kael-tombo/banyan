/**
 * BanyanTree — the hero's one orchestrated visual.
 *
 * A hand-drawn SVG banyan that grows the way the real tree — and the product —
 * grows, in strict order:
 *
 *   1. trunk        the workspace, drawn up from the ground
 *   2. branches     the workflow spreading wide
 *   3. canopy       leaves bloom; shelter for the team
 *   4. aerial roots descend from the branches and touch ground
 *   5. thickening   the moment each root becomes a load-bearing prop trunk
 *   6. channel chips land at the prop-root tips
 *
 * After growth the crown breathes and sways on a slow cycle, and two leaves
 * drift through the light. Pure CSS animation (no JS timeline); every rule
 * collapses to the final static tree under prefers-reduced-motion.
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

function chipProps(delay: number) {
  return { "--pop-delay": `${delay}s` } as React.CSSProperties;
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

/* Aerial roots: from a branch junction down to the ground line (y≈540). */
const AERIAL_ROOTS = [
  { d: "M300 352 C294 412 287 478 285 540", thicken: "M288 468 C287 494 286 518 285 540" },
  { d: "M412 352 C420 414 429 480 432 540", thicken: "M428 470 C430 496 431 520 432 540" },
  { d: "M248 338 C240 406 234 476 232 540", thicken: null },
  { d: "M472 380 C492 434 514 490 524 540", thicken: "M516 478 C519 500 522 522 524 540" },
  { d: "M352 366 C348 418 344 474 342 540", thicken: null },
] as const;

export function BanyanTree({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 150 720 450"
      fill="none"
      role="img"
      aria-label="Animated illustration of a banyan tree: one trunk, a spreading canopy, and aerial roots descending to become load-bearing trunks."
      className={className}
    >
      <defs>
        {/* Soft leaf-mass: the canopy reads as foliage, not geometry. */}
        <filter id="canopy-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="canopy-soft-lite" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse
        className="tree-fade"
        style={fadeProps(0.2, 0.07)}
        cx="368" cy="549" rx="220" ry="9"
        fill="var(--color-forest-deep)"
      />
      {/* Ground hairline */}
      <path
        className="tree-draw"
        style={drawProps(620, 0.15, 1.2)}
        d="M60 545 C200 549 520 549 660 545"
        stroke="var(--color-bark)"
        strokeOpacity="0.28"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Trunk — the workspace. Two strokes suggest the taper of a fluted trunk. */}
      <path
        className="tree-draw"
        style={drawProps(120, 0, 1)}
        d="M360 545 C357 508 355 474 358 442"
        stroke="var(--color-bark)"
        strokeWidth="22"
        strokeLinecap="round"
      />
      <path
        className="tree-draw"
        style={drawProps(95, 0.35, 0.9)}
        d="M358 442 C360 412 362 392 366 362"
        stroke="var(--color-bark)"
        strokeWidth="13"
        strokeLinecap="round"
      />
      {/* Root flares at the base */}
      <path
        className="tree-draw"
        style={drawProps(60, 0.3, 0.7)}
        d="M360 545 C346 545 330 546 314 549"
        stroke="var(--color-bark)"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <path
        className="tree-draw"
        style={drawProps(60, 0.3, 0.7)}
        d="M360 545 C376 545 392 546 408 549"
        stroke="var(--color-bark)"
        strokeWidth="11"
        strokeLinecap="round"
      />

      {/* Branches — the workflow, spreading wide under the crown. */}
      {[
        { d: "M366 360 C330 342 284 334 226 328", len: 150, delay: 0.5 },
        { d: "M366 360 C404 340 454 332 512 324", len: 150, delay: 0.62 },
        { d: "M364 376 C330 373 300 377 264 387", len: 115, delay: 0.74 },
        { d: "M366 372 C400 370 436 376 468 388", len: 115, delay: 0.86 },
        { d: "M366 358 C362 330 360 300 362 270", len: 95, delay: 0.55 },
        { d: "M363 380 C340 392 318 404 298 420", len: 80, delay: 0.9 },
        { d: "M368 378 C392 392 414 406 432 422", len: 80, delay: 1.0 },
      ].map((b, i) => (
        <path
          key={`branch-${i}`}
          className="tree-draw"
          style={drawProps(b.len, b.delay, 0.9)}
          d={b.d}
          stroke="var(--color-bark)"
          strokeWidth="6"
          strokeLinecap="round"
        />
      ))}

      {/* Canopy — shelter. A wide, irregular leaf-mass: deep layer back,
          forest layer mid, moss layer front, sage highlights catching sun. */}
      <g className="tree-breathe">
        <g className="tree-sway">
          <g filter="url(#canopy-soft)">
            {/* deep back layer */}
            <ellipse className="tree-bloom" style={bloomProps(0.95, 0.9)} cx="362" cy="258" rx="62" ry="46" fill="var(--color-forest-deep)" />
            <ellipse className="tree-bloom" style={bloomProps(1.05, 0.9)} cx="246" cy="316" rx="56" ry="42" fill="var(--color-forest-deep)" />
            <ellipse className="tree-bloom" style={bloomProps(1.15, 0.9)} cx="482" cy="312" rx="58" ry="43" fill="var(--color-forest-deep)" />
            <ellipse className="tree-bloom" style={bloomProps(1.25, 0.88)} cx="186" cy="360" rx="40" ry="30" fill="var(--color-forest-deep)" />
            <ellipse className="tree-bloom" style={bloomProps(1.35, 0.88)} cx="552" cy="362" rx="37" ry="28" fill="var(--color-forest-deep)" />

            {/* forest mid layer */}
            <ellipse className="tree-bloom" style={bloomProps(1.4, 0.95)} cx="298" cy="288" rx="50" ry="38" fill="var(--color-forest)" />
            <ellipse className="tree-bloom" style={bloomProps(1.5, 0.95)} cx="436" cy="286" rx="48" ry="37" fill="var(--color-forest)" />
            <ellipse className="tree-bloom" style={bloomProps(1.6, 0.95)} cx="222" cy="346" rx="42" ry="32" fill="var(--color-forest)" />
            <ellipse className="tree-bloom" style={bloomProps(1.7, 0.95)} cx="510" cy="350" rx="40" ry="30" fill="var(--color-forest)" />
            <ellipse className="tree-bloom" style={bloomProps(1.75, 0.95)} cx="368" cy="316" rx="54" ry="40" fill="var(--color-forest)" />

            {/* moss front layer */}
            <ellipse className="tree-bloom" style={bloomProps(1.85, 1)} cx="350" cy="340" rx="52" ry="38" fill="var(--color-moss)" />
            <ellipse className="tree-bloom" style={bloomProps(1.95, 1)} cx="264" cy="376" rx="37" ry="28" fill="var(--color-moss)" />
            <ellipse className="tree-bloom" style={bloomProps(2.05, 1)} cx="466" cy="384" rx="35" ry="26" fill="var(--color-moss)" />
            <ellipse className="tree-bloom" style={bloomProps(2.15, 1)} cx="322" cy="376" rx="34" ry="25" fill="var(--color-moss)" />
          </g>

          {/* sage highlights — sunlight caught at the crown's edge */}
          <g filter="url(#canopy-soft-lite)">
            <ellipse className="tree-bloom" style={bloomProps(2.2, 0.8)} cx="326" cy="288" rx="17" ry="12" fill="var(--color-sage)" />
            <ellipse className="tree-bloom" style={bloomProps(2.3, 0.7)} cx="404" cy="262" rx="13" ry="9" fill="var(--color-sage)" />
          </g>
        </g>
      </g>

      {/* Aerial roots — the signature: thin drops from the branches... */}
      {AERIAL_ROOTS.map((r, i) => (
        <path
          key={`root-thin-${i}`}
          className="tree-draw"
          style={drawProps(215, 1.5 + i * 0.16, 1.15)}
          d={r.d}
          stroke="var(--color-moss)"
          strokeOpacity="0.85"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      ))}
      {/* ...that touch ground and thicken into load-bearing prop trunks. */}
      {AERIAL_ROOTS.map((r, i) =>
        r.thicken ? (
          <path
            key={`root-thick-${i}`}
            className="tree-thicken"
            style={fadeProps(2.35 + i * 0.15, 1)}
            d={r.thicken}
            stroke="var(--color-moss)"
            strokeWidth="6.5"
            strokeLinecap="round"
          />
        ) : null,
      )}

      {/* Quiet caption on the trunk. */}
      <text
        className="tree-fade"
        style={fadeProps(2.9, 0.55)}
        x="338" y="492"
        textAnchor="end"
        fontFamily="var(--font-serif)"
        fontStyle="italic"
        fontSize="13"
        fill="var(--color-forest-deep)"
      >
        your product
      </text>

      {/* Channel chips at the prop-root tips. */}
      {[
        { x: 224, label: "Short video", w: 78, delay: 2.7 },
        { x: 290, label: "X", w: 34, delay: 2.85 },
        { x: 432, label: "LinkedIn", w: 66, delay: 3.0 },
        { x: 524, label: "Video", w: 50, delay: 3.15 },
      ].map((c) => (
        <g key={c.label} className="tree-chip" style={chipProps(c.delay)}>
          <rect
            x={c.x - c.w / 2} y={558}
            width={c.w} height={22} rx={11}
            fill="var(--color-paper)"
            stroke="var(--color-bark)"
            strokeOpacity="0.3"
          />
          <circle cx={c.x - c.w / 2 + 10} cy={569} r={2.4} fill="var(--color-fig)" />
          <text
            x={c.x + 4} y={573}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="500"
            fill="var(--color-charcoal-soft)"
          >
            {c.label}
          </text>
        </g>
      ))}

      {/* Leaves travelling through the light — placed inside the crown, not
          at the SVG origin. */}
      <g transform="translate(468, 246)">
        <path
          className="leaf-drift"
          style={leafProps(26, 150, 160, 10, 4)}
          d="M0 0 C5 -7 14 -7 19 0 C14 7 5 7 0 0 Z"
          fill="var(--color-moss)"
        />
      </g>
      <g transform="translate(282, 236)">
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
