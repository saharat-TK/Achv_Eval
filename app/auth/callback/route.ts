import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Supabase Auth OAuth callback.
 *
 * After Google sign-in, Supabase redirects the user here with a `code`
 * query parameter. We exchange it for a session, then enforce the
 * @mfu.ac.th domain restriction before granting access.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Enforce email domain restriction (defense in depth — also enforced by
  // a CHECK constraint on profiles.email).
  const { data: { user } } = await supabase.auth.getUser();
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'mfu.ac.th').split(',');
  const domain = user?.email?.split('@')[1]?.toLowerCase();

  if (!user || !domain || !allowed.includes(domain)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
