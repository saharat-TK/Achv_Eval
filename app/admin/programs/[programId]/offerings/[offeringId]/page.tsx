import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import { getOffering } from '@/lib/data/offerings';
import { getCoursesForProgram } from '@/lib/data/courses';
import { getAllUsers } from '@/lib/data/users';
import OfferingForm from '@/components/OfferingForm';
import type { OfferingFormData } from '@/app/admin/programs/[programId]/offerings/actions';

export const dynamic = 'force-dynamic';

export default async function EditOfferingPage({
  params,
}: {
  params: { programId: string; offeringId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const program = await getProgram(params.programId);
  if (!program) notFound();
  const allowed =
    profile.roles.isAdmin || profile.roles.directorOf?.includes(program.id);
  if (!allowed) notFound();

  const offering = await getOffering(params.offeringId);
  if (!offering || offering.programId !== program.id) notFound();

  const [courses, users] = await Promise.all([
    getCoursesForProgram(program.id),
    getAllUsers(),
  ]);

  const initial: OfferingFormData = {
    courseId: offering.courseId,
    academicYear: offering.academicYear,
    semester: offering.semester,
    section: offering.section,
    lecturerId: offering.lecturerId,
    hasExamAssessment: offering.hasExamAssessment,
    assignedPloNumbers: offering.assignedPloNumbers ?? [],
  };

  return (
    <div>
      <Link
        href={`/admin/programs/${program.id}/offerings`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้ารายวิชาที่เปิดสอน
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        แก้ไขรายวิชาที่เปิดสอน — {offering.courseCode} {offering.courseNameTh}
      </h1>
      <div className="mt-6">
        <OfferingForm
          mode="edit"
          programId={program.id}
          offeringId={offering.id}
          initial={initial}
          courses={courses.map((c) => ({
            id: c.id,
            code: c.code,
            nameTh: c.nameTh,
          }))}
          lecturers={users.map((u) => ({
            id: u.id,
            nameTh: u.nameTh,
            email: u.email,
          }))}
          plos={(program.plos ?? []).map((p) => ({
            ploNumber: p.ploNumber,
            descriptionTh: p.descriptionTh,
          }))}
        />
      </div>
    </div>
  );
}
