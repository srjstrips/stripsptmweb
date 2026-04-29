import { DetailedStockRow } from '@/lib/api';
import { PIPE_SIZES, PIPE_THICKNESSES } from '@/lib/constants';
import EmptyState from './EmptyState';
import { BarChart3 } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  rows: DetailedStockRow[];   // already filtered to this category
  color: 'blue' | 'violet' | 'rose';
}

export default function PrimePivotMatrix({ title, subtitle, rows, color }: Props) {
  const headerBg = { blue: 'bg-blue-600', violet: 'bg-violet-600', rose: 'bg-rose-600' }[color];
  const thBg     = { blue: 'bg-blue-50',  violet: 'bg-violet-50',  rose: 'bg-rose-50'  }[color];
  const thText   = { blue: 'text-blue-700', violet: 'text-violet-700', rose: 'text-rose-700' }[color];

  // ── Aggregate prime tonnage by size × thickness ────────────
  // (sum across all lengths/stamps within this category)
  const cellMap = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.size}|${r.thickness}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + (parseFloat(String(r.prime_tonnage)) || 0));
  }

  // Show ALL sizes and thicknesses; cells with no data show 0
  const activeSizes  = PIPE_SIZES as unknown as string[];
  const activeThicks = PIPE_THICKNESSES as unknown as string[];

  const cell = (size: string, thick: string) => cellMap.get(`${size}|${thick}`) ?? 0;

  const rowTotal  = (size:  string) => activeThicks.reduce((s, t) => s + cell(size, t), 0);
  const colTotal  = (thick: string) => activeSizes.reduce( (s, sz) => s + cell(sz, thick), 0);
  const grandTotal = rows.reduce((s, r) => s + (parseFloat(String(r.prime_tonnage)) || 0), 0);

  return (
    <div className="card overflow-x-auto p-0">
      {/* Header */}
      <div className={`${headerBg} text-white px-4 py-3`}>
        <h3 className="font-semibold text-sm">{title}</h3>
        {subtitle && <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>}
      </div>

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={BarChart3} title="No prime stock" description="No entries match this category." />
        </div>
      ) : (
        <table className="w-full text-xs" style={{ minWidth: activeThicks.length * 80 + 200 }}>
          {/* Column headers: thicknesses */}
          <thead>
            <tr className={`${thBg} border-b border-slate-200`}>
              <th className={`table-th sticky left-0 ${thBg} font-bold ${thText} whitespace-nowrap`}>
                Size ↓ / Thick →
              </th>
              {activeThicks.map((t) => (
                <th key={t} className={`table-th text-center ${thText} whitespace-nowrap`}>
                  {t} mm
                </th>
              ))}
              <th className="table-th text-right font-bold text-green-700 bg-green-50 whitespace-nowrap">
                Row Total
              </th>
            </tr>
          </thead>

          {/* Data rows: one per size */}
          <tbody>
            {activeSizes.map((size, si) => {
              const rt = rowTotal(size);
              return (
                <tr key={size} className={si % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className={`table-td font-semibold text-slate-700 sticky left-0 whitespace-nowrap ${si % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    {size}
                  </td>
                  {activeThicks.map((t) => {
                    const v = cell(size, t);
                    return (
                      <td key={t} className={`table-td text-center ${v > 0 ? 'bg-green-50' : ''}`}>
                        {v > 0
                          ? <span className={`font-medium ${thText}`}>{v.toFixed(3)}</span>
                          : <span className="text-slate-400 text-xs">0</span>}
                      </td>
                    );
                  })}
                  <td className="table-td text-right font-bold text-green-700 bg-green-50">
                    {rt > 0 ? rt.toFixed(3) : <span className="text-slate-400 font-normal text-xs">0</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Footer: column totals */}
          <tfoot className="border-t-2 border-slate-300 bg-slate-100">
            <tr>
              <td className={`table-td font-bold text-slate-700 sticky left-0 bg-slate-100`}>
                Col Total
              </td>
              {activeThicks.map((t) => {
                const ct = colTotal(t);
                return (
                  <td key={t} className={`table-td text-center font-bold ${ct > 0 ? thText : 'text-slate-400'}`}>
                    {ct > 0 ? ct.toFixed(3) : '0'}
                  </td>
                );
              })}
              <td className="table-td text-right font-bold text-green-700 bg-green-50">
                {grandTotal.toFixed(3)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
