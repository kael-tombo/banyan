/**
 * VisitsChart — the dashboard's main chart: tracked visits per day for the
 * last 14 days, laid over the 14 days before it.
 *
 * It draws exactly the recorded daily counts (true zeros included). The curve
 * is a monotone cubic, so it never overshoots a real value or dips below zero.
 * Lines are drawn in a stretched SVG with non-scaling strokes; every label and
 * the end-point marker are HTML, so text never distorts.
 */

const W = 1000;
const H = 240;

/** Round a maximum up to 1, 2 or 5 × 10^k so gridlines land on plain numbers. */
function niceCeil(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  const f = n / pow;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return step * pow;
}

/** Fritsch–Carlson monotone cubic through the points, as an SVG path. */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

export function VisitsChart({
  current,
  previous,
  days,
}: {
  /** Daily counts for the last 14 days, oldest first. */
  current: number[];
  /** Daily counts for the 14 days before that, oldest first. */
  previous: number[];
  /** Dates matching `current`, oldest first. */
  days: Date[];
}) {
  const top = niceCeil(Math.max(1, ...current, ...previous));
  const toPts = (series: number[]) =>
    series.map((v, i) => ({
      x: series.length <= 1 ? W : (i / (series.length - 1)) * W,
      y: H - (v / top) * H,
    }));
  const cur = toPts(current);
  const prev = toPts(previous);
  const curLine = monotonePath(cur);
  const prevLine = monotonePath(prev);
  const area = cur.length > 1 ? `${curLine} L${W},${H} L0,${H} Z` : "";
  const last = cur[cur.length - 1];
  const lastValue = current[current.length - 1] ?? 0;
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mid = days[Math.floor((days.length - 1) / 2)];

  return (
    <figure className="m-0">
      <div className="relative h-60 pl-8">
        {/* Gridlines and their values: 0, half, top. */}
        {[1, 0.5, 0].map((f) => (
          <div
            key={f}
            className="absolute left-8 right-0 border-t border-bark/[0.08]"
            style={{ top: `${(1 - f) * 100}%` }}
            aria-hidden="true"
          >
            <span className="num absolute -left-8 -top-2 w-6 text-right font-mono text-xs leading-4 text-muted">
              {Math.round(top * f).toLocaleString()}
            </span>
          </div>
        ))}

        <div className="relative h-full">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={`Tracked visits per day: ${current.reduce((a, b) => a + b, 0).toLocaleString()} in the last 14 days, ${previous.reduce((a, b) => a + b, 0).toLocaleString()} in the 14 days before`}
          >
            {prevLine && (
              <path
                d={prevLine}
                fill="none"
                stroke="var(--color-bark)"
                strokeOpacity="0.4"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {area && <path d={area} fill="var(--color-forest)" fillOpacity="0.07" />}
            {curLine && (
              <path
                d={curLine}
                fill="none"
                stroke="var(--color-forest)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {last && (
            <div
              className="absolute"
              style={{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%` }}
              aria-hidden="true"
            >
              <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-forest ring-2 ring-white" />
              <span className="num absolute -top-7 right-2 whitespace-nowrap rounded bg-forest-deep px-1.5 py-0.5 font-mono text-xs text-ivory">
                {lastValue.toLocaleString()} today
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-between pl-8 font-mono text-xs text-muted" aria-hidden="true">
        <span>{days[0] ? fmt(days[0]) : ""}</span>
        <span>{mid ? fmt(mid) : ""}</span>
        <span>Today</span>
      </div>
    </figure>
  );
}
