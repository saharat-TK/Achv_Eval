'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
// Type-only import — erased at compile time, so the server-only data
// module is never pulled into the client bundle.
import type { DashboardTrendPoint } from '@/lib/data/dashboard';

const GREEN = '#00704A';
const LIGHT_GREEN = '#7FB39C';
const AMBER = '#D97706';
const SLATE_200 = '#e2e8f0';
const SLATE_300 = '#cbd5e1'; // "not assessed" bar fill
const SLATE_450 = '#7c8ba1'; // mid-point between slate-400 and slate-500 — label text only

type StackedPoint = DashboardTrendPoint & {
  assessedPct: number;
  notAssessedPct: number;
};

/** Custom tooltip for the left ComposedChart. Shows percentage + course count for bar series. */
function ProgressTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string; payload: StackedPoint }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md"
      style={{ fontSize: 11 }}
    >
      <p className="mb-1.5 font-semibold text-slate-700">{label}</p>
      {payload.map((entry) => {
        if (entry.value === null || entry.value === undefined) return null;
        let detail: string;
        if (entry.name === 'ทวนสอบแล้ว') {
          detail = `${entry.value}% (${pt.assessedCount} วิชา)`;
        } else if (entry.name === 'ยังไม่ทวนสอบ') {
          detail = `${entry.value}% (${pt.totalOfferings - pt.assessedCount} วิชา)`;
        } else {
          // Average score line — value may be null when no signed assessments
          detail = entry.value !== null ? `${entry.value}%` : '—';
        }
        // Use a darker label color for the light "not assessed" bar so the
        // text is legible on the white tooltip background.
        const labelColor =
          entry.name === 'ยังไม่ทวนสอบ' ? SLATE_450 : entry.color;
        return (
          <div key={entry.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: entry.color }}
            />
            <span style={{ color: labelColor }}>
              {entry.name}&nbsp;:&nbsp;{detail}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Custom tooltip for the right BarChart — matches ProgressTooltip's styling. */
function BandTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number | null;
    color: string;
    payload: DashboardTrendPoint;
  }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  const total = pt.excellent + pt.good + pt.improve;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md"
      style={{ fontSize: 11 }}
    >
      <p className="mb-1.5 font-semibold text-slate-700">{label}</p>
      {payload.map((entry) => {
        if (entry.value === null || entry.value === undefined) return null;
        const pct = total > 0 ? Math.round((entry.value / total) * 1000) / 10 : 0;
        return (
          <div key={entry.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: entry.color }}
            />
            <span style={{ color: entry.color }}>
              {entry.name}&nbsp;:&nbsp;{pct}% ({entry.value} วิชา)
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Cross-semester trend charts: average verification score and completion
 * rate over time, plus the result-band mix per term.
 */
export default function DashboardTrends({
  trend,
}: {
  trend: DashboardTrendPoint[];
}) {
  if (trend.length < 2) {
    return (
      <p className="text-sm text-slate-500">
        ต้องมีข้อมูลอย่างน้อย 2 ภาคการศึกษาจึงจะแสดงแนวโน้มได้
      </p>
    );
  }

  // Pre-compute 100%-stack values for each trend point.
  const stackedTrend: StackedPoint[] = trend.map((pt) => {
    const assessed =
      pt.totalOfferings > 0
        ? Math.round((pt.assessedCount / pt.totalOfferings) * 100)
        : 0;
    return { ...pt, assessedPct: assessed, notAssessedPct: 100 - assessed };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left chart: 100% stacked bar (assessed vs not assessed) + average score line */}
      <div>
        <h3 className="text-sm font-medium text-slate-600">
          ความคืบหน้าการทวนสอบ (%) และคะแนนเฉลี่ย
        </h3>
        <div className="mt-2 h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart
              data={stackedTrend}
              margin={{ top: 8, right: 8, bottom: 4, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={SLATE_200} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                content={(props) => (
                  <ProgressTooltip
                    active={props.active}
                    payload={
                      (props.payload as unknown) as Array<{
                        name: string;
                        value: number | null;
                        color: string;
                        payload: StackedPoint;
                      }>
                    }
                    label={props.label as string}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* 100% stacked bars */}
              <Bar
                dataKey="assessedPct"
                name="ทวนสอบแล้ว"
                stackId="completion"
                fill={GREEN}
                isAnimationActive={false}
              />
              <Bar
                dataKey="notAssessedPct"
                name="ยังไม่ทวนสอบ"
                stackId="completion"
                fill={SLATE_300}
                isAnimationActive={false}
              />
              {/* Average score line overlay */}
              <Line
                type="monotone"
                dataKey="averagePercentScore"
                name="คะแนนเฉลี่ย"
                stroke={AMBER}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right chart: band distribution */}
      <div>
        <h3 className="text-sm font-medium text-slate-600">
          การกระจายระดับผลทวนสอบ (จำนวนรายวิชา)
        </h3>
        <div className="mt-2 h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={SLATE_200} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                content={(props) => (
                  <BandTooltip
                    active={props.active}
                    payload={
                      (props.payload as unknown) as Array<{
                        name: string;
                        value: number | null;
                        color: string;
                        payload: DashboardTrendPoint;
                      }>
                    }
                    label={props.label as string}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="excellent" name="ดีเยี่ยม" stackId="band" fill={GREEN} />
              <Bar dataKey="good" name="ดี" stackId="band" fill={LIGHT_GREEN} />
              <Bar dataKey="improve" name="ควรปรับปรุง" stackId="band" fill={AMBER} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
