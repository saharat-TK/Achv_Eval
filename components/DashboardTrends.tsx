'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-medium text-slate-600">
          คะแนนเฉลี่ยและความคืบหน้า (%)
        </h3>
        <div className="mt-2 h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="averagePercentScore"
                name="คะแนนเฉลี่ย"
                stroke={GREEN}
                strokeWidth={2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="completionRate"
                name="ความคืบหน้าการทวนสอบ"
                stroke={HOUSE_GREEN}
                strokeWidth={2}
                strokeDasharray="5 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-600">
          การกระจายระดับผลทวนสอบ (จำนวนรายวิชา)
        </h3>
        <div className="mt-2 h-64">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
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
