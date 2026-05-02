'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, LogOut, UserCircle } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  production: 'Production',
  dispatch:   'Dispatch',
  reports:    'Reports',
  admin:      'Administrator',
  custom:     'Custom',
};

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname        = usePathname();
  const { user, ready, logout } = useAuth();
  const router          = useRouter();
  const isLogin         = pathname === '/login';

  // Desktop: sidebar starts open; mobile: starts closed
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // On first mount: collapse by default on small screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  // Persist desktop preference
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      const saved = localStorage.getItem('ptm_sidebar');
      if (saved !== null) setSidebarOpen(saved === '1');
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
        localStorage.setItem('ptm_sidebar', next ? '1' : '0');
      }
      return next;
    });
  };

  useEffect(() => {
    if (ready && !user && !isLogin) router.replace('/login');
  }, [ready, user, isLogin, router]);

  if (isLogin) {
    return <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>;
  }

  if (!ready || !user) return null;

  const handleLogout = () => { logout(); router.replace('/login'); };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
      />

      {/* Right side: topbar + content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 shadow-sm z-10">
          {/* Hamburger / toggle */}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Menu size={20} />
          </button>

          {/* App name — mobile only */}
          <span className="lg:hidden font-bold text-slate-700 text-sm">PTM System</span>

          <div className="flex-1" />

          {/* User icon + tooltip */}
          <div className="relative group">
            <button className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" title={`${user.username} · ${ROLE_LABELS[user.role] ?? user.role}`}>
              <UserCircle size={20} />
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-700 whitespace-nowrap z-50">
              <span className="font-semibold">{user.username}</span>
              <span className="text-slate-400">{ROLE_LABELS[user.role] ?? user.role}</span>
            </div>
          </div>

          {/* Logout icon */}
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
