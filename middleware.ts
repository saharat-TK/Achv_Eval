import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // TODO: Implement Firebase Auth edge verification or rely on page-level checks.
  return NextResponse.next();
}

export const config = {
  // Match all paths except static assets and image optimizer.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
