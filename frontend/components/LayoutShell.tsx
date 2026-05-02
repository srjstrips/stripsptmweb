'use client';

import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const isLogin = pathname === '/login';

  // Client-side guard: redirect to login if no user after hydration
  useEffect(() => {
    if (ready && !user && !isLogin) router.replace('/login');
  }, [ready, user, isLogin, router]);

  if (isLogin) {
    return <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>;
  }

  if (!ready || !user) return null;

  return (
    <>
      <Sidebar onLogout={() => { logout(); router.replace('/login'); }} />
      <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
    </>
  );
}
