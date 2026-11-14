'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useReducedMotion } from 'framer-motion';

/**
 * Colours validated with the dataviz palette validator (light surface #ffffff):
 *  - two series: emerald #047857 + gold #c4973a (CVD ΔE 16.0, normal ΔE 24.5; gold < 3:1,
 *    so every chart has direct labels/legend and a table view).
 *  - magnitude: one hue (emerald).
 *  - decision outcomes: fixed status palette, always labelled (never colour alone).
 */
export const SERIES = { primary: '#047857', secondary: '#c4973a' };
export const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };
const INK = { axis: '#6b7280', grid: '#e5e7eb', text: '#1f2937' };

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('ms-MY', { month: 'short', year: '2-digit' });
};

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 4px 16px rgba(16,40,28,.08)' },
  labelStyle: { color: INK.text, fontWeight: 600 },
  itemStyle: { color: INK.text },
};

/** Legend text uses ink colour; only the swatch carries the series colour. */
const legendText = (value: string) => <span style={{ color: INK.text }}>{value}</span>;

/** Direct label at the last point of a line (names the series without relying on colour). */
function endLabel(name: string, lastIndex: number) {
  // eslint-disable-next-line react/display-name
  return (props: { x?: number; y?: number; index?: number }) =>
    props.index === lastIndex && props.x !== undefined && props.y !== undefined ? (
      <text x={props.x + 6} y={props.y} dy={4} fontSize={11} fill={INK.text}>
        {name}
      </text>
    ) : (
      <g />
    );
}

export function TrendLines({ data }: { data: Array<{ month: string; registered: number; published: number }> }) {
  const animate = !useReducedMotion();
  const last = data.length - 1;
  return (
    <div className="h-72" role="img" aria-label="Carta garis: guru berdaftar dan diterbitkan setiap bulan, 12 bulan terakhir">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 72, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: INK.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: INK.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} labelFormatter={(m) => monthLabel(String(m))} cursor={{ stroke: INK.axis, strokeDasharray: '3 3' }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          <Line type="monotone" dataKey="registered" name="Berdaftar" stroke={SERIES.primary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} label={endLabel('Berdaftar', last)} isAnimationActive={animate} />
          <Line type="monotone" dataKey="published" name="Diterbitkan" stroke={SERIES.secondary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} label={endLabel('Diterbitkan', last)} isAnimationActive={animate} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DecisionBars({ data }: { data: Array<{ month: string; approved: number; revision: number; rejected: number }> }) {
  const animate = !useReducedMotion();
  return (
    <div className="h-72" role="img" aria-label="Carta bar bertindan: keputusan semakan setiap bulan mengikut hasil">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: INK.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: INK.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} labelFormatter={(m) => monthLabel(String(m))} cursor={{ fill: '#f3f4f6' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          {/* 2px surface-coloured stroke separates stacked segments. */}
          <Bar isAnimationActive={animate} dataKey="approved" name="✓ Diluluskan" stackId="d" fill={STATUS.good} stroke="#ffffff" strokeWidth={2} maxBarSize={24} />
          <Bar isAnimationActive={animate} dataKey="revision" name="↺ Pembetulan" stackId="d" fill={STATUS.warning} stroke="#ffffff" strokeWidth={2} maxBarSize={24} />
          <Bar isAnimationActive={animate} dataKey="rejected" name="✕ Ditolak" stackId="d" fill={STATUS.critical} stroke="#ffffff" strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked magnitude: one hue, value printed at the bar end. */
export function RankedBars({ data, label, unit }: { data: Array<{ name: string; value: number }>; label: string; unit: string }) {
  const animate = !useReducedMotion();
  const height = Math.max(160, data.length * 28 + 24);
  return (
    <div style={{ height }} role="img" aria-label={`Carta bar mendatar: ${label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={160} tick={{ fill: INK.text, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v} ${unit}`, label]} cursor={{ fill: '#f3f4f6' }} />
          <Bar isAnimationActive={animate} dataKey="value" name={label} fill={SERIES.primary} maxBarSize={18} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="value" position="right" fontSize={11} fill={INK.text} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
