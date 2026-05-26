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
const HOUSE_GREEN = '#1E3932';
const LIGHT_GREEN = '#7FB39C';
const AMBER = '#D97706';
const SLATE_200 = '#e2e8f0';
const SLATE_300 = '#cbd5e1';

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
  const stackedTrend = trend.map((pt) => {
    const assessed =
      pt.totalOfferings > 0
        ? Math.round((pt.assessedCount / pt.totalOfferings) * 100)
        : 0;
    return {
      ...pt,
      assessedPct: assessed,
      notAssessedPct: 100 - assessed,
    };
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
              <Tooltip formatter={(value) => `${value}%`} />
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
              <Tooltip />
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
