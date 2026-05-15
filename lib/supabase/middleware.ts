import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/types/database';

/**
 * Refreshes the Supabase session on every request, enforces the @mfu.ac.th
 * domain restriction, and redirects unauthenticated users away from
 * protected routes.
 *
 * Wired up in /middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run any code between createServerClient and getUser.
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico';

  // Domain enforcement (defense in depth).
  if (user) {
    const allowed = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'mfu.ac.th').split(',');
    const domain = user.email?.split('@')[1]?.toLowerCase();
    if (!domain || !allowed.includes(domain)) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'domain_not_allowed');
      return NextResponse.redirect(url);
    }
  }

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}
