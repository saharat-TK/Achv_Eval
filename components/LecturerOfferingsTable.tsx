'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase/config';
import { SEMESTER_LABEL } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import type { OfferingStatus, Semester } from '@/lib/types/models';

interface Offering {
  id: string;
  courseCode: string;
  courseNameTh: string;
  academicYear: number;
  semester: Semester;
  status: OfferingStatus;
}

interface SemesterGroup {
  sem: Semester;
  offerings: Offering[];
}

interface YearGroup {
  year: number;
  count: number;
  semesters: SemesterGroup[];
}

/**
 * Live list of the lecturer's assigned offerings, grouped by academic year
 * (latest → oldest) and, within each year, by semester ordered summer →
 * 2nd → 1st (semester 3 → 2 → 1). Year sections are collapsible; the
 * latest year starts expanded. Subscribes to Firestore so statuses update
 * in place.
 */
export default function LecturerOfferingsTable({ uid }: { uid: string }) {
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const initialisedRef = useRef(false);

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      await getFirebaseAuth().authStateReady();
      if (cancelled) return;
      const q = query(
        collection(getFirebaseDb(), 'offerings'),
        where('lecturerId', '==', uid),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          setOfferings(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Offering, 'id'>) }))
              .filter((o) => (o as { isActive?: boolean }).isActive !== false),
          );
        },
        (err) => {
          console.error('offerings listener error', err);
          setOfferings([]);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  // Group by year (desc), then by semester (3 → 2 → 1), courses by code.
  const groups = useMemo<YearGroup[]>(() => {
    if (!offerings) return [];
    const byYear = new Map<number, Map<Semester, Offering[]>>();
    for (const o of offerings) {
      if (!byYear.has(o.academicYear)) byYear.set(o.academicYear, new Map());
      const semMap = byYear.get(o.academicYear)!;
      if (!semMap.has(o.semester)) semMap.set(o.semester, []);
      semMap.get(o.semester)!.push(o);
    }
    return [...byYear.keys()]
      .sort((a, b) => b - a)
      .map((year) => {
        const semMap = byYear.get(year)!;
        const semesters: SemesterGroup[] = [...semMap.keys()]
          .sort((a, b) => Number(b) - Number(a))
          .map((sem) => ({
            sem,
            offerings: semMap
              .get(sem)!
              .sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
          }));
        const count = semesters.reduce((n, s) => n + s.offerings.length, 0);
        return { year, count, semesters };
      });
  }, [offerings]);

  // Expand the latest year by default, once, without clobbering manual toggles.
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
    return <p className="mt-6 text-sm text-slate-400">กำลังโหลด…</p>;
  }

  if (offerings.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center">
        <p className="text-sm text-slate-500">ยังไม่มีรายวิชาที่ได้รับมอบหมาย</p>
        <p className="mt-2 text-xs text-slate-400">
          ผู้ดูแลระบบหรือประธานหลักสูตรจะเป็นผู้มอบหมายรายวิชาให้ท่าน
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((g, idx) => {
        const isOpen = expanded.has(g.year);
        return (
          <section key={g.year}>
            <button
              type="button"
              onClick={() => toggleYear(g.year)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50"
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
                  className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  aria-hidden
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="text-base font-semibold text-slate-800">
                  ปีการศึกษา {g.year}
                </span>
                {idx === 0 && (
                  <span className="rounded-full bg-mfu-primary/10 px-2 py-0.5 text-xs font-medium text-mfu-primary">
                    ล่าสุด
                  </span>
                )}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {g.count} รายวิชา
              </span>
            </button>

            {isOpen && (
              <div className="mt-2 space-y-3 pl-2">
                {g.semesters.map((s) => (
                  <div key={s.sem}>
                    <h3 className="mb-1 px-1 text-xs font-semibold text-slate-500">
                      {SEMESTER_LABEL[s.sem]}
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500">
                          <tr>
                            <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                              รหัสวิชา
                            </th>
                            <th className="w-full px-4 py-2.5 font-medium">
                              ชื่อรายวิชา
                            </th>
                            <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                              สถานะ
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {s.offerings.map((o) => (
                            <tr key={o.id} className="hover:bg-slate-50">
                              <td className="whitespace-nowrap px-4 py-3">
                                <Link
                                  href={`/lecturer/${o.id}`}
                                  className="font-medium text-mfu-primary hover:underline"
                                >
                                  {o.courseCode}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {o.courseNameTh}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <StatusBadge status={o.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
