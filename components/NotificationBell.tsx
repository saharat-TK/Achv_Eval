'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase/config';

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  relatedOfferingId: string | null;
  readAt: unknown | null;
  createdAt: { toDate: () => Date } | null;
}

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

/**
 * Header notification bell. Subscribes to the signed-in user's notifications
 * in real time, shows an unread badge, and opens a dropdown of recent items.
 * When `basePath` is set, clicking an item deep-links to the related offering.
 */
export default function NotificationBell({ basePath }: { basePath?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    let unsubSnap = () => {};
    const unsubAuth = auth.onAuthStateChanged((user) => {
      unsubSnap();
      if (!user) {
        setItems([]);
        return;
      }
      const notificationsQuery = query(
        collection(getFirebaseDb(), 'notifications'),
        where('recipientId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(20),
      );
      unsubSnap = onSnapshot(notificationsQuery, (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) })),
        );
      });
    });
    return () => {
      unsubAuth();
      unsubSnap();
    };
  }, []);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unread = items.filter((item) => !item.readAt);

  function markRead(id: string) {
    return updateDoc(doc(getFirebaseDb(), 'notifications', id), {
      readAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function markAllRead() {
    await Promise.all(unread.map((item) => markRead(item.id)));
  }

  function openItem(item: NotificationItem) {
    if (!item.readAt) markRead(item.id);
    setOpen(false);
    if (basePath && item.relatedOfferingId) {
      router.push(`${basePath}/${item.relatedOfferingId}`);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="การแจ้งเตือน"
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-mfu-primary px-1 text-[10px] font-semibold text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">การแจ้งเตือน</span>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-mfu-primary hover:underline"
              >
                ทำเครื่องหมายอ่านทั้งหมด
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                ยังไม่มีการแจ้งเตือน
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={`block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${
                    item.readAt ? '' : 'bg-mfu-primary/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!item.readAt && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mfu-primary" />
                    )}
                    <div className={item.readAt ? 'pl-4' : ''}>
                      <p className="text-sm font-medium text-slate-700">
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="mt-0.5 text-xs text-slate-500">{item.body}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {timeAgo(item.createdAt?.toDate() ?? null)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
