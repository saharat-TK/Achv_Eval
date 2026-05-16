'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase/config';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // TODO Phase 1/2/3: route to the user's role-appropriate dashboard.
  // For now, show a minimal landing.
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-semibold text-mfu-primary">
          ระบบประเมินและทวนสอบรายวิชา
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Course Evaluation &amp; Monitoring System — School of Health Science, MFU
        </p>
        <div className="mt-6 p-4 bg-slate-50 rounded-lg text-sm">
          <div className="font-medium text-slate-700">เข้าสู่ระบบสำเร็จ</div>
          <div className="mt-1 text-slate-500">{user?.email}</div>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          Phase 0 scaffold. Lecturer / Assessor / Admin workspaces will appear here
          as Phases 1–3 land.
        </p>
      </div>
    </main>
  );
}
