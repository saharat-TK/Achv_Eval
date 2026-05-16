import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: gates protected routes by the presence of the session
 * cookie. The cookie itself cannot be cryptographically verified here
 * (firebase-admin needs the Node runtime), so full verification happens in
 * server components / route handlers via `getSessionUser()`. This is a
 * cheap first gate, not the authoritative check.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith('/login') || pathname.startsWith('/api/auth/');
  const hasSession = request.cookies.has('session');

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
