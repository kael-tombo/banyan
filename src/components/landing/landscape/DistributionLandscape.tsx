import type { CSSProperties } from "react";
import { ContentCard } from "./ContentCard";
import { PlatformMark } from "./platforms";
import { HERO_COLUMNS, CLOSING_COLUMNS, RAIL_LEFT, RAIL_RIGHT, type Card, type Column } from "./content";
import type { Platform } from "./platforms";

/**
 * The living distribution landscape: four streams of real-looking content,
 * two flowing up and two flowing down, each on its own clock.
 *
 * How the loop stays seamless: a column's track holds the same sequence
 * twice. Each sequence ends with the same gap that separates its cards, so
 * the two copies have identical geometry and the track is exactly two
 * sequences tall. Moving the track by -50% therefore moves it by exactly one
 * sequence, and the frame after the last is indistinguishable from the first.
 * All motion is a CSS transform on one element per column — no JavaScript,
 * no state, a bounded DOM — and it stops under prefers-reduced-motion.
 *
 * Purely decorative: the whole landscape is hidden from assistive tech, and
 * every post in it is fictional.
 */

/** One pass of a column's cards. */
function ContentSequence({ cards, hidden = false }: { cards: Card[]; hidden?: boolean }) {
  return (
    <div className="dl-seq" data-copy={hidden ? "" : undefined}>
      {cards.map((card, i) => (
        <ContentCard key={i} card={card} />
      ))}
    </div>
  );
}

/** A column that flows forever in one direction. */
function InfiniteContentColumn({ column, index }: { column: Column; index: number }) {
  const style = {
    "--dl-dur": `${column.duration}s`,
    "--dl-delay": `${column.delay}s`,
  } as CSSProperties;
  return (
    <div className="dl-col" data-index={index}>
      <div className="dl-track" data-dir={column.direction} style={style}>
        <ContentSequence cards={column.cards} />
        <ContentSequence cards={column.cards} hidden />
      </div>
    </div>
  );
}

/** A side rail of the channels products get discovered on. */
function PlatformRail({ platforms, side }: { platforms: Platform[]; side: "left" | "right" }) {
  return (
    <div className={`dl-rail ${side === "left" ? "left-4 xl:left-8" : "right-4 xl:right-8"}`}>
      {platforms.map((p, i) => (
        <span
          key={p}
          className="dl-rail-mark"
          style={
            {
              "--dl-float-dur": `${7 + ((i * 7 + (side === "left" ? 0 : 3)) % 6)}s`,
              "--dl-float-delay": `${-((i * 1.7 + (side === "left" ? 0 : 0.9)) % 7)}s`,
              "--dl-rest": `${0.5 + ((i * 3) % 4) * 0.1}`,
            } as CSSProperties
          }
        >
          <PlatformMark platform={p} size={32} />
        </span>
      ))}
    </div>
  );
}

/** The coordination layer: thin paths and a few travelling particles. */
function InformationNetwork() {
  const paths = [
    "M-20 180 C 240 120, 380 320, 620 260 S 1000 120, 1460 220",
    "M-20 520 C 200 600, 420 420, 720 470 S 1120 640, 1460 560",
    "M180 -20 C 260 220, 120 460, 300 920",
    "M1260 -20 C 1180 260, 1340 520, 1150 920",
    "M-20 780 C 360 700, 700 820, 1000 740 S 1300 700, 1460 760",
  ];
  const nodes = [
    [300, 248], [620, 260], [1030, 168], [720, 470], [420, 470], [1140, 600], [262, 560], [1200, 360], [1000, 740],
  ];
  return (
    <svg
      className="dl-network pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} id={`dl-path-${i}`} d={d} fill="none" stroke="var(--color-forest)" strokeOpacity="0.1" strokeWidth="1" />
      ))}
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill="var(--color-sage)" opacity="0.35" />
          <circle cx={x} cy={y} r="2.5" fill="var(--color-moss)" opacity="0.45" />
        </g>
      ))}
      <g className="dl-particles">
        {[0, 1, 3, 4].map((p, i) => (
          <circle key={p} r="2.5" fill="var(--color-forest)" opacity="0.45">
            <animateMotion dur={`${16 + i * 5}s`} begin={`${-i * 4}s`} repeatCount="indefinite">
              <mpath href={`#dl-path-${p}`} />
            </animateMotion>
          </circle>
        ))}
      </g>
    </svg>
  );
}

export function DistributionLandscape({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "closing" | "panel";
  className?: string;
}) {
  const columns = variant === "closing" ? CLOSING_COLUMNS : HERO_COLUMNS;
  return (
    <div className={`dl pointer-events-none absolute inset-0 overflow-hidden ${className}`} data-variant={variant} aria-hidden="true">
      <InformationNetwork />

      <div className="dl-columns">
        {columns.map((column, i) => (
          <InfiniteContentColumn key={i} column={column} index={i} />
        ))}
      </div>

      {variant !== "panel" && (

        <>

          <PlatformRail platforms={RAIL_LEFT} side="left" />
          <PlatformRail platforms={RAIL_RIGHT} side="right" />

        </>

      )}

      {/* Soft white edges: the landscape continues past what you can see. */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white to-white/0" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-white/0" />
    </div>
  );
}
