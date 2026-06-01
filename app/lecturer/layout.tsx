import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import SignOutButton from '@/components/SignOutButton';
import NotificationBell from '@/components/NotificationBell';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import AppFooter from '@/components/AppFooter';

export default async function LecturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-mfu-primary shadow-sm">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <Link href="/lecturer" className="flex flex-col">
            <span className="text-sm font-semibold text-white">
              ระบบประเมินและทวนสอบรายวิชา
            </span>
            <span className="text-xs text-white/70">
              พื้นที่ทำงานอาจารย์ผู้รับผิดชอบรายวิชา
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <WorkspaceSwitcher current="lecturer" roles={profile.roles} />
            <NotificationBell basePath="/lecturer" tone="dark" />
            <div className="text-right">
              <div className="text-sm text-white">{profile.nameTh}</div>
              <div className="text-xs text-white/70">{profile.email}</div>
            </div>
            <SignOutButton tone="dark" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8 flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}
