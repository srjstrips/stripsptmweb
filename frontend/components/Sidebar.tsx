'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Factory,
  Truck,
  LayoutDashboard,
  BarChart3,
  Package,
  ChevronRight,
  Zap,
} from 'lucide-react';

const nav = [
  { href: '/',           label: 'Dashboard',         icon: LayoutDashboard },
  { href: '/production', label: 'Production',        icon: Factory },
  { href: '/dispatch',   label: 'Dispatch',          icon: Truck },
  { href: '/stock',      label: 'Live Stock',        icon: Package },
  { href: '/reports',    label: 'Reports',           icon: BarChart3 },
  { href: '/breakdown',  label: 'Breakdown Reports', icon: Zap },
];

export default function Sidebar() {
  const pathname = usePathname();

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
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
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

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-700">
        <p className="text-slate-500 text-[11px]">v1.0.0 · Production Ready</p>
      </div>
    </aside>
  );
}
