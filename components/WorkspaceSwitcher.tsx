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
    canAccess: (r) => !!r.isAdmin || (r.assessorOf?.length ?? 0) > 0,
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

/**
 * Cross-workspace switcher shown in every workspace top bar. Renders a
 * segmented pill control (one pill per workspace the user can access) so
 * multi-role users can switch with a single tap. Hidden when only one
 * workspace is available. Pills wrap to a new line on narrow screens.
 */
export default function WorkspaceSwitcher({
  current,
  roles,
}: {
  current: WorkspaceKey;
  roles: SwitcherRoles;
}) {
  const available = WORKSPACES.filter((w) => w.canAccess(roles));
  // Nothing to switch to — don't render the control at all.
  if (available.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-white/70">Switch workspace</span>
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white/10 p-1">
        {available.map((w) => {
          const isCurrent = w.key === current;
          if (isCurrent) {
            return (
              <span
                key={w.key}
                aria-current="page"
                className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-mfu-primary"
              >
                {w.label}
              </span>
            );
          }
          return (
            <Link
              key={w.key}
              href={w.href}
              className="rounded-md px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
            >
              {w.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
