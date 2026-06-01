import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/firebase/auth-server';
import { getLecturerOfferingCounts } from '@/lib/data/offerings';
import LecturerOfferingsTable from '@/components/LecturerOfferingsTable';

export const dynamic = 'force-dynamic';

export default async function LecturerDashboard() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const counts = await getLecturerOfferingCounts(user.uid);
  const pct = (n: number) =>
    counts.total > 0 ? `${Math.round((n / counts.total) * 100)}%` : '—';

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">รายวิชาที่รับผิดชอบ</h1>
        <p className="mt-1 text-sm text-slate-500">
          รายวิชาที่ได้รับมอบหมายให้ท่านเป็นอาจารย์ผู้รับผิดชอบ
        </p>
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="รายวิชาทั้งหมด"
          value={String(counts.total)}
          detail="ที่ได้รับมอบหมาย"
        />
        <MetricCard
          label="รอส่งเอกสาร"
          value={String(counts.pendingDocs)}
          detail={pct(counts.pendingDocs)}
        />
        <MetricCard
          label="AI วิเคราะห์แล้ว"
          value={String(counts.aiDone)}
          detail={pct(counts.aiDone)}
        />
        <MetricCard
          label="รอทวนสอบ"
          value={String(counts.awaitingAssessor)}
          detail={pct(counts.awaitingAssessor)}
        />
        <MetricCard
          label="ทวนสอบแล้ว"
          value={String(counts.assessed)}
          detail={pct(counts.assessed)}
        />
      </div>

      <div className="mt-6">
        <LecturerOfferingsTable uid={user.uid} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}
