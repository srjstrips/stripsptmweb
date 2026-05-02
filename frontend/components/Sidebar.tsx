'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Factory, Truck, LayoutDashboard, BarChart3,
  Package, ChevronRight, Zap, LogOut, UserCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ROUTES, Role } from '@/lib/auth';

const ALL_NAV = [
  { href: '/',           label: 'Dashboard',         icon: LayoutDashboard },
  { href: '/production', label: 'Production',        icon: Factory },
  { href: '/dispatch',   label: 'Dispatch',          icon: Truck },
  { href: '/stock',      label: 'Live Stock',        icon: Package },
  { href: '/reports',    label: 'Reports',           icon: BarChart3 },
  { href: '/breakdown',  label: 'Breakdown Reports', icon: Zap },
];

const ROLE_LABELS: Record<Role, string> = {
  production: 'Production',
  dispatch:   'Dispatch',
  reports:    'Reports',
  admin:      'Administrator',
};

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const { user }  = useAuth();

  const allowedRoutes = user ? ROLE_ROUTES[user.role] : ['/'];
  const nav = ALL_NAV.filter(({ href }) =>
    allowedRoutes.some(r => r === href || (r !== '/' && href.startsWith(r)))
  );

  return (
    <aside className="w-60 shrink-0 bg-slate-900 text-white flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Factory size={18} />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">PTM System</p>
            <p className="text-slate-400 text-[11px] leading-tight">Pipe Manufacturing</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={17} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={14} className="opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-3 border-t border-slate-700">
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-800 mb-2">
          <UserCircle size={18} className="text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.username}</p>
            <p className="text-[10px] text-slate-400">{user ? ROLE_LABELS[user.role] : ''}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
