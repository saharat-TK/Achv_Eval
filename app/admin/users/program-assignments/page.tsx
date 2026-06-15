import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgramAssignmentData } from '@/lib/data/programAssignments';
import ProgramAssignmentsClient from '@/components/ProgramAssignmentsClient';
import UsersSubNav from '@/components/UsersSubNav';

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

      <UsersSubNav active="assignments" />

      <ProgramAssignmentsClient
        programs={data.programs}
        people={data.people}
        rows={data.rows}
      />
    </div>
  );
}
