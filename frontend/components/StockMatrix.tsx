import { Package } from 'lucide-react';
import EmptyState from './EmptyState';
import { DetailedStockRow } from '@/lib/api';

// ── helpers ───────────────────────────────────────────────────
function f(v: number | string) { return parseFloat(String(v)).toFixed(3); }
function n(v: number | string) { return parseFloat(String(v)) || 0; }

export interface MatrixTotals {
  prime_tonnage:  number;
  prime_pieces:   number;
  random_tonnage: number;
  random_pieces:  number;
  total_tonnage:  number;
}

export function calcMatrixTotals(rows: DetailedStockRow[]): MatrixTotals {
  return rows.reduce(
    (acc, r) => ({
      prime_tonnage:  acc.prime_tonnage  + n(r.prime_tonnage),
      prime_pieces:   acc.prime_pieces   + (r.prime_pieces  || 0),
      random_tonnage: acc.random_tonnage + n(r.random_tonnage),
      random_pieces:  acc.random_pieces  + (r.random_pieces || 0),
      total_tonnage:  acc.total_tonnage  + n(r.total_tonnage),
    }),
    { prime_tonnage: 0, prime_pieces: 0, random_tonnage: 0, random_pieces: 0, total_tonnage: 0 }
  );
}

interface Props {
  title: string;
  subtitle?: string;
  rows: DetailedStockRow[];
  color: 'blue' | 'violet' | 'rose';
}

export default function StockMatrix({ title, subtitle, rows, color }: Props) {
  const headerBg  = { blue: 'bg-blue-600',    violet: 'bg-violet-600',    rose: 'bg-rose-600'    }[color];
  const subBg     = { blue: 'bg-blue-50',     violet: 'bg-violet-50',     rose: 'bg-rose-50'     }[color];
  const totalText = { blue: 'text-blue-700',  violet: 'text-violet-700',  rose: 'text-rose-700'  }[color];

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className={`${headerBg} text-white rounded-t-lg px-4 py-3 -mx-4 -mt-4 mb-4`}>
          <h3 className="font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-xs opacity-75 mt-0.5">{subtitle}</p>}
        </div>
        <EmptyState icon={Package} title="No stock" description="No entries match this category." />
      </div>
    );
  }

  // Group rows by size for subtotals
  const sizeGroups = rows.reduce<Record<string, DetailedStockRow[]>>((acc, r) => {
    if (!acc[r.size]) acc[r.size] = [];
    acc[r.size].push(r);
    return acc;
  }, {});

  const grandTotals = calcMatrixTotals(rows);

  return (
    <div className="card overflow-x-auto p-0">
      <div className={`${headerBg} text-white px-4 py-3`}>
        <h3 className="font-semibold text-sm">{title}</h3>
        {subtitle && <p className="text-xs opacity-75 mt-0.5">{subtitle}</p>}
      </div>

      <table className="w-full text-sm min-w-[680px]">
        <thead className={`${subBg} border-b border-slate-200`}>
          <tr>
            <th className="table-th">Size</th>
            <th className="table-th">Thickness</th>
            <th className="table-th text-right">Prime MT</th>
            <th className="table-th text-right">Prime Pcs</th>
            <th className="table-th text-right">Random MT</th>
            <th className="table-th text-right">Random Pcs</th>
            <th className="table-th text-right font-bold">Total MT</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(sizeGroups).map(([size, sizeRows]) => {
            const sizeTotals = calcMatrixTotals(sizeRows);
            const multiThick = sizeRows.length > 1;
            return (
              <>
                {sizeRows.map((row, idx) => (
                  <tr
                    key={`${row.size}-${row.thickness}-${row.length}-${row.stamp ?? ''}-${idx}`}
                    className="border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="table-td font-medium whitespace-nowrap">{row.size}</td>
                    <td className="table-td">{row.thickness} mm</td>
                    <td className="table-td text-right">
                      <span className={n(row.prime_tonnage) > 0 ? 'text-blue-700 font-medium' : 'text-slate-300'}>
                        {f(row.prime_tonnage)}
                      </span>
                    </td>
                    <td className="table-td text-right text-slate-600">{row.prime_pieces ?? 0}</td>
                    <td className="table-td text-right">
                      <span className={n(row.random_tonnage) > 0 ? 'text-amber-600 font-medium' : 'text-slate-300'}>
                        {f(row.random_tonnage)}
                      </span>
                    </td>
                    <td className="table-td text-right text-slate-600">{row.random_pieces ?? 0}</td>
                    <td className="table-td text-right font-bold text-green-700">{f(row.total_tonnage)}</td>
                  </tr>
                ))}
                {multiThick && (
                  <tr key={`${size}-sub`} className={`${subBg} border-b border-slate-200`}>
                    <td className={`table-td font-semibold ${totalText}`} colSpan={2}>
                      {size} — subtotal
                    </td>
                    <td className={`table-td text-right font-semibold ${totalText}`}>{sizeTotals.prime_tonnage.toFixed(3)}</td>
                    <td className={`table-td text-right font-semibold ${totalText}`}>{sizeTotals.prime_pieces}</td>
                    <td className="table-td text-right font-semibold text-amber-700">{sizeTotals.random_tonnage.toFixed(3)}</td>
                    <td className="table-td text-right font-semibold text-amber-700">{sizeTotals.random_pieces}</td>
                    <td className="table-td text-right font-bold text-green-700">{sizeTotals.total_tonnage.toFixed(3)}</td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-slate-300">
          <tr>
            <td className="table-td font-bold" colSpan={2}>TOTAL</td>
            <td className={`table-td text-right font-bold ${totalText}`}>{grandTotals.prime_tonnage.toFixed(3)}</td>
            <td className={`table-td text-right font-bold ${totalText}`}>{grandTotals.prime_pieces}</td>
            <td className="table-td text-right font-bold text-amber-700">{grandTotals.random_tonnage.toFixed(3)}</td>
            <td className="table-td text-right font-bold text-amber-700">{grandTotals.random_pieces}</td>
            <td className="table-td text-right font-bold text-green-700">{grandTotals.total_tonnage.toFixed(3)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
