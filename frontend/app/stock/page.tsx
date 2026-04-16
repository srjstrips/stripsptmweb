'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Package, Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import Spinner from '@/components/Spinner';
import StockMatrix from '@/components/StockMatrix';
import { stockApi, productionApi, dispatchApi, DetailedStockRow, StockTotals, EntryTotals } from '@/lib/api';
import { IS_1239_GRADE } from '@/lib/constants';

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
  const is1239Rows = detail.filter((r) => r.stamp === IS_1239_GRADE);
  const normalRows = detail.filter((r) => r.stamp !== IS_1239_GRADE);
  const sixMRows   = normalRows.filter((r) => r.length === '6m' || r.length === '');
  const customRows = normalRows.filter((r) => r.length !== '6m' && r.length !== '');

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
          <StockMatrix
            title="6m Standard Length Stock"
            subtitle="Normal 6-metre pipes — all IS grades except IS 1239"
            rows={sixMRows}
            color="blue"
          />
          <StockMatrix
            title="Custom Length Stock"
            subtitle="Non-6m length pipes — all IS grades except IS 1239"
            rows={customRows}
            color="violet"
          />
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
