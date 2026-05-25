import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgramAssignmentData } from '@/lib/data/programAssignments';
import ProgramAssignmentsClient from '@/components/ProgramAssignmentsClient';

export const dynamic = 'force-dynamic';

export default async function AdminProgramAssignmentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const data = await getProgramAssignmentData();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">ผู้ใช้งานและสิทธิ์</h1>
      <p className="mt-1 text-sm text-slate-500">
        มอบหมายประธานหลักสูตรและอาจารย์ประจำหลักสูตร เพื่อใช้ต่อกับการเปิดสอนรายวิชา
      </p>

      <div className="mt-4 flex gap-4 border-b border-slate-200 text-sm">
        <Link
          href="/admin/users"
          className="border-b-2 border-transparent pb-2 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
        >
          ผู้ใช้งานปัจจุบัน
        </Link>
        <Link
          href="/admin/users/program-assignments"
          className="border-b-2 border-mfu-primary pb-2 font-medium text-mfu-primary"
        >
          มอบหมายอาจารย์ประจำหลักสูตร
        </Link>
        <Link
          href="/admin/users/allowlist"
          className="border-b-2 border-transparent pb-2 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
        >
          ทะเบียนรายชื่อ
        </Link>
      </div>

      <ProgramAssignmentsClient
        programs={data.programs}
        people={data.people}
        rows={data.rows}
      />
    </div>
  );
}
