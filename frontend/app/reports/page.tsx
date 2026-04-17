'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { BarChart3, Download, Search, Trash2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import PrimePivotMatrix from '@/components/PrimePivotMatrix';
import { stockApi, productionApi, dispatchApi, ProductionEntry, DispatchEntry, ReportProductionRow, StockSummaryRow, DetailedStockRow } from '@/lib/api';
import { IS_1239_GRADE, PIPE_SIZES, PIPE_THICKNESSES } from '@/lib/constants';

interface ReportData {
  production: ReportProductionRow[];
  dispatch: StockSummaryRow[];
  scrap: { total_scrap: number; total_slit_wastage: number };
}

type TabKey = 'summary' | 'production' | 'dispatch' | 'scrap';

export default function ReportsPage() {
  const defaultFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const defaultTo   = format(new Date(), 'yyyy-MM-dd');

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(defaultTo);
  const [loading,  setLoading]  = useState(false);
  const [report,   setReport]   = useState<ReportData | null>(null);
  const [rawProd,  setRawProd]  = useState<ProductionEntry[]>([]);
  const [rawDisp,  setRawDisp]  = useState<DispatchEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');

  // ── Stock Matrix state ──────────────────────────────────────
  const [matrixDate,    setMatrixDate]    = useState(format(new Date(), 'yyyy-MM-dd'));
  const [matrixDetail,  setMatrixDetail]  = useState<DetailedStockRow[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo };
      const [stockRep, prodRaw, dispRaw] = await Promise.all([
        stockApi.report(params),
        productionApi.list({ ...params, limit: 500 }),
        dispatchApi.list({ ...params, limit: 500 }),
      ]);
      setReport(stockRep.data);
      setRawProd(prodRaw.data.data);
      setRawDisp(dispRaw.data.data);
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const exportExcel = () => {
    if (!report) return;
    const wb = XLSX.utils.book_new();
    const summaryData = report.production.map((p) => {
      const d = report.dispatch.find((x) => x.size === p.size && x.thickness === p.thickness);
      return {
        Size: p.size, Thickness: p.thickness,
        'Prod Prime MT': p.prime_tonnage, 'Prod Prime Pcs': p.prime_pieces,
        'Prod Rnd MT':   p.random_tonnage, 'Prod Rnd Pcs': p.random_pieces,
        'Disp Prime MT': d?.prime_tonnage ?? 0, 'Disp Prime Pcs': d?.prime_pieces ?? 0,
        'Disp Rnd MT':   d?.random_tonnage ?? 0, 'Disp Rnd Pcs': d?.random_pieces ?? 0,
        'Net Prime MT':  parseFloat(String(p.prime_tonnage))  - parseFloat(String(d?.prime_tonnage  ?? 0)),
        'Net Rnd MT':    parseFloat(String(p.random_tonnage)) - parseFloat(String(d?.random_tonnage ?? 0)),
        'Scrap MT': p.scrap_tonnage, 'Slit Wastage': p.slit_wastage,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawProd), 'Production Detail');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDisp), 'Dispatch Detail');
    XLSX.writeFile(wb, `report_${dateFrom}_${dateTo}.xlsx`);
  };

  // Aggregate totals from report data
  const totals = report ? {
    prod_prime_t:  report.production.reduce((s, r) => s + parseFloat(String(r.prime_tonnage)),  0),
    prod_prime_p:  report.production.reduce((s, r) => s + parseInt(String(r.prime_pieces), 10), 0),
    prod_random_t: report.production.reduce((s, r) => s + parseFloat(String(r.random_tonnage)), 0),
    disp_prime_t:  report.dispatch.reduce((s, r)   => s + parseFloat(String(r.prime_tonnage)),  0),
    disp_random_t: report.dispatch.reduce((s, r)   => s + parseFloat(String(r.random_tonnage)), 0),
    scrap: parseFloat(String(report.scrap?.total_scrap        ?? 0)),
    slit:  parseFloat(String(report.scrap?.total_slit_wastage ?? 0)),
  } : null;

  // ── Load as-of stock matrix ──────────────────────────────────
  const loadMatrix = useCallback(async () => {
    setMatrixLoading(true);
    try {
      const res = await stockApi.detail(matrixDate);
      setMatrixDetail(res.data.data);
    } catch {
      toast.error('Failed to load stock matrix');
    } finally {
      setMatrixLoading(false);
    }
  }, [matrixDate]);

  // ── Split matrix into 3 categories ──────────────────────────
  const is1239Rows = matrixDetail.filter((r) => r.stamp === IS_1239_GRADE);
  const normalRows = matrixDetail.filter((r) => r.stamp !== IS_1239_GRADE);
  const sixMRows   = normalRows.filter((r) => r.length === '6m' || r.length === '');
  const customRows = normalRows.filter((r) => r.length !== '6m' && r.length !== '');

  type MatrixTab = '6m' | 'custom' | 'is1239';
  const [matrixTab, setMatrixTab] = useState<MatrixTab>('6m');

  const matrixTabRows: Record<MatrixTab, DetailedStockRow[]> = {
    '6m':     sixMRows,
    'custom': customRows,
    'is1239': is1239Rows,
  };
  const matrixTabTitles: Record<MatrixTab, string> = {
    '6m':     '6m Standard Length — Prime Stock (MT)',
    'custom': 'Custom Length — Prime Stock (MT)',
    'is1239': 'SRJ + IS 1239 Grade — Prime Stock (MT)',
  };
  const matrixTabColors: Record<MatrixTab, 'blue' | 'violet' | 'rose'> = {
    '6m': 'blue', 'custom': 'violet', 'is1239': 'rose',
  };

  // ── Per-tab Excel export (pivot layout) ─────────────────────
  const exportPivotExcel = (tab: MatrixTab) => {
    const rows = matrixTabRows[tab];
    if (!rows.length) return;

    const cellMap = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.size}|${r.thickness}`;
      cellMap.set(key, (cellMap.get(key) ?? 0) + (parseFloat(String(r.prime_tonnage)) || 0));
    }
    const activeSizes  = PIPE_SIZES.filter((s) => rows.some((r) => r.size === s));
    const activeThicks = PIPE_THICKNESSES.filter((t) => rows.some((r) => r.thickness === t));

    const header = ['Size', ...activeThicks.map((t) => `${t}mm`), 'Row Total'];
    const dataRows = activeSizes.map((size) => {
      let rowTotal = 0;
      const cells = activeThicks.map((t) => {
        const v = cellMap.get(`${size}|${t}`) ?? 0;
        rowTotal += v;
        return v > 0 ? v.toFixed(3) : '';
      });
      return [size, ...cells, rowTotal > 0 ? rowTotal.toFixed(3) : ''];
    });
    const totalRow = [
      'Col Total',
      ...activeThicks.map((t) => {
        const ct = activeSizes.reduce((s, sz) => s + (cellMap.get(`${sz}|${t}`) ?? 0), 0);
        return ct > 0 ? ct.toFixed(3) : '';
      }),
      rows.reduce((s, r) => s + (parseFloat(String(r.prime_tonnage)) || 0), 0).toFixed(3),
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totalRow]);
    ws['!cols'] = header.map(() => ({ wch: 10 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Matrix');
    XLSX.writeFile(wb, `matrix_${tab}_${matrixDate}.xlsx`);
  };

  // ── Per-tab PDF export (pivot layout) ───────────────────────
  const exportPivotPDF = (tab: MatrixTab) => {
    const rows = matrixTabRows[tab];
    if (!rows.length) return;
    const title = matrixTabTitles[tab];

    const cellMap = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.size}|${r.thickness}`;
      cellMap.set(key, (cellMap.get(key) ?? 0) + (parseFloat(String(r.prime_tonnage)) || 0));
    }
    const activeSizes  = PIPE_SIZES.filter((s) => rows.some((r) => r.size === s));
    const activeThicks = PIPE_THICKNESSES.filter((t) => rows.some((r) => r.thickness === t));

    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text(title, 14, 14);
    doc.setFontSize(8);
    doc.text(`As of ${format(new Date(matrixDate + 'T00:00:00'), 'dd MMM yyyy')}`, 14, 20);

    const head = [['Size', ...activeThicks.map((t) => `${t}mm`), 'Row Total']];
    const body = activeSizes.map((size) => {
      let rowTotal = 0;
      const cells = activeThicks.map((t) => {
        const v = cellMap.get(`${size}|${t}`) ?? 0;
        rowTotal += v;
        return v > 0 ? v.toFixed(3) : '—';
      });
      return [size, ...cells, rowTotal > 0 ? rowTotal.toFixed(3) : '—'];
    });
    const foot = [[
      'Col Total',
      ...activeThicks.map((t) => {
        const ct = activeSizes.reduce((s, sz) => s + (cellMap.get(`${sz}|${t}`) ?? 0), 0);
        return ct > 0 ? ct.toFixed(3) : '—';
      }),
      rows.reduce((s, r) => s + (parseFloat(String(r.prime_tonnage)) || 0), 0).toFixed(3),
    ]];

    autoTable(doc, {
      head, body, foot,
      startY: 25,
      styles: { fontSize: 6, cellPadding: 1.5 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 22 } },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`matrix_${tab}_${matrixDate}.pdf`);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary',    label: 'Summary' },
    { key: 'production', label: `Production (${rawProd.length})` },
    { key: 'dispatch',   label: `Dispatch (${rawDisp.length})` },
    { key: 'scrap',      label: 'Scrap / Wastage' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Reports"
        subtitle="Production, dispatch, and scrap analysis"
        actions={
          report && (
            <button onClick={exportExcel} className="btn-secondary">
              <Download size={15} /> Export Excel
            </button>
          )
        }
      />

      {/* Date picker */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="form-label">From Date</label>
            <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">To Date</label>
            <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button className="btn-primary mb-0.5" onClick={generateReport} disabled={loading}>
            {loading ? <Spinner size={15} /> : <Search size={15} />}
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
          <div className="flex gap-2 mb-0.5">
            {[
              { label: 'Today',      from: format(new Date(), 'yyyy-MM-dd'),              to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Week',  from: format(subDays(new Date(), 7),  'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Month', from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
            ].map(({ label, from, to }) => (
              <button key={label} className="btn-secondary text-xs py-1"
                onClick={() => { setDateFrom(from); setDateTo(to); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size={32} /></div>}

      {!loading && !report && (
        <div className="card">
          <EmptyState icon={BarChart3} title="No report generated" description="Select a date range and click Generate Report." />
        </div>
      )}

      {!loading && report && totals && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Produced (MT)"   value={(totals.prod_prime_t + totals.prod_random_t).toFixed(3)}   sub={`${totals.prod_prime_p} prime pcs`} icon={BarChart3} color="blue" />
            <StatCard label="Total Dispatched (MT)" value={(totals.disp_prime_t + totals.disp_random_t).toFixed(3)}   icon={BarChart3} color="amber" />
            <StatCard label="Net Stock (MT)"        value={(totals.prod_prime_t + totals.prod_random_t - totals.disp_prime_t - totals.disp_random_t).toFixed(3)} icon={BarChart3} color="green" />
            <StatCard label="Total Scrap (MT)"      value={(totals.scrap + totals.slit).toFixed(3)} sub={`Slit: ${totals.slit.toFixed(3)} MT`} icon={Trash2} color="red" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-slate-200">
            {tabs.map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Summary Tab */}
          {activeTab === 'summary' && (() => {
            // Build full grid: all sizes × all thicknesses, show 0 where no data
            const allCombos = PIPE_SIZES.flatMap((sz) =>
              PIPE_THICKNESSES.map((th) => ({ size: sz, thickness: th }))
            );
            const summaryRows = allCombos.map(({ size, thickness }) => {
              const p = report.production.find((x) => x.size === size && x.thickness === thickness);
              const d = report.dispatch.find((x) => x.size === size && x.thickness === thickness);
              return { size, thickness, p, d };
            });
            const hasData = summaryRows.some(({ p, d }) => p || d);
            return (
            <div className="card overflow-x-auto p-0">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-600">Production vs Dispatch by Size & Thickness</p>
                <p className="text-xs text-slate-400">{dateFrom} → {dateTo}</p>
              </div>
              {!hasData ? (
                <EmptyState icon={BarChart3} title="No data for this period" />
              ) : (
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="table-th">Size</th>
                      <th className="table-th">Thickness</th>
                      <th className="table-th text-right bg-blue-50">Prod Prime MT</th>
                      <th className="table-th text-right bg-blue-50">Prod Rnd MT</th>
                      <th className="table-th text-right bg-amber-50">Disp Prime MT</th>
                      <th className="table-th text-right bg-amber-50">Disp Rnd MT</th>
                      <th className="table-th text-right bg-green-50">Net Prime MT</th>
                      <th className="table-th text-right bg-green-50">Net Rnd MT</th>
                      <th className="table-th text-right bg-red-50">Scrap MT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map(({ size, thickness, p, d }, i) => {
                      const prodPrime  = parseFloat(String(p?.prime_tonnage  ?? 0));
                      const prodRandom = parseFloat(String(p?.random_tonnage ?? 0));
                      const dispPrime  = parseFloat(String(d?.prime_tonnage  ?? 0));
                      const dispRandom = parseFloat(String(d?.random_tonnage ?? 0));
                      const netPrime   = prodPrime  - dispPrime;
                      const netRandom  = prodRandom - dispRandom;
                      const scrap      = parseFloat(String(p?.scrap_tonnage  ?? 0));
                      const hasAny = prodPrime || prodRandom || dispPrime || dispRandom || scrap;
                      return (
                        <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${!hasAny ? 'opacity-40' : ''}`}>
                          <td className="table-td font-semibold">{size}</td>
                          <td className="table-td">{thickness}</td>
                          <td className="table-td text-right text-blue-700">{prodPrime.toFixed(3)}</td>
                          <td className="table-td text-right text-blue-600">{prodRandom.toFixed(3)}</td>
                          <td className="table-td text-right text-amber-700">{dispPrime.toFixed(3)}</td>
                          <td className="table-td text-right text-amber-600">{dispRandom.toFixed(3)}</td>
                          <td className={`table-td text-right font-medium ${netPrime  >= 0 ? 'text-green-700' : 'text-red-600'}`}>{netPrime.toFixed(3)}</td>
                          <td className={`table-td text-right font-medium ${netRandom >= 0 ? 'text-green-700' : 'text-red-600'}`}>{netRandom.toFixed(3)}</td>
                          <td className="table-td text-right text-red-600">{scrap.toFixed(3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                    <tr>
                      <td className="table-td" colSpan={2}>TOTAL</td>
                      <td className="table-td text-right text-blue-700">{totals.prod_prime_t.toFixed(3)}</td>
                      <td className="table-td text-right text-blue-600">{totals.prod_random_t.toFixed(3)}</td>
                      <td className="table-td text-right text-amber-700">{totals.disp_prime_t.toFixed(3)}</td>
                      <td className="table-td text-right text-amber-600">{totals.disp_random_t.toFixed(3)}</td>
                      <td className="table-td text-right text-green-700">{(totals.prod_prime_t - totals.disp_prime_t).toFixed(3)}</td>
                      <td className="table-td text-right text-green-600">{(totals.prod_random_t - totals.disp_random_t).toFixed(3)}</td>
                      <td className="table-td text-right text-red-600">{totals.scrap.toFixed(3)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            );
          })()}

          {/* Production Detail Tab */}
          {activeTab === 'production' && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Size</th>
                    <th className="table-th">Thickness</th>
                    <th className="table-th">Length</th>
                    <th className="table-th text-right">Prime MT</th>
                    <th className="table-th text-right">Prime Pcs</th>
                    <th className="table-th text-right">Rnd MT</th>
                    <th className="table-th text-right">Scrap MT</th>
                  </tr>
                </thead>
                <tbody>
                  {rawProd.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="table-td">{format(new Date(e.date), 'dd MMM yyyy')}</td>
                      <td className="table-td font-medium">{e.size}</td>
                      <td className="table-td">{e.thickness}</td>
                      <td className="table-td">{e.length}</td>
                      <td className="table-td text-right text-blue-700">{parseFloat(String(e.prime_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right">{e.prime_pieces}</td>
                      <td className="table-td text-right text-amber-600">{parseFloat(String(e.random_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right text-red-600">{(parseFloat(String(e.total_scrap_kg)) / 1000).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Dispatch Detail Tab */}
          {activeTab === 'dispatch' && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Size</th>
                    <th className="table-th">Thickness</th>
                    <th className="table-th">Length</th>
                    <th className="table-th text-right">Prime MT</th>
                    <th className="table-th text-right">Prime Pcs</th>
                    <th className="table-th text-right">Random MT</th>
                    <th className="table-th text-right">Total MT</th>
                  </tr>
                </thead>
                <tbody>
                  {rawDisp.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="table-td">{format(new Date(e.date), 'dd MMM yyyy')}</td>
                      <td className="table-td font-medium">{e.size}</td>
                      <td className="table-td">{e.thickness}</td>
                      <td className="table-td">{e.length}</td>
                      <td className="table-td text-right text-blue-700">{parseFloat(String(e.prime_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right">{e.prime_pieces}</td>
                      <td className="table-td text-right text-amber-600">{parseFloat(String(e.random_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right font-semibold">
                        {(parseFloat(String(e.prime_tonnage)) + parseFloat(String(e.random_tonnage))).toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Scrap Tab */}
          {activeTab === 'scrap' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card">
                <h3 className="font-semibold text-slate-700 mb-4">Scrap Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Total Scrap Tonnage</span>
                    <span className="font-bold text-red-600">{totals.scrap.toFixed(3)} MT</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Total Slit Wastage</span>
                    <span className="font-bold text-orange-600">{totals.slit.toFixed(3)} MT</span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-red-50 rounded px-2">
                    <span className="text-sm font-semibold text-slate-700">Grand Total Loss</span>
                    <span className="font-bold text-red-700">{(totals.scrap + totals.slit).toFixed(3)} MT</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <h3 className="font-semibold text-slate-700 mb-4">Scrap by Size</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="table-th">Size</th>
                        <th className="table-th">Thickness</th>
                        <th className="table-th text-right">Scrap MT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.production
                        .filter((p) => parseFloat(String(p.scrap_tonnage)) > 0)
                        .map((p, i) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="table-td font-medium">{p.size}</td>
                            <td className="table-td">{p.thickness}</td>
                            <td className="table-td text-right text-red-600">{parseFloat(String(p.scrap_tonnage)).toFixed(3)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Stock Matrix — always visible, independent of report ── */}
      <div className="mt-8">
        {/* Date picker + load */}
        <div className="card mb-4">
          <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BarChart3 size={15} className="text-green-600" /> Stock Matrix (as of date)
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="form-label">As of Date</label>
              <input type="date" className="form-input" value={matrixDate}
                onChange={(e) => setMatrixDate(e.target.value)} />
            </div>
            <button className="btn-primary mb-0.5" onClick={loadMatrix} disabled={matrixLoading}>
              {matrixLoading ? <Spinner size={15} /> : <Search size={15} />}
              {matrixLoading ? 'Loading…' : 'Show Stock'}
            </button>
            <p className="text-xs text-slate-400 mb-1 self-end">
              Production − Dispatch up to and including this date.
            </p>
          </div>
        </div>

        {matrixLoading && <div className="flex justify-center py-8"><Spinner size={28} /></div>}

        {!matrixLoading && matrixDetail.length === 0 && (
          <div className="card">
            <EmptyState icon={BarChart3} title="No stock data" description="Select a date and click Show Stock." />
          </div>
        )}

        {!matrixLoading && matrixDetail.length > 0 && (
          <div className="card p-0">
            {/* Tab header + download buttons */}
            <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-200 flex-wrap gap-2">
              <div className="flex gap-0">
                {(['6m', 'custom', 'is1239'] as MatrixTab[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setMatrixTab(key)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      matrixTab === key
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {{ '6m': '6m Standard', 'custom': 'Custom Length', 'is1239': 'SRJ + IS 1239' }[key]}
                    <span className="ml-1.5 text-xs text-slate-400">
                      ({matrixTabRows[key].length > 0
                        ? `${Array.from(new Set(matrixTabRows[key].map(r => r.size))).length} sizes`
                        : '0'})
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pb-2">
                <button
                  className="btn-secondary text-xs py-1"
                  disabled={matrixTabRows[matrixTab].length === 0}
                  onClick={() => exportPivotExcel(matrixTab)}
                >
                  <Download size={13} /> Excel
                </button>
                <button
                  className="btn-secondary text-xs py-1"
                  disabled={matrixTabRows[matrixTab].length === 0}
                  onClick={() => exportPivotPDF(matrixTab)}
                >
                  <Download size={13} /> PDF
                </button>
              </div>
            </div>

            {/* Active matrix */}
            <PrimePivotMatrix
              title={matrixTabTitles[matrixTab]}
              subtitle={`As of ${format(new Date(matrixDate + 'T00:00:00'), 'dd MMM yyyy')}`}
              rows={matrixTabRows[matrixTab]}
              color={matrixTabColors[matrixTab]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
