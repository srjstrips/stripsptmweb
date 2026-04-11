'use client';

import { useRef, useState, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Upload, X, Download, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react';
import Spinner from '@/components/Spinner';
import { productionApi, dispatchApi, ImportResult } from '@/lib/api';

// ── Column definitions ─────────────────────────────────────────

const PRODUCTION_COLUMNS = [
  { key: 'date',               label: 'date',               required: true,  hint: 'YYYY-MM-DD' },
  { key: 'shift',              label: 'shift',              required: true,  hint: 'Day or Night' },
  { key: 'mill_no',            label: 'mill_no',            required: true,  hint: 'Mill1 / Mill2 / Mill3 / Mill4' },
  { key: 'size',               label: 'size',               required: true,  hint: 'e.g. 20mm' },
  { key: 'thickness',          label: 'thickness',          required: true,  hint: 'e.g. 1.6' },
  { key: 'length',             label: 'length',             required: true,  hint: 'e.g. 6m' },
  { key: 'od',                 label: 'od',                 required: false, hint: '' },
  { key: 'weight_per_pipe',    label: 'weight_per_pipe',    required: false, hint: 'kg' },
  { key: 'stamp',              label: 'stamp',              required: false, hint: '' },
  { key: 'raw_material_grade', label: 'raw_material_grade', required: false, hint: '' },
  { key: 'prime_tonnage',      label: 'prime_tonnage',      required: false, hint: 'MT' },
  { key: 'prime_pieces',       label: 'prime_pieces',       required: false, hint: '' },
  { key: 'joint_pipes',        label: 'joint_pipes',        required: false, hint: '' },
  { key: 'joint_tonnage',      label: 'joint_tonnage',      required: false, hint: 'MT' },
  { key: 'cq_pipes',           label: 'cq_pipes',           required: false, hint: '' },
  { key: 'cq_tonnage',         label: 'cq_tonnage',         required: false, hint: 'MT' },
  { key: 'open_pipes',         label: 'open_pipes',         required: false, hint: '' },
  { key: 'open_tonnage',       label: 'open_tonnage',       required: false, hint: 'MT' },
  { key: 'scrap_endcut_kg',    label: 'scrap_endcut_kg',    required: false, hint: 'kg' },
  { key: 'scrap_bitcut_kg',    label: 'scrap_bitcut_kg',    required: false, hint: 'kg' },
  { key: 'scrap_burning_kg',   label: 'scrap_burning_kg',   required: false, hint: 'kg' },
  { key: 'rejection_percent',  label: 'rejection_percent',  required: false, hint: '0-100' },
];

const DISPATCH_COLUMNS = [
  { key: 'date',              label: 'date',              required: true,  hint: 'YYYY-MM-DD' },
  { key: 'size',              label: 'size',              required: true,  hint: 'e.g. 20mm' },
  { key: 'thickness',         label: 'thickness',         required: true,  hint: 'e.g. 1.6' },
  { key: 'length',            label: 'length',            required: true,  hint: 'e.g. 6m' },
  { key: 'prime_tonnage',     label: 'prime_tonnage',     required: false, hint: 'MT' },
  { key: 'prime_pieces',      label: 'prime_pieces',      required: false, hint: '' },
  { key: 'random_tonnage',    label: 'random_tonnage',    required: false, hint: 'MT' },
  { key: 'random_pieces',     label: 'random_pieces',     required: false, hint: '' },
  { key: 'party_name',        label: 'party_name',        required: false, hint: '' },
  { key: 'vehicle_no',        label: 'vehicle_no',        required: false, hint: '' },
  { key: 'loading_slip_no',   label: 'loading_slip_no',   required: false, hint: '' },
  { key: 'order_tat',         label: 'order_tat',         required: false, hint: '' },
  { key: 'weight_per_pipe',   label: 'weight_per_pipe',   required: false, hint: 'kg' },
  { key: 'pdi',               label: 'pdi',               required: false, hint: '' },
  { key: 'supervisor',        label: 'supervisor',        required: false, hint: '' },
  { key: 'delivery_location', label: 'delivery_location', required: false, hint: '' },
  { key: 'remark',            label: 'remark',            required: false, hint: '' },
];

// ── Helpers ────────────────────────────────────────────────────

/** Convert Excel date serial or various string formats to YYYY-MM-DD */
function normalizeDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  // Excel serial number — days since 1900-01-01, adjusted by Unix epoch offset (25569 days)
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y  = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }
  const s = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  return s;
}

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseSheet(ws: XLSX.WorkSheet, columns: typeof PRODUCTION_COLUMNS): Record<string, string>[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return raw.map((row) => {
    const out: Record<string, string> = {};
    for (const col of columns) {
      // Try exact match first, then case-insensitive
      const keys = Object.keys(row);
      const match = keys.find((k) => k === col.key) ??
                    keys.find((k) => k.toLowerCase().replace(/\s+/g, '_') === col.key);
      const val = match ? row[match] : '';
      out[col.key] = col.key === 'date' ? normalizeDate(val) : cellToString(val);
    }
    return out;
  });
}

function downloadTemplate(type: 'production' | 'dispatch') {
  const columns = type === 'production' ? PRODUCTION_COLUMNS : DISPATCH_COLUMNS;
  const header = columns.map((c) => c.key);
  const hint   = columns.map((c) => c.required ? `REQUIRED${c.hint ? ` — ${c.hint}` : ''}` : c.hint);
  const sample: Record<string, string> = {};
  if (type === 'production') {
    sample['date'] = '2024-01-15'; sample['shift'] = 'Day'; sample['mill_no'] = 'Mill1';
    sample['size'] = '20mm'; sample['thickness'] = '1.6'; sample['length'] = '6m';
    sample['prime_tonnage'] = '5.250'; sample['prime_pieces'] = '100';
  } else {
    sample['date'] = '2024-01-15'; sample['size'] = '20mm'; sample['thickness'] = '1.6';
    sample['length'] = '6m'; sample['prime_tonnage'] = '5.250'; sample['prime_pieces'] = '100';
    sample['party_name'] = 'ABC Corp'; sample['vehicle_no'] = 'MH12AB1234';
  }

  const ws = XLSX.utils.aoa_to_sheet([
    header,
    hint,
    header.map((h) => sample[h] ?? ''),
  ]);
  // Style the hint row (row 2) grey — basic column widths
  ws['!cols'] = header.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type === 'production' ? 'Production' : 'Dispatch');
  XLSX.writeFile(wb, `${type}_import_template.xlsx`);
}

// ── Component ──────────────────────────────────────────────────

interface Props {
  type: 'production' | 'dispatch';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'upload' | 'preview' | 'result';

export default function CsvImportModal({ type, isOpen, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep]           = useState<Step>('upload');
  const [rows, setRows]           = useState<Record<string, string>[]>([]);
  const [fileName, setFileName]   = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<ImportResult | null>(null);

  const columns = type === 'production' ? PRODUCTION_COLUMNS : DISPATCH_COLUMNS;
  const previewCols = type === 'production'
    ? ['date', 'shift', 'mill_no', 'size', 'thickness', 'length', 'prime_tonnage', 'prime_pieces']
    : ['date', 'size', 'thickness', 'length', 'prime_tonnage', 'prime_pieces', 'party_name', 'vehicle_no'];

  const reset = () => {
    setStep('upload');
    setRows([]);
    setFileName('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array', cellDates: false });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseSheet(ws, columns);
        if (parsed.length === 0) {
          toast.error('No data rows found in the file');
          return;
        }
        if (parsed.length > 500) {
          toast.error('File has more than 500 rows. Please split into smaller batches.');
          return;
        }
        setRows(parsed);
        setStep('preview');
      } catch {
        toast.error('Failed to parse file. Ensure it is a valid CSV or Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const fn = type === 'production' ? productionApi.import : dispatchApi.import;
      const res = await fn(rows);
      setResult(res.data);
      setStep('result');
      if (res.data.success_count > 0) {
        onSuccess();
        toast.success(`Imported ${res.data.success_count} ${type} entries`);
      }
    } catch {
      toast.error('Import request failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-800">
              Import {type === 'production' ? 'Production' : 'Dispatch'} Entries from CSV / Excel
            </h2>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Upload ───────────────────────────────── */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>
                  Historical imports do <strong>not</strong> affect current rack stock levels — they only add records to the history table.
                </span>
              </div>

              {/* Template download */}
              <div className="flex items-center justify-between p-4 border border-dashed border-slate-300 rounded-lg bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-700">Step 1 — Download the template</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Fill in the template with your data (row 1 = headers, row 2 = hints, row 3+ = data).
                  </p>
                </div>
                <button
                  onClick={() => downloadTemplate(type)}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <Download size={14} /> Template
                </button>
              </div>

              {/* File drop zone */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Step 2 — Upload your filled file</p>
                <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors">
                  <Upload size={28} className="text-blue-500" />
                  <span className="text-sm text-blue-700 font-medium">
                    {fileName || 'Click to choose a CSV or Excel file'}
                  </span>
                  <span className="text-xs text-blue-500">Accepts .csv, .xlsx, .xls — max 500 rows</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFile}
                  />
                </label>
              </div>

              {/* Required columns list */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Required columns</p>
                <div className="flex flex-wrap gap-2">
                  {columns.filter((c) => c.required).map((c) => (
                    <span key={c.key} className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-mono">
                      {c.key}
                    </span>
                  ))}
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3 mb-2">Optional columns</p>
                <div className="flex flex-wrap gap-2">
                  {columns.filter((c) => !c.required).map((c) => (
                    <span key={c.key} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">
                      {c.key}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ──────────────────────────────── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-sm text-slate-700">
                  Parsed <strong>{rows.length}</strong> rows from <em>{fileName}</em>. Review before importing.
                </span>
                <button onClick={reset} className="ml-auto text-xs text-slate-500 underline">Change file</button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="text-xs w-full min-w-max">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">#</th>
                      {previewCols.map((c) => (
                        <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{c}</th>
                      ))}
                      <th className="px-3 py-2 text-slate-400">…</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-3 py-1.5 text-slate-400">{i + 2}</td>
                        {previewCols.map((c) => (
                          <td key={c} className="px-3 py-1.5 whitespace-nowrap text-slate-700">
                            {row[c] || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-slate-300">…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 20 && (
                <p className="text-xs text-slate-400 text-center">Showing first 20 of {rows.length} rows</p>
              )}
            </div>
          )}

          {/* ── Step 3: Result ───────────────────────────────── */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-3xl font-bold text-green-700">{result.success_count}</p>
                  <p className="text-sm text-green-600 mt-1">Rows imported successfully</p>
                </div>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                  <p className="text-3xl font-bold text-red-700">{result.error_count}</p>
                  <p className="text-sm text-red-600 mt-1">Rows failed</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Failed rows</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 divide-y divide-red-100">
                    {result.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 text-xs text-red-800 flex gap-2">
                        <span className="font-semibold shrink-0">Row {e.row}:</span>
                        <span>{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          {step === 'upload' && (
            <button onClick={handleClose} className="btn-secondary">Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="btn-secondary">Back</button>
              <button onClick={handleImport} disabled={importing} className="btn-primary">
                {importing ? <><Spinner size={14} /> Importing…</> : <>Import {rows.length} rows</>}
              </button>
            </>
          )}
          {step === 'result' && (
            <>
              <button onClick={reset} className="btn-secondary">Import another file</button>
              <button onClick={handleClose} className="btn-primary">Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
