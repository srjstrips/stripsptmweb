'use client';

import { useEffect, useState, useCallback, ChangeEvent, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Factory, Filter, Download, BarChart3, Pencil, X, Upload } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import Spinner from '@/components/Spinner';
import { productionApi, racksApi, ProductionEntry, MillSummaryRow, Rack } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { PIPE_SIZES, PIPE_THICKNESSES, STANDARD_LENGTH } from '@/lib/constants';

const SHIFTS = ['Day', 'Night'] as const;
const MILLS  = ['Mill1', 'Mill2', 'Mill3', 'Mill4'] as const;

const EMPTY_FORM = {
  date:               format(new Date(), 'yyyy-MM-dd'),
  shift:              '' as string,
  mill_no:            '' as string,
  // Product
  size:               '',
  thickness:          '',
  length:             STANDARD_LENGTH,
  customLength:       '',
  od:                 '',
  // Additional
  weight_per_pipe:    '',
  stamp:              '',
  raw_material_grade: '',
  // Prime
  prime_tonnage:      '',
  prime_pieces:       '',
  // Joint
  joint_pipes:        '',
  joint_tonnage:      '',
  // CQ
  cq_pipes:           '',
  cq_tonnage:         '',
  // Open
  open_pipes:         '',
  open_tonnage:       '',
  // Scrap KG
  scrap_endcut_kg:    '',
  scrap_bitcut_kg:    '',
  scrap_burning_kg:   '',
  // Quality
  rejection_percent:  '',
  // Optional
  rack_id:            '',
};

type FormState = typeof EMPTY_FORM;

function n(v: string) { return parseFloat(v || '0') || 0; }
function i(v: string) { return parseInt(v  || '0', 10) || 0; }

export default function ProductionPage() {
  const [entries, setEntries]       = useState<ProductionEntry[]>([]);
  const [racks, setRacks]           = useState<Rack[]>([]);
  const [millSummary, setMillSummary] = useState<MillSummaryRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [activeTab, setActiveTab]   = useState<'entries' | 'mill-summary'>('entries');
  const [form, setForm]             = useState<FormState>({ ...EMPTY_FORM });
  const [filters, setFilters]       = useState({ size: '', mill_no: '', shift: '', date_from: '', date_to: '' });
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  // Tracks whether scrap has already been entered for the selected date+shift
  const [scrapEnteredForShift, setScrapEnteredForShift] = useState(false);
  // null = new entry, uuid = editing existing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const loadEntries = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 50 };
      if (filters.size)      params.size      = filters.size;
      if (filters.mill_no)   params.mill_no   = filters.mill_no;
      if (filters.shift)     params.shift     = filters.shift;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const res = await productionApi.list(params);
      setEntries(res.data.data);
      setPagination({ page, total: res.data.pagination.total, pages: res.data.pagination.pages });
    } catch {
      toast.error('Failed to load production entries');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadMillSummary = useCallback(async () => {
    try {
      const res = await productionApi.millSummary();
      setMillSummary(res.data.data);
    } catch {
      toast.error('Failed to load mill summary');
    }
  }, []);

  useEffect(() => {
    loadEntries();
    racksApi.list().then((r) => setRacks(r.data.data)).catch(() => {});
  }, [loadEntries]);

  useEffect(() => {
    if (activeTab === 'mill-summary') loadMillSummary();
  }, [activeTab, loadMillSummary]);

  // ── Check if scrap already recorded for selected date+shift ──
  // Excludes the entry currently being edited so it can still edit its own scrap.
  useEffect(() => {
    if (!form.date || !form.shift) {
      setScrapEnteredForShift(false);
      return;
    }
    productionApi
      .list({ date_from: form.date, date_to: form.date, shift: form.shift, limit: 200 })
      .then((res) => {
        const hasScrap = res.data.data
          .filter((e) => e.id !== editingId)
          .some(
            (e) =>
              (parseFloat(String(e.scrap_endcut_kg))  || 0) > 0 ||
              (parseFloat(String(e.scrap_bitcut_kg))  || 0) > 0 ||
              (parseFloat(String(e.scrap_burning_kg)) || 0) > 0
          );
        setScrapEnteredForShift(hasScrap);
      })
      .catch(() => setScrapEnteredForShift(false));
  }, [form.date, form.shift, editingId]);

  // ── Derived auto-calc values ──────────────────────────────
  const calc = {
    random_pipes:   i(form.joint_pipes)   + i(form.cq_pipes)    + i(form.open_pipes),
    random_tonnage: n(form.joint_tonnage) + n(form.cq_tonnage)  + n(form.open_tonnage),
    total_pipes:    i(form.prime_pieces)  + i(form.joint_pipes) + i(form.cq_pipes)    + i(form.open_pipes),
    total_tonnage:  n(form.prime_tonnage) + n(form.joint_tonnage) + n(form.cq_tonnage) + n(form.open_tonnage),
    total_scrap_kg: n(form.scrap_endcut_kg) + n(form.scrap_bitcut_kg) + n(form.scrap_burning_kg),
  };

  const effectiveLength = form.length === 'Custom' ? form.customLength : form.length;

  const field = (key: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));

  const buildPayload = () => ({
    date:               form.date,
    shift:              form.shift as 'Day' | 'Night',
    mill_no:            form.mill_no as 'Mill1' | 'Mill2' | 'Mill3' | 'Mill4',
    size:               form.size,
    thickness:          form.thickness,
    length:             effectiveLength,
    od:                 form.od || undefined,
    weight_per_pipe:    form.weight_per_pipe ? n(form.weight_per_pipe) : undefined,
    stamp:              form.stamp || undefined,
    raw_material_grade: form.raw_material_grade || undefined,
    prime_tonnage:      n(form.prime_tonnage),
    prime_pieces:       i(form.prime_pieces),
    joint_pipes:        i(form.joint_pipes),
    joint_tonnage:      n(form.joint_tonnage),
    cq_pipes:           i(form.cq_pipes),
    cq_tonnage:         n(form.cq_tonnage),
    open_pipes:         i(form.open_pipes),
    open_tonnage:       n(form.open_tonnage),
    scrap_endcut_kg:    scrapEnteredForShift ? 0 : n(form.scrap_endcut_kg),
    scrap_bitcut_kg:    scrapEnteredForShift ? 0 : n(form.scrap_bitcut_kg),
    scrap_burning_kg:   scrapEnteredForShift ? 0 : n(form.scrap_burning_kg),
    rejection_percent:  n(form.rejection_percent),
    rack_id:            form.rack_id || undefined,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!effectiveLength) { toast.error('Please enter the custom length'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        await productionApi.update(editingId, buildPayload());
        toast.success('Entry updated!');
      } else {
        await productionApi.create(buildPayload());
        toast.success('Entry saved!');
      }
      // Reset form but keep it open for the next entry
      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      loadEntries();
      if (activeTab === 'mill-summary') loadMillSummary();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { errors?: { message: string }[]; message?: string } } };
      const msg = ex?.response?.data?.errors?.[0]?.message
        ?? ex?.response?.data?.message
        ?? 'Failed to save';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (entry: ProductionEntry) => {
    setForm({
      date:               entry.date?.slice(0, 10) ?? '',
      shift:              entry.shift ?? '',
      mill_no:            entry.mill_no ?? '',
      size:               entry.size,
      thickness:          entry.thickness,
      length:             entry.length === '6m' || entry.length === '' ? (entry.length || STANDARD_LENGTH) : 'Custom',
      customLength:       entry.length !== '6m' && entry.length !== '' ? entry.length : '',
      od:                 entry.od ?? '',
      weight_per_pipe:    entry.weight_per_pipe != null ? String(entry.weight_per_pipe) : '',
      stamp:              entry.stamp ?? '',
      raw_material_grade: entry.raw_material_grade ?? '',
      prime_tonnage:      String(entry.prime_tonnage ?? ''),
      prime_pieces:       String(entry.prime_pieces ?? ''),
      joint_pipes:        String(entry.joint_pipes ?? ''),
      joint_tonnage:      String(entry.joint_tonnage ?? ''),
      cq_pipes:           String(entry.cq_pipes ?? ''),
      cq_tonnage:         String(entry.cq_tonnage ?? ''),
      open_pipes:         String(entry.open_pipes ?? ''),
      open_tonnage:       String(entry.open_tonnage ?? ''),
      scrap_endcut_kg:    String(entry.scrap_endcut_kg ?? ''),
      scrap_bitcut_kg:    String(entry.scrap_bitcut_kg ?? ''),
      scrap_burning_kg:   String(entry.scrap_burning_kg ?? ''),
      rejection_percent:  String(entry.rejection_percent ?? ''),
      rack_id:            entry.rack_id ?? '',
    });
    setEditingId(entry.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this production entry? This will reverse the stock update.')) return;
    try {
      await productionApi.delete(id);
      toast.success('Entry deleted');
      loadEntries();
      loadMillSummary();
    } catch {
      toast.error('Failed to delete entry');
    }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(entries.map((e) => ({
      Date: e.date, Shift: e.shift, Mill: e.mill_no,
      Size: e.size, Thickness: e.thickness, Length: e.length,
      'Weight/Pipe': e.weight_per_pipe, Stamp: e.stamp, 'RM Grade': e.raw_material_grade,
      'Prime Pcs': e.prime_pieces, 'Prime MT': e.prime_tonnage,
      'Joint Pcs': e.joint_pipes, 'Joint MT': e.joint_tonnage,
      'CQ Pcs': e.cq_pipes, 'CQ MT': e.cq_tonnage,
      'Open Pcs': e.open_pipes, 'Open MT': e.open_tonnage,
      'Random Pcs': e.random_pipes, 'Random MT': e.random_tonnage,
      'Total Pcs': e.total_pipes, 'Total MT': e.total_tonnage,
      'Endcut Scrap (kg)': e.scrap_endcut_kg,
      'Bitcut Scrap (kg)': e.scrap_bitcut_kg,
      'Burning Scrap (kg)': e.scrap_burning_kg,
      'Total Scrap (kg)': e.total_scrap_kg,
      'Rejection %': e.rejection_percent,
      Rack: e.rack_name,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production');
    XLSX.writeFile(wb, `production_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const totals = entries.reduce(
    (acc, e) => ({
      total_tonnage: acc.total_tonnage + n(String(e.total_tonnage)),
      total_pipes:   acc.total_pipes   + (e.total_pipes || 0),
      total_scrap:   acc.total_scrap   + n(String(e.total_scrap_kg)),
    }),
    { total_tonnage: 0, total_pipes: 0, total_scrap: 0 }
  );

  // Group mill summary by mill for display
  const millGroups = millSummary.reduce<Record<string, MillSummaryRow[]>>((acc, row) => {
    if (!acc[row.mill_no]) acc[row.mill_no] = [];
    acc[row.mill_no].push(row);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Production Entries"
        subtitle={`${pagination.total} total records`}
        actions={
          <>
            <button onClick={exportExcel} className="btn-secondary"><Download size={15} /> Export</button>
            <button onClick={() => setShowImport(true)} className="btn-secondary"><Upload size={15} /> Import CSV</button>
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...EMPTY_FORM }); }} className="btn-primary"><Plus size={15} /> New Entry</button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total MT (page)"   value={totals.total_tonnage.toFixed(3)} sub={`${totals.total_pipes} pipes`} icon={Factory} color="blue" />
        <StatCard label="Total Scrap (kg)"  value={totals.total_scrap.toFixed(1)}   icon={Factory} color="red" />
        <StatCard label="Total Records"     value={pagination.total}                 icon={Factory} color="slate" />
        <StatCard label="Mills Active"      value={new Set(entries.map(e => e.mill_no).filter(Boolean)).size} icon={BarChart3} color="amber" />
      </div>

      {/* ── Entry Form ──────────────────────────────────────── */}
      {showForm && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <Factory size={16} /> {editingId ? 'Edit Production Entry' : 'New Production Entry'}
            </h2>
            <button type="button" onClick={handleCancelForm} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Section: Basic */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">Basic</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-input" value={form.date} onChange={field('date')} required />
                </div>
                <div>
                  <label className="form-label">Shift *</label>
                  <select className="form-select" value={form.shift} onChange={field('shift')} required>
                    <option value="">Select shift…</option>
                    {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Mill No. *</label>
                  <select className="form-select" value={form.mill_no} onChange={field('mill_no')} required>
                    <option value="">Select mill…</option>
                    {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Product (size/thickness/length untouched) */}
            <div className="p-3 bg-indigo-50 rounded-lg">
              <p className="text-xs font-bold text-indigo-700 mb-3 uppercase tracking-wide">Product</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">Pipe Size *</label>
                  <select className="form-select" value={form.size} onChange={field('size')} required>
                    <option value="">Select size…</option>
                    {PIPE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Thickness (mm) *</label>
                  <select className="form-select" value={form.thickness} onChange={field('thickness')} required>
                    <option value="">Select…</option>
                    {PIPE_THICKNESSES.map((t) => <option key={t} value={t}>{t} mm</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Length *</label>
                  <select className="form-select" value={form.length} onChange={field('length')} required>
                    <option value="6m">6 m (Standard)</option>
                    <option value="Custom">Custom…</option>
                  </select>
                </div>
                {form.length === 'Custom' ? (
                  <div>
                    <label className="form-label">Custom Length *</label>
                    <input className="form-input" value={form.customLength} onChange={field('customLength')}
                      placeholder="e.g. 5.4m" required />
                  </div>
                ) : (
                  <div>
                    <label className="form-label">OD</label>
                    <input className="form-input" value={form.od} onChange={field('od')} placeholder="e.g. 88.9mm" />
                  </div>
                )}
              </div>
            </div>

            {/* Section: Additional Details */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">Additional Details</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Weight per Pipe (tons)</label>
                  <input type="number" step="0.0001" min="0" className="form-input"
                    value={form.weight_per_pipe} onChange={field('weight_per_pipe')} placeholder="0.0000" />
                </div>
                <div>
                  <label className="form-label">Stamp</label>
                  <input className="form-input" value={form.stamp} onChange={field('stamp')} placeholder="e.g. IS1239" />
                </div>
                <div>
                  <label className="form-label">Raw Material Grade</label>
                  <input className="form-input" value={form.raw_material_grade} onChange={field('raw_material_grade')}
                    placeholder="e.g. IS2062 E250" />
                </div>
              </div>
            </div>

            {/* Section: Prime */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs font-bold text-blue-700 mb-3 uppercase tracking-wide">Prime</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Pipes *</label>
                  <input type="number" min="0" className="form-input"
                    value={form.prime_pieces} onChange={field('prime_pieces')} required placeholder="0" />
                </div>
                <div>
                  <label className="form-label">Tonnage (MT) *</label>
                  <input type="number" step="0.001" min="0" className="form-input"
                    value={form.prime_tonnage} onChange={field('prime_tonnage')} required placeholder="0.000" />
                </div>
              </div>
            </div>

            {/* Section: Joint / CQ / Open */}
            <div className="p-3 bg-amber-50 rounded-lg">
              <p className="text-xs font-bold text-amber-700 mb-3 uppercase tracking-wide">Random (Joint · CQ · Open)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([
                  { label: 'Joint', pKey: 'joint_pipes' as const, tKey: 'joint_tonnage' as const },
                  { label: 'CQ',    pKey: 'cq_pipes'    as const, tKey: 'cq_tonnage'    as const },
                  { label: 'Open',  pKey: 'open_pipes'  as const, tKey: 'open_tonnage'  as const },
                ]).map(({ label, pKey, tKey }) => (
                  <div key={pKey} className="space-y-2">
                    <p className="text-xs font-semibold text-amber-600">{label}</p>
                    <div>
                      <label className="form-label">Pipes</label>
                      <input type="number" min="0" className="form-input"
                        value={form[pKey]} onChange={field(pKey)} placeholder="0" />
                    </div>
                    <div>
                      <label className="form-label">Tonnage (MT)</label>
                      <input type="number" step="0.001" min="0" className="form-input"
                        value={form[tKey]} onChange={field(tKey)} placeholder="0.000" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Auto-calc: Random totals */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="bg-amber-100 rounded p-2 text-center">
                  <p className="text-xs text-amber-600 font-medium">Random Pipes (auto)</p>
                  <p className="text-lg font-bold text-amber-800">{calc.random_pipes}</p>
                </div>
                <div className="bg-amber-100 rounded p-2 text-center">
                  <p className="text-xs text-amber-600 font-medium">Random Tonnage (auto)</p>
                  <p className="text-lg font-bold text-amber-800">{calc.random_tonnage.toFixed(3)} MT</p>
                </div>
              </div>
            </div>

            {/* Auto-calc: Grand totals */}
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-xs font-bold text-green-700 mb-3 uppercase tracking-wide">Total Production (auto-calculated)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-100 rounded p-3 text-center">
                  <p className="text-xs text-green-600 font-medium">Total Pipes</p>
                  <p className="text-2xl font-bold text-green-800">{calc.total_pipes}</p>
                </div>
                <div className="bg-green-100 rounded p-3 text-center">
                  <p className="text-xs text-green-600 font-medium">Total Tonnage</p>
                  <p className="text-2xl font-bold text-green-800">{calc.total_tonnage.toFixed(3)} MT</p>
                </div>
              </div>
            </div>

            {/* Section: Scrap */}
            {scrapEnteredForShift ? (
              <div className="p-3 bg-slate-100 rounded-lg border border-slate-300 flex items-center gap-3">
                <span className="text-slate-400 text-lg">🚫</span>
                <div>
                  <p className="text-sm font-semibold text-slate-600">Scrap already recorded for this shift</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Scrap is entered only once per shift ({form.shift}, {form.date}). This entry will be saved without scrap.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs font-bold text-red-700 mb-3 uppercase tracking-wide">Scrap (KG)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="form-label">Endcut (kg)</label>
                    <input type="number" step="0.001" min="0" className="form-input"
                      value={form.scrap_endcut_kg} onChange={field('scrap_endcut_kg')} placeholder="0.000" />
                  </div>
                  <div>
                    <label className="form-label">Bitcut (kg)</label>
                    <input type="number" step="0.001" min="0" className="form-input"
                      value={form.scrap_bitcut_kg} onChange={field('scrap_bitcut_kg')} placeholder="0.000" />
                  </div>
                  <div>
                    <label className="form-label">Burning (kg)</label>
                    <input type="number" step="0.001" min="0" className="form-input"
                      value={form.scrap_burning_kg} onChange={field('scrap_burning_kg')} placeholder="0.000" />
                  </div>
                </div>
                <div className="mt-3 bg-red-100 rounded p-2 text-center">
                  <p className="text-xs text-red-600 font-medium">Total Scrap KG (auto)</p>
                  <p className="text-lg font-bold text-red-800">{calc.total_scrap_kg.toFixed(3)} kg</p>
                </div>
              </div>
            )}

            {/* Section: Quality */}
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-xs font-bold text-purple-700 mb-3 uppercase tracking-wide">Quality</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">Rejection %</label>
                  <input type="number" step="0.01" min="0" max="100" className="form-input"
                    value={form.rejection_percent} onChange={field('rejection_percent')} placeholder="0.00" />
                </div>
              </div>
            </div>

            {/* Optional: Rack */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">Storage (Optional)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">Rack</label>
                  <select className="form-select" value={form.rack_id} onChange={field('rack_id')}>
                    <option value="">No rack</option>
                    {racks.map((r) => (
                      <option key={r.id} value={r.id}>{r.rack_name} — {r.location}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Spinner size={15} /> : <Plus size={15} />}
                {submitting ? 'Saving…' : 'Save Entry'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleCancelForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'entries'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('entries')}
        >
          Entries
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'mill-summary'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('mill-summary')}
        >
          <BarChart3 size={14} /> Mill Summary
        </button>
      </div>

      {activeTab === 'entries' && (
        <>
          {/* ── Filters ─────────────────────────────────────── */}
          <div className="card mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <Filter size={15} className="text-slate-400 mt-5" />
              <div>
                <label className="form-label">Size</label>
                <select className="form-select w-36" value={filters.size}
                  onChange={(e) => setFilters((p) => ({ ...p, size: e.target.value }))}>
                  <option value="">All sizes</option>
                  {PIPE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Mill</label>
                <select className="form-select w-28" value={filters.mill_no}
                  onChange={(e) => setFilters((p) => ({ ...p, mill_no: e.target.value }))}>
                  <option value="">All mills</option>
                  {MILLS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Shift</label>
                <select className="form-select w-28" value={filters.shift}
                  onChange={(e) => setFilters((p) => ({ ...p, shift: e.target.value }))}>
                  <option value="">All shifts</option>
                  {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">From</label>
                <input type="date" className="form-input" value={filters.date_from}
                  onChange={(e) => setFilters((p) => ({ ...p, date_from: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">To</label>
                <input type="date" className="form-input" value={filters.date_to}
                  onChange={(e) => setFilters((p) => ({ ...p, date_to: e.target.value }))} />
              </div>
              <button className="btn-primary mb-0.5" onClick={() => loadEntries(1)}>Apply</button>
              <button className="btn-secondary mb-0.5"
                onClick={() => setFilters({ size: '', mill_no: '', shift: '', date_from: '', date_to: '' })}>
                Clear
              </button>
            </div>
          </div>

          {/* ── Table ───────────────────────────────────────── */}
          <div className="card overflow-x-auto p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Spinner size={28} /></div>
            ) : entries.length === 0 ? (
              <EmptyState icon={Factory} title="No production entries" description="Click 'New Entry' to record production." />
            ) : (
              <table className="w-full text-sm min-w-[1200px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Shift</th>
                    <th className="table-th">Mill</th>
                    <th className="table-th">Size</th>
                    <th className="table-th">Thick.</th>
                    <th className="table-th">Length</th>
                    <th className="table-th text-right">Prime Pcs</th>
                    <th className="table-th text-right">Prime MT</th>
                    <th className="table-th text-right">Joint Pcs</th>
                    <th className="table-th text-right">CQ Pcs</th>
                    <th className="table-th text-right">Open Pcs</th>
                    <th className="table-th text-right">Random MT</th>
                    <th className="table-th text-right">Total Pcs</th>
                    <th className="table-th text-right">Total MT</th>
                    <th className="table-th text-right">Scrap (kg)</th>
                    <th className="table-th text-right">Rej %</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="table-td whitespace-nowrap">{format(new Date(e.date), 'dd MMM yyyy')}</td>
                      <td className="table-td">
                        <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                          e.shift === 'Day' ? 'bg-yellow-100 text-yellow-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>{e.shift ?? '—'}</span>
                      </td>
                      <td className="table-td">
                        <span className="text-xs bg-slate-100 rounded px-1.5 py-0.5 font-mono">{e.mill_no ?? '—'}</span>
                      </td>
                      <td className="table-td font-medium whitespace-nowrap">{e.size}</td>
                      <td className="table-td">{e.thickness}</td>
                      <td className="table-td">{e.length}</td>
                      <td className="table-td text-right text-blue-700">{e.prime_pieces ?? 0}</td>
                      <td className="table-td text-right text-blue-700 font-medium">{n(String(e.prime_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right text-amber-600">{e.joint_pipes ?? 0}</td>
                      <td className="table-td text-right text-amber-600">{e.cq_pipes ?? 0}</td>
                      <td className="table-td text-right text-amber-600">{e.open_pipes ?? 0}</td>
                      <td className="table-td text-right text-amber-600 font-medium">{n(String(e.random_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right font-bold text-green-700">{e.total_pipes ?? 0}</td>
                      <td className="table-td text-right font-bold text-green-700">{n(String(e.total_tonnage)).toFixed(3)}</td>
                      <td className="table-td text-right text-red-600">{n(String(e.total_scrap_kg)).toFixed(1)}</td>
                      <td className="table-td text-right text-purple-600">{n(String(e.rejection_percent)).toFixed(2)}%</td>
                      <td className="table-td">
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(e)} className="btn-secondary py-1 px-2" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(e.id)} className="btn-danger py-1 px-2" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.pages} ({pagination.total} records)</p>
                <div className="flex gap-2">
                  <button className="btn-secondary text-xs py-1" disabled={pagination.page <= 1}
                    onClick={() => loadEntries(pagination.page - 1)}>Prev</button>
                  <button className="btn-secondary text-xs py-1" disabled={pagination.page >= pagination.pages}
                    onClick={() => loadEntries(pagination.page + 1)}>Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'mill-summary' && (
        <div className="space-y-6">
          {Object.keys(millGroups).length === 0 ? (
            <div className="card">
              <EmptyState icon={BarChart3} title="No mill data" description="Production entries with mill assignments will appear here." />
            </div>
          ) : (
            Object.entries(millGroups).map(([mill, rows]) => {
              const millTotals = rows.reduce(
                (acc, r) => ({
                  total_pipes:   acc.total_pipes   + Number(r.total_pipes),
                  total_tonnage: acc.total_tonnage + Number(r.total_tonnage),
                }),
                { total_pipes: 0, total_tonnage: 0 }
              );
              return (
                <div key={mill} className="card overflow-x-auto p-0">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                      <BarChart3 size={15} className="text-blue-500" /> {mill}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {millTotals.total_pipes} pipes · {Number(millTotals.total_tonnage).toFixed(3)} MT total
                    </span>
                  </div>
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="table-th">Size</th>
                        <th className="table-th">Thickness</th>
                        <th className="table-th text-right">Prime Pipes</th>
                        <th className="table-th text-right">Prime MT</th>
                        <th className="table-th text-right">Random Pipes</th>
                        <th className="table-th text-right">Random MT</th>
                        <th className="table-th text-right">Total Pipes</th>
                        <th className="table-th text-right">Total MT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="table-td font-medium">{r.size}</td>
                          <td className="table-td">{r.thickness} mm</td>
                          <td className="table-td text-right text-blue-700">{Number(r.prime_pipes)}</td>
                          <td className="table-td text-right text-blue-700">{Number(r.prime_tonnage).toFixed(3)}</td>
                          <td className="table-td text-right text-amber-600">{Number(r.random_pipes)}</td>
                          <td className="table-td text-right text-amber-600">{Number(r.random_tonnage).toFixed(3)}</td>
                          <td className="table-td text-right font-bold text-green-700">{Number(r.total_pipes)}</td>
                          <td className="table-td text-right font-bold text-green-700">{Number(r.total_tonnage).toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={6} className="table-td text-right font-semibold text-slate-600">Mill Total</td>
                        <td className="table-td text-right font-bold text-green-700">{millTotals.total_pipes}</td>
                        <td className="table-td text-right font-bold text-green-700">{millTotals.total_tonnage.toFixed(3)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })
          )}
        </div>
      )}

      <CsvImportModal
        type="production"
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { loadEntries(); loadMillSummary(); }}
      />
    </div>
  );
}
