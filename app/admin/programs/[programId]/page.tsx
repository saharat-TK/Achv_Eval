import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import { getAllDepartments } from '@/lib/data/departments';
import ProgramForm from '@/components/ProgramForm';
import ProgramLifecyclePanel from '@/components/ProgramLifecyclePanel';
import { checkProgramBlockers, type ProgramFormData } from '@/app/admin/programs/actions';

export const dynamic = 'force-dynamic';

export default async function EditProgramPage({
  params,
}: {
  params: { programId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const program = await getProgram(params.programId);
  if (!program) notFound();

  // Admin, or the director of this program.
  const allowed =
    profile.roles.isAdmin || profile.roles.directorOf?.includes(program.id);
  if (!allowed) notFound();

  // Plain, serializable subset for the client form (no Firestore Timestamps).
  const initial: ProgramFormData = {
    code: program.code,
    nameTh: program.nameTh,
    nameEn: program.nameEn,
    school: program.school,
    level: program.level,
    ploDomainSchema: program.ploDomainSchema,
    isActive: program.isActive,
    departmentId: program.departmentId ?? null,
    plos: (program.plos ?? []).map((p) => ({
      ploNumber: p.ploNumber,
      domain: p.domain,
      descriptionTh: p.descriptionTh,
      descriptionEn: p.descriptionEn ?? '',
      bloomLevel: p.bloomLevel,
    })),
  };

  const departments = await getAllDepartments();
  const departmentOptions = departments.map((d) => ({
    id: d.id,
    nameTh: d.nameTh,
    isActive: d.isActive,
  }));

  const isAdmin = profile.roles.isAdmin === true;
  let blockers = {
    coursesCount: 0,
    offeringsCount: 0,
    reviewsCount: 0,
    assignedUsers: [] as string[],
  };

  if (isAdmin) {
    const blockersRes = await checkProgramBlockers(program.id);
    if (blockersRes.ok) {
      blockers = blockersRes.blockers;
    }
  }

  return (
    <div>
      <Link href="/admin" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้าหลักสูตร
      </Link>

      {isAdmin ? (
        <div className="mt-3 grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_256px]">
          {/* Header — spans both columns */}
          <div className="flex items-start justify-between gap-4 lg:col-span-2">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">
                แก้ไขหลักสูตร {program.code}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{program.nameTh}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/admin/programs/${program.id}/courses`}
                className="rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
              >
                จัดการรายวิชา →
              </Link>
              <Link
                href={`/admin/programs/${program.id}/offerings`}
                className="rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
              >
                รายวิชาที่เปิดสอน →
              </Link>
            </div>
          </div>

          {/* Body — left */}
          <div className="mt-6">
            <ProgramForm
              mode="edit"
              programId={program.id}
              initial={initial}
              departments={departmentOptions}
            />
          </div>
          {/* Body — right */}
          <aside className="mt-6 lg:sticky lg:top-24 lg:self-start">
            <ProgramLifecyclePanel
              programId={program.id}
              programCode={program.code}
              isActive={program.isActive}
              blockers={blockers}
            />
          </aside>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">
                แก้ไขหลักสูตร {program.code}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{program.nameTh}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/admin/programs/${program.id}/courses`}
                className="rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
              >
                จัดการรายวิชา →
              </Link>
              <Link
                href={`/admin/programs/${program.id}/offerings`}
                className="rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
              >
                รายวิชาที่เปิดสอน →
              </Link>
            </div>
          </div>
          <div className="mt-6">
            <ProgramForm
              mode="edit"
              programId={program.id}
              initial={initial}
              departments={departmentOptions}
              canEditDepartment={false}
            />
          </div>
        </>
      )}
    </div>
  );
}

