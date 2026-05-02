'use client';

import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';
import { LogOut, UserCircle } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  production: 'Production',
  dispatch:   'Dispatch',
  reports:    'Reports',
  admin:      'Administrator',
};

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (ready && !user && !isLogin) router.replace('/login');
  }, [ready, user, isLogin, router]);

  if (isLogin) {
    return <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>;
  }

  if (!ready || !user) return null;

  const handleLogout = () => { logout(); router.replace('/login'); };

  return (
    <>
      <Sidebar onLogout={handleLogout} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-12 bg-white border-b border-slate-200 flex items-center justify-end px-5 gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <UserCircle size={17} className="text-slate-400" />
            <span className="font-medium">{user.username}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">{ROLE_LABELS[user.role] ?? user.role}</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
          >
            <LogOut size={15} />
            Logout
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
      </div>
    </>
  );
}
