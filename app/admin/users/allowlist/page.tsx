import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllAllowlistEntries } from '@/lib/data/allowlist';
import { getAllAcademicPrograms } from '@/lib/data/academicPrograms';
import AllowlistTable, {
  type AllowlistRow,
} from '@/components/AllowlistTable';
import AllowlistAddForm from '@/components/AllowlistAddForm';
import AllowlistCsvUpload from '@/components/AllowlistCsvUpload';

export const dynamic = 'force-dynamic';

function tsToIso(ts: unknown): string | null {
  if (!ts) return null;
  // Firestore Timestamp shape — has toDate()
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export default async function AdminAllowlistPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const [entries, academicPrograms] = await Promise.all([
    getAllAllowlistEntries(),
    getAllAcademicPrograms(),
  ]);
  const programById = new Map(academicPrograms.map((p) => [p.id, p]));
  const programOptions = academicPrograms.map((p) => ({
    id: p.id,
    code: p.code,
    nameTh: p.nameTh,
  }));

  const rows: AllowlistRow[] = entries.map((e) => {
    const prog = e.presetDirectorProgramId
      ? programById.get(e.presetDirectorProgramId)
      : undefined;
    return {
      id: e.id,
      email: e.email,
      nameTh: e.nameTh,
      nameEn: e.nameEn,
      notes: e.notes,
      presetIsLecturer: e.presetIsLecturer !== false, // default true
      presetIsDirector: e.presetIsDirector === true,
      presetDirectorProgramId: e.presetDirectorProgramId ?? null,
      presetDirectorProgramName: prog ? `${prog.code} — ${prog.nameTh}` : null,
      consumedAt: tsToIso(e.consumedAt),
      consumedUid: e.consumedUid ?? null,
    };
  });

  const pendingCount = rows.filter((r) => !r.consumedAt).length;
  const consumedCount = rows.length - pendingCount;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">
        ผู้ใช้งานและสิทธิ์
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        จัดการรายชื่อผู้ใช้ที่ได้รับอนุญาตให้เข้าใช้งานระบบ — เฉพาะอีเมลที่อยู่
        ในทะเบียนนี้เท่านั้นจึงจะสร้างบัญชีอัตโนมัติเมื่อเข้าสู่ระบบครั้งแรก
      </p>

      {/* Sub-nav */}
      <div className="mt-4 flex gap-4 border-b border-slate-200 text-sm">
        <Link
          href="/admin/users"
          className="border-b-2 border-transparent pb-2 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
        >
          ผู้ใช้งานปัจจุบัน
        </Link>
        <Link
          href="/admin/users/program-assignments"
          className="border-b-2 border-transparent pb-2 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
        >
          มอบหมายอาจารย์ประจำหลักสูตร
        </Link>
        <Link
          href="/admin/users/allowlist"
          className="border-b-2 border-mfu-primary pb-2 font-medium text-mfu-primary"
        >
          ทะเบียนรายชื่อ
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">
          รวม {rows.length} รายการ — รอลงทะเบียน {pendingCount} ·
          ลงทะเบียนแล้ว {consumedCount}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <AllowlistAddForm programs={programOptions} />
        <AllowlistCsvUpload programs={programOptions} />
      </div>

      <div className="mt-4">
        <AllowlistTable rows={rows} programs={programOptions} />
      </div>
    </div>
  );
}
