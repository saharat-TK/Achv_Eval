import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import SignOutButton from '@/components/SignOutButton';
import NotificationBell from '@/components/NotificationBell';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';

export default async function AssessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Must be an assessor of at least one program, or an admin viewing
  // read-only. The sign-off route still gates strictly on assessorOf.
  const hasAssessor = (profile.roles.assessorOf ?? []).length > 0;
  if (!profile.roles.isAdmin && !hasAssessor) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <header className="bg-mfu-primary">
          <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
            <Link href="/assessor" className="flex flex-col">
              <span className="text-sm font-semibold text-white">
                ระบบประเมินและทวนสอบรายวิชา
              </span>
              <span className="text-xs text-white/70">
                พื้นที่ทำงานผู้ทวนสอบ
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <WorkspaceSwitcher current="assessor" roles={profile.roles} />
              <NotificationBell basePath="/assessor" tone="dark" />
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
                href="/assessor"
                className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
              >
                รายการทวนสอบ
              </Link>
              <Link
                href="/assessor/verification"
                className="border-b-2 border-transparent py-3 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary"
              >
                การนำไปปฏิบัติ
              </Link>
            </div>
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
