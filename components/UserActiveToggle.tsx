'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUserActive } from '@/app/admin/users/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

export default function UserActiveToggle({
  userId,
  isSelf,
  initialActive,
  locked = false,
}: {
  userId: string;
  isSelf: boolean;
  initialActive: boolean;
  /** True when the target is an admin and the viewer is not a super admin. */
  locked?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: boolean) {
    if (!next) {
      const ok = await confirm({
        title: 'ปิดใช้งานบัญชี',
        message: 'ผู้ใช้จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง',
        confirmLabel: 'ปิดใช้งานบัญชี',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    const res = await setUserActive(userId, next);
    setBusy(false);
    if (res.ok) {
      setActive(next);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">สถานะบัญชี</h2>
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="text-sm">
          {active ? (
            <span className="text-green-700">บัญชีนี้เปิดใช้งานอยู่</span>
          ) : (
            <span className="text-red-600">บัญชีนี้ถูกปิดใช้งาน — ผู้ใช้เข้าสู่ระบบไม่ได้</span>
          )}
        </p>
        {isSelf ? (
          <span className="text-xs text-amber-600">
            ไม่สามารถปิดใช้งานบัญชีของตนเองได้
          </span>
        ) : locked ? (
          <span className="text-xs text-slate-500">
            เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่จัดการบัญชีผู้ดูแลระบบได้
          </span>
        ) : (
          <button
            onClick={() => apply(!active)}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              active
                ? 'border border-red-300 text-red-600 hover:bg-red-50'
                : 'bg-mfu-primary text-white hover:opacity-90'
            }`}
          >
            {busy ? 'กำลังบันทึก…' : active ? 'ปิดใช้งานบัญชี' : 'เปิดใช้งานบัญชี'}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
