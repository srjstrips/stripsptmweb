export type Role = 'production' | 'dispatch' | 'reports' | 'admin';

export interface AuthUser {
  username: string;
  role: Role;
}

// Routes each role is allowed to visit
export const ROLE_ROUTES: Record<Role, string[]> = {
  production: ['/', '/production'],
  dispatch:   ['/', '/dispatch'],
  reports:    ['/', '/reports', '/stock'],
  admin:      ['/', '/production', '/dispatch', '/stock', '/reports', '/breakdown'],
};

function decodeJwt(token: string): (AuthUser & { exp: number }) | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch {
    return null;
  }
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('ptm_token');
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload || payload.exp * 1000 < Date.now()) {
    clearAuth();
    return null;
  }
  return { username: payload.username, role: payload.role };
}

export function saveAuth(token: string) {
  localStorage.setItem('ptm_token', token);
  // Cookie for Next.js middleware (8h = 28800s)
  document.cookie = `ptm_token=${token}; path=/; max-age=28800; samesite=strict`;
}

export function clearAuth() {
  localStorage.removeItem('ptm_token');
  document.cookie = 'ptm_token=; path=/; max-age=0';
}

export function canAccess(role: Role, pathname: string): boolean {
  const allowed = ROLE_ROUTES[role] ?? [];
  return allowed.some(r => r === pathname || (r !== '/' && pathname.startsWith(r)));
}
