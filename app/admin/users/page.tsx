import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllUsers } from '@/lib/data/users';

export const dynamic = 'force-dynamic';

function roleSummary(roles: {
  isSuperAdmin?: boolean;
  isAdmin: boolean;
  isLecturer?: boolean;
  directorOf?: string[];
  assessorOf?: string[];
  verifierOf?: string[];
}): string {
  const parts: string[] = [];
  if (roles.isSuperAdmin) parts.push('ผู้ดูแลระบบสูงสุด');
  if (roles.isAdmin && !roles.isSuperAdmin) parts.push('ผู้ดูแลระบบ');
  if (roles.directorOf?.length) parts.push(`ประธานหลักสูตร (${roles.directorOf.length})`);
  if (roles.assessorOf?.length) parts.push(`ผู้ทวนสอบ (${roles.assessorOf.length})`);
  if (roles.verifierOf?.length) parts.push(`กรรมการรับรองผล (${roles.verifierOf.length})`);
  if (roles.isLecturer) parts.push('อาจารย์ผู้รับผิดชอบ');
  return parts.length ? parts.join(' · ') : '—';
}

export default async function AdminUsersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // User & role management is admin-only.
  if (!profile.roles.isAdmin) redirect('/admin');

  const users = await getAllUsers();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">ผู้ใช้งานและสิทธิ์</h1>
      <p className="mt-1 text-sm text-slate-500">
        กำหนดสิทธิ์ผู้ดูแลระบบ ประธานหลักสูตร ผู้ทวนสอบ และกรรมการรับรองผล
        (สิทธิ์อาจารย์ผู้รับผิดชอบรายวิชากำหนดที่หน้ารายวิชาที่เปิดสอน)
      </p>

      {/* Sub-nav */}
      <div className="mt-4 flex gap-4 border-b border-slate-200 text-sm">
        <Link
          href="/admin/users"
          className="border-b-2 border-mfu-primary pb-2 font-medium text-mfu-primary"
        >
          ผู้ใช้งานปัจจุบัน
        </Link>
        <Link
          href="/admin/users/allowlist"
          className="border-b-2 border-transparent pb-2 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
        >
          ทะเบียนรายชื่อ
        </Link>
      </div>

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
                    <td className="px-4 py-3 text-slate-600">
                      {roleSummary(u.roles)}
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
