import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color?: 'blue' | 'amber' | 'green' | 'red' | 'slate';
}

const colorMap = {
  blue:  { bg: 'bg-blue-50',  icon: 'bg-blue-100  text-blue-600',  val: 'text-blue-700' },
  amber: { bg: 'bg-amber-50', icon: 'bg-amber-100 text-amber-600', val: 'text-amber-700' },
  green: { bg: 'bg-green-50', icon: 'bg-green-100 text-green-600', val: 'text-green-700' },
  red:   { bg: 'bg-red-50',   icon: 'bg-red-100   text-red-600',   val: 'text-red-700' },
  slate: { bg: 'bg-slate-50', icon: 'bg-slate-100 text-slate-600', val: 'text-slate-700' },
};

export default function StatCard({ label, value, sub, icon: Icon, color = 'blue' }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className={`card ${c.bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${c.val}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${c.icon}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
