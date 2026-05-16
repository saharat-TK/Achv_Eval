'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
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

/**
 * Live list of the lecturer's assigned offerings. Subscribes to Firestore so
 * a course's status updates in place (e.g. กำลังวิเคราะห์ → วิเคราะห์เสร็จ)
 * while the lecturer is on this page.
 */
export default function LecturerOfferingsTable({ uid }: { uid: string }) {
  const [offerings, setOfferings] = useState<Offering[] | null>(null);

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      await getFirebaseAuth().authStateReady();
      if (cancelled) return;
      const q = query(
        collection(getFirebaseDb(), 'offerings'),
        where('lecturerId', '==', uid),
        orderBy('updatedAt', 'desc'),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          setOfferings(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Offering, 'id'>) })),
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
    <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">รหัสวิชา</th>
            <th className="px-4 py-3 font-medium">ชื่อรายวิชา</th>
            <th className="px-4 py-3 font-medium">ปี/ภาค</th>
            <th className="px-4 py-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {offerings.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link
                  href={`/lecturer/${o.id}`}
                  className="font-medium text-mfu-primary hover:underline"
                >
                  {o.courseCode}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-700">{o.courseNameTh}</td>
              <td className="px-4 py-3 text-slate-600">
                {o.academicYear}/{SEMESTER_LABEL[o.semester]}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
