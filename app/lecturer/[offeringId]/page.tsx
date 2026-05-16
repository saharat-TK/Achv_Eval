import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/firebase/auth-server';
import { getOffering, getAiReportsForOffering } from '@/lib/data/offerings';
import StatusBadge from '@/components/StatusBadge';
import { DOCUMENT_SLOTS, SEMESTER_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function OfferingDetailPage({
  params,
}: {
  params: { offeringId: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const offering = await getOffering(params.offeringId);
  // Lecturer may only view their own offering. Admin/director/assessor views
  // arrive in later phases through their own workspaces.
  if (!offering || offering.lecturerId !== user.uid) {
    notFound();
  }

  const aiReports = await getAiReportsForOffering(offering.id);

  return (
    <div>
      <Link href="/lecturer" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้ารายวิชา
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {offering.courseCode} {offering.courseNameTh}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {offering.courseNameEn} · ปีการศึกษา {offering.academicYear}{' '}
            {SEMESTER_LABEL[offering.semester]} · ตอนเรียน {offering.section}
          </p>
        </div>
        <StatusBadge status={offering.status} />
      </div>

      {/* Analysis submission */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          ส่งเอกสารเพื่อวิเคราะห์ด้วย AI
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          ไฟล์ที่อัปโหลดจะถูกส่งให้ระบบ AI วิเคราะห์ทันทีและ
          <strong>ไม่ถูกจัดเก็บไว้ในระบบ</strong> — ระบบเก็บเฉพาะรายงาน PDF
          ที่สร้างขึ้นเท่านั้น
        </p>
        <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {DOCUMENT_SLOTS.map((slot) => (
            <div key={slot.type} className="px-4 py-3">
              <div className="text-sm font-medium text-slate-800">
                {slot.labelTh}
                {slot.required && (
                  <span className="ml-2 text-xs text-red-500">บังคับ</span>
                )}
              </div>
              <div className="text-xs text-slate-500">{slot.descriptionTh}</div>
            </div>
          ))}
        </div>
        <button
          disabled
          className="mt-4 rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white opacity-50"
        >
          อัปโหลดและเริ่มวิเคราะห์
        </button>
        <p className="mt-2 text-xs text-slate-400">
          การอัปโหลดและการวิเคราะห์จะเปิดใช้งานใน Phase 1B
        </p>
      </section>

      {/* AI reports */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          รายงานการวิเคราะห์
        </h2>
        {aiReports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">ยังไม่มีรายงาน</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {aiReports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-slate-700">เวอร์ชัน {r.version}</span>
                <span className="text-slate-500">{r.status}</span>
                {r.reportDownloadUrl && (
                  <a
                    href={r.reportDownloadUrl}
                    className="text-mfu-primary hover:underline"
                  >
                    ดาวน์โหลด PDF
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
