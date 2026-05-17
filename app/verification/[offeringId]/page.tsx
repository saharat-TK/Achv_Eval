import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  canAccessVerificationProgram,
  getVerificationQueueItem,
} from '@/lib/data/verifications';
import { SEMESTER_LABEL, VERIFICATION_DECISION } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import FinalVerificationForm from '@/components/FinalVerificationForm';

export const dynamic = 'force-dynamic';

export default async function VerificationDetailPage({
  params,
}: {
  params: { offeringId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const item = await getVerificationQueueItem(params.offeringId);
  if (!item || !canAccessVerificationProgram(profile, item.offering.programId)) {
    notFound();
  }

  const { offering, assessment, latestVerification } = item;

  return (
    <div className="max-w-4xl">
      <Link href="/verification" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้ารายการรับรองผล
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {offering.courseCode} {offering.courseNameTh}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {offering.courseNameEn} · ปีการศึกษา {offering.academicYear}{' '}
            {SEMESTER_LABEL[offering.semester]} ตอนเรียน {offering.section}
          </p>
        </div>
        <StatusBadge status={offering.status} />
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">
          ผลการทวนสอบโดยผู้ทวนสอบ
        </h2>
        {assessment ? (
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
            <Metric label="ผู้ทวนสอบ" value={assessment.assessorName} />
            <Metric
              label="คะแนน"
              value={`${assessment.totalScore}/${assessment.maxScore}`}
            />
            <Metric label="ร้อยละ" value={`${assessment.percentScore}%`} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">ไม่พบผลการทวนสอบ</p>
        )}
        {assessment?.signedPdfUrl && (
          <a
            href={assessment.signedPdfUrl}
            className="mt-4 inline-block text-sm text-mfu-primary hover:underline"
          >
            ดาวน์โหลดรายงาน AI + ผลทวนสอบ
          </a>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">
          ผลการรับรองของคณะกรรมการ
        </h2>
        {latestVerification ? (
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>
              สถานะ:{' '}
              <span className="font-semibold">
                {VERIFICATION_DECISION[latestVerification.decision].labelTh}
              </span>
            </p>
            {latestVerification.committeeNotes && (
              <p>{latestVerification.committeeNotes}</p>
            )}
            {latestVerification.requiredActions && (
              <p className="text-amber-700">{latestVerification.requiredActions}</p>
            )}
            <p className="text-xs text-slate-400">
              บันทึกโดย {latestVerification.verifierName}
            </p>
          </div>
        ) : !assessment ? (
          <p className="mt-2 text-sm text-slate-500">
            ยังไม่พบผลการทวนสอบจากผู้ทวนสอบ จึงยังรับรองผลขั้นสุดท้ายไม่ได้
          </p>
        ) : !['assessed', 'verification_review'].includes(offering.status) ? (
          <p className="mt-2 text-sm text-slate-500">
            รายวิชานี้ไม่ได้อยู่ในสถานะรอรับรองผล
          </p>
        ) : (
          <div className="mt-3">
            <FinalVerificationForm offeringId={offering.id} />
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-800">{value}</div>
    </div>
  );
}
