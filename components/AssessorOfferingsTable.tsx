'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase/config';
import { ASSESSOR_OFFERING_STATUSES, SEMESTER_LABEL } from '@/lib/constants';
import type { OfferingStatus, Semester } from '@/lib/types/models';
import StatusBadge from './StatusBadge';

interface Offering {
  id: string;
  programId: string;
  courseCode: string;
  courseNameTh: string;
  courseNameEn: string;
  academicYear: number;
  semester: Semester;
  section: string;
  status: OfferingStatus;
  lecturerEmail: string | null;
}

interface ProgramMeta {
  code: string;
  nameTh: string;
  departmentId: string | null;
  departmentNameTh: string | null;
}

interface DepartmentGroup {
  departmentId: string;
  departmentNameTh: string;
  offerings: Offering[];
}

interface SemesterGroup {
  sem: Semester;
  departments: DepartmentGroup[];
}

interface YearGroup {
  year: number;
  count: number;
  semesters: SemesterGroup[];
}

const UNKNOWN_DEPARTMENT_ID = '__unknown_department__';
const UNKNOWN_DEPARTMENT_NAME = 'ไม่ระบุสาขาวิชา';

const YEAR_SECTION_CLASS =
  'rounded-xl border border-[#00704A]/20 border-l-4 border-l-[#00704A] bg-[#00704A]/[0.04]';
const YEAR_TEXT_CLASS = 'text-[#00704A]';
const INNER_CARD_CLASS = 'rounded-lg border border-slate-200 bg-white';
const TABLE_WRAPPER_CLASS =
  'overflow-x-auto rounded-b-lg border-t border-slate-100';
const OFFERING_TABLE_CLASS = 'min-w-[760px] w-full table-fixed text-xs';
const TABLE_HEADER_ROW_CLASS =
  'bg-slate-50 text-left text-[11px] font-medium text-slate-500';
const TABLE_HEAD_CELL_CLASS = 'px-3 py-2';
const TABLE_CELL_CLASS = 'px-3 py-1.5 align-middle';

/**
 * Live grouped list of offerings an assessor can review. The list mirrors
 * the lecturer workspace grouping: academic year desc, semester desc, then
 * department. It subscribes per program to avoid Firestore's compound `in`
 * query limits when an assessor/admin can see many curricula.
 */
export default function AssessorOfferingsTable({
  programIds,
  programMetaById,
}: {
  programIds: string[];
  programMetaById: Record<string, ProgramMeta>;
}) {
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const initialisedRef = useRef(false);

  const queryProgramIds = useMemo(
    () => [...new Set(programIds.filter(Boolean))],
    [programIds],
  );

  useEffect(() => {
    if (queryProgramIds.length === 0) {
      setOfferings([]);
      return;
    }

    setOfferings(null);
    const unsubs: Array<() => void> = [];
    const byProgram = new Map<string, Offering[]>();
    const loaded = new Set<string>();
    let cancelled = false;

    (async () => {
      await getFirebaseAuth().authStateReady();
      if (cancelled) return;

      for (const programId of queryProgramIds) {
        const q = query(
          collection(getFirebaseDb(), 'offerings'),
          where('programId', '==', programId),
          where('status', 'in', ASSESSOR_OFFERING_STATUSES),
        );

        unsubs.push(
          onSnapshot(
            q,
            (snap) => {
              byProgram.set(
                programId,
                snap.docs
                  .map((d) => ({
                    id: d.id,
                    ...(d.data() as Omit<Offering, 'id'>),
                  }))
                  .filter((o) => (o as { isActive?: boolean }).isActive !== false),
              );
              loaded.add(programId);
              if (loaded.size === queryProgramIds.length) {
                setOfferings([...byProgram.values()].flat());
              }
            },
            (err) => {
              console.error('assessor offerings listener error', err);
              byProgram.set(programId, []);
              loaded.add(programId);
              if (loaded.size === queryProgramIds.length) {
                setOfferings([...byProgram.values()].flat());
              }
            },
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [queryProgramIds]);

  const groups = useMemo<YearGroup[]>(() => {
    if (!offerings) return [];
    const byYear = new Map<number, Map<Semester, Map<string, Offering[]>>>();

    for (const offering of offerings) {
      const meta = programMetaById[offering.programId];
      const deptId = meta?.departmentId ?? UNKNOWN_DEPARTMENT_ID;
      if (!byYear.has(offering.academicYear)) {
        byYear.set(offering.academicYear, new Map());
      }
      const semMap = byYear.get(offering.academicYear)!;
      if (!semMap.has(offering.semester)) semMap.set(offering.semester, new Map());
      const deptMap = semMap.get(offering.semester)!;
      if (!deptMap.has(deptId)) deptMap.set(deptId, []);
      deptMap.get(deptId)!.push(offering);
    }

    return [...byYear.keys()]
      .sort((a, b) => b - a)
      .map((year) => {
        const semMap = byYear.get(year)!;
        const semesters: SemesterGroup[] = [...semMap.keys()]
          .sort((a, b) => Number(b) - Number(a))
          .map((sem) => {
            const deptMap = semMap.get(sem)!;
            const departments: DepartmentGroup[] = [...deptMap.entries()]
              .map(([departmentId, deptOfferings]) => {
                const firstMeta = deptOfferings
                  .map((offering) => programMetaById[offering.programId])
                  .find((meta) => meta?.departmentId === departmentId);
                return {
                  departmentId,
                  departmentNameTh:
                    firstMeta?.departmentNameTh ?? UNKNOWN_DEPARTMENT_NAME,
                  offerings: deptOfferings.sort(
                    (a, b) =>
                      a.courseCode.localeCompare(b.courseCode) ||
                      a.section.localeCompare(b.section),
                  ),
                };
              })
              .sort((a, b) => {
                if (a.departmentId === UNKNOWN_DEPARTMENT_ID) return 1;
                if (b.departmentId === UNKNOWN_DEPARTMENT_ID) return -1;
                return a.departmentNameTh.localeCompare(b.departmentNameTh, 'th');
              });
            return { sem, departments };
          });
        const count = semesters.reduce(
          (yearTotal, sem) =>
            yearTotal +
            sem.departments.reduce(
              (semTotal, dept) => semTotal + dept.offerings.length,
              0,
            ),
          0,
        );
        return { year, count, semesters };
      });
  }, [offerings, programMetaById]);

  useEffect(() => {
    if (initialisedRef.current || groups.length === 0) return;
    setExpanded(new Set([groups[0].year]));
    initialisedRef.current = true;
  }, [groups]);

  function toggleYear(year: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  if (offerings === null) {
    return <p className="mt-4 text-sm text-slate-400">กำลังโหลด…</p>;
  }

  if (offerings.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate-400">
        ไม่พบรายวิชาที่รอทวนสอบในขณะนี้
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {groups.map((g, idx) => {
        const isOpen = expanded.has(g.year);
        return (
          <section key={g.year} className={YEAR_SECTION_CLASS}>
            <button
              type="button"
              onClick={() => toggleYear(g.year)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:brightness-[0.98]"
            >
              <span className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''} ${YEAR_TEXT_CLASS} opacity-60`}
                  aria-hidden
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className={`text-base font-semibold ${YEAR_TEXT_CLASS}`}>
                  ปีการศึกษา {g.year}
                </span>
                {idx === 0 && (
                  <span className="rounded-full bg-mfu-primary px-2 py-0.5 text-xs font-medium text-white">
                    ล่าสุด
                  </span>
                )}
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {g.count} รายวิชา
              </span>
            </button>

            {isOpen && (
              <div className="space-y-4 px-3 pb-3">
                {g.semesters.map((s) => (
                  <div key={s.sem} className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-500">
                      {SEMESTER_LABEL[s.sem]}
                    </h3>
                    {s.departments.map((dept) => (
                      <div key={dept.departmentId} className={INNER_CARD_CLASS}>
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <h4 className="text-sm font-semibold text-slate-700">
                            {dept.departmentNameTh}
                          </h4>
                          <span className="text-xs text-slate-400">
                            {dept.offerings.length} รายวิชา
                          </span>
                        </div>
                        <div className={TABLE_WRAPPER_CLASS}>
                          <table className={OFFERING_TABLE_CLASS}>
                            <colgroup>
                              <col className="w-[15%]" />
                              <col />
                              <col className="w-[22%]" />
                              <col className="w-[10%]" />
                              <col className="w-[18%]" />
                              <col className="w-[16%]" />
                            </colgroup>
                            <thead>
                              <tr className={TABLE_HEADER_ROW_CLASS}>
                                <th className={TABLE_HEAD_CELL_CLASS}>รหัสวิชา</th>
                                <th className={TABLE_HEAD_CELL_CLASS}>ชื่อรายวิชา</th>
                                <th className={TABLE_HEAD_CELL_CLASS}>เล่มหลักสูตร</th>
                                <th className={TABLE_HEAD_CELL_CLASS}>ตอนเรียน</th>
                                <th className={TABLE_HEAD_CELL_CLASS}>อาจารย์</th>
                                <th className={TABLE_HEAD_CELL_CLASS}>สถานะ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {dept.offerings.map((o) => {
                                const meta = programMetaById[o.programId];
                                return (
                                  <tr
                                    key={o.id}
                                    className="transition-colors hover:bg-slate-50"
                                  >
                                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap font-medium`}>
                                      <Link
                                        href={`/assessor/${o.id}`}
                                        className="text-mfu-primary hover:underline"
                                      >
                                        {o.courseCode}
                                      </Link>
                                    </td>
                                    <td className={`${TABLE_CELL_CLASS} min-w-0 text-slate-700`}>
                                      <div className="truncate" title={o.courseNameTh}>
                                        {o.courseNameTh}
                                      </div>
                                    </td>
                                    <td className={`${TABLE_CELL_CLASS} min-w-0 text-slate-500`}>
                                      <div
                                        className="truncate"
                                        title={meta ? `${meta.code} ${meta.nameTh}` : undefined}
                                      >
                                        {meta ? `${meta.code} ${meta.nameTh}` : '—'}
                                      </div>
                                    </td>
                                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap text-slate-600`}>
                                      {o.section}
                                    </td>
                                    <td className={`${TABLE_CELL_CLASS} min-w-0 text-slate-500`}>
                                      <div className="truncate" title={o.lecturerEmail ?? undefined}>
                                        {o.lecturerEmail ?? '—'}
                                      </div>
                                    </td>
                                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
                                      <StatusBadge status={o.status} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
