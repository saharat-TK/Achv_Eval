import Link from 'next/link';

/**
 * Sub-tabs for the academic-program area: Program (หลักสูตร) and
 * Curriculum (เล่มหลักสูตร). Rendered admin-only by the parent pages.
 */
export default function ProgramAreaTabs({
  current,
}: {
  current: 'program' | 'curriculum';
}) {
  const tab = (active: boolean) =>
    active
      ? 'border-b-2 border-mfu-primary pb-2 font-medium text-mfu-primary'
      : 'border-b-2 border-transparent pb-2 text-slate-600 hover:border-mfu-primary hover:text-mfu-primary';

  return (
    <div className="mt-4 flex gap-4 border-b border-slate-200 text-sm">
      <Link href="/admin/academic-programs" className={tab(current === 'program')}>
        หลักสูตร
      </Link>
      <Link href="/admin" className={tab(current === 'curriculum')}>
        เล่มหลักสูตร
      </Link>
    </div>
  );
}
