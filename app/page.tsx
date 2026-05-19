import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';

/**
 * Root route. Routes signed-in users to the correct workspace based on their
 * role assignments. Priority: admin/director → verifier → assessor → lecturer.
 */
export default async function RootPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Admins and program directors land on the dashboard.
  if (
    profile.roles.isAdmin ||
    (profile.roles.directorOf && profile.roles.directorOf.length > 0)
  ) {
    redirect('/admin/dashboard');
  }

  // Verification committee members go to the final verification queue.
  if (profile.roles.verifierOf && profile.roles.verifierOf.length > 0) {
    redirect('/verification');
  }

  // Assessors go to the assessor workspace.
  if (profile.roles.assessorOf && profile.roles.assessorOf.length > 0) {
    redirect('/assessor');
  }

  // Default: lecturer workspace.
  redirect('/lecturer');
}
