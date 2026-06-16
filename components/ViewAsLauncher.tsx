'use client';

import { useEffect, useState } from 'react';
import {
  listImpersonationTargets,
  startImpersonation,
  type ImpersonationTarget,
} from '@/app/impersonation/actions';

/** Super-admin "view as user" launcher for the top bar. Lazy-loads the roster
 *  on open so non-super-admin page loads pay nothing. */
export default function ViewAsLauncher() {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ImpersonationTarget[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && targets === null) {
      listImpersonationTargets()
        .then(setTargets)
        .catch(() => setTargets([]));
    }
  }, [open, targets]);

  const query = q.trim().toLowerCase();
  const filtered = (targets ?? []).filter(
    (t) =>
      !query ||
      t.nameTh.toLowerCase().includes(query) ||
      t.email.toLowerCase().includes(query),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-white/80 hover:text-white"
      >
        ดูในมุมมองผู้ใช้
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-4">
              <h3 className="text-base font-semibold text-slate-800">ดูในมุมมองผู้ใช้</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                เลือกผู้ใช้เพื่อดูระบบในมุมมองของเขา (อ่านอย่างเดียว)
              </p>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อหรืออีเมล"
                autoFocus
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {targets === null ? (
                <p className="p-4 text-sm text-slate-400">กำลังโหลด…</p>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">ไม่พบผู้ใช้</p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.uid}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const res = await startImpersonation(t.uid);
                      if ('error' in res) {
                        setBusy(false);
                        return;
                      }
                      window.location.href = '/';
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                  >
                    <div className="text-sm font-medium text-slate-800">{t.nameTh}</div>
                    <div className="text-xs text-slate-500">
                      {t.email} · {t.summary}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 p-3 text-right">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
