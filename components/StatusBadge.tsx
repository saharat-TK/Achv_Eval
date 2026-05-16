import { OFFERING_STATUS } from '@/lib/constants';
import type { OfferingStatus } from '@/lib/types/models';

const TONE_CLASSES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
};

export default function StatusBadge({ status }: { status: OfferingStatus }) {
  const meta = OFFERING_STATUS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[meta.tone]}`}
    >
      {meta.labelTh}
    </span>
  );
}
