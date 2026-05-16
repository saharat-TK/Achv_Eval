'use client';

import { useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/config';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const auth = getFirebaseAuth();
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: 'mfu.ac.th', prompt: 'consent' });
      const result = await signInWithPopup(auth, provider);

      // Client-side domain check (fast feedback). The server re-verifies
      // it in /api/auth/session before issuing the session cookie.
      if (!result.user.email?.endsWith('@mfu.ac.th')) {
        await signOut(auth);
        throw new Error('domain_not_allowed');
      }

      // Exchange the Firebase ID token for an httpOnly session cookie so the
      // server (middleware + route handlers) can authorize requests.
      const idToken = await result.user.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        await signOut(auth);
        const { error: serverError } = await res.json().catch(() => ({ error: 'session_failed' }));
        throw new Error(serverError ?? 'session_failed');
      }

      router.push('/');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'unknown';
      if (message === 'domain_not_allowed') {
        setError('เฉพาะบัญชีอีเมล @mfu.ac.th เท่านั้น');
      } else if (message === 'session_failed') {
        setError('สร้างเซสชันไม่สำเร็จ กรุณาลองใหม่');
      } else {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      }
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-xl font-semibold text-mfu-primary">
          ระบบประเมินและทวนสอบรายวิชา
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          สำนักวิชาวิทยาศาสตร์สุขภาพ มฟล.
        </p>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-8 w-full flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
        >
          <GoogleIcon />
          {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วยบัญชี @mfu.ac.th'}
        </button>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <p className="mt-8 text-xs text-slate-400">
          เฉพาะบัญชีอีเมล @mfu.ac.th เท่านั้น
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
