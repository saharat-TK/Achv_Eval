import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/firebase/auth-server';
import {
  getOffering,
  getUploadsForOffering,
  getAiReportsForOffering,
} from '@/lib/data/offerings';
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

  const [uploads, aiReports] = await Promise.all([
    getUploadsForOffering(offering.id),
    getAiReportsForOffering(offering.id),
  ]);

  const uploadByType = new Map(uploads.map((u) => [u.type, u]));
  const requiredMissing = DOCUMENT_SLOTS.filter(
    (s) => s.required && !uploadByType.has(s.type),
  );

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

      {/* Document checklist */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          เอกสารประกอบการประเมิน
        </h2>
        <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {DOCUMENT_SLOTS.map((slot) => {
            const upload = uploadByType.get(slot.type);
            return (
              <div
                key={slot.type}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {slot.labelTh}
                    {slot.required && (
                      <span className="ml-2 text-xs text-red-500">บังคับ</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {slot.descriptionTh}
                  </div>
                </div>
                {upload ? (
                  <span className="text-xs font-medium text-green-700">
                    ✓ อัปโหลดแล้ว
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">ยังไม่อัปโหลด</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {requiredMissing.length > 0
            ? `ยังขาดเอกสารบังคับ ${requiredMissing.length} รายการ`
            : 'เอกสารบังคับครบถ้วน'}
          {' · '}การอัปโหลดไฟล์จะเปิดใช้งานในขั้นถัดไป (Phase 1B)
        </p>
      </section>

      {/* AI reports */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          รายงานการวิเคราะห์ด้วย AI
        </h2>
        {aiReports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">
            ยังไม่มีรายงาน — จะเปิดใช้งานหลังอัปโหลดเอกสารและเชื่อมต่อ Gemini
            (Phase 1C)
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {aiReports.map((r) => (
              <li key={r.id} className="text-slate-700">
                เวอร์ชัน {r.version} — {r.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
