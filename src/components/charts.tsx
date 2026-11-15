/** Thin wrappers around Recharts so every chart in FitFlow shares one look. */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Row = Record<string, string | number | null>;
const tick = { fill: 'var(--muted)', fontSize: 11 };
const tooltipStyle = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 13 };

export function Bars({ data, y, name, color = 'var(--accent)', unit = '', height = 200, fmt, integer }: {
  data: Row[]; y: string; name: string; color?: string; unit?: string; height?: number; fmt?: (v: number) => string; integer?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} allowDecimals={!integer} tickFormatter={fmt ? (v: number) => fmt(v) : undefined} />
        <Tooltip cursor={{ fill: 'var(--surface-3)', opacity: 0.4 }} contentStyle={tooltipStyle}
          formatter={(v: number | string) => [`${fmt ? fmt(Number(v)) : v}${unit ? ` ${unit}` : ''}`, name]} />
        <Bar dataKey={y} name={name} fill={color} radius={[6, 6, 2, 2]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, series, unit = '', height = 200, fmt, domain }: {
  data: Row[]; series: { key: string; name: string; color: string }[]; unit?: string; height?: number;
  fmt?: (v: number) => string; domain?: [number | string, number | string];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={48} domain={domain ?? ['auto', 'auto']} tickFormatter={fmt ? (v: number) => fmt(v) : undefined} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string, n: string) => [`${fmt ? fmt(Number(v)) : v}${unit ? ` ${unit}` : ''}`, n]} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 3, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
