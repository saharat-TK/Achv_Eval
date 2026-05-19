import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import SignOutButton from '@/components/SignOutButton';
import NotificationBell from '@/components/NotificationBell';

export default async function LecturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <Link href="/lecturer" className="flex flex-col">
            <span className="text-sm font-semibold text-mfu-primary">
              ระบบประเมินและทวนสอบรายวิชา
            </span>
            <span className="text-xs text-slate-500">
              พื้นที่ทำงานอาจารย์ผู้รับผิดชอบรายวิชา
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <NotificationBell basePath="/lecturer" />
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
