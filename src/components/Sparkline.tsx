/**
 * Sparkline — a small inline SVG line/area chart for a real, recorded series.
 *
 * Used where the vision calls for a trend chart but the data must stay honest:
 * the component renders exactly the numbers it is given — no smoothing into
 * fiction, no invented baseline. An empty or single-point series renders as a
 * flat honest line, and `null` entries (days with no data) are skipped rather
 * than interpolated as zeros.
 */

export function Sparkline({
  points,
  width = 320,
  height = 72,
  label,
}: {
  /** Values in chronological order. Use `null` for days with no recorded data. */
  points: (number | null)[];
  width?: number;
  height?: number;
  /** Accessible description of what the series measures. */
  label: string;
}) {
  const pad = 3;
  const values = points.filter((p): p is number => p != null);
  const max = values.length > 0 ? Math.max(...values) : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const span = max - min || 1;

  // Evenly distribute the non-null points across the width; nulls create gaps.
  const coords: { x: number; y: number }[] = [];
  const nonNull = points.filter((p) => p != null).length;
  let seen = -1;
  points.forEach((p) => {
    if (p == null) return;
    seen += 1;
    const x = nonNull <= 1 ? width - pad : pad + (seen / (nonNull - 1)) * (width - pad * 2);
    const y = height - pad - ((p - min) / span) * (height - pad * 2);
    coords.push({ x, y });
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath =
    coords.length > 1
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height - pad} L${coords[0].x.toFixed(1)},${height - pad} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={label}
      className="block"
      preserveAspectRatio="none"
    >
      {areaPath && <path d={areaPath} fill="var(--color-forest)" fillOpacity="0.12" />}
      {coords.length > 1 && (
        <path d={linePath} fill="none" stroke="var(--color-forest)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {coords.length > 0 && (
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="2.8" fill="var(--color-forest)" />
      )}
    </svg>
  );
}
