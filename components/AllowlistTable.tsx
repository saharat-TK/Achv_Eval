'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removeFromAllowlist } from '@/app/admin/users/allowlist/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

export interface AllowlistRow {
  id: string;
  email: string;
  nameTh: string;
  nameEn: string;
  notes?: string;
  /** ISO string when serialized server-side, or null. */
  consumedAt: string | null;
  consumedUid: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AllowlistTable({ rows }: { rows: AllowlistRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(row: AllowlistRow) {
    setError(null);
    const ok = await confirm({
      title: 'ลบรายชื่อจากทะเบียน',
      message: `ลบ ${row.email} ออกจากทะเบียนรายชื่อ`,
      confirmLabel: 'ลบ',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(row.id);
    const res = await removeFromAllowlist(row.id);
    setBusy(null);
    if (res.ok) {
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
        ยังไม่มีรายชื่อในทะเบียน
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">อีเมล</th>
              <th className="px-4 py-3 font-medium">ชื่อ (ไทย)</th>
              <th className="px-4 py-3 font-medium">ชื่อ (อังกฤษ)</th>
              <th className="px-4 py-3 font-medium">หมายเหตุ</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="w-20 px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const consumed = !!r.consumedAt;
              return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50 ${consumed ? 'bg-slate-50/40' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {r.email}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.nameTh}</td>
                  <td className="px-4 py-3 text-slate-600">{r.nameEn}</td>
                  <td className="px-4 py-3 text-slate-500">{r.notes || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {consumed ? (
                      <span title={formatDate(r.consumedAt)}>
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 font-semibold text-green-800">
                          ลงทะเบียนแล้ว
                        </span>
                        <span className="ml-2 text-slate-500">
                          {formatDate(r.consumedAt)}
                        </span>
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800">
                        รอลงทะเบียน
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!consumed && (
                      <button
                        type="button"
                        onClick={() => handleRemove(r)}
                        disabled={busy === r.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        ลบ
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
