'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Factory, Truck, LayoutDashboard, BarChart3,
  Package, Zap, LogOut, UserCircle, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ROUTES, Role } from '@/lib/auth';
import { usePageActions } from '@/context/PageActionsContext';

const ALL_NAV = [
  { href: '/',           label: 'Dashboard',         icon: LayoutDashboard },
  { href: '/production', label: 'Production',        icon: Factory },
  { href: '/dispatch',   label: 'Dispatch',          icon: Truck },
  { href: '/stock',      label: 'Live Stock',        icon: Package },
  { href: '/reports',    label: 'Reports',           icon: BarChart3 },
  { href: '/breakdown',  label: 'Breakdown',         icon: Zap },
];

const ROLE_LABELS: Record<Role, string> = {
  production: 'Production',
  dispatch:   'Dispatch',
  reports:    'Reports',
  admin:      'Administrator',
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export default function Sidebar({ open, onClose, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const { user }  = useAuth();
  const { actions: pageActions } = usePageActions();

  const allowedRoutes = user ? ROLE_ROUTES[user.role] : ['/'];
  const nav = ALL_NAV.filter(({ href }) =>
    allowedRoutes.some(r => r === href || (r !== '/' && href.startsWith(r)))
  );

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          flex flex-col h-full bg-slate-900 text-white
          transition-all duration-300 ease-in-out shrink-0
          ${open ? 'w-60' : 'w-0 lg:w-16'}
          overflow-hidden
        `}
      >
        {/* Logo */}
        <div className={`flex items-center border-b border-slate-700 shrink-0 ${open ? 'px-5 py-4 gap-3' : 'px-0 py-4 justify-center'}`}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Factory size={18} />
          </div>
          {open && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight truncate">PTM System</p>
              <p className="text-slate-400 text-[11px] leading-tight truncate">Pipe Manufacturing</p>
            </div>
          )}
          {/* Close button — mobile only */}
          {open && (
            <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white ml-1">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Nav links */}
        <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden ${open ? 'px-3' : 'px-2'}`}>
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                title={!open ? label : undefined}
                className={`
                  flex items-center rounded-lg text-sm font-medium transition-colors group
                  ${open ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5'}
                  ${active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }
                `}
              >
                <Icon size={18} className="shrink-0" />
                {open && <span className="flex-1 truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Page-level actions (Import / Export / Delete) */}
        {pageActions.length > 0 && (
          <div className={`border-t border-slate-700 shrink-0 py-3 ${open ? 'px-3' : 'px-2'}`}>
            {open && <p className="text-[10px] uppercase tracking-widest text-slate-500 px-2 mb-2">Actions</p>}
            <div className="flex flex-col gap-0.5">
              {pageActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  title={!open ? action.label : undefined}
                  className={`
                    flex items-center rounded-lg text-sm font-medium transition-colors
                    ${open ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5'}
                    ${action.variant === 'danger'
                      ? 'text-red-400 hover:bg-red-900/30 hover:text-red-300'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
                  `}
                >
                  <action.icon size={18} className="shrink-0" />
                  {open && <span className="flex-1 truncate text-left">{action.label}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User + logout */}
        <div className={`border-t border-slate-700 shrink-0 py-3 ${open ? 'px-3' : 'px-2'}`}>
          {open ? (
            <>
              <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-800 mb-2">
                <UserCircle size={18} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{user?.username}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user ? ROLE_LABELS[user.role] : ''}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </>
          ) : (
            <button
              onClick={onLogout}
              title="Sign Out"
              className="w-full flex items-center justify-center py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
