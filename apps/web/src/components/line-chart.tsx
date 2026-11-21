import { format } from './format';

export function LineChart({ points, label }: { points: { day: string; value: number }[]; label: string }) {
  const data = points.filter(point => Number.isFinite(point.value));
  if (!data.length) return <p className="muted">No chart data yet. Snapshots build daily.</p>;
  const min = Math.min(0, ...data.map(point => point.value));
  const max = Math.max(...data.map(point => point.value));
  const x = (index: number) => 88 + (index / Math.max(1, data.length - 1)) * 500;
  const y = (value: number) => 18 + (1 - (value - min) / (max - min || 1)) * 142;
  const summary = `${label}: ${data[0].day} to ${data[data.length - 1].day}, ${format(Math.min(...data.map(point => point.value)))} to ${format(max)}; ${data.length} observations.`;
  return (
    <svg className="line-chart" viewBox="0 0 620 200" role="img" aria-label={summary}>
      <title>{summary}</title>
      <line x1="88" x2="588" y1="18" y2="18" />
      <line x1="88" x2="588" y1="160" y2="160" />
      <text x="80" y="22" textAnchor="end">
        {format(max)}
      </text>
      <text x="80" y="164" textAnchor="end">
        {format(min)}
      </text>
      <polyline points={data.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')} />
      {data.length === 1 ? <circle cx={x(0)} cy={y(data[0].value)} r="3" /> : null}
      <text x="88" y="190">
        {data[0].day}
      </text>
      <text x="588" y="190" textAnchor="end">
        {data[data.length - 1].day}
      </text>
    </svg>
  );
}
