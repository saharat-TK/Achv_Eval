import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import SignOutButton from '@/components/SignOutButton';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isDirector = profile.roles.directorOf?.length > 0;
  if (!profile.roles.isAdmin && !isDirector) {
    // Not an admin or director — send to their own workspace.
    redirect('/lecturer');
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-50 bg-white shadow-sm print:hidden">
        <header className="border-b border-slate-200">
          <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
            <Link href="/admin/dashboard" className="flex flex-col">
              <span className="text-sm font-semibold text-mfu-primary">
                ระบบประเมินและทวนสอบรายวิชา
              </span>
              <span className="text-xs text-slate-500">
                พื้นที่ทำงานผู้ดูแลระบบ / ประธานหลักสูตร
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-slate-700">{profile.nameTh}</div>
                <div className="text-xs text-slate-400">
                  {profile.roles.isAdmin ? 'ผู้ดูแลระบบ' : 'ประธานหลักสูตร'}
                </div>
              </div>
              <SignOutButton />
            </div>
          </div>
        </header>

        <nav className="border-b border-slate-200">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex gap-6 text-sm">
              <Link
                href="/admin/dashboard"
                className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
              >
                แดชบอร์ด
              </Link>
              <Link
                href="/admin"
                className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
              >
                หลักสูตร
              </Link>
              <Link
                href="/verification"
                className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
              >
                รับรองผล
              </Link>
              {profile.roles.isAdmin && (
                <Link
                  href="/admin/users"
                  className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
                >
                  ผู้ใช้งานและสิทธิ์
                </Link>
              )}
            </div>
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
