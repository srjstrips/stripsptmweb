'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Package, Filter, Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import Spinner from '@/components/Spinner';
import { stockApi, StockSummaryRow, StockTotals } from '@/lib/api';

export default function StockPage() {
  const [summary, setSummary] = useState<StockSummaryRow[]>([]);
  const [totals, setTotals]   = useState<StockTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ size: '', thickness: '' });

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.size)      params.size      = filters.size;
      if (filters.thickness) params.thickness = filters.thickness;
      const res = await stockApi.get(params);
      setSummary(res.data.summary);
      setTotals(res.data.totals);
    } catch {
      toast.error('Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadStock(); }, [loadStock]);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(summary.map((s) => ({
      Size:          s.size,
      Thickness:     s.thickness,
      'Prime MT':    s.prime_tonnage,
      'Prime Pcs':   s.prime_pieces,
      'Random MT':   s.random_tonnage,
      'Random Pcs':  s.random_pieces,
      'Total MT':    parseFloat(String(s.prime_tonnage)) + parseFloat(String(s.random_tonnage)),
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
            <button onClick={exportExcel} className="btn-secondary" disabled={summary.length === 0}>
              <Download size={15} /> Export
            </button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Prime Stock (MT)"
          value={parseFloat(String(totals?.total_prime_tonnage ?? 0)).toFixed(3)}
          sub={`${totals?.total_prime_pieces ?? 0} pieces`}
          icon={Package}
          color="blue"
        />
        <StatCard
          label="Random Stock (MT)"
          value={parseFloat(String(totals?.total_random_tonnage ?? 0)).toFixed(3)}
          sub={`${totals?.total_random_pieces ?? 0} pieces`}
          icon={Package}
          color="amber"
        />
        <StatCard
          label="Grand Total (MT)"
          value={parseFloat(String(totals?.grand_total_tonnage ?? 0)).toFixed(3)}
          sub={`${totals?.grand_total_pieces ?? 0} pieces`}
          icon={Package}
          color="green"
        />
        <StatCard
          label="Size × Thickness"
          value={summary.length}
          sub="combinations in stock"
          icon={Package}
          color="slate"
        />
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Filter size={15} className="text-slate-400 mt-5" />
          <div>
            <label className="form-label">Size</label>
            <input className="form-input w-36" placeholder="e.g. 50x50" value={filters.size}
              onChange={(e) => setFilters((p) => ({ ...p, size: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Thickness</label>
            <input className="form-input w-28" placeholder="e.g. 2.9" value={filters.thickness}
              onChange={(e) => setFilters((p) => ({ ...p, thickness: e.target.value }))} />
          </div>
          <button className="btn-primary mb-0.5" onClick={loadStock}>Apply</button>
          <button className="btn-secondary mb-0.5" onClick={() => setFilters({ size: '', thickness: '' })}>Clear</button>
        </div>
      </div>

      {/* Stock Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : summary.length === 0 ? (
        <div className="card">
          <EmptyState icon={Package} title="No stock found" description="Stock is calculated from production minus dispatch entries." />
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="table-th">Size</th>
                <th className="table-th">Thickness</th>
                <th className="table-th text-right">Prime MT</th>
                <th className="table-th text-right">Prime Pcs</th>
                <th className="table-th text-right">Random MT</th>
                <th className="table-th text-right">Random Pcs</th>
                <th className="table-th text-right">Total MT</th>
                <th className="table-th text-right">Total Pcs</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row, idx) => {
                const totalMT  = parseFloat(String(row.prime_tonnage)) + parseFloat(String(row.random_tonnage));
                const totalPcs = (row.prime_pieces || 0) + (row.random_pieces || 0);
                return (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="table-td font-medium whitespace-nowrap">{row.size}</td>
                    <td className="table-td">{row.thickness} mm</td>
                    <td className="table-td text-right">
                      <span className={`font-medium ${parseFloat(String(row.prime_tonnage)) > 0 ? 'text-blue-700' : 'text-slate-300'}`}>
                        {parseFloat(String(row.prime_tonnage)).toFixed(3)}
                      </span>
                    </td>
                    <td className="table-td text-right text-slate-600">{row.prime_pieces ?? 0}</td>
                    <td className="table-td text-right">
                      <span className={`font-medium ${parseFloat(String(row.random_tonnage)) > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                        {parseFloat(String(row.random_tonnage)).toFixed(3)}
                      </span>
                    </td>
                    <td className="table-td text-right text-slate-600">{row.random_pieces ?? 0}</td>
                    <td className="table-td text-right font-bold text-green-700">{totalMT.toFixed(3)}</td>
                    <td className="table-td text-right font-bold text-slate-700">{totalPcs}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td className="table-td font-bold" colSpan={2}>TOTAL</td>
                <td className="table-td text-right font-bold text-blue-700">
                  {parseFloat(String(totals?.total_prime_tonnage ?? 0)).toFixed(3)}
                </td>
                <td className="table-td text-right font-bold">{totals?.total_prime_pieces ?? 0}</td>
                <td className="table-td text-right font-bold text-amber-600">
                  {parseFloat(String(totals?.total_random_tonnage ?? 0)).toFixed(3)}
                </td>
                <td className="table-td text-right font-bold">{totals?.total_random_pieces ?? 0}</td>
                <td className="table-td text-right font-bold text-green-700">
                  {parseFloat(String(totals?.grand_total_tonnage ?? 0)).toFixed(3)}
                </td>
                <td className="table-td text-right font-bold">{totals?.grand_total_pieces ?? 0}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
