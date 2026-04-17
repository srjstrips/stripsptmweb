'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Package, Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import Spinner from '@/components/Spinner';
import StockMatrix, { calcMatrixTotals } from '@/components/StockMatrix';
import { stockApi, productionApi, dispatchApi, DetailedStockRow, StockTotals, EntryTotals } from '@/lib/api';
import { IS_1239_GRADE } from '@/lib/constants';

type TabKey = '6m' | 'custom' | 'is1239';

const TABS: { key: TabKey; label: string }[] = [
  { key: '6m',     label: '6m Standard' },
  { key: 'custom', label: 'Custom Length' },
  { key: 'is1239', label: 'SRJ + IS 1239' },
];

function exportMatrixExcel(rows: DetailedStockRow[], title: string) {
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
    Size:         r.size,
    'Thickness (mm)': r.thickness,
    'Prime MT':   parseFloat(String(r.prime_tonnage)),
    'Random MT':  parseFloat(String(r.random_tonnage)),
    'Total MT':   parseFloat(String(r.total_tonnage)),
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
}

function exportMatrixPDF(rows: DetailedStockRow[], title: string) {
  const doc = new jsPDF();
  doc.setFontSize(13);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 22);

  const totals = calcMatrixTotals(rows);

  autoTable(doc, {
    head: [['Size', 'Thickness', 'Prime MT', 'Random MT', 'Total MT']],
    body: rows.map((r) => [
      r.size,
      `${r.thickness} mm`,
      parseFloat(String(r.prime_tonnage)).toFixed(3),
      parseFloat(String(r.random_tonnage)).toFixed(3),
      parseFloat(String(r.total_tonnage)).toFixed(3),
    ]),
    foot: [[
      'TOTAL', '',
      totals.prime_tonnage.toFixed(3),
      totals.random_tonnage.toFixed(3),
      totals.total_tonnage.toFixed(3),
    ]],
    startY: 27,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export default function StockPage() {
  const [detail, setDetail]           = useState<DetailedStockRow[]>([]);
  const [stockTotals, setStockTotals] = useState<StockTotals | null>(null);
  const [prodTotals, setProdTotals]   = useState<EntryTotals | null>(null);
  const [dispTotals, setDispTotals]   = useState<EntryTotals | null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<TabKey>('6m');

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

  // ── Split into 3 categories ───────────────────────────────
  const is1239Rows = detail.filter((r) => r.stamp === IS_1239_GRADE);
  const normalRows = detail.filter((r) => r.stamp !== IS_1239_GRADE);
  const sixMRows   = normalRows.filter((r) => r.length === '6m' || r.length === '');
  const customRows = normalRows.filter((r) => r.length !== '6m' && r.length !== '');

  const tabRows: Record<TabKey, DetailedStockRow[]> = {
    '6m':     sixMRows,
    'custom': customRows,
    'is1239': is1239Rows,
  };

  const tabConfig: Record<TabKey, { title: string; subtitle: string; color: 'blue' | 'violet' | 'rose' }> = {
    '6m':     { title: '6m Standard Length Stock',       subtitle: 'Normal 6-metre pipes — all IS grades except IS 1239', color: 'blue' },
    'custom': { title: 'Custom Length Stock',             subtitle: 'Non-6m length pipes — all IS grades except IS 1239',  color: 'violet' },
    'is1239': { title: 'SRJ + IS 1239 Grade Stock',       subtitle: 'IS 1239 grade pipes — tracked separately (any length)', color: 'rose' },
  };

  const activeRows  = tabRows[activeTab];
  const activeConf  = tabConfig[activeTab];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Live Stock"
        subtitle="Current inventory: production minus dispatch"
        actions={
          <button onClick={loadStock} className="btn-secondary">
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Production (MT)"
          value={parseFloat(String(prodTotals?.all_time?.total_mt ?? 0)).toFixed(3)}
          sub={`Prime ${parseFloat(String(prodTotals?.all_time?.prime_mt ?? 0)).toFixed(3)} MT · Random ${parseFloat(String(prodTotals?.all_time?.random_mt ?? 0)).toFixed(3)} MT`}
          icon={Package}
          color="blue"
        />
        <StatCard
          label="Total Dispatch (MT)"
          value={parseFloat(String(dispTotals?.all_time?.total_mt ?? 0)).toFixed(3)}
          sub={`Prime ${parseFloat(String(dispTotals?.all_time?.prime_mt ?? 0)).toFixed(3)} MT · Random ${parseFloat(String(dispTotals?.all_time?.random_mt ?? 0)).toFixed(3)} MT`}
          icon={Package}
          color="amber"
        />
        <StatCard
          label="Live Stock (MT)"
          value={parseFloat(String(stockTotals?.grand_total_tonnage ?? 0)).toFixed(3)}
          sub={`${detail.length} size-thickness combinations`}
          icon={Package}
          color="green"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : (
        <div className="card p-0">
          {/* ── Tab header ─────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-200 flex-wrap gap-2">
            <div className="flex gap-0">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === key
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 text-xs text-slate-400">
                    ({tabRows[key].length})
                  </span>
                </button>
              ))}
            </div>

            {/* Download buttons */}
            <div className="flex gap-2 pb-2">
              <button
                className="btn-secondary text-xs py-1"
                disabled={activeRows.length === 0}
                onClick={() => exportMatrixExcel(activeRows, activeConf.title)}
              >
                <Download size={13} /> Excel
              </button>
              <button
                className="btn-secondary text-xs py-1"
                disabled={activeRows.length === 0}
                onClick={() => exportMatrixPDF(activeRows, activeConf.title)}
              >
                <Download size={13} /> PDF
              </button>
            </div>
          </div>

          {/* ── Active matrix ───────────────────────────────── */}
          <div className="p-0">
            <StockMatrix
              title={activeConf.title}
              subtitle={activeConf.subtitle}
              rows={activeRows}
              color={activeConf.color}
            />
          </div>
        </div>
      )}
    </div>
  );
}
