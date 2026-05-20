import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import SignOutButton from '@/components/SignOutButton';
import NotificationBell from '@/components/NotificationBell';

export default async function VerificationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const canVerify =
    profile.roles.isAdmin ||
    (profile.roles.directorOf ?? []).length > 0 ||
    (profile.roles.verifierOf ?? []).length > 0;

  if (!canVerify) {
    redirect('/lecturer');
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/verification" className="flex flex-col">
            <span className="text-sm font-semibold text-mfu-primary">
              ระบบประเมินและทวนสอบรายวิชา
            </span>
            <span className="text-xs text-slate-500">
              พื้นที่ทำงานคณะกรรมการรับรองผล
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/verification"
                className="text-slate-600 hover:text-mfu-primary"
              >
                รายการรอรับรอง
              </Link>
              {profile.roles.isAdmin || (profile.roles.directorOf ?? []).length > 0 ? (
                <Link
                  href="/admin"
                  className="text-slate-600 hover:text-mfu-primary"
                >
                  จัดการหลักสูตร
                </Link>
              ) : null}
            </nav>
            <NotificationBell basePath="/verification" />
            <div className="text-right">
              <div className="text-sm text-slate-700">{profile.nameTh}</div>
              <div className="text-xs text-slate-400">{profile.email}</div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
