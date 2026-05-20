import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  AUDIT_LOG_ENTITY_TYPES,
  getAuditLogPage,
} from '@/lib/data/auditLog';

export const dynamic = 'force-dynamic';

function readValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(value: unknown): string {
  if (
    value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
  return '—';
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: {
    entityType?: string | string[];
    cursor?: string | string[];
  };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const entityTypeRaw = readValue(searchParams.entityType);
  const entityType = (
    AUDIT_LOG_ENTITY_TYPES as readonly string[]
  ).includes(entityTypeRaw ?? '')
    ? entityTypeRaw
    : undefined;
  const cursorRaw = Number(readValue(searchParams.cursor));
  const cursor = Number.isFinite(cursorRaw) && cursorRaw > 0 ? cursorRaw : undefined;

  const { entries, nextCursor } = await getAuditLogPage({ entityType, cursor });

  const nextHref =
    nextCursor !== null
      ? `/admin/audit-log?${new URLSearchParams({
          ...(entityType ? { entityType } : {}),
          cursor: String(nextCursor),
        }).toString()}`
      : null;

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">บันทึกการทำงาน</h1>
        <p className="mt-1 text-sm text-slate-500">
          Audit log — ทุกการเปลี่ยนแปลงที่ระบบบันทึกไว้ เรียงจากใหม่ไปเก่า
        </p>
      </div>

      <form
        action="/admin/audit-log"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <label className="text-sm">
          <span className="text-xs font-medium text-slate-500">ประเภท</span>
          <select
            name="entityType"
            defaultValue={entityType ?? ''}
            className="mt-1 block w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">ทั้งหมด</option>
            {AUDIT_LOG_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          กรอง
        </button>
        <Link
          href="/admin/audit-log"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ล้าง
        </Link>
      </form>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        {entries.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">เวลา</th>
                  <th className="px-3 py-2 font-medium">ผู้กระทำ</th>
                  <th className="px-3 py-2 font-medium">การกระทำ</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium">รหัสเอกสาร</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {formatTime(entry.occurredAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {entry.actorEmail ?? entry.actorId ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {entry.action}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {entry.entityType}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">
                      {entry.entityId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {nextHref && (
        <div className="mt-4 text-right">
          <Link
            href={nextHref}
            className="text-sm font-medium text-mfu-primary hover:underline"
          >
            ดูเก่ากว่า →
          </Link>
        </div>
      )}
    </div>
  );
}
