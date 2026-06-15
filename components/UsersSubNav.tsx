import Link from 'next/link';

type UsersTab = 'users' | 'committee' | 'verification' | 'assignments' | 'allowlist';

const TABS: { href: string; label: string; key: UsersTab }[] = [
  { href: '/admin/users/assessment-committee', label: 'คณะกรรมการทวนสอบ', key: 'committee' },
  { href: '/admin/users/verification-committee', label: 'คณะกรรมการรับรองผล', key: 'verification' },
  { href: '/admin/users/program-assignments', label: 'มอบหมายอาจารย์ประจำหลักสูตร', key: 'assignments' },
  { href: '/admin/users', label: 'ผู้ใช้งานปัจจุบัน', key: 'users' },
  { href: '/admin/users/allowlist', label: 'ทะเบียนรายชื่อ', key: 'allowlist' },
];

/** Shared sub-navigation for the /admin/users section. */
export default function UsersSubNav({ active }: { active: UsersTab }) {
  return (
    <div className="mt-4 flex flex-wrap gap-4 border-b border-slate-200 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={
            active === t.key
              ? 'border-b-2 border-mfu-primary pb-2 font-medium text-mfu-primary'
              : 'border-b-2 border-transparent pb-2 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary'
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
