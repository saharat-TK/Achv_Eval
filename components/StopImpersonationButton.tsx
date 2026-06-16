'use client';

import { useState } from 'react';
import { stopImpersonation } from '@/app/impersonation/actions';

export default function StopImpersonationButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        await stopImpersonation();
        window.location.href = '/';
      }}
      disabled={busy}
      className="shrink-0 rounded-md bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30 disabled:opacity-50"
    >
      {busy ? 'กำลังออก…' : 'ออกจากมุมมอง'}
    </button>
  );
}
