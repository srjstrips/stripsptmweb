import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 bg-slate-100 rounded-full mb-4">
        <Icon size={28} className="text-slate-400" />
      </div>
      <p className="font-semibold text-slate-600">{title}</p>
      {description && <p className="text-sm text-slate-400 mt-1 max-w-xs">{description}</p>}
    </div>
  );
}
