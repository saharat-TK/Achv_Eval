'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  removeFromAllowlist,
  updateAllowlistPresets,
} from '@/app/admin/users/allowlist/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

type SortKey = 'email' | 'nameTh' | 'notes' | 'status';
type SortDir = 'asc' | 'desc';

export interface AllowlistRow {
  id: string;
  email: string;
  nameTh: string;
  nameEn: string;
  notes?: string;
  presetIsLecturer: boolean;
  presetIsDirector: boolean;
  presetDirectorProgramId: string | null;
  presetDirectorProgramName: string | null;
  /** ISO string when serialized server-side, or null. */
  consumedAt: string | null;
  consumedUid: string | null;
}

export interface AllowlistProgramOption {
  id: string;
  code: string;
  nameTh: string;
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

export default function AllowlistTable({
  rows,
  programs,
}: {
  rows: AllowlistRow[];
  programs: AllowlistProgramOption[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Server delivers rows in addedAt desc; clicking a header overrides.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      // third click clears — back to the server's default order
      setSortKey(null);
      setSortDir('asc');
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    const compare = (a: AllowlistRow, b: AllowlistRow): number => {
      if (sortKey === 'status') {
        const av = a.consumedAt ?? '';
        const bv = b.consumedAt ?? '';
        return av.localeCompare(bv) * dir;
      }
      const pick = (row: AllowlistRow): string => {
        if (sortKey === 'email') return row.email ?? '';
        if (sortKey === 'nameTh') return row.nameTh ?? '';
        if (sortKey === 'notes') return row.notes ?? '';
        return '';
      };
      return pick(a).localeCompare(pick(b), 'th') * dir;
    };
    return [...rows].sort(compare);
  }, [rows, sortKey, sortDir]);

  function SortIndicator({ col }: { col: SortKey }) {
    if (sortKey !== col) {
      return <span className="ml-1 text-slate-300">↕</span>;
    }
    return (
      <span className="ml-1 text-mfu-primary">
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  }

  function HeaderButton({
    col,
    label,
    center = false,
  }: {
    col: SortKey;
    label: string;
    center?: boolean;
  }) {
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`flex items-center font-medium text-slate-500 hover:text-slate-800 ${
          center ? 'mx-auto justify-center' : 'text-left'
        }`}
      >
        {label}
        <SortIndicator col={col} />
      </button>
    );
  }

  async function toggleLecturer(row: AllowlistRow) {
    setError(null);
    setBusy(row.id);
    const res = await updateAllowlistPresets(row.id, {
      presetIsLecturer: !row.presetIsLecturer,
      presetIsDirector: row.presetIsDirector,
      presetDirectorProgramId: row.presetDirectorProgramId,
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function changeDirector(row: AllowlistRow, programId: string) {
    setError(null);
    setBusy(row.id);
    const res = await updateAllowlistPresets(row.id, {
      presetIsLecturer: row.presetIsLecturer,
      presetIsDirector: programId !== '',
      presetDirectorProgramId: programId || null,
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

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
    if (res.ok) router.refresh();
    else setError(res.error);
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
          <thead className="bg-slate-50 text-left text-xs">
            <tr>
              <th className="px-3 py-3">
                <HeaderButton col="email" label="อีเมล" />
              </th>
              <th className="px-3 py-3">
                <HeaderButton col="nameTh" label="ชื่อ (ไทย)" />
              </th>
              <th className="whitespace-nowrap px-3 py-3">
                <HeaderButton col="notes" label="หมายเหตุ" />
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-center">
                <HeaderButton col="status" label="สถานะ" center />
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-center font-medium text-slate-500">
                อาจารย์ผู้รับผิดชอบ
              </th>
              <th className="px-3 py-3 font-medium text-slate-500">
                ประธานหลักสูตร
              </th>
              <th className="w-12 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((r) => {
              const consumed = !!r.consumedAt;
              return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50 ${consumed ? 'bg-slate-50/40' : ''}`}
                >
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">
                    {r.email}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{r.nameTh}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                    {r.notes || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center text-xs">
                    {consumed ? (
                      <span
                        className="rounded-full bg-green-100 px-2.5 py-0.5 font-semibold text-green-800"
                        title={formatDate(r.consumedAt)}
                      >
                        ลงทะเบียนแล้ว
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800">
                        รอลงทะเบียน
                      </span>
                    )}
                  </td>
                  {/* Lecturer — interactive toggle for pending rows, centered */}
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={r.presetIsLecturer}
                      disabled={consumed || busy === r.id}
                      onChange={() => toggleLecturer(r)}
                      aria-label={`อาจารย์ผู้รับผิดชอบ ${r.email}`}
                    />
                  </td>
                  {/* Director — live program dropdown for pending rows */}
                  <td className="px-3 py-3">
                    {consumed ? (
                      <span className="text-xs text-slate-500">
                        {r.presetDirectorProgramName ?? '—'}
                      </span>
                    ) : (
                      <select
                        value={r.presetDirectorProgramId ?? ''}
                        disabled={busy === r.id}
                        onChange={(e) => changeDirector(r, e.target.value)}
                        aria-label={`ประธานหลักสูตร ${r.email}`}
                        className="w-full max-w-[220px] rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-mfu-primary focus:outline-none disabled:opacity-50"
                      >
                        <option value="">— ไม่เป็นประธาน —</option>
                        {programs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.nameTh}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
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
