'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase/config';
import { OFFERING_STATUS, SEMESTER_LABEL } from '@/lib/constants';
import type { OfferingStatus, Semester } from '@/lib/types/models';
import StatusBadge from './StatusBadge';

interface Offering {
  id: string;
  courseCode: string;
  courseNameTh: string;
  courseNameEn: string;
  academicYear: number;
  semester: Semester;
  section: string;
  status: OfferingStatus;
  lecturerEmail: string | null;
}

const ASSESSOR_STATUSES: OfferingStatus[] = [
  'pending_assessment',
  'assessor_review',
  'assessed',
];

/**
 * Live table of offerings an assessor can review. Subscribes to Firestore
 * so status transitions appear in real time.
 */
export default function AssessorOfferingsTable({
  programIds,
}: {
  programIds: string[];
}) {
  const [offerings, setOfferings] = useState<Offering[] | null>(null);

  useEffect(() => {
    if (programIds.length === 0) {
      setOfferings([]);
      return;
    }

    let unsub = () => {};
    let cancelled = false;

    (async () => {
      await getFirebaseAuth().authStateReady();
      if (cancelled) return;

      const q = query(
        collection(getFirebaseDb(), 'offerings'),
        where('programId', 'in', programIds),
        where('status', 'in', ASSESSOR_STATUSES),
        orderBy('academicYear', 'desc'),
        orderBy('semester', 'desc'),
      );

      unsub = onSnapshot(
        q,
        (snap) => {
          setOfferings(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Offering, 'id'>),
            })),
          );
        },
        (err) => {
          console.error('assessor offerings listener error', err);
          setOfferings([]);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [programIds]);

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
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2">รหัสวิชา</th>
            <th className="px-4 py-2">ชื่อรายวิชา</th>
            <th className="px-4 py-2">ปี/ภาค</th>
            <th className="px-4 py-2">ตอนเรียน</th>
            <th className="px-4 py-2">อาจารย์</th>
            <th className="px-4 py-2">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {offerings.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-2 font-medium text-slate-800">
                <Link
                  href={`/assessor/${o.id}`}
                  className="hover:text-mfu-primary hover:underline"
                >
                  {o.courseCode}
                </Link>
              </td>
              <td className="px-4 py-2 text-slate-700">{o.courseNameTh}</td>
              <td className="px-4 py-2 text-slate-600">
                {o.academicYear} {SEMESTER_LABEL[o.semester]}
              </td>
              <td className="px-4 py-2 text-slate-600">{o.section}</td>
              <td className="px-4 py-2 text-slate-500 text-xs">
                {o.lecturerEmail ?? '—'}
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
