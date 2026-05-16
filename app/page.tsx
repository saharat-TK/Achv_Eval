import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/firebase/auth-server';

/**
 * Root route. Middleware already redirects unauthenticated users to /login;
 * here we route signed-in users to their workspace.
 *
 * Phase 1 ships only the lecturer workspace, so everyone lands there.
 * Role-aware routing (admin / director / assessor) arrives in Phase 3.
 */
export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect('/lecturer');
}
