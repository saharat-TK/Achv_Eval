import { getImpersonation } from '@/lib/firebase/auth-server';
import StopImpersonationButton from '@/components/StopImpersonationButton';

/** Global "view as user" banner — rendered in the root layout. Only appears
 *  when a super-admin is actively impersonating; non-impersonated requests pay
 *  only a cookie read. */
export default async function ImpersonationBanner() {
  const imp = await getImpersonation();
  if (!imp) return null;
  return (
    <div className="bg-amber-500 text-white print:hidden">
      <div className="mx-auto flex max-w-[1026px] items-center justify-between gap-3 px-6 py-2 text-sm">
        <span className="min-w-0">
          👁 กำลังดูในมุมมองของ <strong>{imp.target.nameTh}</strong> · อ่านอย่างเดียว
        </span>
        <StopImpersonationButton />
      </div>
    </div>
  );
}
