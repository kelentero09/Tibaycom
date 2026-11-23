'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPHP } from '@/lib/money';

// Validated categorical pair (colour-blind safe, ≥3:1 against the white surface).
export const SERIES = { primary: '#2563eb', secondary: '#c2410c' } as const;
const INK = { axis: '#5b6779', grid: '#e2e8f0' };

type Point = { bucket: string; value: number; secondary?: number };
type ChartProps = { data: Point[]; granularity: 'day' | 'month'; kind: 'money' | 'count'; label: string; secondaryLabel?: string };

const formatBucket = (bucket: string, granularity: 'day' | 'month') => {
  const date = new Date(granularity === 'month' ? `${bucket}-01T00:00:00` : `${bucket}T00:00:00`);
  return date.toLocaleDateString('en-PH', granularity === 'month' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' });
};
const compact = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 });
const formatValue = (value: number, kind: ChartProps['kind']) => (kind === 'money' ? formatPHP(value) : value.toLocaleString('en-PH'));
const formatTick = (value: number, kind: ChartProps['kind']) => (kind === 'money' ? `₱${compact.format(value / 100)}` : compact.format(value));

function ChartTooltip({ active, payload, granularity, kind, label, secondaryLabel }: { active?: boolean; payload?: { payload: Point }[] } & Omit<ChartProps, 'data'>) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatBucket(point.bucket, granularity)}</p>
      <p className="flex items-center gap-2 tabular-nums">
        <span className="size-2 rounded-full" style={{ background: SERIES.primary }} />
        {label}: <span className="font-medium">{formatValue(point.value, kind)}</span>
      </p>
      {secondaryLabel && point.secondary !== undefined && (
        <p className="mt-0.5 pl-4 tabular-nums text-muted-foreground">
          {secondaryLabel}: {formatValue(point.secondary, kind)}
        </p>
      )}
    </div>
  );
}

/** Every chart ships with the same data as a table for screen readers and precise reading. */
function DataTableView({ data, granularity, kind, label, secondaryLabel }: ChartProps) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:underline">View as table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-md border">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 bg-subtle text-left">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-medium">Period</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">{label}</th>
              {secondaryLabel && <th scope="col" className="px-3 py-1.5 text-right font-medium">{secondaryLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.bucket} className="border-t">
                <td className="px-3 py-1.5">{formatBucket(point.bucket, granularity)}</td>
                <td className="px-3 py-1.5 text-right">{formatValue(point.value, kind)}</td>
                {secondaryLabel && <td className="px-3 py-1.5 text-right">{formatValue(point.secondary ?? 0, kind)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Empty() {
  return <p className="flex h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">No data in this date range yet.</p>;
}

const axisProps = { tickLine: false, axisLine: false, tick: { fill: INK.axis, fontSize: 11 } } as const;

/** Magnitude per period → bars (single series, so the title names it and no legend is needed). */
export function PeriodBarChart(props: ChartProps) {
  const { data, granularity, kind, label } = props;
  if (!data.length) return <Empty />;
  return (
    <div>
      <div className="h-56" role="img" aria-label={`${label} per ${granularity}. Use “View as table” for exact values.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis dataKey="bucket" tickFormatter={(b: string) => formatBucket(b, granularity)} minTickGap={24} {...axisProps} />
            <YAxis width={52} tickFormatter={(v: number) => formatTick(v, kind)} allowDecimals={false} {...axisProps} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip {...props} />} />
            <Bar dataKey="value" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableView {...props} />
    </div>
  );
}

/** Change over time → line. */
export function PeriodLineChart(props: ChartProps) {
  const { data, granularity, kind, label } = props;
  if (!data.length) return <Empty />;
  return (
    <div>
      <div className="h-56" role="img" aria-label={`${label} per ${granularity}. Use “View as table” for exact values.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis dataKey="bucket" tickFormatter={(b: string) => formatBucket(b, granularity)} minTickGap={24} {...axisProps} />
            <YAxis width={40} tickFormatter={(v: number) => formatTick(v, kind)} allowDecimals={false} {...axisProps} />
            <Tooltip cursor={{ stroke: INK.axis, strokeDasharray: '3 3' }} content={<ChartTooltip {...props} />} />
            <Line type="monotone" dataKey="value" stroke={SERIES.primary} strokeWidth={2} dot={data.length <= 31 ? { r: 2.5, fill: SERIES.primary, strokeWidth: 0 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTableView {...props} />
    </div>
  );
}

/** Part-to-whole of two groups → one segmented bar with direct labels (never a pie for two values). */
export function SplitBar({ a, b }: { a: { label: string; value: number }; b: { label: string; value: number } }) {
  const total = a.value + b.value;
  if (!total) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const share = (value: number) => `${((value / total) * 100).toFixed(1)}%`;
  return (
    <div className="grid gap-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${a.label} ${share(a.value)}, ${b.label} ${share(b.value)}`}>
        {a.value > 0 && <div style={{ width: share(a.value), background: SERIES.primary }} />}
        {b.value > 0 && <div style={{ width: share(b.value), background: SERIES.secondary }} />}
      </div>
      <dl className="flex justify-between gap-4 text-sm">
        {[{ ...a, color: SERIES.primary }, { ...b, color: SERIES.secondary }].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-medium tabular-nums">
              {item.value.toLocaleString('en-PH')} <span className="font-normal text-muted-foreground">({share(item.value)})</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Ranked categories → horizontal bars with the value written beside each. */
export function RankedBars({ items }: { items: { name: string; count: number }[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ol className="grid gap-2.5">
      {items.map((item) => (
        <li key={item.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={item.name}>{item.name}</span>
          <span className="h-2.5 rounded-r bg-muted">
            <span className="block h-full rounded-r" style={{ width: `${Math.max(2, (item.count / max) * 100)}%`, background: SERIES.primary }} />
          </span>
          <span className="w-10 text-right tabular-nums text-muted-foreground">{item.count.toLocaleString('en-PH')}</span>
        </li>
      ))}
    </ol>
  );
}
