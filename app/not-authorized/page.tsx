'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/config';

export default function NotAuthorizedPage() {
  // Sign the user out of Firebase Auth on mount so they aren't stuck
  // in a loop where Google keeps reauthenticating them and the session
  // route keeps rejecting. They still need to be on the allowlist to
  // get in.
  useEffect(() => {
    signOut(getFirebaseAuth()).catch(() => undefined);
  }, []);

  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-800">
              ไม่สามารถเข้าใช้งานระบบได้
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              ระบบนี้สงวนสิทธิ์เฉพาะบุคลากรที่ได้รับการลงทะเบียนล่วงหน้า
              เท่านั้น บัญชีของท่านยังไม่ได้รับสิทธิ์ในการเข้าใช้งาน
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              หากท่านควรมีสิทธิ์เข้าใช้งานระบบนี้ กรุณาติดต่อผู้ดูแลระบบเพื่อ
              ลงทะเบียนรายชื่อของท่าน
            </p>

            {contactEmail && (
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">ติดต่อผู้ดูแลระบบ: </span>
                <a
                  href={`mailto:${contactEmail}`}
                  className="font-medium text-mfu-primary hover:underline"
                >
                  {contactEmail}
                </a>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
