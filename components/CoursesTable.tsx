'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import {
  bulkSoftDeleteCourses,
  bulkRestoreCourses,
  bulkHardDeleteCourses,
  type BulkFailure,
  type BulkResult,
} from '@/app/admin/programs/[programId]/courses/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import { COURSE_TYPE_LABEL, SEMESTER_LABEL } from '@/lib/constants';
import type { CourseType, Semester } from '@/lib/types/models';

export interface CourseRow {
  id: string;
  code: string;
  nameTh: string;
  creditStructure: string;
  type: CourseType;
  yearOfStudy?: number | null;
  semester?: Semester | null;
  isActive: boolean;
}

interface CoursesTableProps {
  courses: CourseRow[];
  programId: string;
  /** Director sees the table but no checkboxes / bulk actions. */
  showBulkActions: boolean;
}

type ResultMessage =
  | { type: 'ok' | 'mixed' | 'err'; text: string }
  | null;

function summarize(action: string, res: BulkResult): ResultMessage {
  if (!res.ok) return { type: 'err', text: res.error };
  const { succeeded, failed } = res;
  if (failed.length === 0) {
    return { type: 'ok', text: `${action}สำเร็จ ${succeeded} รายการ` };
  }
  const failedList = failed
    .map((f) => `${f.code} — ${f.reason}`)
    .join(', ');
  return {
    type: succeeded > 0 ? 'mixed' : 'err',
    text: `${action}สำเร็จ ${succeeded} รายการ · ไม่สำเร็จ ${failed.length} รายการ (${failedList})`,
  };
}

export default function CoursesTable({
  courses,
  programId,
  showBulkActions,
}: CoursesTableProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const base = `/admin/programs/${programId}/courses`;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ResultMessage>(null);

  // Danger-zone purge state
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeAgreed, setPurgeAgreed] = useState(false);
  const [purgeKeyword, setPurgeKeyword] = useState('');
  const PURGE_KEYWORD = 'ยืนยัน';

  const selectedRows = useMemo(
    () => courses.filter((c) => selected.has(c.id)),
    [courses, selected],
  );
  const selectedActiveCount = selectedRows.filter((c) => c.isActive).length;
  const selectedInactiveCount = selectedRows.length - selectedActiveCount;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) =>
      s.size === courses.length ? new Set() : new Set(courses.map((c) => c.id)),
    );
  }

  function clearSelection() {
    setSelected(new Set());
    setPurgeOpen(false);
    setPurgeAgreed(false);
    setPurgeKeyword('');
  }

  async function runBulk(
    label: string,
    fn: () => Promise<BulkResult>,
  ): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const res = await fn();
      setResult(summarize(label, res));
      if (res.ok && res.failed.length === 0) clearSelection();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      setResult({ type: 'err', text: `${label}ล้มเหลว — ${message}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkSoftDelete() {
    const ids = selectedRows.filter((c) => c.isActive).map((c) => c.id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `ปิดใช้งานรายวิชา ${ids.length} รายการ`,
      message:
        'รายวิชาที่เลือกและรายวิชาที่เปิดสอนภายใต้รายวิชานั้นจะถูกซ่อนจากอาจารย์และผู้ทวนสอบ สามารถเปิดใช้งานใหม่ได้ภายหลัง',
      confirmLabel: 'ปิดใช้งาน',
      variant: 'danger',
    });
    if (!ok) return;
    await runBulk('ปิดใช้งาน', () => bulkSoftDeleteCourses(programId, ids));
  }

  async function handleBulkRestore() {
    const ids = selectedRows.filter((c) => !c.isActive).map((c) => c.id);
    if (ids.length === 0) return;
    await runBulk('เปิดใช้งาน', () => bulkRestoreCourses(programId, ids));
  }

  async function handleBulkHardDelete() {
    const ids = selectedRows.map((c) => c.id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `ลบรายวิชา ${ids.length} รายการ`,
      message:
        'ลบรายวิชาที่เลือกออกจากระบบอย่างถาวร — รายวิชาที่ยังมีการเปิดสอนจะถูกข้าม การกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmLabel: 'ลบรายวิชา',
      variant: 'danger',
    });
    if (!ok) return;
    await runBulk('ลบรายวิชา', () => bulkHardDeleteCourses(programId, ids));
  }

  async function handleBulkPurge() {
    if (purgeKeyword !== PURGE_KEYWORD || !purgeAgreed) return;
    const ids = selectedRows.map((c) => c.id);
    if (ids.length === 0) return;

    const ok = await confirm({
      title: `ลบทั้งหมดถาวร ${ids.length} รายวิชา`,
      message:
        'ลบรายวิชาและข้อมูลทั้งหมดอย่างถาวร รวมถึงครั้งที่เปิดสอน รายงาน AI ผลทวนสอบ และไฟล์ PDF ทั้งหมด\n\nการกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmLabel: 'ลบทั้งหมดถาวร',
      variant: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    setResult(null);
    setProgress(`กำลังลบ 0/${ids.length}…`);

    const succeeded: string[] = [];
    const failed: BulkFailure[] = [];

    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable<{ courseId: string }, { ok: boolean }>(
        getFirebaseFunctions(),
        'purgeCourse',
        { timeout: 300_000 },
      );
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const code = selectedRows.find((r) => r.id === id)?.code ?? id;
        setProgress(`กำลังลบ ${i + 1}/${ids.length} — ${code}`);
        try {
          const res = await callable({ courseId: id });
          if (res.data.ok) succeeded.push(id);
          else failed.push({ id, code, reason: 'callable returned ok=false' });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown';
          failed.push({ id, code, reason: message });
        }
      }
      setResult(
        summarize('ลบทั้งหมดถาวร', {
          ok: true,
          succeeded: succeeded.length,
          failed,
        }),
      );
      if (failed.length === 0) clearSelection();
      router.refresh();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const headerChecked =
    courses.length > 0 && selected.size === courses.length;
  const headerIndeterminate =
    selected.size > 0 && selected.size < courses.length;

  return (
    <div className="space-y-3">
      {showBulkActions && selected.size > 0 && (
        <div className="rounded-lg border border-mfu-primary/30 bg-mfu-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-700">
              {selected.size} รายวิชาที่เลือก
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {selectedActiveCount > 0 && (
                <button
                  type="button"
                  onClick={handleBulkSoftDelete}
                  disabled={busy}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  ปิดใช้งาน ({selectedActiveCount})
                </button>
              )}
              {selectedInactiveCount > 0 && (
                <button
                  type="button"
                  onClick={handleBulkRestore}
                  disabled={busy}
                  className="rounded-lg bg-mfu-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  เปิดใช้งาน ({selectedInactiveCount})
                </button>
              )}
              <button
                type="button"
                onClick={handleBulkHardDelete}
                disabled={busy}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                ลบรายวิชา
              </button>
              <button
                type="button"
                onClick={() => setPurgeOpen((v) => !v)}
                disabled={busy}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                ⚠ ลบทั้งหมดถาวร
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิกการเลือก
              </button>
            </div>
          </div>

          {purgeOpen && (
            <div className="mt-3 space-y-2.5 rounded-lg border border-red-200 bg-red-50/60 p-3">
              <p className="text-[11px] leading-snug text-red-700">
                การกระทำนี้จะลบรายวิชาที่เลือกทั้งหมด รวมถึงครั้งที่เปิดสอน
                รายงาน AI ผลทวนสอบ และไฟล์ PDF ใน Storage{' '}
                <strong>ไม่สามารถย้อนกลับได้</strong>
              </p>
              <label className="flex items-start gap-2 text-[11px] leading-snug text-red-700">
                <input
                  type="checkbox"
                  checked={purgeAgreed}
                  onChange={(e) => setPurgeAgreed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  ฉันเข้าใจว่าการกระทำนี้ไม่สามารถย้อนกลับได้ และจะลบประวัติ
                  ทวนสอบของรายวิชาที่เลือกทั้งหมด
                </span>
              </label>
              <label className="block text-[11px] leading-snug text-red-700">
                พิมพ์ <strong>{PURGE_KEYWORD}</strong> เพื่อยืนยัน:
                <input
                  type="text"
                  value={purgeKeyword}
                  onChange={(e) => setPurgeKeyword(e.target.value)}
                  placeholder={PURGE_KEYWORD}
                  className="mt-1 w-full max-w-xs rounded border border-red-300 px-2 py-1 text-xs text-slate-800 focus:border-red-500 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={handleBulkPurge}
                disabled={
                  busy || !purgeAgreed || purgeKeyword !== PURGE_KEYWORD
                }
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                ลบทั้งหมดถาวร ({selected.size})
              </button>
            </div>
          )}
        </div>
      )}

      {progress && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {progress}
        </p>
      )}
      {result && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            result.type === 'ok'
              ? 'border-green-200 bg-green-50 text-green-700'
              : result.type === 'mixed'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {result.text}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              {showBulkActions && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    checked={headerChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = headerIndeterminate;
                    }}
                    onChange={toggleAll}
                  />
                </th>
              )}
              <th className="px-4 py-3 font-medium">รหัสวิชา</th>
              <th className="px-4 py-3 font-medium">ชื่อวิชา</th>
              <th className="px-4 py-3 font-medium">หน่วยกิต</th>
              <th className="px-4 py-3 font-medium">ประเภท</th>
              <th className="px-4 py-3 font-medium">ชั้นปี</th>
              <th className="px-4 py-3 font-medium">ภาค</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((c) => {
              const isSelected = selected.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={`hover:bg-slate-50 ${isSelected ? 'bg-mfu-primary/5' : ''}`}
                >
                  {showBulkActions && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`เลือก ${c.code}`}
                        checked={isSelected}
                        onChange={() => toggle(c.id)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link
                      href={`${base}/${c.id}`}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      {c.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.nameTh}</td>
                  <td className="px-4 py-3 text-slate-600">{c.creditStructure}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {COURSE_TYPE_LABEL[c.type]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.yearOfStudy ? `ปี ${c.yearOfStudy}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.semester ? SEMESTER_LABEL[c.semester] : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.isActive ? (
                      <span className="text-green-700">เปิดใช้งาน</span>
                    ) : (
                      <span className="text-slate-400">ปิดใช้งาน</span>
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
