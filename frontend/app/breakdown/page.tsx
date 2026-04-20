'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Plus, Trash2, Zap, Search, AlertTriangle, RefreshCw, X, ChevronDown } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import {
  breakdownApi,
  BreakdownTimeEntry,
  BreakdownReasonEntry,
  BreakdownAnalysisRow,
  ProductionSizeRow,
} from '@/lib/api';
import { PIPE_SIZES, PIPE_THICKNESSES } from '@/lib/constants';

const MILLS = ['Mill1', 'Mill2', 'Mill3', 'Mill4'] as const;
const DEPTS = ['Electrical', 'Mechanical', 'Production'] as const;

type TabKey = 'time' | 'reasons' | 'analysis';

// ── helpers ──────────────────────────────────────────────────
function n(v: string | number) { return parseFloat(String(v || '0')) || 0; }
function i(v: string | number) { return parseInt(String(v || '0'), 10) || 0; }
function fmtMin(m: number) {
  if (!m) return '0 min';
  const h = Math.floor(m / 60); const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

// ── Time batch row ────────────────────────────────────────────
interface TimeRow {
  size: string; thickness: string;
  total_time: string;
  electrical_bd: string; mechanical_bd: string;
  roll_change: string; production_bd: string;
  prime_mt: string; random_mt: string;
  total_pieces: string; total_meters: string;
  note: string;
  _locked: boolean; // true = auto-filled from production
}

function makeTimeRow(p?: ProductionSizeRow): TimeRow {
  return {
    size:          p?.size          ?? '',
    thickness:     p?.thickness     ?? '',
    total_time:    '1440',
    electrical_bd: '', mechanical_bd: '', roll_change: '', production_bd: '',
    prime_mt:      p ? String(parseFloat(String(p.prime_mt)).toFixed(3))  : '',
    random_mt:     p ? String(parseFloat(String(p.random_mt)).toFixed(3)) : '',
    total_pieces:  p ? String(p.total_pieces) : '',
    total_meters:  p ? String(parseFloat(String(p.total_meters)).toFixed(1)) : '',
    note: '',
    _locked: !!p,
  };
}

// ── Reason batch row ──────────────────────────────────────────
interface ReasonRow {
  size: string; thickness: string;
  department: string; reason: string;
  time_taken: string; times_repeated: string;
  _locked: boolean;
}

function makeReasonRow(p?: ProductionSizeRow): ReasonRow {
  return {
    size:           p?.size      ?? '',
    thickness:      p?.thickness ?? '',
    department: '', reason: '', time_taken: '', times_repeated: '1',
    _locked: !!p,
  };
}

// ─────────────────────────────────────────────────────────────
export default function BreakdownPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('time');

  // ── Time tab state ────────────────────────────────────────
  const [timeDate,    setTimeDate]    = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeMill,    setTimeMill]    = useState('');
  const [timeRows,    setTimeRows]    = useState<TimeRow[]>([makeTimeRow()]);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [timeSaving,  setTimeSaving]  = useState(false);
  const [timeEntries, setTimeEntries] = useState<BreakdownTimeEntry[]>([]);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeFilters, setTimeFilters] = useState({ date_from: '', date_to: '', mill_no: '' });

  // ── Reasons tab state ─────────────────────────────────────
  const [reaDate,     setReaDate]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reaMill,     setReaMill]     = useState('');
  const [reaRows,     setReaRows]     = useState<ReasonRow[]>([makeReasonRow()]);
  const [reaLoadingSizes, setReaLoadingSizes] = useState(false);
  const [reaSaving,   setReaSaving]   = useState(false);
  const [reaEntries,  setReaEntries]  = useState<BreakdownReasonEntry[]>([]);
  const [reaLoading,  setReaLoading]  = useState(false);
  const [reaFilters,  setReaFilters]  = useState({ date_from: '', date_to: '', mill_no: '', department: '' });

  // ── Analysis tab state ────────────────────────────────────
  const [anaYear,     setAnaYear]     = useState(String(new Date().getFullYear()));
  const [anaMonth,    setAnaMonth]    = useState(String(new Date().getMonth() + 1));
  const [anaData,     setAnaData]     = useState<BreakdownAnalysisRow[]>([]);
  const [anaLoading,  setAnaLoading]  = useState(false);
  const [anaFilter,   setAnaFilter]   = useState({ size: '', dept: '' });

  // ── Load production sizes for Time batch ──────────────────
  const loadTimeSizes = useCallback(async () => {
    if (!timeDate || !timeMill) { toast.error('Select date and mill first'); return; }
    setLoadingSizes(true);
    try {
      const res = await breakdownApi.productionSizes(timeDate, timeMill);
      if (res.data.data.length === 0) {
        toast('No production entries found for this mill on this date', { icon: '⚠️' });
        setTimeRows([makeTimeRow()]);
      } else {
        setTimeRows(res.data.data.map((p) => makeTimeRow(p)));
        toast.success(`Loaded ${res.data.data.length} size(s) from production`);
      }
    } catch {
      toast.error('Failed to load sizes');
    } finally {
      setLoadingSizes(false);
    }
  }, [timeDate, timeMill]);

  // ── Load production sizes for Reasons batch ───────────────
  const loadReaSizes = useCallback(async () => {
    if (!reaDate || !reaMill) { toast.error('Select date and mill first'); return; }
    setReaLoadingSizes(true);
    try {
      const res = await breakdownApi.productionSizes(reaDate, reaMill);
      if (res.data.data.length === 0) {
        toast('No production entries found for this mill on this date', { icon: '⚠️' });
        setReaRows([makeReasonRow()]);
      } else {
        setReaRows(res.data.data.map((p) => makeReasonRow(p)));
        toast.success(`Loaded ${res.data.data.length} size(s) from production`);
      }
    } catch {
      toast.error('Failed to load sizes');
    } finally {
      setReaLoadingSizes(false);
    }
  }, [reaDate, reaMill]);

  // ── Submit time batch ─────────────────────────────────────
  const submitTime = async () => {
    if (!timeMill) { toast.error('Select mill'); return; }
    const valid = timeRows.filter((r) => r.size && r.thickness);
    if (!valid.length) { toast.error('No valid rows'); return; }
    setTimeSaving(true);
    try {
      const payload = valid.map((r) => {
        const totalBd = i(r.electrical_bd) + i(r.mechanical_bd) + i(r.roll_change) + i(r.production_bd);
        const avail   = i(r.total_time) - totalBd;
        return {
          date: timeDate, mill_no: timeMill,
          size: r.size, thickness: r.thickness,
          total_time:    i(r.total_time),
          electrical_bd: i(r.electrical_bd),
          mechanical_bd: i(r.mechanical_bd),
          roll_change:   i(r.roll_change),
          production_bd: i(r.production_bd),
          prime_mt:      n(r.prime_mt),
          random_mt:     n(r.random_mt),
          total_pieces:  i(r.total_pieces),
          total_meters:  n(r.total_meters),
          // Speed validation
          _avail: avail,
          note: r.note || null,
        };
      });
      const res = await breakdownApi.saveTime(payload);
      toast.success(`${res.data.count} row(s) saved`);
      if (res.data.errors?.length) toast.error(`${res.data.errors.length} row(s) failed`);
      loadTimeEntries();
    } catch {
      toast.error('Save failed');
    } finally {
      setTimeSaving(false);
    }
  };

  // ── Submit reasons batch ──────────────────────────────────
  const submitReasons = async () => {
    if (!reaMill) { toast.error('Select mill'); return; }
    const valid = reaRows.filter((r) => r.size && r.thickness && r.department && r.reason);
    if (!valid.length) { toast.error('No valid rows (need size, dept, reason)'); return; }
    setReaSaving(true);
    try {
      const payload = valid.map((r) => ({
        date: reaDate, mill_no: reaMill,
        size: r.size, thickness: r.thickness,
        department:     r.department,
        reason:         r.reason,
        time_taken:     i(r.time_taken),
        times_repeated: i(r.times_repeated) || 1,
      }));
      const res = await breakdownApi.saveReasons(payload);
      toast.success(`${res.data.count} reason(s) saved`);
      if (res.data.errors?.length) toast.error(`${res.data.errors.length} failed`);
      loadReaEntries();
    } catch {
      toast.error('Save failed');
    } finally {
      setReaSaving(false);
    }
  };

  // ── Load time entries ─────────────────────────────────────
  const loadTimeEntries = useCallback(async () => {
    setTimeLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (timeFilters.date_from) params.date_from = timeFilters.date_from;
      if (timeFilters.date_to)   params.date_to   = timeFilters.date_to;
      if (timeFilters.mill_no)   params.mill_no   = timeFilters.mill_no;
      const res = await breakdownApi.listTime(params);
      setTimeEntries(res.data.data);
    } catch {
      toast.error('Failed to load breakdown entries');
    } finally {
      setTimeLoading(false);
    }
  }, [timeFilters]);

  // ── Load reason entries ───────────────────────────────────
  const loadReaEntries = useCallback(async () => {
    setReaLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (reaFilters.date_from)  params.date_from  = reaFilters.date_from;
      if (reaFilters.date_to)    params.date_to    = reaFilters.date_to;
      if (reaFilters.mill_no)    params.mill_no    = reaFilters.mill_no;
      if (reaFilters.department) params.department = reaFilters.department;
      const res = await breakdownApi.listReasons(params);
      setReaEntries(res.data.data);
    } catch {
      toast.error('Failed to load reason entries');
    } finally {
      setReaLoading(false);
    }
  }, [reaFilters]);

  // ── Load monthly analysis ─────────────────────────────────
  const loadAnalysis = async () => {
    setAnaLoading(true);
    try {
      const res = await breakdownApi.analysis(parseInt(anaYear), parseInt(anaMonth));
      setAnaData(res.data.data);
    } catch {
      toast.error('Failed to load analysis');
    } finally {
      setAnaLoading(false);
    }
  };

  // ── Computed display for a time row ───────────────────────
  function calcRow(r: TimeRow) {
    const totalBd = i(r.electrical_bd) + i(r.mechanical_bd) + i(r.roll_change) + i(r.production_bd);
    const avail   = i(r.total_time) - totalBd;
    const meters  = n(r.total_meters);
    const speed   = avail > 0 && meters > 0 ? meters / avail : 0;
    const eff     = i(r.total_time) > 0 ? (avail / i(r.total_time)) * 100 : 0;
    return { totalBd, avail, speed, eff };
  }

  // ── Computed from saved entry ─────────────────────────────
  function calcEntry(e: BreakdownTimeEntry) {
    const totalBd = e.electrical_bd + e.mechanical_bd + e.roll_change + e.production_bd;
    const avail   = e.total_time - totalBd;
    const speed   = avail > 0 && e.total_meters > 0 ? e.total_meters / avail : 0;
    const eff     = e.total_time > 0 ? (avail / e.total_time) * 100 : 0;
    return { totalBd, avail, speed, eff };
  }

  // ── Filtered analysis rows ────────────────────────────────
  const filteredAna = anaData.filter((r) => {
    if (anaFilter.size && r.size !== anaFilter.size) return false;
    if (anaFilter.dept && r.department !== anaFilter.dept) return false;
    return true;
  });

  // ── Cell input helper ─────────────────────────────────────
  function TimeInput({ idx, fkey, type = 'number', bg = '', disabled = false }: {
    idx: number; fkey: keyof TimeRow; type?: string; bg?: string; disabled?: boolean;
  }) {
    return (
      <input
        type={type} min="0"
        disabled={disabled}
        className={`w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-500 ${bg}`}
        value={String(timeRows[idx][fkey])}
        onChange={(e) => setTimeRows((prev) => prev.map((r, i) => i === idx ? { ...r, [fkey]: e.target.value } : r))}
        placeholder="0"
      />
    );
  }

  function ReasonInput({ idx, fkey, type = 'text', bg = '' }: {
    idx: number; fkey: keyof ReasonRow; type?: string; bg?: string;
  }) {
    return (
      <input
        type={type} min="0"
        className={`w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 ${bg}`}
        value={String(reaRows[idx][fkey])}
        onChange={(e) => setReaRows((prev) => prev.map((r, i) => i === idx ? { ...r, [fkey]: e.target.value } : r))}
        placeholder="—"
      />
    );
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Breakdown Reports"
        subtitle="Mill-wise daily breakdown tracking, reason analysis & monthly trends"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {([
          { key: 'time',     label: '⏱ Time & Speed' },
          { key: 'reasons',  label: '🔧 Breakdown Reasons' },
          { key: 'analysis', label: '📊 Monthly Analysis' },
        ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 1 — Time & Speed
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'time' && (
        <div className="space-y-6">

          {/* Batch Entry Panel */}
          <div className="card">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Zap size={16} className="text-amber-500" /> Batch Entry — Time & Speed
              <span className="text-xs font-normal text-slate-400">Select date + mill → load sizes → fill breakdown times</span>
            </h2>

            {/* Date + Mill selector */}
            <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
              <div>
                <label className="form-label">Date *</label>
                <input type="date" className="form-input" value={timeDate}
                  onChange={(e) => setTimeDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Mill No. *</label>
                <select className="form-select w-32" value={timeMill}
                  onChange={(e) => setTimeMill(e.target.value)}>
                  <option value="">Select…</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={loadTimeSizes} disabled={loadingSizes || !timeDate || !timeMill}
                className="btn-secondary mb-0.5">
                {loadingSizes ? <Spinner size={14} /> : <RefreshCw size={14} />}
                {loadingSizes ? 'Loading…' : 'Load Sizes from Production'}
              </button>
              <p className="text-xs text-slate-400 mb-1 self-end">
                Auto-fills sizes that ran on this mill on the selected date.
              </p>
            </div>

            {/* Batch table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: 1400 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">#</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Size *</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Thick *</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Total Time (min)</th>
                    <th className="px-2 py-2 text-center font-semibold text-red-600 whitespace-nowrap bg-red-50" colSpan={4}>Breakdown Time (min)</th>
                    <th className="px-2 py-2 text-center font-semibold text-green-700 whitespace-nowrap bg-green-50" colSpan={2}>Auto-Calc</th>
                    <th className="px-2 py-2 text-center font-semibold text-blue-700 whitespace-nowrap bg-blue-50" colSpan={4}>Production (auto-filled)</th>
                    <th className="px-2 py-2 text-center font-semibold text-teal-700 whitespace-nowrap bg-teal-50" colSpan={2}>Speed / Efficiency</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600">Note</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th /><th /><th /><th />
                    <th className="px-2 py-1 bg-red-50 font-normal text-red-600">Electrical</th>
                    <th className="px-2 py-1 bg-red-50 font-normal text-red-600">Mechanical</th>
                    <th className="px-2 py-1 bg-red-50 font-normal text-red-600">Roll Chg</th>
                    <th className="px-2 py-1 bg-red-50 font-normal text-red-600">Production</th>
                    <th className="px-2 py-1 bg-green-50 font-normal text-green-700">Total BD</th>
                    <th className="px-2 py-1 bg-green-50 font-normal text-green-700">Available</th>
                    <th className="px-2 py-1 bg-blue-50 font-normal text-blue-700">Prime MT</th>
                    <th className="px-2 py-1 bg-blue-50 font-normal text-blue-700">Random MT</th>
                    <th className="px-2 py-1 bg-blue-50 font-normal text-blue-700">Pieces</th>
                    <th className="px-2 py-1 bg-blue-50 font-normal text-blue-700">Meters</th>
                    <th className="px-2 py-1 bg-teal-50 font-normal text-teal-700">Speed MPM</th>
                    <th className="px-2 py-1 bg-teal-50 font-normal text-teal-700">Eff %</th>
                    <th /><th />
                  </tr>
                </thead>
                <tbody>
                  {timeRows.map((row, idx) => {
                    const { totalBd, avail, speed, eff } = calcRow(row);
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-2 py-1 text-slate-400">{idx + 1}</td>
                        {/* Size */}
                        <td className="px-1 py-1" style={{ minWidth: 110 }}>
                          {row._locked ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs font-medium">{row.size}</span>
                          ) : (
                            <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                              value={row.size}
                              onChange={(e) => setTimeRows((p) => p.map((r, i) => i === idx ? { ...r, size: e.target.value } : r))}>
                              <option value="">Size…</option>
                              {PIPE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                        </td>
                        {/* Thickness */}
                        <td className="px-1 py-1" style={{ minWidth: 80 }}>
                          {row._locked ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs font-medium">{row.thickness}</span>
                          ) : (
                            <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                              value={row.thickness}
                              onChange={(e) => setTimeRows((p) => p.map((r, i) => i === idx ? { ...r, thickness: e.target.value } : r))}>
                              <option value="">Thick…</option>
                              {PIPE_THICKNESSES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-1 py-1" style={{ minWidth: 90 }}><TimeInput idx={idx} fkey="total_time" /></td>
                        <td className="px-1 py-1 bg-red-50" style={{ minWidth: 72 }}><TimeInput idx={idx} fkey="electrical_bd" bg="bg-red-50" /></td>
                        <td className="px-1 py-1 bg-red-50" style={{ minWidth: 72 }}><TimeInput idx={idx} fkey="mechanical_bd" bg="bg-red-50" /></td>
                        <td className="px-1 py-1 bg-red-50" style={{ minWidth: 72 }}><TimeInput idx={idx} fkey="roll_change" bg="bg-red-50" /></td>
                        <td className="px-1 py-1 bg-red-50" style={{ minWidth: 72 }}><TimeInput idx={idx} fkey="production_bd" bg="bg-red-50" /></td>
                        {/* Auto-calc */}
                        <td className="px-2 py-1 bg-green-50 text-center font-bold text-red-700" style={{ minWidth: 72 }}>
                          {totalBd > 0 ? fmtMin(totalBd) : '—'}
                        </td>
                        <td className="px-2 py-1 bg-green-50 text-center font-bold text-green-800" style={{ minWidth: 72 }}>
                          {fmtMin(avail)}
                        </td>
                        {/* Production auto-filled */}
                        <td className="px-1 py-1 bg-blue-50" style={{ minWidth: 72 }}><TimeInput idx={idx} fkey="prime_mt" disabled={row._locked} bg="bg-blue-50" /></td>
                        <td className="px-1 py-1 bg-blue-50" style={{ minWidth: 72 }}><TimeInput idx={idx} fkey="random_mt" disabled={row._locked} bg="bg-blue-50" /></td>
                        <td className="px-1 py-1 bg-blue-50" style={{ minWidth: 65 }}><TimeInput idx={idx} fkey="total_pieces" disabled={row._locked} bg="bg-blue-50" /></td>
                        <td className="px-1 py-1 bg-blue-50" style={{ minWidth: 72 }}><TimeInput idx={idx} fkey="total_meters" disabled={row._locked} bg="bg-blue-50" /></td>
                        {/* Speed / Eff */}
                        <td className="px-2 py-1 bg-teal-50 text-center font-bold text-teal-800" style={{ minWidth: 72 }}>
                          {speed > 0 ? `${speed.toFixed(2)} MPM` : '—'}
                        </td>
                        <td className={`px-2 py-1 bg-teal-50 text-center font-bold ${eff >= 80 ? 'text-green-700' : eff >= 60 ? 'text-amber-700' : 'text-red-600'}`} style={{ minWidth: 60 }}>
                          {eff > 0 ? `${eff.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-1 py-1" style={{ minWidth: 100 }}>
                          <input type="text"
                            className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400"
                            value={row.note}
                            onChange={(e) => setTimeRows((p) => p.map((r, i) => i === idx ? { ...r, note: e.target.value } : r))}
                            placeholder="optional" />
                        </td>
                        <td className="px-1 py-1">
                          <button type="button" disabled={timeRows.length === 1}
                            onClick={() => setTimeRows((p) => p.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 disabled:opacity-30 p-0.5">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => setTimeRows((p) => [...p, makeTimeRow()])} className="btn-secondary text-sm">
                <Plus size={14} /> Add Row
              </button>
              <button onClick={submitTime} disabled={timeSaving} className="btn-primary text-sm">
                {timeSaving ? <Spinner size={14} /> : <Zap size={14} />}
                {timeSaving ? 'Saving…' : `Submit All (${timeRows.length})`}
              </button>
            </div>
          </div>

          {/* Entries Table */}
          <div className="card p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <p className="font-semibold text-slate-700 text-sm">Saved Entries</p>
              <div className="flex flex-wrap items-end gap-2">
                <input type="date" className="form-input text-xs py-1" value={timeFilters.date_from}
                  onChange={(e) => setTimeFilters((p) => ({ ...p, date_from: e.target.value }))} placeholder="From" />
                <input type="date" className="form-input text-xs py-1" value={timeFilters.date_to}
                  onChange={(e) => setTimeFilters((p) => ({ ...p, date_to: e.target.value }))} placeholder="To" />
                <select className="form-select text-xs py-1 w-28" value={timeFilters.mill_no}
                  onChange={(e) => setTimeFilters((p) => ({ ...p, mill_no: e.target.value }))}>
                  <option value="">All Mills</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={loadTimeEntries} className="btn-primary text-xs py-1">
                  <Search size={13} /> Load
                </button>
              </div>
            </div>
            {timeLoading ? (
              <div className="flex justify-center py-10"><Spinner size={24} /></div>
            ) : timeEntries.length === 0 ? (
              <EmptyState icon={Zap} title="No entries" description="Add breakdown data above and click Load." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1200px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="table-th">Date</th>
                      <th className="table-th">Mill</th>
                      <th className="table-th">Size</th>
                      <th className="table-th">Thick</th>
                      <th className="table-th text-right">Total Time</th>
                      <th className="table-th text-right bg-red-50">Elec BD</th>
                      <th className="table-th text-right bg-red-50">Mech BD</th>
                      <th className="table-th text-right bg-red-50">Roll Chg</th>
                      <th className="table-th text-right bg-red-50">Prod BD</th>
                      <th className="table-th text-right bg-red-50">Total BD</th>
                      <th className="table-th text-right bg-green-50">Available</th>
                      <th className="table-th text-right bg-green-50">Eff %</th>
                      <th className="table-th text-right bg-blue-50">Prime MT</th>
                      <th className="table-th text-right bg-blue-50">Rnd MT</th>
                      <th className="table-th text-right bg-blue-50">Pieces</th>
                      <th className="table-th text-right bg-teal-50">Speed MPM</th>
                      <th className="table-th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeEntries.map((e) => {
                      const { totalBd, avail, speed, eff } = calcEntry(e);
                      return (
                        <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="table-td whitespace-nowrap">{format(new Date(e.date), 'dd MMM yyyy')}</td>
                          <td className="table-td"><span className="text-xs bg-slate-100 rounded px-1.5 py-0.5 font-mono">{e.mill_no}</span></td>
                          <td className="table-td font-medium">{e.size}</td>
                          <td className="table-td">{e.thickness}</td>
                          <td className="table-td text-right">{fmtMin(e.total_time)}</td>
                          <td className="table-td text-right text-red-600 bg-red-50">{e.electrical_bd} min</td>
                          <td className="table-td text-right text-red-600 bg-red-50">{e.mechanical_bd} min</td>
                          <td className="table-td text-right text-orange-600 bg-red-50">{e.roll_change} min</td>
                          <td className="table-td text-right text-red-600 bg-red-50">{e.production_bd} min</td>
                          <td className="table-td text-right font-bold text-red-700 bg-red-50">{fmtMin(totalBd)}</td>
                          <td className="table-td text-right font-bold text-green-700 bg-green-50">{fmtMin(avail)}</td>
                          <td className={`table-td text-right font-bold bg-green-50 ${eff >= 80 ? 'text-green-700' : eff >= 60 ? 'text-amber-700' : 'text-red-600'}`}>
                            {eff.toFixed(1)}%
                          </td>
                          <td className="table-td text-right text-blue-700 bg-blue-50">{parseFloat(String(e.prime_mt)).toFixed(3)}</td>
                          <td className="table-td text-right text-blue-600 bg-blue-50">{parseFloat(String(e.random_mt)).toFixed(3)}</td>
                          <td className="table-td text-right bg-blue-50">{e.total_pieces}</td>
                          <td className="table-td text-right font-bold text-teal-700 bg-teal-50">
                            {speed > 0 ? `${speed.toFixed(2)}` : '—'}
                          </td>
                          <td className="table-td">
                            <button onClick={async () => {
                              if (!confirm('Delete this entry?')) return;
                              await breakdownApi.deleteTime(e.id);
                              loadTimeEntries();
                            }} className="btn-danger py-1 px-2"><Trash2 size={12} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 2 — Breakdown Reasons
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'reasons' && (
        <div className="space-y-6">

          {/* Batch Entry Panel */}
          <div className="card">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" /> Batch Entry — Breakdown Reasons
              <span className="text-xs font-normal text-slate-400">Select date + mill → sizes auto-load → enter reasons per size</span>
            </h2>

            <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
              <div>
                <label className="form-label">Date *</label>
                <input type="date" className="form-input" value={reaDate}
                  onChange={(e) => setReaDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Mill No. *</label>
                <select className="form-select w-32" value={reaMill}
                  onChange={(e) => setReaMill(e.target.value)}>
                  <option value="">Select…</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={loadReaSizes} disabled={reaLoadingSizes || !reaDate || !reaMill}
                className="btn-secondary mb-0.5">
                {reaLoadingSizes ? <Spinner size={14} /> : <RefreshCw size={14} />}
                {reaLoadingSizes ? 'Loading…' : 'Load Sizes from Production'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">#</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Size *</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Thickness *</th>
                    <th className="px-2 py-2 text-left font-semibold text-orange-700 whitespace-nowrap bg-orange-50">Department *</th>
                    <th className="px-2 py-2 text-left font-semibold text-orange-700 whitespace-nowrap bg-orange-50">Breakdown Reason *</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Time Taken (min)</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">No. of Times</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {reaRows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-2 py-1 text-slate-400">{idx + 1}</td>
                      <td className="px-1 py-1" style={{ minWidth: 110 }}>
                        {row._locked ? (
                          <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs font-medium">{row.size}</span>
                        ) : (
                          <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                            value={row.size}
                            onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, size: e.target.value } : r))}>
                            <option value="">Size…</option>
                            {PIPE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-1 py-1" style={{ minWidth: 80 }}>
                        {row._locked ? (
                          <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs font-medium">{row.thickness}</span>
                        ) : (
                          <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                            value={row.thickness}
                            onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, thickness: e.target.value } : r))}>
                            <option value="">Thick…</option>
                            {PIPE_THICKNESSES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-1 py-1 bg-orange-50" style={{ minWidth: 120 }}>
                        <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-orange-400 bg-orange-50"
                          value={row.department}
                          onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, department: e.target.value } : r))}>
                          <option value="">Dept…</option>
                          {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1 bg-orange-50" style={{ minWidth: 200 }}>
                        <ReasonInput idx={idx} fkey="reason" bg="bg-orange-50" />
                      </td>
                      <td className="px-1 py-1" style={{ minWidth: 90 }}>
                        <ReasonInput idx={idx} fkey="time_taken" type="number" />
                      </td>
                      <td className="px-1 py-1" style={{ minWidth: 80 }}>
                        <ReasonInput idx={idx} fkey="times_repeated" type="number" />
                      </td>
                      <td className="px-1 py-1">
                        <button type="button" disabled={reaRows.length === 1}
                          onClick={() => setReaRows((p) => p.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30 p-0.5">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => setReaRows((p) => [...p, makeReasonRow()])} className="btn-secondary text-sm">
                <Plus size={14} /> Add Row
              </button>
              <button onClick={submitReasons} disabled={reaSaving} className="btn-primary text-sm">
                {reaSaving ? <Spinner size={14} /> : <AlertTriangle size={14} />}
                {reaSaving ? 'Saving…' : `Submit All (${reaRows.length})`}
              </button>
            </div>
          </div>

          {/* Reasons Entries Table */}
          <div className="card p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-wrap gap-2">
              <p className="font-semibold text-slate-700 text-sm">Saved Reasons</p>
              <div className="flex flex-wrap items-end gap-2">
                <input type="date" className="form-input text-xs py-1" value={reaFilters.date_from}
                  onChange={(e) => setReaFilters((p) => ({ ...p, date_from: e.target.value }))} />
                <input type="date" className="form-input text-xs py-1" value={reaFilters.date_to}
                  onChange={(e) => setReaFilters((p) => ({ ...p, date_to: e.target.value }))} />
                <select className="form-select text-xs py-1 w-28" value={reaFilters.mill_no}
                  onChange={(e) => setReaFilters((p) => ({ ...p, mill_no: e.target.value }))}>
                  <option value="">All Mills</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="form-select text-xs py-1 w-32" value={reaFilters.department}
                  onChange={(e) => setReaFilters((p) => ({ ...p, department: e.target.value }))}>
                  <option value="">All Depts</option>
                  {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={loadReaEntries} className="btn-primary text-xs py-1">
                  <Search size={13} /> Load
                </button>
              </div>
            </div>
            {reaLoading ? (
              <div className="flex justify-center py-10"><Spinner size={24} /></div>
            ) : reaEntries.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No reasons saved" description="Add breakdown reasons above and click Load." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="table-th">Date</th>
                      <th className="table-th">Mill</th>
                      <th className="table-th">Size</th>
                      <th className="table-th">Thickness</th>
                      <th className="table-th">Department</th>
                      <th className="table-th">Reason</th>
                      <th className="table-th text-right">Time (min)</th>
                      <th className="table-th text-right">Repeats</th>
                      <th className="table-th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reaEntries.map((e) => (
                      <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="table-td whitespace-nowrap">{format(new Date(e.date), 'dd MMM yyyy')}</td>
                        <td className="table-td"><span className="text-xs bg-slate-100 rounded px-1.5 py-0.5 font-mono">{e.mill_no}</span></td>
                        <td className="table-td font-medium">{e.size}</td>
                        <td className="table-td">{e.thickness}</td>
                        <td className="table-td">
                          <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                            e.department === 'Electrical' ? 'bg-yellow-100 text-yellow-800' :
                            e.department === 'Mechanical' ? 'bg-blue-100 text-blue-800' :
                            'bg-orange-100 text-orange-800'
                          }`}>{e.department}</span>
                        </td>
                        <td className="table-td">{e.reason}</td>
                        <td className="table-td text-right font-medium text-red-600">{e.time_taken} min</td>
                        <td className="table-td text-right">
                          <span className={`font-bold ${e.times_repeated > 1 ? 'text-red-600' : 'text-slate-500'}`}>
                            {e.times_repeated}×
                          </span>
                        </td>
                        <td className="table-td">
                          <button onClick={async () => {
                            if (!confirm('Delete this reason entry?')) return;
                            await breakdownApi.deleteReason(e.id);
                            loadReaEntries();
                          }} className="btn-danger py-1 px-2"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 3 — Monthly Analysis
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* Filter bar */}
          <div className="card">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <ChevronDown size={15} className="text-blue-600" /> Select Month
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="form-label">Month</label>
                <select className="form-select w-32" value={anaMonth}
                  onChange={(e) => setAnaMonth(e.target.value)}>
                  {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Year</label>
                <input type="number" className="form-input w-24" value={anaYear}
                  onChange={(e) => setAnaYear(e.target.value)} min="2020" max="2099" />
              </div>
              <button onClick={loadAnalysis} disabled={anaLoading} className="btn-primary mb-0.5">
                {anaLoading ? <Spinner size={14} /> : <Search size={14} />}
                {anaLoading ? 'Loading…' : 'Generate Analysis'}
              </button>

              {anaData.length > 0 && (
                <>
                  <div className="ml-2">
                    <label className="form-label">Filter Size</label>
                    <select className="form-select w-36" value={anaFilter.size}
                      onChange={(e) => setAnaFilter((p) => ({ ...p, size: e.target.value }))}>
                      <option value="">All Sizes</option>
                      {Array.from(new Set(anaData.map((r) => r.size))).sort().map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Filter Dept</label>
                    <select className="form-select w-32" value={anaFilter.dept}
                      onChange={(e) => setAnaFilter((p) => ({ ...p, dept: e.target.value }))}>
                      <option value="">All Depts</option>
                      {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setAnaFilter({ size: '', dept: '' })} className="btn-secondary mb-0.5">
                    <X size={13} /> Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Summary cards */}
          {anaData.length > 0 && (() => {
            const totalTimeLost = filteredAna.reduce((s, r) => s + Number(r.total_time_lost), 0);
            const totalRepeats  = filteredAna.reduce((s, r) => s + Number(r.total_repeats), 0);
            const uniqueReasons = new Set(filteredAna.map((r) => r.reason)).size;
            const topReason     = filteredAna[0];
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card bg-red-50 border border-red-200">
                  <p className="text-xs text-red-600 font-medium mb-1">Total Time Lost</p>
                  <p className="text-2xl font-bold text-red-700">{fmtMin(totalTimeLost)}</p>
                  <p className="text-xs text-red-500 mt-1">{MONTHS[parseInt(anaMonth) - 1]} {anaYear}</p>
                </div>
                <div className="card bg-orange-50 border border-orange-200">
                  <p className="text-xs text-orange-600 font-medium mb-1">Total Occurrences</p>
                  <p className="text-2xl font-bold text-orange-700">{totalRepeats}</p>
                  <p className="text-xs text-orange-500 mt-1">across {filteredAna.length} breakdown types</p>
                </div>
                <div className="card bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-600 font-medium mb-1">Unique Reasons</p>
                  <p className="text-2xl font-bold text-amber-700">{uniqueReasons}</p>
                </div>
                <div className="card bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-600 font-medium mb-1">Top Loss Reason</p>
                  <p className="text-sm font-bold text-slate-700 leading-tight">{topReason?.reason ?? '—'}</p>
                  {topReason && <p className="text-xs text-slate-500 mt-1">{fmtMin(Number(topReason.total_time_lost))} · {topReason.size}</p>}
                </div>
              </div>
            );
          })()}

          {/* Analysis table */}
          {anaLoading ? (
            <div className="flex justify-center py-10"><Spinner size={24} /></div>
          ) : anaData.length === 0 ? (
            <div className="card">
              <EmptyState icon={AlertTriangle} title="No data" description="Select a month and click Generate Analysis." />
            </div>
          ) : (
            <div className="card p-0">
              <div className="px-4 py-3 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-700">
                  Recurring Breakdown Reasons — {MONTHS[parseInt(anaMonth) - 1]} {anaYear}
                </p>
                <p className="text-xs text-slate-400">Sorted by total time lost. Showing {filteredAna.length} of {anaData.length} records.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="table-th">#</th>
                      <th className="table-th">Size</th>
                      <th className="table-th">Thickness</th>
                      <th className="table-th">Department</th>
                      <th className="table-th">Reason</th>
                      <th className="table-th text-right bg-red-50">Total Time Lost</th>
                      <th className="table-th text-right bg-orange-50">Occurrences</th>
                      <th className="table-th text-right bg-amber-50">Total Repeats</th>
                      <th className="table-th text-right">Days Affected</th>
                      <th className="table-th text-right">Max Single</th>
                      <th className="table-th">Mills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAna.map((r, idx) => (
                      <tr key={idx} className={`border-b border-slate-50 hover:bg-slate-50 ${Number(r.total_repeats) > 3 ? 'bg-red-50/30' : ''}`}>
                        <td className="table-td text-slate-400 font-medium">{idx + 1}</td>
                        <td className="table-td font-semibold">{r.size}</td>
                        <td className="table-td">{r.thickness}</td>
                        <td className="table-td">
                          <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                            r.department === 'Electrical' ? 'bg-yellow-100 text-yellow-800' :
                            r.department === 'Mechanical' ? 'bg-blue-100 text-blue-800' :
                            'bg-orange-100 text-orange-800'
                          }`}>{r.department}</span>
                        </td>
                        <td className="table-td">{r.reason}</td>
                        <td className="table-td text-right font-bold text-red-600 bg-red-50">
                          {fmtMin(Number(r.total_time_lost))}
                        </td>
                        <td className="table-td text-right bg-orange-50">
                          <span className={`font-bold ${Number(r.occurrence_count) > 2 ? 'text-red-600' : 'text-slate-600'}`}>
                            {r.occurrence_count}×
                          </span>
                        </td>
                        <td className="table-td text-right bg-amber-50">
                          <span className={`font-bold ${Number(r.total_repeats) > 3 ? 'text-red-600' : 'text-slate-600'}`}>
                            {r.total_repeats}
                          </span>
                        </td>
                        <td className="table-td text-right">{r.days_occurred} day{Number(r.days_occurred) > 1 ? 's' : ''}</td>
                        <td className="table-td text-right text-slate-500">{fmtMin(Number(r.max_single_time))}</td>
                        <td className="table-td">
                          <div className="flex flex-wrap gap-1">
                            {(r.mills_affected ?? []).map((m) => (
                              <span key={m} className="text-xs bg-slate-100 rounded px-1 py-0.5 font-mono">{m}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
