// Dashboard charts. Each chart has a legend, a hover tooltip and a text summary for screen readers;
// the same numbers are also in tables (Reports page).
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COLORS, formatDay, formatNumber } from '../theme.js';

/**
 * Small trend line for a KPI tile (decorative; the tile states the numbers). Stretches to the tile's
 * width; the stroke keeps its 2px thickness however it is scaled.
 */
export function Sparkline({ values, color = COLORS.primary, height = 28 }) {
  if (!values?.length) return null;
  const width = 100;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => `${i * step},${height - 2 - (v / max) * (height - 4)}`).join(' ');
  return (
    <svg className="sparkline" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{labelFormatter ? labelFormatter(label) : label}</strong>
      {payload.map((p) => (
        <div key={p.dataKey}>
          <span>{p.name}</span>
          <b>{formatNumber(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: COLORS.muted, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: COLORS.border },
};

/** Uploads and decisions per day (two series: solid blue, dashed teal). */
export function ActivityChart({ trend }) {
  const totals = trend.reduce((t, d) => ({ uploads: t.uploads + d.uploads, decisions: t.decisions + d.decisions }), { uploads: 0, decisions: 0 });
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-legend">
        <span>
          <i className="legend-line" style={{ borderColor: COLORS.series[0] }} aria-hidden="true" />
          Documents uploaded <strong>{formatNumber(totals.uploads)}</strong>
        </span>
        <span>
          <i className="legend-line dashed" style={{ borderColor: COLORS.series[1] }} aria-hidden="true" />
          Decisions recorded <strong>{formatNumber(totals.decisions)}</strong>
        </span>
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="day" tickFormatter={formatDay} {...axisProps} minTickGap={18} />
            <YAxis allowDecimals={false} {...axisProps} axisLine={false} width={48} />
            <Tooltip content={<ChartTooltip labelFormatter={formatDay} />} cursor={{ stroke: COLORS.border, strokeWidth: 1 }} />
            <Line type="monotone" dataKey="uploads" name="Uploaded" stroke={COLORS.series[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: COLORS.surface }} />
            <Line
              type="monotone"
              dataKey="decisions"
              name="Decisions"
              stroke={COLORS.series[1]}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: COLORS.surface }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Over the last {trend.length} days, {totals.uploads} documents were uploaded and {totals.decisions} decisions were recorded.
      </figcaption>
    </figure>
  );
}

const CATEGORY_SERIES = [
  { key: 'completed', label: 'Completed', color: COLORS.status.COMPLETED },
  { key: 'underReview', label: 'Under review', color: COLORS.status.UNDER_REVIEW },
  { key: 'pending', label: 'Pending', color: COLORS.status.PENDING },
  { key: 'rejected', label: 'Rejected', color: COLORS.status.REJECTED },
];

/** Applications per category, stacked by application status (status colours). */
export function CategoryChart({ categories }) {
  const data = categories
    .filter((c) => c.isActive || c.applications.total > 0)
    .map((c) => ({ name: c.name, ...c.applications }));
  const totals = CATEGORY_SERIES.map((s) => ({ ...s, total: data.reduce((sum, d) => sum + d[s.key], 0) }));

  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-legend">
        {totals.map((s) => (
          <span key={s.key}>
            <i className="status-legend-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label} <strong>{s.total}</strong>
          </span>
        ))}
      </div>
      <div style={{ width: '100%', height: Math.max(160, data.length * 44 + 30) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap={10}>
            <CartesianGrid stroke={COLORS.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="name" {...axisProps} axisLine={false} width={90} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
            {CATEGORY_SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="status"
                fill={s.color}
                stroke={COLORS.surface}
                strokeWidth={2}
                radius={i === CATEGORY_SERIES.length - 1 ? [0, 4, 4, 0] : 0}
                maxBarSize={24}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Applications per category: {data.map((d) => `${d.name} ${d.total}`).join(', ')}.
      </figcaption>
    </figure>
  );
}
