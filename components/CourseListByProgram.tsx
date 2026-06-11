'use client';

import { Fragment, useMemo, useState } from 'react';
import { SEMESTER_LABEL, OFFERING_STATUS, BAND_LABEL, BAND_BADGE } from '@/lib/constants';
import {
  bandFromPercent,
  type ReportCourseRow,
  type Semester,
} from '@/lib/types/models';

/** Grouped, filterable course listing for the all-programs report (Section under §3.2). */
export default function CourseListByProgram({ rows }: { rows: ReportCourseRow[] }) {
  const programs = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.academicProgramId)
        m.set(r.academicProgramId, `${r.academicProgramCode ?? ''} ${r.academicProgramName ?? ''}`.trim());
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'));
  }, [rows]);

  const [filter, setFilter] = useState('all');

  const groups = useMemo(() => {
    const byProgram = new Map<string, ReportCourseRow[]>();
    for (const r of rows) {
      const key = r.academicProgramId ?? '_none';
      if (filter !== 'all' && key !== filter) continue;
      if (!byProgram.has(key)) byProgram.set(key, []);
      byProgram.get(key)!.push(r);
    }
    return [...byProgram.entries()]
      .map(([key, list]) => ({
        key,
        label:
          list[0]?.academicProgramCode || list[0]?.academicProgramName
            ? `${list[0]?.academicProgramCode ?? ''} ${list[0]?.academicProgramName ?? ''}`.trim()
            : 'ไม่ระบุหลักสูตร',
        rows: list.sort(
          (a, b) =>
            Number(a.semester) - Number(b.semester) || a.courseCode.localeCompare(b.courseCode),
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  }, [rows, filter]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800">
          รายวิชาทั้งหมด (จำแนกตามหลักสูตร)
        </h2>
        <label className="text-xs text-slate-600">
          หลักสูตร{' '}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-mfu-primary focus:outline-none"
          >
            <option value="all">ทั้งหมด</option>
            {programs.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Single table so columns stay consistent across every program group.
          Course-name column flexes (w-full); the rest fit their content. */}
      <table className="mt-3 w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="w-full py-1 pr-3 font-medium">รหัส/ชื่อรายวิชา</th>
            <th className="whitespace-nowrap py-1 pr-3 font-medium">ภาค/ปี</th>
            <th className="whitespace-nowrap py-1 pr-3 font-medium">คะแนน</th>
            <th className="whitespace-nowrap py-1 pr-3 font-medium">ระดับ</th>
            <th className="whitespace-nowrap py-1 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr>
                <td
                  colSpan={5}
                  className="border-t border-slate-200 pt-3 pb-1 text-sm font-semibold text-slate-700"
                >
                  {g.label}
                </td>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.offeringId} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-700">
                    {r.courseCode} {r.courseNameEn}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">
                    {SEMESTER_LABEL[r.semester as Semester]}
                    {r.academicYear ? ` / ${r.academicYear}` : ''}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">
                    {r.percentScore != null ? `${r.percentScore}%` : '—'}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    {r.percentScore != null ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          BAND_BADGE[r.band ?? bandFromPercent(r.percentScore)]
                        }`}
                      >
                        {BAND_LABEL[r.band ?? bandFromPercent(r.percentScore)]}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-slate-600">
                    {OFFERING_STATUS[r.status as keyof typeof OFFERING_STATUS]?.labelTh ??
                      r.status ??
                      '—'}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
