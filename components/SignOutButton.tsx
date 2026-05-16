'use client';

import { getFirebaseAuth } from '@/lib/firebase/config';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await signOut(getFirebaseAuth());
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/login');
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50"
    >
      {loading ? 'กำลังออก…' : 'ออกจากระบบ'}
    </button>
  );
}
