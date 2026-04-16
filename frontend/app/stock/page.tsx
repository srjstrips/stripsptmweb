'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Package, Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import Spinner from '@/components/Spinner';
import { stockApi, productionApi, dispatchApi, DetailedStockRow, StockTotals, EntryTotals } from '@/lib/api';
import { IS_1239_GRADE } from '@/lib/constants';

// ── helpers ───────────────────────────────────────────────────
function f(v: number | string) { return parseFloat(String(v)).toFixed(3); }
function n(v: number | string) { return parseFloat(String(v)) || 0; }

interface MatrixTotals {
  prime_tonnage: number;
  prime_pieces: number;
  random_tonnage: number;
  random_pieces: number;
  total_tonnage: number;
}

function calcTotals(rows: DetailedStockRow[]): MatrixTotals {
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

// ── StockMatrix component ─────────────────────────────────────
function StockMatrix({
  title,
  subtitle,
  rows,
  color,
}: {
  title: string;
  subtitle?: string;
  rows: DetailedStockRow[];
  color: 'blue' | 'violet' | 'rose';
}) {
  const headerBg   = { blue: 'bg-blue-600', violet: 'bg-violet-600', rose: 'bg-rose-600' }[color];
  const subBg      = { blue: 'bg-blue-50',  violet: 'bg-violet-50',  rose: 'bg-rose-50'  }[color];
  const totalText  = { blue: 'text-blue-700', violet: 'text-violet-700', rose: 'text-rose-700' }[color];

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

  const grandTotals = calcTotals(rows);

  return (
    <div className="card overflow-x-auto p-0">
      {/* Header */}
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
            const sizeTotals = calcTotals(sizeRows);
            const multiThick = sizeRows.length > 1;
            return (
              <>
                {sizeRows.map((row, idx) => (
                  <tr key={`${row.size}-${row.thickness}-${row.length}-${row.stamp}-${idx}`}
                    className="border-b border-slate-50 hover:bg-slate-50">
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
                  <tr className={`${subBg} border-b border-slate-200`}>
                    <td className={`table-td font-semibold ${totalText}`} colSpan={2}>
                      {size} — subtotal
                    </td>
                    <td className={`table-td text-right font-semibold ${totalText}`}>{sizeTotals.prime_tonnage.toFixed(3)}</td>
                    <td className={`table-td text-right font-semibold ${totalText}`}>{sizeTotals.prime_pieces}</td>
                    <td className={`table-td text-right font-semibold text-amber-700`}>{sizeTotals.random_tonnage.toFixed(3)}</td>
                    <td className={`table-td text-right font-semibold text-amber-700`}>{sizeTotals.random_pieces}</td>
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

// ── Page ──────────────────────────────────────────────────────
export default function StockPage() {
  const [detail, setDetail]           = useState<DetailedStockRow[]>([]);
  const [stockTotals, setStockTotals] = useState<StockTotals | null>(null);
  const [prodTotals, setProdTotals]   = useState<EntryTotals | null>(null);
  const [dispTotals, setDispTotals]   = useState<EntryTotals | null>(null);
  const [loading, setLoading]         = useState(true);

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const [detailRes, summaryRes, prodRes, dispRes] = await Promise.all([
        stockApi.detail(),
        stockApi.get(),
        productionApi.totals(),
        dispatchApi.totals(),
      ]);
      setDetail(detailRes.data.data);
      setStockTotals(summaryRes.data.totals);
      setProdTotals(prodRes.data);
      setDispTotals(dispRes.data);
    } catch {
      toast.error('Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStock(); }, [loadStock]);

  // ── Split into 3 matrices ─────────────────────────────────
  const is1239Rows   = detail.filter((r) => r.stamp === IS_1239_GRADE);
  const normalRows   = detail.filter((r) => r.stamp !== IS_1239_GRADE);
  const sixMRows     = normalRows.filter((r) => r.length === '6m' || r.length === '');
  const customRows   = normalRows.filter((r) => r.length !== '6m' && r.length !== '');

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(detail.map((s) => ({
      Size:         s.size,
      Thickness:    s.thickness,
      Length:       s.length,
      'IS Grade':   s.stamp || '',
      'Prime MT':   s.prime_tonnage,
      'Prime Pcs':  s.prime_pieces,
      'Random MT':  s.random_tonnage,
      'Random Pcs': s.random_pieces,
      'Total MT':   s.total_tonnage,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Live Stock');
    XLSX.writeFile(wb, `stock_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Live Stock"
        subtitle="Current inventory: production minus dispatch"
        actions={
          <>
            <button onClick={loadStock} className="btn-secondary">
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={exportExcel} className="btn-secondary" disabled={detail.length === 0}>
              <Download size={15} /> Export
            </button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Production (MT)"
          value={parseFloat(String(prodTotals?.all_time?.total_mt ?? 0)).toFixed(3)}
          sub={`Prime ${parseFloat(String(prodTotals?.all_time?.prime_mt ?? 0)).toFixed(3)} · Random ${parseFloat(String(prodTotals?.all_time?.random_mt ?? 0)).toFixed(3)}`}
          icon={Package}
          color="blue"
        />
        <StatCard
          label="Total Dispatch (MT)"
          value={parseFloat(String(dispTotals?.all_time?.total_mt ?? 0)).toFixed(3)}
          sub={`Prime ${parseFloat(String(dispTotals?.all_time?.prime_mt ?? 0)).toFixed(3)} · Random ${parseFloat(String(dispTotals?.all_time?.random_mt ?? 0)).toFixed(3)}`}
          icon={Package}
          color="amber"
        />
        <StatCard
          label="Live Stock (MT)"
          value={parseFloat(String(stockTotals?.grand_total_tonnage ?? 0)).toFixed(3)}
          sub={`${stockTotals?.grand_total_pieces ?? 0} pieces · ${detail.length} combinations`}
          icon={Package}
          color="green"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : (
        <div className="space-y-6">
          {/* Matrix 1: 6m standard length (non IS-1239) */}
          <StockMatrix
            title="6m Standard Length Stock"
            subtitle="Normal 6-metre pipes (all IS grades except IS 1239)"
            rows={sixMRows}
            color="blue"
          />

          {/* Matrix 2: Custom length (non IS-1239) */}
          <StockMatrix
            title="Custom Length Stock"
            subtitle="All non-6m length pipes (all IS grades except IS 1239)"
            rows={customRows}
            color="violet"
          />

          {/* Matrix 3: SRJ + IS 1239 grade (any length) */}
          <StockMatrix
            title="SRJ + IS 1239 Grade Stock"
            subtitle="IS 1239 grade pipes — tracked separately (any length)"
            rows={is1239Rows}
            color="rose"
          />
        </div>
      )}
    </div>
  );
}
