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
  verifierOf?: string[];
}

interface WorkspaceDef {
  key: WorkspaceKey;
  label: string;
  href: string;
  canAccess: (r: SwitcherRoles) => boolean;
}

const WORKSPACES: WorkspaceDef[] = [
  {
    key: 'admin',
    label: 'จัดการหลักสูตร',
    href: '/admin/dashboard',
    canAccess: (r) => !!r.isAdmin || (r.directorOf?.length ?? 0) > 0,
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
  {
    key: 'assessor',
    label: 'ทวนสอบ',
    href: '/assessor',
    canAccess: (r) => !!r.isAdmin || (r.assessorOf?.length ?? 0) > 0,
  },
  {
    key: 'lecturer',
    label: 'รายวิชาที่รับผิดชอบ',
    href: '/lecturer',
    canAccess: (r) => !!r.isLecturer,
  },
];

/**
 * Cross-workspace switcher shown in every workspace top bar. Lists the
 * workspaces the current user can access (by role) so multi-role users
 * can hop between them. Hidden when only one workspace is available.
 */
export default function WorkspaceSwitcher({
  current,
  roles,
}: {
  current: WorkspaceKey;
  roles: SwitcherRoles;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const available = WORKSPACES.filter((w) => w.canAccess(roles));
  // Nothing to switch to — don't render the control at all.
  if (available.length < 2) return null;

  const currentDef = available.find((w) => w.key === current);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
      >
        <span>{currentDef?.label ?? 'พื้นที่ทำงาน'}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-400">
            สลับพื้นที่ทำงาน
          </p>
          {available.map((w) => {
            const isCurrent = w.key === current;
            return (
              <Link
                key={w.key}
                href={w.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 ${
                  isCurrent
                    ? 'font-semibold text-mfu-primary'
                    : 'text-slate-700'
                }`}
              >
                {w.label}
                {isCurrent && (
                  <span className="text-xs text-mfu-primary">ปัจจุบัน</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
