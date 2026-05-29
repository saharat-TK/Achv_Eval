import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import SignOutButton from '@/components/SignOutButton';
import NotificationBell from '@/components/NotificationBell';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import AppFooter from '@/components/AppFooter';

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

  const canSeeAdminLink =
    profile.roles.isAdmin || (profile.roles.directorOf ?? []).length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <header className="bg-mfu-primary">
          <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
            <Link href="/verification" className="flex flex-col">
              <span className="text-sm font-semibold text-white">
                ระบบประเมินและทวนสอบรายวิชา
              </span>
              <span className="text-xs text-white/70">
                พื้นที่ทำงานคณะกรรมการรับรองผล
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <WorkspaceSwitcher current="verification" roles={profile.roles} />
              <NotificationBell basePath="/verification" tone="dark" />
              <div className="text-right">
                <div className="text-sm text-white">{profile.nameTh}</div>
                <div className="text-xs text-white/70">{profile.email}</div>
              </div>
              <SignOutButton tone="dark" />
            </div>
          </div>
        </header>

        <nav className="border-b border-slate-200">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex gap-6 text-sm">
              <Link
                href="/verification"
                className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
              >
                รายการรอรับรอง
              </Link>
              {canSeeAdminLink && (
                <Link
                  href="/admin"
                  className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
                >
                  จัดการหลักสูตร
                </Link>
              )}
            </div>
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8 flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}
