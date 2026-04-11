'use client';

import { useEffect, useState, useCallback, ChangeEvent, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Truck, Filter, Download, AlertCircle, Upload } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import Spinner from '@/components/Spinner';
import { dispatchApi, stockApi, DispatchEntry, StockSummaryRow } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { PIPE_SIZES, PIPE_THICKNESSES, STANDARD_LENGTH } from '@/lib/constants';

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  party_name: '',
  vehicle_no: '',
  loading_slip_no: '',
  order_tat: '',
  size: '',
  thickness: '',
  length: STANDARD_LENGTH,  // default 6m
  customLength: '',
  weight_per_pipe: '',
  prime_tonnage: '',
  prime_pieces: '',
  random_tonnage: '',
  random_pieces: '',
  pdi: '',
  supervisor: '',
  delivery_location: '',
  remark: '',
};

function calcPieces(tonnage: string, weightPerPipe: string): string {
  const t = parseFloat(tonnage);
  const w = parseFloat(weightPerPipe);
  if (!t || !w || w <= 0) return '';
  return String(Math.round((t * 1000) / w));
}

export default function DispatchPage() {
  const [entries, setEntries]       = useState<DispatchEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [filters, setFilters]       = useState({ size: '', date_from: '', date_to: '' });
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [availableStock, setAvailableStock] = useState<StockSummaryRow | null>(null);
  const [checkingStock, setCheckingStock]   = useState(false);
  const [showImport, setShowImport]         = useState(false);

  const loadEntries = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 50 };
      if (filters.size)      params.size      = filters.size;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const res = await dispatchApi.list(params);
      setEntries(res.data.data);
      setPagination({ page, total: res.data.pagination.total, pages: res.data.pagination.pages });
    } catch {
      toast.error('Failed to load dispatch entries');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Live stock check whenever size + thickness change
  useEffect(() => {
    if (!form.size || !form.thickness) { setAvailableStock(null); return; }
    const timer = setTimeout(async () => {
      setCheckingStock(true);
      try {
        const res = await stockApi.get({ size: form.size, thickness: form.thickness });
        const match = res.data.summary.find(
          (s) =>
            s.size.trim().toLowerCase() === form.size.trim().toLowerCase() &&
            s.thickness.trim().toLowerCase() === form.thickness.trim().toLowerCase()
        );
        setAvailableStock(match || null);
      } finally {
        setCheckingStock(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.size, form.thickness]);

  const effectiveLength = form.length === 'Custom' ? form.customLength : form.length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!effectiveLength) { toast.error('Please enter the custom length'); return; }
    setSubmitting(true);
    try {
      await dispatchApi.create({
        date: form.date,
        party_name: form.party_name || null,
        vehicle_no: form.vehicle_no || null,
        loading_slip_no: form.loading_slip_no || null,
        order_tat: form.order_tat || null,
        size: form.size,
        thickness: form.thickness,
        length: effectiveLength,
        weight_per_pipe: form.weight_per_pipe ? parseFloat(form.weight_per_pipe) : null,
        prime_tonnage:  parseFloat(form.prime_tonnage  || '0'),
        prime_pieces:   parseInt(form.prime_pieces     || '0', 10),
        random_tonnage: parseFloat(form.random_tonnage || '0'),
        random_pieces:  parseInt(form.random_pieces    || '0', 10),
        pdi: form.pdi || null,
        supervisor: form.supervisor || null,
        delivery_location: form.delivery_location || null,
        remark: form.remark || null,
      });
      toast.success('Dispatch entry saved!');
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      loadEntries();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { errors?: Array<string | { field?: string; message: string }>; message?: string } } };
      const errData = ex?.response?.data;
      if (Array.isArray(errData?.errors) && errData!.errors!.length > 0) {
        const msgs = errData!.errors!.map((e) =>
          typeof e === 'string' ? e : e.message
        );
        toast.error(msgs.join('\n'));
      } else {
        toast.error(errData?.message || 'Failed to save dispatch');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dispatch entry? Stock will be restored.')) return;
    try {
      await dispatchApi.delete(id);
      toast.success('Entry deleted');
      loadEntries();
    } catch {
      toast.error('Failed to delete entry');
    }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(entries.map((e) => ({
      Date: e.date,
      'Party Name': e.party_name || '',
      'Vehicle No.': e.vehicle_no || '',
      'Loading Slip No.': e.loading_slip_no || '',
      'Order TAT': e.order_tat || '',
      Size: e.size,
      Thickness: e.thickness,
      Length: e.length,
      'Wt/Pipe (kg)': e.weight_per_pipe ?? '',
      'Prime MT': e.prime_tonnage,
      'Prime Pcs': e.prime_pieces,
      'Random MT': e.random_tonnage,
      'Random Pcs': e.random_pieces,
      PDI: e.pdi || '',
      Supervisor: e.supervisor || '',
      'Delivery Location': e.delivery_location || '',
      Remark: e.remark || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dispatch');
    XLSX.writeFile(wb, `dispatch_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const totals = entries.reduce(
    (acc, e) => ({
      prime_tonnage:  acc.prime_tonnage  + parseFloat(String(e.prime_tonnage)),
      prime_pieces:   acc.prime_pieces   + e.prime_pieces,
      random_tonnage: acc.random_tonnage + parseFloat(String(e.random_tonnage)),
      random_pieces:  acc.random_pieces  + e.random_pieces,
    }),
    { prime_tonnage: 0, prime_pieces: 0, random_tonnage: 0, random_pieces: 0 }
  );

  const field =
    (key: string) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val = e.target.value;
      setForm((p) => {
        const next = { ...p, [key]: val };
        if (key === 'prime_tonnage' || (key === 'weight_per_pipe' && p.prime_tonnage)) {
          const auto = calcPieces(key === 'prime_tonnage' ? val : p.prime_tonnage, key === 'weight_per_pipe' ? val : p.weight_per_pipe);
          if (auto) next.prime_pieces = auto;
        }
        if (key === 'random_tonnage' || (key === 'weight_per_pipe' && p.random_tonnage)) {
          const auto = calcPieces(key === 'random_tonnage' ? val : p.random_tonnage, key === 'weight_per_pipe' ? val : p.weight_per_pipe);
          if (auto) next.random_pieces = auto;
        }
        return next;
      });
    };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dispatch Entries"
        subtitle={`${pagination.total} total records`}
        actions={
          <>
            <button onClick={exportExcel} className="btn-secondary"><Download size={15} /> Export</button>
            <button onClick={() => setShowImport(true)} className="btn-secondary"><Upload size={15} /> Import CSV</button>
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary"><Plus size={15} /> New Dispatch</button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Prime MT (page)"     value={totals.prime_tonnage.toFixed(3)}  sub={`${totals.prime_pieces} pcs`}  icon={Truck} color="blue" />
        <StatCard label="Random MT (page)"    value={totals.random_tonnage.toFixed(3)} sub={`${totals.random_pieces} pcs`} icon={Truck} color="amber" />
        <StatCard label="Total Dispatched MT" value={(totals.prime_tonnage + totals.random_tonnage).toFixed(3)} sub="this page" icon={Truck} color="green" />
        <StatCard label="Total Records"       value={pagination.total} icon={Truck} color="slate" />
      </div>

      {/* ── Entry Form ─────────────────────────────────────────── */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-slate-700 mb-5 flex items-center gap-2">
            <Truck size={16} /> New Dispatch Entry
          </h2>

          {/* Stock availability banner */}
          {(form.size && form.thickness) && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
              checkingStock
                ? 'bg-slate-50 text-slate-500'
                : availableStock
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {checkingStock ? (
                <><Spinner size={14} /> Checking available stock…</>
              ) : availableStock ? (
                <>
                  Available stock for <strong>{form.size} / {form.thickness} mm</strong>:{' '}
                  Prime <strong>{parseFloat(String(availableStock.prime_tonnage)).toFixed(3)} MT</strong>{' '}
                  ({availableStock.prime_pieces} pcs) &nbsp;·&nbsp;
                  Random <strong>{parseFloat(String(availableStock.random_tonnage)).toFixed(3)} MT</strong>{' '}
                  ({availableStock.random_pieces} pcs)
                </>
              ) : (
                <><AlertCircle size={15} /> No stock found for {form.size} / {form.thickness} mm</>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Row 1 — Date + Party Name + Vehicle No. + Loading Slip No. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">Date *</label>
                <input type="date" className="form-input" value={form.date} onChange={field('date')} required />
              </div>
              <div>
                <label className="form-label">Party Name</label>
                <input type="text" className="form-input" value={form.party_name} onChange={field('party_name')} placeholder="Customer / party" />
              </div>
              <div>
                <label className="form-label">Vehicle No.</label>
                <input type="text" className="form-input" value={form.vehicle_no} onChange={field('vehicle_no')} placeholder="e.g. MH12AB1234" />
              </div>
              <div>
                <label className="form-label">Loading Slip No.</label>
                <input type="text" className="form-input" value={form.loading_slip_no} onChange={field('loading_slip_no')} placeholder="Slip number" />
              </div>
            </div>

            {/* Row 2 — Order TAT + Pipe Size + Thickness + Length */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">Order TAT</label>
                <input type="text" className="form-input" value={form.order_tat} onChange={field('order_tat')} placeholder="e.g. 2 days / 2026-04-15" />
              </div>

              {/* Size dropdown */}
              <div>
                <label className="form-label">Pipe Size *</label>
                <select className="form-select" value={form.size} onChange={field('size')} required>
                  <option value="">Select size…</option>
                  {PIPE_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Thickness dropdown */}
              <div>
                <label className="form-label">Thickness (mm) *</label>
                <select className="form-select" value={form.thickness} onChange={field('thickness')} required>
                  <option value="">Select…</option>
                  {PIPE_THICKNESSES.map((t) => (
                    <option key={t} value={t}>{t} mm</option>
                  ))}
                </select>
              </div>

              {/* Length */}
              <div>
                <label className="form-label">Length *</label>
                <select className="form-select" value={form.length} onChange={field('length')} required>
                  <option value="6m">6 m (Standard)</option>
                  <option value="Custom">Custom…</option>
                </select>
              </div>
            </div>

            {/* Custom length input */}
            {form.length === 'Custom' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="md:col-start-4">
                  <label className="form-label">Enter Custom Length *</label>
                  <input
                    className="form-input"
                    value={form.customLength}
                    onChange={field('customLength')}
                    placeholder="e.g. 5.4m or 3600mm"
                    required
                  />
                </div>
              </div>
            )}

            {/* Row 3 — Weight per Pipe + PDI + Supervisor + Delivery Location */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">Wt. of Single Pipe (kg) <span className="text-slate-400 font-normal">— auto-calc pcs</span></label>
                <input type="number" step="0.01" min="0" className="form-input" value={form.weight_per_pipe} onChange={field('weight_per_pipe')} placeholder="e.g. 48.5" />
              </div>
              <div>
                <label className="form-label">PDI</label>
                <input type="text" className="form-input" value={form.pdi} onChange={field('pdi')} placeholder="e.g. Pass / Fail" />
              </div>
              <div>
                <label className="form-label">Supervisor</label>
                <input type="text" className="form-input" value={form.supervisor} onChange={field('supervisor')} placeholder="Supervisor name" />
              </div>
              <div>
                <label className="form-label">Delivery Location</label>
                <input type="text" className="form-input" value={form.delivery_location} onChange={field('delivery_location')} placeholder="Destination" />
              </div>
            </div>

            {/* Prime */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wide">Prime Dispatch</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Tonnage (MT) *</label>
                  <input type="number" step="0.001" min="0" className="form-input" value={form.prime_tonnage} onChange={field('prime_tonnage')} required placeholder="0.000" />
                </div>
                <div>
                  <label className="form-label">No. of Pipes {form.weight_per_pipe && <span className="text-blue-500 font-normal">(auto)</span>} *</label>
                  <input type="number" min="0" className="form-input" value={form.prime_pieces} onChange={field('prime_pieces')} required placeholder="0" />
                </div>
              </div>
            </div>

            {/* Random */}
            <div className="p-3 bg-amber-50 rounded-lg">
              <p className="text-xs font-bold text-amber-700 mb-2 uppercase tracking-wide">Random Dispatch</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Tonnage (MT) *</label>
                  <input type="number" step="0.001" min="0" className="form-input" value={form.random_tonnage} onChange={field('random_tonnage')} required placeholder="0.000" />
                </div>
                <div>
                  <label className="form-label">No. of Pipes {form.weight_per_pipe && <span className="text-amber-500 font-normal">(auto)</span>} *</label>
                  <input type="number" min="0" className="form-input" value={form.random_pieces} onChange={field('random_pieces')} required placeholder="0" />
                </div>
              </div>
            </div>

            {/* Remark */}
            <div>
              <label className="form-label">Remark</label>
              <textarea className="form-input" rows={2} value={form.remark} onChange={field('remark')} placeholder="Any additional notes…" />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Spinner size={15} /> : <Plus size={15} />}
                {submitting ? 'Saving…' : 'Save Dispatch'}
              </button>
              <button type="button" className="btn-secondary"
                onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Filter size={15} className="text-slate-400 mt-5" />
          <div>
            <label className="form-label">Size</label>
            <select className="form-select w-40" value={filters.size}
              onChange={(e) => setFilters((p) => ({ ...p, size: e.target.value }))}>
              <option value="">All sizes</option>
              {PIPE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
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
            onClick={() => setFilters({ size: '', date_from: '', date_to: '' })}>Clear</button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : entries.length === 0 ? (
          <EmptyState icon={Truck} title="No dispatch entries" description="Click 'New Dispatch' to record outward movement." />
        ) : (
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Party Name</th>
                <th className="table-th">Vehicle No.</th>
                <th className="table-th">Slip No.</th>
                <th className="table-th">Size</th>
                <th className="table-th">Thick.</th>
                <th className="table-th">Length</th>
                <th className="table-th text-right">Prime MT</th>
                <th className="table-th text-right">Prime Pcs</th>
                <th className="table-th text-right">Rnd MT</th>
                <th className="table-th text-right">Rnd Pcs</th>
                <th className="table-th text-right">Total MT</th>
                <th className="table-th">PDI</th>
                <th className="table-th">Supervisor</th>
                <th className="table-th">Location</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="table-td whitespace-nowrap">{format(new Date(e.date), 'dd MMM yyyy')}</td>
                  <td className="table-td whitespace-nowrap">{e.party_name || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td whitespace-nowrap">{e.vehicle_no || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td whitespace-nowrap">{e.loading_slip_no || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td font-medium whitespace-nowrap">{e.size}</td>
                  <td className="table-td">{e.thickness}</td>
                  <td className="table-td">{e.length}</td>
                  <td className="table-td text-right text-blue-700 font-medium">{parseFloat(String(e.prime_tonnage)).toFixed(3)}</td>
                  <td className="table-td text-right">{e.prime_pieces}</td>
                  <td className="table-td text-right text-amber-600">{parseFloat(String(e.random_tonnage)).toFixed(3)}</td>
                  <td className="table-td text-right">{e.random_pieces}</td>
                  <td className="table-td text-right font-semibold">
                    {(parseFloat(String(e.prime_tonnage)) + parseFloat(String(e.random_tonnage))).toFixed(3)}
                  </td>
                  <td className="table-td">{e.pdi || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td">{e.supervisor || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td">{e.delivery_location || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td">
                    <button onClick={() => handleDelete(e.id)} className="btn-danger py-1 px-2">
                      <Trash2 size={13} />
                    </button>
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

      <CsvImportModal
        type="dispatch"
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => loadEntries()}
      />
    </div>
  );
}
