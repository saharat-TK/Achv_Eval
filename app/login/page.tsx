'use client';

import { createBrowserClient } from '@/lib/supabase/client';
import { useState } from 'react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          // Hint to Google's consent screen: filter to MFU domain.
          // Supabase's domain-restrict happens on the callback handler.
          hd: 'mfu.ac.th',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) {
      setError(error.message);
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

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}

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
