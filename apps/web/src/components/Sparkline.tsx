/**
 * A tiny inline SVG sparkline. Pure and dependency-free, so it renders on the
 * server with no client JS.
 */
export function Sparkline({
  points,
  width = 120,
  height = 28,
  className = "text-brand-500",
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) {
    return <span className="text-xs text-slate-300">—</span>;
  }
  const max = Math.max(...points, 1);
  const step = width / (points.length - 1);
  const y = (v: number) => height - (v / max) * (height - 4) - 2;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${y(p).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="trend"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
