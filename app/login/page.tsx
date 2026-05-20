'use client';

import { useState } from 'react';
import Image from 'next/image';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebase/config';
import ConfettiBackground from '@/components/ConfettiBackground';

const FEATURES = [
  {
    title: 'วิเคราะห์ มคอ.3 ด้วย AI',
    body: 'Gemini วิเคราะห์เอกสาร มคอ.3 ตามแนวทาง AUN-QA ระบุจุดเด่น ช่องว่าง และร่างฉบับปรับปรุง',
    icon: 'sparkle' as const,
  },
  {
    title: 'ทวนสอบ 7 หัวข้อมาตรฐาน',
    body: 'แบบประเมินทางการ 7 หัวข้อ พร้อมการลงนามรับรองจากผู้ทวนสอบและคณะกรรมการ',
    icon: 'check' as const,
  },
  {
    title: 'แดชบอร์ดและรายงาน AUN-QA',
    body: 'ภาพรวมคุณภาพข้ามภาคการศึกษา จุดอ่อนที่พบซ้ำ ส่งออก CSV และพิมพ์เป็น PDF',
    icon: 'chart' as const,
  },
];

const STEPS = [
  { n: 1, label: 'อัปโหลด มคอ.3', body: 'อาจารย์ส่งเอกสารและข้อมูลรายวิชา' },
  { n: 2, label: 'AI วิเคราะห์', body: 'Gemini ตรวจตามเกณฑ์ AUN-QA' },
  { n: 3, label: 'ทวนสอบ 7 หัวข้อ', body: 'ผู้ทวนสอบประเมินและลงนาม' },
  { n: 4, label: 'รับรองผล', body: 'คณะกรรมการรับรองและออกรายงาน' },
];

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

      if (!result.user.email?.endsWith('@mfu.ac.th')) {
        await signOut(auth);
        throw new Error('domain_not_allowed');
      }

      const idToken = await result.user.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        await signOut(auth);
        const { error: serverError } = await res
          .json()
          .catch(() => ({ error: 'session_failed' }));
        throw new Error(serverError ?? 'session_failed');
      }

      router.push('/');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'unknown';
      if (message === 'domain_not_allowed') {
        setError('เฉพาะบัญชีอีเมล @mfu.ac.th เท่านั้น');
      } else if (message === 'account_deactivated') {
        setError('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      } else if (message === 'session_failed') {
        setError('สร้างเซสชันไม่สำเร็จ กรุณาลองใหม่');
      } else {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      }
      setLoading(false);
    }
  }

  return (
    <div className="bg-white text-slate-900">
      {/* Hero with animated confetti */}
      <section className="relative min-h-screen overflow-hidden">
        <ConfettiBackground />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">
          <div className="flex items-center gap-4">
            <Image
              src="/logoSHS.png"
              alt=""
              width={56}
              height={56}
              priority
            />
            <span className="text-xl font-semibold text-slate-800 md:text-2xl">
              School of Health Science · MFU
            </span>
          </div>

          <h1 className="mt-10 max-w-4xl text-center text-5xl font-bold leading-[1.05] tracking-tight text-slate-900 md:text-6xl lg:text-7xl">
            ระบบประเมินและทวนสอบ
            <br />
            รายวิชา
          </h1>
          <p className="mt-5 text-center text-lg text-slate-500 md:text-xl">
            Course Evaluation &amp; Verification System
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="flex items-center gap-2.5 rounded-full bg-mfu-accent px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
            >
              <GoogleIcon />
              {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย @mfu.ac.th'}
            </button>
            <a
              href="#features"
              className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ดูฟีเจอร์ของระบบ
            </a>
          </div>

          {error && (
            <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
          )}
          <p className="mt-3 text-xs text-slate-400">
            เฉพาะบัญชีอีเมล @mfu.ac.th เท่านั้น
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative bg-white px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-mfu-primary">
            ความสามารถของระบบ
          </p>
          <h2 className="mt-2 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            สิ่งที่ระบบช่วยคุณทำได้
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-mfu-primary/10 text-mfu-primary">
                  <FeatureIcon type={feature.icon} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative bg-[#f1f6f3] px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-mfu-primary">
            ขั้นตอนการใช้งาน
          </p>
          <h2 className="mt-2 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            การทำงานของระบบ
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mfu-accent text-lg font-semibold text-white shadow-sm">
                  {step.n}
                </div>
                <p className="mt-4 text-base font-semibold text-slate-800">
                  {step.label}
                </p>
                <p className="mt-1 text-sm text-slate-500">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 text-sm text-slate-500 md:flex-row">
          <p>สำนักวิชาวิทยาศาสตร์สุขภาพ มหาวิทยาลัยแม่ฟ้าหลวง</p>
          <p>© 2026 School of Health Science, Mae Fah Luang University</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureIcon({ type }: { type: 'sparkle' | 'check' | 'chart' }) {
  if (type === 'sparkle') {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l2.5 6 6.5 2.5-6.5 2.5L12 21l-2.5-7L3 11.5 9.5 9z" />
        <path d="M19 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </svg>
    );
  }
  if (type === 'check') {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="7" rx="0.5" />
      <rect x="12" y="7" width="3" height="11" rx="0.5" />
      <rect x="17" y="14" width="3" height="4" rx="0.5" />
    </svg>
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
