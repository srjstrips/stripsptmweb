'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Plus, Trash2, Zap, Search, AlertTriangle, RefreshCw, X, ChevronDown, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import {
  breakdownApi,
  BreakdownMillEntry,
  BreakdownReasonEntry,
  BreakdownAnalysisRow,
  SizeWiseSpeedRow,
  MillWiseSpeedRow,
  ProductionSizeRow,
} from '@/lib/api';
import { PIPE_SIZES, PIPE_THICKNESSES } from '@/lib/constants';

const MILLS = ['Mill1', 'Mill2', 'Mill3', 'Mill4'] as const;
const DEPTS = ['Electrical', 'Mechanical', 'Production'] as const;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type TabKey = 'time' | 'reasons' | 'speed' | 'analysis';

function n(v: string | number) { return parseFloat(String(v || '0')) || 0; }
function i(v: string | number) { return parseInt(String(v  || '0'), 10) || 0; }
function fmtMin(m: number) {
  if (!m) return '0 min';
  const h = Math.floor(m / 60); const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

interface SizeRow {
  size: string; thickness: string;
  time_on_size: string;
  prime_mt: string; random_mt: string;
  total_pieces: string; total_meters: string;
  _locked: boolean;
}

function makeSizeRow(p?: ProductionSizeRow): SizeRow {
  return {
    size:          p?.size      ?? '',
    thickness:     p?.thickness ?? '',
    time_on_size:  '',
    prime_mt:      p ? parseFloat(String(p.prime_mt)).toFixed(3)  : '',
    random_mt:     p ? parseFloat(String(p.random_mt)).toFixed(3) : '',
    total_pieces:  p ? String(p.total_pieces) : '',
    total_meters:  p ? parseFloat(String(p.total_meters)).toFixed(1) : '',
    _locked: !!p,
  };
}

interface ReasonRow {
  size: string; thickness: string;
  department: string; reason: string;
  time_taken: string; times_repeated: string;
  _locked: boolean;
}

function makeReasonRow(p?: ProductionSizeRow): ReasonRow {
  return {
    size: p?.size ?? '', thickness: p?.thickness ?? '',
    department: '', reason: '', time_taken: '', times_repeated: '1',
    _locked: !!p,
  };
}

export default function BreakdownPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('time');

  // ── Time & Speed tab ──────────────────────────────────────
  const [entryDate,  setEntryDate]  = useState(format(new Date(), 'yyyy-MM-dd'));
  const [entryMill,  setEntryMill]  = useState('');
  // Mill-level breakdown inputs
  const [totalTime,    setTotalTime]    = useState('1440');
  const [electricalBd, setElectricalBd] = useState('');
  const [mechanicalBd, setMechanicalBd] = useState('');
  const [rollChange,   setRollChange]   = useState('');
  const [productionBd, setProductionBd] = useState('');
  const [millNote,     setMillNote]     = useState('');
  // Size rows
  const [sizeRows,  setSizeRows]  = useState<SizeRow[]>([makeSizeRow()]);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [saving,    setSaving]    = useState(false);
  // Entries list
  const [entries,   setEntries]   = useState<BreakdownMillEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entryFilters, setEntryFilters] = useState({ date_from: '', date_to: '', mill_no: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Reasons tab ───────────────────────────────────────────
  const [reaDate, setReaDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reaMill, setReaMill] = useState('');
  const [reaRows, setReaRows] = useState<ReasonRow[]>([makeReasonRow()]);
  const [reaLoadingSizes, setReaLoadingSizes] = useState(false);
  const [reaSaving, setReaSaving] = useState(false);
  const [reaEntries, setReaEntries] = useState<BreakdownReasonEntry[]>([]);
  const [reaLoading, setReaLoading] = useState(false);
  const [reaFilters, setReaFilters] = useState({ date_from: '', date_to: '', mill_no: '', department: '' });

  // ── Speed Analysis tab ────────────────────────────────────
  const [spdFrom,   setSpdFrom]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [spdTo,     setSpdTo]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [spdMill,   setSpdMill]   = useState('');
  const [spdData,   setSpdData]   = useState<{ sizeWise: SizeWiseSpeedRow[]; millWise: MillWiseSpeedRow[] } | null>(null);
  const [spdLoading,setSpdLoading]= useState(false);
  const [spdView,   setSpdView]   = useState<'size' | 'mill'>('mill');

  // ── Monthly Analysis tab ──────────────────────────────────
  const [anaYear,  setAnaYear]  = useState(String(new Date().getFullYear()));
  const [anaMonth, setAnaMonth] = useState(String(new Date().getMonth() + 1));
  const [anaData,  setAnaData]  = useState<BreakdownAnalysisRow[]>([]);
  const [anaLoading, setAnaLoading] = useState(false);
  const [anaFilter, setAnaFilter] = useState({ size: '', dept: '' });

  // ── Computed mill-level values ────────────────────────────
  const totalBd    = i(electricalBd) + i(mechanicalBd) + i(rollChange) + i(productionBd);
  const availTime  = i(totalTime) - totalBd;
  const sumTimeOnSize = sizeRows.reduce((s, r) => s + i(r.time_on_size), 0);
  const timeBalance   = availTime - sumTimeOnSize;
  const totalMetersAll = sizeRows.reduce((s, r) => s + n(r.total_meters), 0);
  const millSpeed  = availTime > 0 && totalMetersAll > 0 ? totalMetersAll / availTime : 0;

  // ── Load sizes from production ────────────────────────────
  const loadSizes = useCallback(async () => {
    if (!entryDate || !entryMill) { toast.error('Select date and mill first'); return; }
    setLoadingSizes(true);
    try {
      const res = await breakdownApi.productionSizes(entryDate, entryMill);
      if (!res.data.data.length) {
        toast('No production entries for this mill on this date', { icon: '⚠️' });
        setSizeRows([makeSizeRow()]);
      } else {
        setSizeRows(res.data.data.map((p) => makeSizeRow(p)));
        toast.success(`Loaded ${res.data.data.length} size(s) from production`);
      }
    } catch { toast.error('Failed to load sizes'); }
    finally { setLoadingSizes(false); }
  }, [entryDate, entryMill]);

  const loadReaSizes = useCallback(async () => {
    if (!reaDate || !reaMill) { toast.error('Select date and mill first'); return; }
    setReaLoadingSizes(true);
    try {
      const res = await breakdownApi.productionSizes(reaDate, reaMill);
      if (!res.data.data.length) {
        toast('No production entries for this mill on this date', { icon: '⚠️' });
        setReaRows([makeReasonRow()]);
      } else {
        setReaRows(res.data.data.map((p) => makeReasonRow(p)));
        toast.success(`Loaded ${res.data.data.length} size(s)`);
      }
    } catch { toast.error('Failed to load sizes'); }
    finally { setReaLoadingSizes(false); }
  }, [reaDate, reaMill]);

  // ── Submit mill entry ─────────────────────────────────────
  const submitEntry = async () => {
    if (!entryMill) { toast.error('Select mill'); return; }
    const validSizes = sizeRows.filter((r) => r.size && r.thickness);
    if (!validSizes.length) { toast.error('Add at least one size row'); return; }
    if (timeBalance < 0) {
      toast.error(`Time on sizes (${sumTimeOnSize} min) exceeds available time (${availTime} min)`);
      return;
    }
    setSaving(true);
    try {
      await breakdownApi.saveEntry({
        date: entryDate, mill_no: entryMill,
        total_time:    i(totalTime),
        electrical_bd: i(electricalBd),
        mechanical_bd: i(mechanicalBd),
        roll_change:   i(rollChange),
        production_bd: i(productionBd),
        note: millNote || null,
        sizes: validSizes.map((r) => ({
          size: r.size, thickness: r.thickness,
          time_on_size:  i(r.time_on_size),
          prime_mt:      n(r.prime_mt),
          random_mt:     n(r.random_mt),
          total_pieces:  i(r.total_pieces),
          total_meters:  n(r.total_meters),
        })),
      });
      toast.success('Entry saved!');
      loadEntries();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  // ── Load entries list ─────────────────────────────────────
  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const params: Record<string, string> = {};
      if (entryFilters.date_from) params.date_from = entryFilters.date_from;
      if (entryFilters.date_to)   params.date_to   = entryFilters.date_to;
      if (entryFilters.mill_no)   params.mill_no   = entryFilters.mill_no;
      const res = await breakdownApi.listEntries(params);
      setEntries(res.data.data);
    } catch { toast.error('Failed to load entries'); }
    finally { setEntriesLoading(false); }
  }, [entryFilters]);

  // ── Submit reasons ────────────────────────────────────────
  const submitReasons = async () => {
    if (!reaMill) { toast.error('Select mill'); return; }
    const valid = reaRows.filter((r) => r.size && r.thickness && r.department && r.reason);
    if (!valid.length) { toast.error('Fill size, dept, and reason for at least one row'); return; }
    setReaSaving(true);
    try {
      const res = await breakdownApi.saveReasons(valid.map((r) => ({
        date: reaDate, mill_no: reaMill,
        size: r.size, thickness: r.thickness,
        department: r.department, reason: r.reason,
        time_taken:     i(r.time_taken),
        times_repeated: i(r.times_repeated) || 1,
      })));
      toast.success(`${res.data.count} reason(s) saved`);
      if (res.data.errors?.length) toast.error(`${res.data.errors.length} failed`);
      loadReaEntries();
    } catch { toast.error('Save failed'); }
    finally { setReaSaving(false); }
  };

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
    } catch { toast.error('Failed to load reasons'); }
    finally { setReaLoading(false); }
  }, [reaFilters]);

  // ── Load speed analysis ───────────────────────────────────
  const loadSpeedAnalysis = async () => {
    setSpdLoading(true);
    try {
      const params: Record<string, string> = {};
      if (spdFrom) params.date_from = spdFrom;
      if (spdTo)   params.date_to   = spdTo;
      if (spdMill) params.mill_no   = spdMill;
      const res = await breakdownApi.speedAnalysis(params);
      setSpdData(res.data);
    } catch { toast.error('Failed to load speed analysis'); }
    finally { setSpdLoading(false); }
  };

  // ── Load monthly analysis ─────────────────────────────────
  const loadAnalysis = async () => {
    setAnaLoading(true);
    try {
      const res = await breakdownApi.analysis(parseInt(anaYear), parseInt(anaMonth));
      setAnaData(res.data.data);
    } catch { toast.error('Failed to load analysis'); }
    finally { setAnaLoading(false); }
  };

  const filteredAna = anaData.filter((r) => {
    if (anaFilter.size && r.size !== anaFilter.size) return false;
    if (anaFilter.dept && r.department !== anaFilter.dept) return false;
    return true;
  });

  const setSize = (idx: number, val: string) =>
    setSizeRows((p) => p.map((r, i) => i === idx ? { ...r, size: val } : r));
  const setThick = (idx: number, val: string) =>
    setSizeRows((p) => p.map((r, i) => i === idx ? { ...r, thickness: val } : r));
  const setSizeField = (idx: number, key: keyof SizeRow, val: string) =>
    setSizeRows((p) => p.map((r, i) => i === idx ? { ...r, [key]: val } : r));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Breakdown Reports"
        subtitle="Mill-wise daily breakdown — size-wise & mill-wise speed analysis"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {([
          { key: 'time',     label: '⏱ Time & Speed Entry' },
          { key: 'reasons',  label: '🔧 Breakdown Reasons' },
          { key: 'speed',    label: '📈 Speed Analysis' },
          { key: 'analysis', label: '📊 Monthly Analysis' },
        ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 1 — Time & Speed Entry
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Zap size={16} className="text-amber-500" /> Daily Entry — Mill Breakdown & Size Speed
            </h2>

            {/* Step 1: Date + Mill */}
            <div className="p-3 bg-slate-50 rounded-lg mb-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Step 1 — Select Date & Mill</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Mill No. *</label>
                  <select className="form-select w-32" value={entryMill} onChange={(e) => setEntryMill(e.target.value)}>
                    <option value="">Select…</option>
                    {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <button onClick={loadSizes} disabled={loadingSizes || !entryDate || !entryMill} className="btn-secondary mb-0.5">
                  {loadingSizes ? <Spinner size={14} /> : <RefreshCw size={14} />}
                  {loadingSizes ? 'Loading…' : 'Load Sizes from Production'}
                </button>
                <p className="text-xs text-slate-400 mb-1 self-end">Auto-fills sizes that ran on this mill on the selected date.</p>
              </div>
            </div>

            {/* Step 2: Mill-level breakdown times */}
            <div className="p-3 bg-red-50 rounded-lg mb-4">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3">
                Step 2 — Mill Day Breakdown (shared across all sizes)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                <div>
                  <label className="form-label">Total Time (min)</label>
                  <input type="number" className="form-input" value={totalTime}
                    onChange={(e) => setTotalTime(e.target.value)} placeholder="1440" />
                </div>
                <div>
                  <label className="form-label">Electrical BD (min)</label>
                  <input type="number" className="form-input" value={electricalBd}
                    onChange={(e) => setElectricalBd(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">Mechanical BD (min)</label>
                  <input type="number" className="form-input" value={mechanicalBd}
                    onChange={(e) => setMechanicalBd(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">Roll Change (min)</label>
                  <input type="number" className="form-input" value={rollChange}
                    onChange={(e) => setRollChange(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">Production BD (min)</label>
                  <input type="number" className="form-input" value={productionBd}
                    onChange={(e) => setProductionBd(e.target.value)} placeholder="0" />
                </div>
              </div>

              {/* Mill-level auto-calc summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-red-100 rounded p-2 text-center">
                  <p className="text-xs text-red-600 font-medium">Total Breakdown</p>
                  <p className="text-lg font-bold text-red-700">{fmtMin(totalBd)}</p>
                </div>
                <div className="bg-green-100 rounded p-2 text-center">
                  <p className="text-xs text-green-600 font-medium">Available Time</p>
                  <p className="text-lg font-bold text-green-700">{fmtMin(availTime)}</p>
                </div>
                <div className={`rounded p-2 text-center ${
                  i(totalTime) > 0 ? ((availTime / i(totalTime)) * 100 >= 80 ? 'bg-green-100' : 'bg-amber-100') : 'bg-slate-100'
                }`}>
                  <p className="text-xs font-medium text-slate-600">Efficiency</p>
                  <p className="text-lg font-bold text-slate-700">
                    {i(totalTime) > 0 ? ((availTime / i(totalTime)) * 100).toFixed(1) + '%' : '—'}
                  </p>
                </div>
                <div className="bg-teal-100 rounded p-2 text-center">
                  <p className="text-xs text-teal-600 font-medium">Mill Speed (overall)</p>
                  <p className="text-lg font-bold text-teal-700">
                    {millSpeed > 0 ? millSpeed.toFixed(2) + ' MPM' : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: Size rows */}
            <div className="p-3 bg-blue-50 rounded-lg mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                  Step 3 — Size-wise Time & Production
                </p>
                {/* Time balance indicator */}
                <div className={`text-xs font-semibold px-2 py-1 rounded ${
                  timeBalance === 0 ? 'bg-green-100 text-green-700' :
                  timeBalance > 0  ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {timeBalance === 0 ? '✓ Time balanced' :
                   timeBalance > 0  ? `${timeBalance} min unallocated` :
                   `⚠ Over by ${Math.abs(timeBalance)} min`}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: 900 }}>
                  <thead>
                    <tr className="bg-blue-100 border-b border-blue-200">
                      <th className="px-2 py-2 text-left font-semibold text-slate-600">#</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-600">Size *</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-600">Thickness *</th>
                      <th className="px-2 py-2 text-left font-semibold text-blue-700">Time on Size (min) *</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-500">Prime MT</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-500">Random MT</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-500">Pieces</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-500">Meters</th>
                      <th className="px-2 py-2 text-center font-semibold text-teal-700 bg-teal-50">Size Speed MPM</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeRows.map((row, idx) => {
                      const sizeSpeed = i(row.time_on_size) > 0 && n(row.total_meters) > 0
                        ? n(row.total_meters) / i(row.time_on_size) : 0;
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                          <td className="px-2 py-1 text-slate-400 font-medium">{idx + 1}</td>
                          <td className="px-1 py-1" style={{ minWidth: 110 }}>
                            {row._locked
                              ? <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium">{row.size}</span>
                              : <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                                  value={row.size} onChange={(e) => setSize(idx, e.target.value)}>
                                  <option value="">Size…</option>
                                  {PIPE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>}
                          </td>
                          <td className="px-1 py-1" style={{ minWidth: 80 }}>
                            {row._locked
                              ? <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium">{row.thickness}</span>
                              : <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                                  value={row.thickness} onChange={(e) => setThick(idx, e.target.value)}>
                                  <option value="">Thick…</option>
                                  {PIPE_THICKNESSES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>}
                          </td>
                          <td className="px-1 py-1" style={{ minWidth: 110 }}>
                            <input type="number" className="w-full border-2 border-blue-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500 font-semibold"
                              value={row.time_on_size}
                              onChange={(e) => setSizeField(idx, 'time_on_size', e.target.value)}
                              placeholder="min" />
                          </td>
                          <td className="px-1 py-1" style={{ minWidth: 80 }}>
                            <input type="number" className={`w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 ${row._locked ? 'bg-slate-100 text-slate-500' : ''}`}
                              value={row.prime_mt} disabled={row._locked}
                              onChange={(e) => setSizeField(idx, 'prime_mt', e.target.value)} placeholder="0.000" />
                          </td>
                          <td className="px-1 py-1" style={{ minWidth: 80 }}>
                            <input type="number" className={`w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 ${row._locked ? 'bg-slate-100 text-slate-500' : ''}`}
                              value={row.random_mt} disabled={row._locked}
                              onChange={(e) => setSizeField(idx, 'random_mt', e.target.value)} placeholder="0.000" />
                          </td>
                          <td className="px-1 py-1" style={{ minWidth: 70 }}>
                            <input type="number" className={`w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 ${row._locked ? 'bg-slate-100 text-slate-500' : ''}`}
                              value={row.total_pieces} disabled={row._locked}
                              onChange={(e) => setSizeField(idx, 'total_pieces', e.target.value)} placeholder="0" />
                          </td>
                          <td className="px-1 py-1" style={{ minWidth: 80 }}>
                            <input type="number" className={`w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 ${row._locked ? 'bg-slate-100 text-slate-500' : ''}`}
                              value={row.total_meters} disabled={row._locked}
                              onChange={(e) => setSizeField(idx, 'total_meters', e.target.value)} placeholder="0.0" />
                          </td>
                          <td className="px-2 py-1 bg-teal-50 text-center" style={{ minWidth: 100 }}>
                            <span className={`font-bold text-sm ${sizeSpeed > 0 ? 'text-teal-700' : 'text-slate-300'}`}>
                              {sizeSpeed > 0 ? sizeSpeed.toFixed(2) + ' MPM' : '—'}
                            </span>
                          </td>
                          <td className="px-1 py-1">
                            <button type="button" disabled={sizeRows.length === 1}
                              onClick={() => setSizeRows((p) => p.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-600 disabled:opacity-30 p-0.5">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-blue-100 border-t border-blue-200 font-semibold text-xs">
                    <tr>
                      <td colSpan={3} className="px-2 py-1 text-slate-600">Total</td>
                      <td className={`px-2 py-1 font-bold ${timeBalance < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                        {sumTimeOnSize} / {availTime} min
                      </td>
                      <td className="px-2 py-1 text-blue-700">
                        {sizeRows.reduce((s, r) => s + n(r.prime_mt), 0).toFixed(3)}
                      </td>
                      <td className="px-2 py-1 text-blue-700">
                        {sizeRows.reduce((s, r) => s + n(r.random_mt), 0).toFixed(3)}
                      </td>
                      <td className="px-2 py-1 text-blue-700">
                        {sizeRows.reduce((s, r) => s + i(r.total_pieces), 0)}
                      </td>
                      <td className="px-2 py-1 text-blue-700">
                        {totalMetersAll.toFixed(1)}
                      </td>
                      <td className="px-2 py-1 bg-teal-50 text-center text-teal-700">
                        {millSpeed > 0 ? millSpeed.toFixed(2) + ' MPM' : '—'}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => setSizeRows((p) => [...p, makeSizeRow()])} className="btn-secondary text-sm">
                  <Plus size={14} /> Add Size Row
                </button>
              </div>
            </div>

            {/* Note + Submit */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-48">
                <label className="form-label">Note (optional)</label>
                <input type="text" className="form-input" value={millNote}
                  onChange={(e) => setMillNote(e.target.value)} placeholder="Any remark for this mill day…" />
              </div>
              <button onClick={submitEntry} disabled={saving} className="btn-primary">
                {saving ? <Spinner size={15} /> : <Zap size={15} />}
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>

          {/* Saved entries */}
          <div className="card p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-wrap gap-2">
              <p className="font-semibold text-slate-700 text-sm">Saved Entries</p>
              <div className="flex flex-wrap items-end gap-2">
                <input type="date" className="form-input text-xs py-1" value={entryFilters.date_from}
                  onChange={(e) => setEntryFilters((p) => ({ ...p, date_from: e.target.value }))} />
                <input type="date" className="form-input text-xs py-1" value={entryFilters.date_to}
                  onChange={(e) => setEntryFilters((p) => ({ ...p, date_to: e.target.value }))} />
                <select className="form-select text-xs py-1 w-28" value={entryFilters.mill_no}
                  onChange={(e) => setEntryFilters((p) => ({ ...p, mill_no: e.target.value }))}>
                  <option value="">All Mills</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={loadEntries} className="btn-primary text-xs py-1"><Search size={13} /> Load</button>
              </div>
            </div>

            {entriesLoading
              ? <div className="flex justify-center py-10"><Spinner size={24} /></div>
              : entries.length === 0
              ? <EmptyState icon={Zap} title="No entries" description="Save an entry above, then click Load." />
              : (
                <div className="divide-y divide-slate-100">
                  {entries.map((e) => {
                    const totalBdE = e.electrical_bd + e.mechanical_bd + e.roll_change + e.production_bd;
                    const availE   = e.total_time - totalBdE;
                    const effE     = e.total_time > 0 ? (availE / e.total_time * 100).toFixed(1) : '0';
                    const mSpd     = availE > 0 && n(e.total_meters_all) > 0 ? (n(e.total_meters_all) / availE).toFixed(2) : '—';
                    const expanded = expandedId === e.id;
                    return (
                      <div key={e.id}>
                        <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpandedId(expanded ? null : e.id)}>
                          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                          <span className="text-sm font-medium text-slate-700 w-28 shrink-0">
                            {format(new Date(e.date), 'dd MMM yyyy')}
                          </span>
                          <span className="text-xs bg-slate-100 rounded px-1.5 py-0.5 font-mono">{e.mill_no}</span>
                          <span className="text-xs text-slate-500">Total: {fmtMin(e.total_time)}</span>
                          <span className="text-xs text-red-600">BD: {fmtMin(totalBdE)}</span>
                          <span className="text-xs text-green-700 font-medium">Avail: {fmtMin(availE)}</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            parseFloat(effE) >= 80 ? 'bg-green-100 text-green-700' :
                            parseFloat(effE) >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                          }`}>{effE}%</span>
                          <span className="text-xs text-teal-700 font-bold ml-2">Mill: {mSpd} MPM</span>
                          <span className="text-xs text-slate-400 ml-auto">{e.sizes?.length ?? 0} size(s)</span>
                          <button onClick={(ev) => { ev.stopPropagation(); if (!confirm('Delete this entry?')) return; breakdownApi.deleteEntry(e.id).then(() => loadEntries()); }}
                            className="btn-danger py-1 px-2 ml-2"><Trash2 size={12} /></button>
                        </div>

                        {expanded && e.sizes && e.sizes.length > 0 && (
                          <div className="px-8 pb-3 bg-slate-50">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                  <th className="px-2 py-1 text-left">Size</th>
                                  <th className="px-2 py-1 text-left">Thick</th>
                                  <th className="px-2 py-1 text-right">Time on Size</th>
                                  <th className="px-2 py-1 text-right">Prime MT</th>
                                  <th className="px-2 py-1 text-right">Random MT</th>
                                  <th className="px-2 py-1 text-right">Pieces</th>
                                  <th className="px-2 py-1 text-right">Meters</th>
                                  <th className="px-2 py-1 text-right text-teal-700 font-semibold">Size Speed MPM</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.sizes.map((s) => {
                                  const sSp = s.time_on_size > 0 && n(s.total_meters) > 0
                                    ? (n(s.total_meters) / s.time_on_size).toFixed(2) : '—';
                                  return (
                                    <tr key={s.id} className="border-b border-slate-100">
                                      <td className="px-2 py-1 font-medium">{s.size}</td>
                                      <td className="px-2 py-1">{s.thickness}</td>
                                      <td className="px-2 py-1 text-right text-blue-700 font-semibold">{fmtMin(s.time_on_size)}</td>
                                      <td className="px-2 py-1 text-right">{parseFloat(String(s.prime_mt)).toFixed(3)}</td>
                                      <td className="px-2 py-1 text-right">{parseFloat(String(s.random_mt)).toFixed(3)}</td>
                                      <td className="px-2 py-1 text-right">{s.total_pieces}</td>
                                      <td className="px-2 py-1 text-right">{parseFloat(String(s.total_meters)).toFixed(1)} m</td>
                                      <td className="px-2 py-1 text-right font-bold text-teal-700">{sSp} {sSp !== '—' ? 'MPM' : ''}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
          <div className="card">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" /> Batch Entry — Breakdown Reasons
            </h2>
            <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
              <div>
                <label className="form-label">Date *</label>
                <input type="date" className="form-input" value={reaDate} onChange={(e) => setReaDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Mill No. *</label>
                <select className="form-select w-32" value={reaMill} onChange={(e) => setReaMill(e.target.value)}>
                  <option value="">Select…</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={loadReaSizes} disabled={reaLoadingSizes || !reaDate || !reaMill} className="btn-secondary mb-0.5">
                {reaLoadingSizes ? <Spinner size={14} /> : <RefreshCw size={14} />}
                {reaLoadingSizes ? 'Loading…' : 'Load Sizes from Production'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-2 py-2 text-left font-semibold text-slate-600">#</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600">Size *</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600">Thickness *</th>
                    <th className="px-2 py-2 text-left font-semibold text-orange-700 bg-orange-50">Department *</th>
                    <th className="px-2 py-2 text-left font-semibold text-orange-700 bg-orange-50">Reason *</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600">Time (min)</th>
                    <th className="px-2 py-2 text-left font-semibold text-slate-600">No. of Times</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {reaRows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-2 py-1 text-slate-400">{idx + 1}</td>
                      <td className="px-1 py-1" style={{ minWidth: 110 }}>
                        {row._locked
                          ? <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded font-medium">{row.size}</span>
                          : <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                              value={row.size} onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, size: e.target.value } : r))}>
                              <option value="">Size…</option>
                              {PIPE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>}
                      </td>
                      <td className="px-1 py-1" style={{ minWidth: 80 }}>
                        {row._locked
                          ? <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded font-medium">{row.thickness}</span>
                          : <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
                              value={row.thickness} onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, thickness: e.target.value } : r))}>
                              <option value="">Thick…</option>
                              {PIPE_THICKNESSES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>}
                      </td>
                      <td className="px-1 py-1 bg-orange-50" style={{ minWidth: 120 }}>
                        <select className="w-full border border-slate-200 rounded px-1 py-1 text-xs bg-orange-50 focus:outline-none"
                          value={row.department} onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, department: e.target.value } : r))}>
                          <option value="">Dept…</option>
                          {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1 bg-orange-50" style={{ minWidth: 200 }}>
                        <input type="text" className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs bg-orange-50 focus:outline-none"
                          value={row.reason} placeholder="Describe reason…"
                          onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, reason: e.target.value } : r))} />
                      </td>
                      <td className="px-1 py-1" style={{ minWidth: 90 }}>
                        <input type="number" className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                          value={row.time_taken} placeholder="0"
                          onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, time_taken: e.target.value } : r))} />
                      </td>
                      <td className="px-1 py-1" style={{ minWidth: 80 }}>
                        <input type="number" className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                          value={row.times_repeated} placeholder="1"
                          onChange={(e) => setReaRows((p) => p.map((r, i) => i === idx ? { ...r, times_repeated: e.target.value } : r))} />
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
            <div className="flex gap-3 mt-4">
              <button onClick={() => setReaRows((p) => [...p, makeReasonRow()])} className="btn-secondary text-sm">
                <Plus size={14} /> Add Row
              </button>
              <button onClick={submitReasons} disabled={reaSaving} className="btn-primary text-sm">
                {reaSaving ? <Spinner size={14} /> : <AlertTriangle size={14} />}
                {reaSaving ? 'Saving…' : `Submit All (${reaRows.length})`}
              </button>
            </div>
          </div>

          {/* Saved reasons */}
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
                <button onClick={loadReaEntries} className="btn-primary text-xs py-1"><Search size={13} /> Load</button>
              </div>
            </div>
            {reaLoading
              ? <div className="flex justify-center py-10"><Spinner size={24} /></div>
              : reaEntries.length === 0
              ? <EmptyState icon={AlertTriangle} title="No reasons saved" description="Add reasons above and click Load." />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="table-th">Date</th><th className="table-th">Mill</th>
                        <th className="table-th">Size</th><th className="table-th">Thickness</th>
                        <th className="table-th">Department</th><th className="table-th">Reason</th>
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
                              e.department === 'Mechanical' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                            }`}>{e.department}</span>
                          </td>
                          <td className="table-td">{e.reason}</td>
                          <td className="table-td text-right font-medium text-red-600">{e.time_taken} min</td>
                          <td className="table-td text-right">
                            <span className={`font-bold ${e.times_repeated > 1 ? 'text-red-600' : 'text-slate-500'}`}>{e.times_repeated}×</span>
                          </td>
                          <td className="table-td">
                            <button onClick={async () => { if (!confirm('Delete?')) return; await breakdownApi.deleteReason(e.id); loadReaEntries(); }}
                              className="btn-danger py-1 px-2"><Trash2 size={12} /></button>
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
          TAB 3 — Speed Analysis
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'speed' && (
        <div className="space-y-6">
          <div className="card">
            <p className="text-sm font-semibold text-slate-700 mb-3">Speed Analysis — Size-wise & Mill-wise</p>
            <div className="flex flex-wrap items-end gap-3">
              <div><label className="form-label">From</label>
                <input type="date" className="form-input" value={spdFrom} onChange={(e) => setSpdFrom(e.target.value)} /></div>
              <div><label className="form-label">To</label>
                <input type="date" className="form-input" value={spdTo} onChange={(e) => setSpdTo(e.target.value)} /></div>
              <div><label className="form-label">Mill</label>
                <select className="form-select w-32" value={spdMill} onChange={(e) => setSpdMill(e.target.value)}>
                  <option value="">All Mills</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select></div>
              <button onClick={loadSpeedAnalysis} disabled={spdLoading} className="btn-primary mb-0.5">
                {spdLoading ? <Spinner size={14} /> : <Search size={14} />}
                {spdLoading ? 'Loading…' : 'Generate'}
              </button>
            </div>
          </div>

          {spdData && (
            <>
              <div className="flex gap-2">
                <button onClick={() => setSpdView('mill')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${spdView === 'mill' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                  Mill-wise Speed
                </button>
                <button onClick={() => setSpdView('size')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${spdView === 'size' ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                  Size-wise Speed
                </button>
              </div>

              {spdView === 'mill' && (
                <div className="card p-0">
                  <div className="px-4 py-3 border-b border-slate-200">
                    <p className="text-sm font-semibold text-slate-700">Mill-wise Speed (overall per day)</p>
                    <p className="text-xs text-slate-400">Speed = Total meters produced ÷ Available time for the mill</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="table-th">Date</th><th className="table-th">Mill</th>
                          <th className="table-th text-right">Total Time</th>
                          <th className="table-th text-right bg-red-50">Total BD</th>
                          <th className="table-th text-right bg-green-50">Available</th>
                          <th className="table-th text-right bg-green-50">Efficiency</th>
                          <th className="table-th text-right">Total Meters</th>
                          <th className="table-th text-right">Pieces</th>
                          <th className="table-th text-right bg-teal-50">Mill Speed MPM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spdData.millWise.map((r, idx) => (
                          <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="table-td whitespace-nowrap">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                            <td className="table-td"><span className="text-xs bg-slate-100 rounded px-1.5 py-0.5 font-mono">{r.mill_no}</span></td>
                            <td className="table-td text-right">{fmtMin(r.total_time)}</td>
                            <td className="table-td text-right text-red-600 bg-red-50">{fmtMin(r.total_bd)}</td>
                            <td className="table-td text-right text-green-700 font-medium bg-green-50">{fmtMin(r.available_time)}</td>
                            <td className={`table-td text-right font-bold bg-green-50 ${
                              n(r.efficiency_pct) >= 80 ? 'text-green-700' : n(r.efficiency_pct) >= 60 ? 'text-amber-700' : 'text-red-600'
                            }`}>{n(r.efficiency_pct).toFixed(1)}%</td>
                            <td className="table-td text-right">{n(r.total_meters).toFixed(1)} m</td>
                            <td className="table-td text-right">{r.total_pieces}</td>
                            <td className="table-td text-right font-bold text-teal-700 bg-teal-50 text-base">
                              {n(r.mill_speed_mpm) > 0 ? n(r.mill_speed_mpm).toFixed(2) + ' MPM' : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {spdView === 'size' && (
                <div className="card p-0">
                  <div className="px-4 py-3 border-b border-slate-200">
                    <p className="text-sm font-semibold text-slate-700">Size-wise Speed (per size per mill per day)</p>
                    <p className="text-xs text-slate-400">Speed = Meters produced for that size ÷ Time allocated to that size</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="table-th">Date</th><th className="table-th">Mill</th>
                          <th className="table-th">Size</th><th className="table-th">Thickness</th>
                          <th className="table-th text-right bg-blue-50">Time on Size</th>
                          <th className="table-th text-right">Meters</th>
                          <th className="table-th text-right">Pieces</th>
                          <th className="table-th text-right">Prime MT</th>
                          <th className="table-th text-right">Random MT</th>
                          <th className="table-th text-right bg-teal-50">Size Speed MPM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spdData.sizeWise.map((r, idx) => (
                          <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="table-td whitespace-nowrap">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                            <td className="table-td"><span className="text-xs bg-slate-100 rounded px-1.5 py-0.5 font-mono">{r.mill_no}</span></td>
                            <td className="table-td font-medium">{r.size}</td>
                            <td className="table-td">{r.thickness}</td>
                            <td className="table-td text-right text-blue-700 font-medium bg-blue-50">{fmtMin(r.time_on_size)}</td>
                            <td className="table-td text-right">{n(r.total_meters).toFixed(1)} m</td>
                            <td className="table-td text-right">{r.total_pieces}</td>
                            <td className="table-td text-right">{n(r.prime_mt).toFixed(3)}</td>
                            <td className="table-td text-right">{n(r.random_mt).toFixed(3)}</td>
                            <td className="table-td text-right font-bold text-teal-700 bg-teal-50 text-base">
                              {n(r.speed_mpm) > 0 ? n(r.speed_mpm).toFixed(2) + ' MPM' : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {!spdData && !spdLoading && (
            <div className="card">
              <EmptyState icon={Zap} title="No data" description="Select a date range and click Generate." />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 4 — Monthly Analysis
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          <div className="card">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <ChevronDown size={15} className="text-blue-600" /> Monthly Breakdown Reason Analysis
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div><label className="form-label">Month</label>
                <select className="form-select w-32" value={anaMonth} onChange={(e) => setAnaMonth(e.target.value)}>
                  {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                </select></div>
              <div><label className="form-label">Year</label>
                <input type="number" className="form-input w-24" value={anaYear}
                  onChange={(e) => setAnaYear(e.target.value)} min="2020" max="2099" /></div>
              <button onClick={loadAnalysis} disabled={anaLoading} className="btn-primary mb-0.5">
                {anaLoading ? <Spinner size={14} /> : <Search size={14} />}
                {anaLoading ? 'Loading…' : 'Generate'}
              </button>
              {anaData.length > 0 && (
                <>
                  <div className="ml-2"><label className="form-label">Filter Size</label>
                    <select className="form-select w-36" value={anaFilter.size}
                      onChange={(e) => setAnaFilter((p) => ({ ...p, size: e.target.value }))}>
                      <option value="">All Sizes</option>
                      {Array.from(new Set(anaData.map((r) => r.size))).sort().map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select></div>
                  <div><label className="form-label">Filter Dept</label>
                    <select className="form-select w-32" value={anaFilter.dept}
                      onChange={(e) => setAnaFilter((p) => ({ ...p, dept: e.target.value }))}>
                      <option value="">All Depts</option>
                      {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select></div>
                  <button onClick={() => setAnaFilter({ size: '', dept: '' })} className="btn-secondary mb-0.5">
                    <X size={13} /> Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {anaData.length > 0 && (() => {
            const totalTimeLost = filteredAna.reduce((s, r) => s + Number(r.total_time_lost), 0);
            const totalRepeats  = filteredAna.reduce((s, r) => s + Number(r.total_repeats), 0);
            const topReason     = filteredAna[0];
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card bg-red-50 border border-red-200">
                  <p className="text-xs text-red-600 font-medium mb-1">Total Time Lost</p>
                  <p className="text-2xl font-bold text-red-700">{fmtMin(totalTimeLost)}</p>
                </div>
                <div className="card bg-orange-50 border border-orange-200">
                  <p className="text-xs text-orange-600 font-medium mb-1">Total Occurrences</p>
                  <p className="text-2xl font-bold text-orange-700">{totalRepeats}</p>
                </div>
                <div className="card bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-600 font-medium mb-1">Unique Reasons</p>
                  <p className="text-2xl font-bold text-amber-700">{new Set(filteredAna.map((r) => r.reason)).size}</p>
                </div>
                <div className="card bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-600 font-medium mb-1">Top Loss Reason</p>
                  <p className="text-sm font-bold text-slate-700 leading-tight">{topReason?.reason ?? '—'}</p>
                  {topReason && <p className="text-xs text-slate-500 mt-1">{fmtMin(Number(topReason.total_time_lost))} · {topReason.size}</p>}
                </div>
              </div>
            );
          })()}

          {anaLoading
            ? <div className="flex justify-center py-10"><Spinner size={24} /></div>
            : anaData.length === 0
            ? <div className="card"><EmptyState icon={AlertTriangle} title="No data" description="Select a month and click Generate." /></div>
            : (
              <div className="card p-0">
                <div className="px-4 py-3 border-b border-slate-200">
                  <p className="text-sm font-semibold text-slate-700">Recurring Reasons — {MONTHS[parseInt(anaMonth) - 1]} {anaYear}</p>
                  <p className="text-xs text-slate-400">Sorted by total time lost. {filteredAna.length} records.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="table-th">#</th><th className="table-th">Size</th>
                        <th className="table-th">Thickness</th><th className="table-th">Department</th>
                        <th className="table-th">Reason</th>
                        <th className="table-th text-right bg-red-50">Time Lost</th>
                        <th className="table-th text-right bg-orange-50">Occurrences</th>
                        <th className="table-th text-right bg-amber-50">Total Repeats</th>
                        <th className="table-th text-right">Days</th>
                        <th className="table-th text-right">Max Single</th>
                        <th className="table-th">Mills</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAna.map((r, idx) => (
                        <tr key={idx} className={`border-b border-slate-50 hover:bg-slate-50 ${Number(r.total_repeats) > 3 ? 'bg-red-50/30' : ''}`}>
                          <td className="table-td text-slate-400">{idx + 1}</td>
                          <td className="table-td font-semibold">{r.size}</td>
                          <td className="table-td">{r.thickness}</td>
                          <td className="table-td">
                            <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                              r.department === 'Electrical' ? 'bg-yellow-100 text-yellow-800' :
                              r.department === 'Mechanical' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                            }`}>{r.department}</span>
                          </td>
                          <td className="table-td">{r.reason}</td>
                          <td className="table-td text-right font-bold text-red-600 bg-red-50">{fmtMin(Number(r.total_time_lost))}</td>
                          <td className="table-td text-right bg-orange-50">
                            <span className={`font-bold ${Number(r.occurrence_count) > 2 ? 'text-red-600' : 'text-slate-600'}`}>{r.occurrence_count}×</span>
                          </td>
                          <td className="table-td text-right bg-amber-50">
                            <span className={`font-bold ${Number(r.total_repeats) > 3 ? 'text-red-600' : 'text-slate-600'}`}>{r.total_repeats}</span>
                          </td>
                          <td className="table-td text-right">{r.days_occurred}d</td>
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
