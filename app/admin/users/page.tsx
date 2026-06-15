import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllUsers } from '@/lib/data/users';
import { getCommitteeMembershipsByUser } from '@/lib/data/assessmentCommittee';
import UsersSubNav from '@/components/UsersSubNav';

export const dynamic = 'force-dynamic';

function roleSummary(roles: {
  isSuperAdmin?: boolean;
  isAdmin: boolean;
  isLecturer?: boolean;
  directorOf?: string[];
  assessorOf?: string[];
  verifierOf?: string[];
  directorOfAcademicPrograms?: string[];
  assessorOfAcademicPrograms?: string[];
  verifierOfAcademicPrograms?: string[];
}): string {
  const parts: string[] = [];
  const directorCount =
    roles.directorOfAcademicPrograms?.length || roles.directorOf?.length || 0;
  const verifierCount =
    roles.verifierOfAcademicPrograms?.length || roles.verifierOf?.length || 0;
  if (roles.isSuperAdmin) parts.push('ผู้ดูแลระบบสูงสุด');
  if (roles.isAdmin && !roles.isSuperAdmin) parts.push('ผู้ดูแลระบบ');
  if (directorCount) parts.push(`ประธานหลักสูตร (${directorCount})`);
  if (verifierCount) parts.push(`กรรมการรับรองผล (${verifierCount})`);
  if (roles.isLecturer) parts.push('อาจารย์ผู้รับผิดชอบ');
  // Assessor roles are shown separately as committee chips (see the table cell).
  return parts.join(' · ');
}

const POSITION_LABEL: Record<'head' | 'internal' | 'secretary', string> = {
  head: 'ประธานผู้ทวนสอบ',
  internal: 'ผู้ทวนสอบภายใน',
  secretary: 'เลขานุการ',
};

export default async function AdminUsersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // User & role management is admin-only.
  if (!profile.roles.isAdmin) redirect('/admin');

  const [users, committeeByUser] = await Promise.all([
    getAllUsers(),
    getCommitteeMembershipsByUser(),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">ผู้ใช้งานและสิทธิ์</h1>
      <p className="mt-1 text-sm text-slate-500">
        กำหนดสิทธิ์ผู้ดูแลระบบ ประธานหลักสูตร ผู้ทวนสอบ และกรรมการรับรองผล
        (สิทธิ์อาจารย์ผู้รับผิดชอบรายวิชากำหนดที่หน้ารายวิชาที่เปิดสอน)
      </p>

      {/* Sub-nav */}
      <UsersSubNav active="users" />

      {users.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีผู้ใช้ — ผู้ใช้จะปรากฏหลังเข้าสู่ระบบครั้งแรก
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">อีเมล</th>
                <th className="px-4 py-3 font-medium">สิทธิ์ปัจจุบัน</th>
                <th className="px-4 py-3 font-medium">สถานะบัญชี</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const inactive = u.isActive === false;
                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-slate-50 ${inactive ? 'bg-slate-50/60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="font-medium text-mfu-primary hover:underline"
                      >
                        {u.nameTh || '(ไม่มีชื่อ)'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const base = roleSummary(u.roles);
                        const memberships = committeeByUser[u.id] ?? [];
                        const assessorCount =
                          u.roles.assessorOfAcademicPrograms?.length ?? 0;
                        if (!base && memberships.length === 0 && assessorCount === 0)
                          return <span className="text-slate-500">—</span>;
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
                            {base && <span>{base}</span>}
                            {memberships.map((m, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                              >
                                {POSITION_LABEL[m.position]} · {m.code}
                              </span>
                            ))}
                            {memberships.length === 0 && assessorCount > 0 && (
                              <span>ผู้ทวนสอบ ({assessorCount})</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {inactive ? (
                        <span className="text-red-600">ปิดใช้งาน</span>
                      ) : (
                        <span className="text-green-700">ใช้งาน</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
