import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { format } from './format';

const isoDay = /^\d{4}-\d\d-\d\d$/;
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
  isoDay.test(day) ? new Date(`${day}T00:00:00`).toLocaleDateString(undefined, options) : day;

export function LineChart({ points, label, reversed = false }: { points: { day: string; value: number }[]; label: string; reversed?: boolean }) {
  const gradient = `fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const data = points.filter(point => Number.isFinite(point.value));
  if (data.length < 2) return <p className="text-sm text-muted-foreground">Not enough history yet: the chart appears after two days of snapshots.</p>;
  const values = data.map(point => point.value);
  const summary = `${label}: ${data[0].day} to ${data[data.length - 1].day}, ${format(Math.min(...values))} to ${format(Math.max(...values))}; ${data.length} observations.`;
  const config = { value: { label, color: 'var(--chart-1)' } } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={summary}
      className="aspect-auto h-60 w-full [&_.recharts-cartesian-axis-tick_text]:font-mono [&_.recharts-cartesian-axis-tick_text]:text-[11px]"
    >
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={40}
          tickFormatter={(day: string) => dayLabel(day, { month: 'short', day: 'numeric' })}
        />
        <YAxis width={52} tickLine={false} axisLine={false} tickMargin={6} reversed={reversed} tickFormatter={(value: number) => format(value)} />
        <ChartTooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => {
                const point = payload[0]?.payload as { day: string } | undefined;
                return point ? dayLabel(point.day, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : null;
              }}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradient})`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
