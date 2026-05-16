import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';

/**
 * Root route. Routes signed-in users to the correct workspace based on their
 * role assignments.
 *
 * Priority: admin → assessor → lecturer (default).
 * Admin routing will be added in Phase 3.
 */
export default async function RootPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Assessors go to the assessor workspace.
  if (profile.roles.assessorOf && profile.roles.assessorOf.length > 0) {
    redirect('/assessor');
  }

  // Default: lecturer workspace.
  redirect('/lecturer');
}

