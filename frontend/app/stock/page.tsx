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
import { stockApi, racksApi, RackStock, StockTotals, Rack } from '@/lib/api';

export default function StockPage() {
  const [stock, setStock] = useState<RackStock[]>([]);
  const [totals, setTotals] = useState<StockTotals | null>(null);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ size: '', thickness: '', rack_id: '' });

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.size)      params.size      = filters.size;
      if (filters.thickness) params.thickness = filters.thickness;
      if (filters.rack_id)   params.rack_id   = filters.rack_id;

      const res = await stockApi.get(params);
      setStock(res.data.data);
      setTotals(res.data.totals);
    } catch {
      toast.error('Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadStock();
    racksApi.list().then((r) => setRacks(r.data.data)).catch(() => {});
  }, [loadStock]);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(stock.map((s) => ({
      Rack: s.rack_name,
      Location: s.location,
      Size: s.size,
      Thickness: s.thickness,
      'Prime MT': s.prime_tonnage,
      'Prime Pcs': s.prime_pieces,
      'Random MT': s.random_tonnage,
      'Random Pcs': s.random_pieces,
      'Total MT': s.total_tonnage,
      'Total Pcs': s.total_pieces,
      'Last Updated': s.updated_at,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Live Stock');
    XLSX.writeFile(wb, `stock_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  // Group stock by rack
  const byRack = stock.reduce<Record<string, RackStock[]>>((acc, row) => {
    if (!acc[row.rack_name]) acc[row.rack_name] = [];
    acc[row.rack_name].push(row);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Live Stock"
        subtitle="Real-time inventory across all racks"
        actions={
          <>
            <button onClick={loadStock} className="btn-secondary">
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={exportExcel} className="btn-secondary">
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
          label="Rack Slots"
          value={stock.length}
          sub={`${Object.keys(byRack).length} racks used`}
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
            <input className="form-input w-32" placeholder="e.g. 3&quot;" value={filters.size}
              onChange={(e) => setFilters((p) => ({ ...p, size: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Thickness</label>
            <input className="form-input w-32" placeholder="e.g. 2.9mm" value={filters.thickness}
              onChange={(e) => setFilters((p) => ({ ...p, thickness: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Rack</label>
            <select className="form-select w-44" value={filters.rack_id}
              onChange={(e) => setFilters((p) => ({ ...p, rack_id: e.target.value }))}>
              <option value="">All racks</option>
              {racks.map((r) => (
                <option key={r.id} value={r.id}>{r.rack_name}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary mb-0.5" onClick={loadStock}>Apply</button>
          <button className="btn-secondary mb-0.5" onClick={() => setFilters({ size: '', thickness: '', rack_id: '' })}>Clear</button>
        </div>
      </div>

      {/* Stock Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : stock.length === 0 ? (
        <div className="card">
          <EmptyState icon={Package} title="No stock found" description="Production entries will create stock records." />
        </div>
      ) : (
        <>
          {/* Flat table view */}
          <div className="card overflow-x-auto p-0 mb-6">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="font-semibold text-slate-700 text-sm">All Stock Rows ({stock.length})</h2>
            </div>
            <table className="w-full text-sm min-w-[750px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="table-th">Rack</th>
                  <th className="table-th">Location</th>
                  <th className="table-th">Size</th>
                  <th className="table-th">Thickness</th>
                  <th className="table-th text-right">Prime MT</th>
                  <th className="table-th text-right">Prime Pcs</th>
                  <th className="table-th text-right">Random MT</th>
                  <th className="table-th text-right">Random Pcs</th>
                  <th className="table-th text-right">Total MT</th>
                  <th className="table-th text-right">Total Pcs</th>
                  <th className="table-th">Updated</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="table-td font-medium">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-xs font-mono">
                        {row.rack_name}
                      </span>
                    </td>
                    <td className="table-td text-slate-500 text-xs">{row.location ?? '—'}</td>
                    <td className="table-td font-semibold">{row.size}</td>
                    <td className="table-td">{row.thickness}</td>
                    <td className="table-td text-right">
                      <span className={`font-medium ${parseFloat(String(row.prime_tonnage)) > 0 ? 'text-blue-700' : 'text-slate-300'}`}>
                        {parseFloat(String(row.prime_tonnage)).toFixed(3)}
                      </span>
                    </td>
                    <td className="table-td text-right text-slate-600">{row.prime_pieces}</td>
                    <td className="table-td text-right">
                      <span className={`font-medium ${parseFloat(String(row.random_tonnage)) > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                        {parseFloat(String(row.random_tonnage)).toFixed(3)}
                      </span>
                    </td>
                    <td className="table-td text-right text-slate-600">{row.random_pieces}</td>
                    <td className="table-td text-right font-bold text-slate-800">
                      {parseFloat(String(row.total_tonnage)).toFixed(3)}
                    </td>
                    <td className="table-td text-right text-slate-600">{row.total_pieces}</td>
                    <td className="table-td text-xs text-slate-400">
                      {format(new Date(row.updated_at), 'dd MMM HH:mm')}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals footer */}
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="table-td font-bold" colSpan={4}>TOTAL</td>
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
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Rack-wise summary cards */}
          <h2 className="font-semibold text-slate-700 mb-3">By Rack</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(byRack).map(([rackName, rows]) => {
              const rackTotals = rows.reduce(
                (acc, r) => ({
                  prime_t: acc.prime_t + parseFloat(String(r.prime_tonnage)),
                  prime_p: acc.prime_p + r.prime_pieces,
                  random_t: acc.random_t + parseFloat(String(r.random_tonnage)),
                  random_p: acc.random_p + r.random_pieces,
                }),
                { prime_t: 0, prime_p: 0, random_t: 0, random_p: 0 }
              );
              return (
                <div key={rackName} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-slate-700">{rackName}</span>
                    <span className="text-xs text-slate-400">{rows[0]?.location}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div className="bg-blue-50 rounded p-2">
                      <p className="text-blue-500 font-semibold">PRIME</p>
                      <p className="text-blue-800 font-bold">{rackTotals.prime_t.toFixed(3)} MT</p>
                      <p className="text-blue-600">{rackTotals.prime_p} pcs</p>
                    </div>
                    <div className="bg-amber-50 rounded p-2">
                      <p className="text-amber-500 font-semibold">RANDOM</p>
                      <p className="text-amber-800 font-bold">{rackTotals.random_t.toFixed(3)} MT</p>
                      <p className="text-amber-600">{rackTotals.random_p} pcs</p>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-left pb-1">Size</th>
                        <th className="text-left pb-1">Thick.</th>
                        <th className="text-right pb-1">Prime MT</th>
                        <th className="text-right pb-1">Rnd MT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="py-1 font-medium">{r.size}</td>
                          <td className="py-1">{r.thickness}</td>
                          <td className="py-1 text-right text-blue-700">{parseFloat(String(r.prime_tonnage)).toFixed(3)}</td>
                          <td className="py-1 text-right text-amber-600">{parseFloat(String(r.random_tonnage)).toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
