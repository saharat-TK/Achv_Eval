import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import ProgramForm from '@/components/ProgramForm';
import type { ProgramFormData } from '@/app/admin/programs/actions';

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
    plos: (program.plos ?? []).map((p) => ({
      ploNumber: p.ploNumber,
      domain: p.domain,
      descriptionTh: p.descriptionTh,
      descriptionEn: p.descriptionEn ?? '',
      bloomLevel: p.bloomLevel,
    })),
  };

  return (
    <div>
      <Link href="/admin" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้าหลักสูตร
      </Link>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            แก้ไขหลักสูตร {program.code}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{program.nameTh}</p>
        </div>
        <Link
          href={`/admin/programs/${program.id}/courses`}
          className="shrink-0 rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
        >
          จัดการรายวิชา →
        </Link>
      </div>
      <div className="mt-6">
        <ProgramForm mode="edit" programId={program.id} initial={initial} />
      </div>
    </div>
  );
}
