'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { BarChart3, Download, Search, Trash2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { stockApi, productionApi, dispatchApi, ProductionEntry, DispatchEntry, ReportProductionRow, StockSummaryRow } from '@/lib/api';

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
  const [loading, setLoading] = useState(false);
  const [report, setReport]   = useState<ReportData | null>(null);
  const [rawProd, setRawProd] = useState<ProductionEntry[]>([]);
  const [rawDisp, setRawDisp] = useState<DispatchEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');

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

    // Summary sheet
    const summaryData = report.production.map((p) => {
      const d = report.dispatch.find((x) => x.size === p.size && x.thickness === p.thickness);
      return {
        Size: p.size, Thickness: p.thickness,
        'Prod Prime MT': p.prime_tonnage, 'Prod Prime Pcs': p.prime_pieces,
        'Prod Rnd MT': p.random_tonnage,  'Prod Rnd Pcs': p.random_pieces,
        'Disp Prime MT': d?.prime_tonnage ?? 0, 'Disp Prime Pcs': d?.prime_pieces ?? 0,
        'Disp Rnd MT': d?.random_tonnage ?? 0,  'Disp Rnd Pcs': d?.random_pieces ?? 0,
        'Net Prime MT': p.prime_tonnage - (d?.prime_tonnage ?? 0),
        'Net Rnd MT':   p.random_tonnage - (d?.random_tonnage ?? 0),
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
    prod_prime_t:  report.production.reduce((s, r) => s + parseFloat(String(r.prime_tonnage)), 0),
    prod_prime_p:  report.production.reduce((s, r) => s + parseInt(String(r.prime_pieces), 10), 0),
    prod_random_t: report.production.reduce((s, r) => s + parseFloat(String(r.random_tonnage)), 0),
    disp_prime_t:  report.dispatch.reduce((s, r)   => s + parseFloat(String(r.prime_tonnage)), 0),
    disp_random_t: report.dispatch.reduce((s, r)   => s + parseFloat(String(r.random_tonnage)), 0),
    scrap: parseFloat(String(report.scrap?.total_scrap ?? 0)),
    slit:  parseFloat(String(report.scrap?.total_slit_wastage ?? 0)),
  } : null;

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
          {/* Quick presets */}
          <div className="flex gap-2 mb-0.5">
            {[
              { label: 'Today',     from: format(new Date(), 'yyyy-MM-dd'),       to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Week', from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),  to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Month',from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
            ].map(({ label, from, to }) => (
              <button key={label} className="btn-secondary text-xs py-1"
                onClick={() => { setDateFrom(from); setDateTo(to); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      )}

      {!loading && !report && (
        <div className="card">
          <EmptyState icon={BarChart3} title="No report generated" description="Select a date range and click Generate Report." />
        </div>
      )}

      {!loading && report && totals && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Produced (MT)" value={(totals.prod_prime_t + totals.prod_random_t).toFixed(3)} sub={`${totals.prod_prime_p} prime pcs`} icon={BarChart3} color="blue" />
            <StatCard label="Total Dispatched (MT)" value={(totals.disp_prime_t + totals.disp_random_t).toFixed(3)} icon={BarChart3} color="amber" />
            <StatCard label="Net Stock (MT)" value={(totals.prod_prime_t + totals.prod_random_t - totals.disp_prime_t - totals.disp_random_t).toFixed(3)} icon={BarChart3} color="green" />
            <StatCard label="Total Scrap (MT)" value={(totals.scrap + totals.slit).toFixed(3)} sub={`Slit: ${totals.slit.toFixed(3)} MT`} icon={Trash2} color="red" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-slate-200">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="card overflow-x-auto p-0">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-600">Production vs Dispatch by Size & Thickness</p>
                <p className="text-xs text-slate-400">{dateFrom} → {dateTo}</p>
              </div>
              {report.production.length === 0 ? (
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
                      <th className="table-th text-right bg-red-50">Slit MT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.production.map((p, i) => {
                      const d = report.dispatch.find(
                        (x) => x.size === p.size && x.thickness === p.thickness
                      );
                      const netPrime  = parseFloat(String(p.prime_tonnage))  - parseFloat(String(d?.prime_tonnage  ?? 0));
                      const netRandom = parseFloat(String(p.random_tonnage)) - parseFloat(String(d?.random_tonnage ?? 0));
                      return (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="table-td font-semibold">{p.size}</td>
                          <td className="table-td">{p.thickness}</td>
                          <td className="table-td text-right text-blue-700">{parseFloat(String(p.prime_tonnage)).toFixed(3)}</td>
                          <td className="table-td text-right text-blue-600">{parseFloat(String(p.random_tonnage)).toFixed(3)}</td>
                          <td className="table-td text-right text-amber-700">{parseFloat(String(d?.prime_tonnage  ?? 0)).toFixed(3)}</td>
                          <td className="table-td text-right text-amber-600">{parseFloat(String(d?.random_tonnage ?? 0)).toFixed(3)}</td>
                          <td className={`table-td text-right font-medium ${netPrime  >= 0 ? 'text-green-700' : 'text-red-600'}`}>{netPrime.toFixed(3)}</td>
                          <td className={`table-td text-right font-medium ${netRandom >= 0 ? 'text-green-700' : 'text-red-600'}`}>{netRandom.toFixed(3)}</td>
                          <td className="table-td text-right text-red-600">{parseFloat(String(p.scrap_tonnage)).toFixed(3)}</td>
                          <td className="table-td text-right text-red-400">{parseFloat(String(p.slit_wastage)).toFixed(3)}</td>
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
                      <td className="table-td text-right text-red-400">{totals.slit.toFixed(3)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

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
                    <th className="table-th">Rack</th>
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
                      <td className="table-td"><span className="text-xs bg-slate-100 rounded px-1.5 py-0.5">{e.rack_name}</span></td>
                      <td className="table-td text-right text-blue-700">{parseFloat(String(e.prime_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right">{e.prime_pieces}</td>
                      <td className="table-td text-right text-amber-600">
                        {parseFloat(String(e.random_tonnage)).toFixed(3)}
                      </td>
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
                    <th className="table-th text-right">Random Pcs</th>
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
                      <td className="table-td text-right">{e.random_pieces}</td>
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
                        <th className="table-th text-right">Slit MT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.production.filter((p) => parseFloat(String(p.scrap_tonnage)) > 0 || parseFloat(String(p.slit_wastage)) > 0).map((p, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="table-td font-medium">{p.size}</td>
                          <td className="table-td">{p.thickness}</td>
                          <td className="table-td text-right text-red-600">{parseFloat(String(p.scrap_tonnage)).toFixed(3)}</td>
                          <td className="table-td text-right text-orange-500">{parseFloat(String(p.slit_wastage)).toFixed(3)}</td>
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
    </div>
  );
}
