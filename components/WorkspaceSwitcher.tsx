'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export type WorkspaceKey = 'admin' | 'verification' | 'assessor' | 'lecturer';

export interface SwitcherRoles {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  isLecturer?: boolean;
  directorOf?: string[];
  assessorOf?: string[];
  assessorViewerOf?: string[];
  verifierOf?: string[];
}

interface WorkspaceDef {
  key: WorkspaceKey;
  label: string;
  href: string;
  canAccess: (r: SwitcherRoles) => boolean;
}

// Display order: จัดการหลักสูตร / รายวิชาที่รับผิดชอบ / ทวนสอบ / รับรองผล
const WORKSPACES: WorkspaceDef[] = [
  {
    key: 'admin',
    label: 'จัดการหลักสูตร',
    href: '/admin/dashboard',
    canAccess: (r) => !!r.isAdmin || (r.directorOf?.length ?? 0) > 0,
  },
  {
    key: 'lecturer',
    label: 'รายวิชาที่รับผิดชอบ',
    href: '/lecturer',
    canAccess: (r) => !!r.isLecturer,
  },
  {
    key: 'assessor',
    label: 'ทวนสอบ',
    href: '/assessor',
    canAccess: (r) =>
      !!r.isAdmin ||
      (r.assessorOf?.length ?? 0) > 0 ||
      (r.assessorViewerOf?.length ?? 0) > 0,
  },
  {
    key: 'verification',
    label: 'รับรองผล',
    href: '/verification',
    canAccess: (r) =>
      !!r.isAdmin ||
      (r.directorOf?.length ?? 0) > 0 ||
      (r.verifierOf?.length ?? 0) > 0,
  },
];

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Cross-workspace switcher shown in every workspace top bar. Renders a
 * segmented pill control with a sliding white "thumb" that glides under
 * the highlighted pill — it follows the cursor on hover and rests on the
 * current workspace otherwise. Clicking a pill navigates to that
 * workspace (each has its own menu bar). Hidden when only one workspace
 * is available; pills wrap on narrow screens.
 */
export default function WorkspaceSwitcher({
  current,
  roles,
}: {
  current: WorkspaceKey;
  roles: SwitcherRoles;
}) {
  const available = WORKSPACES.filter((w) => w.canAccess(roles));

  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [rects, setRects] = useState<Rect[]>([]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const activeIndex = Math.max(
    0,
    available.findIndex((w) => w.key === current),
  );
  const highlightIndex = hoverIndex ?? activeIndex;

  useEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      const t = track.getBoundingClientRect();
      setRects(
        itemRefs.current.map((el) => {
          if (!el) return { left: 0, top: 0, width: 0, height: 0 };
          const r = el.getBoundingClientRect();
          return {
            left: r.left - t.left,
            top: r.top - t.top,
            width: r.width,
            height: r.height,
          };
        }),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [available.length]);

  if (available.length < 2) return null;

  const thumb = rects[highlightIndex];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-white/70">Switch workspace</span>
      <div
        ref={trackRef}
        className="relative flex flex-wrap items-center gap-1 rounded-lg bg-white/10 p-1"
      >
        {thumb && thumb.width > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-md bg-white shadow-sm transition-all duration-300 ease-out"
            style={{
              left: thumb.left,
              top: thumb.top,
              width: thumb.width,
              height: thumb.height,
            }}
          />
        )}
        {available.map((w, i) => {
          const highlighted = i === highlightIndex;
          const cls = `relative z-10 rounded-md px-3 py-1 text-xs transition-colors duration-200 active:scale-95 ${
            highlighted ? 'font-semibold text-mfu-primary' : 'font-medium text-white'
          }`;
          const setRef = (el: HTMLElement | null) => {
            itemRefs.current[i] = el;
          };
          const hoverHandlers = {
            onMouseEnter: () => setHoverIndex(i),
            onMouseLeave: () => setHoverIndex(null),
          };
          if (w.key === current) {
            return (
              <span key={w.key} ref={setRef} aria-current="page" className={cls} {...hoverHandlers}>
                {w.label}
              </span>
            );
          }
          return (
            <Link key={w.key} ref={setRef} href={w.href} className={cls} {...hoverHandlers}>
              {w.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
