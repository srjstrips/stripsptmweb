import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('ptm_token')?.value;

  // Always allow login page
  if (pathname.startsWith('/login')) {
    if (token) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }

  // Redirect to login if no token
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Decode role from JWT payload (no secret verification needed here — just routing)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (payload.exp * 1000 < Date.now()) {
      const res = NextResponse.redirect(new URL('/login', request.url));
      res.cookies.delete('ptm_token');
      return res;
    }

    const role: string = payload.role;
    const allowed: Record<string, string[]> = {
      production: ['/', '/production'],
      dispatch:   ['/', '/dispatch'],
      reports:    ['/', '/reports', '/stock'],
      admin:      ['/', '/production', '/dispatch', '/stock', '/reports', '/breakdown', '/admin'],
    };
    const routes = allowed[role] ?? [];
    const ok = routes.some(r => r === pathname || (r !== '/' && pathname.startsWith(r)));
    if (!ok) return NextResponse.redirect(new URL('/', request.url));
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.delete('ptm_token');
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
