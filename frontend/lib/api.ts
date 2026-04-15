import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── Types ──────────────────────────────────────────────────────

export interface ProductionEntry {
  id: string;
  date: string;
  size: string;
  thickness: string;
  length: string;
  od: string | null;
  // Operational
  shift: 'Shift A' | 'Shift B' | null;
  mill_no: 'Mill1' | 'Mill2' | 'Mill3' | 'Mill4' | null;
  weight_per_pipe: number | null;
  stamp: string | null;
  raw_material_grade: string | null;
  // Prime
  prime_tonnage: number;
  prime_pieces: number;
  // Joint
  joint_pipes: number;
  joint_tonnage: number;
  // CQ
  cq_pipes: number;
  cq_tonnage: number;
  // Open
  open_pipes: number;
  open_tonnage: number;
  // Calculated aggregates
  random_pipes: number;
  random_tonnage: number;
  total_pipes: number;
  total_tonnage: number;
  // Scrap KG
  scrap_endcut_kg: number;
  scrap_bitcut_kg: number;
  scrap_burning_kg: number;
  total_scrap_kg: number;
  // Quality
  rejection_percent: number;
  created_at: string;
}

export interface MillSummaryRow {
  mill_no: string;
  size: string;
  thickness: string;
  total_pipes: number;
  total_tonnage: number;
  prime_pipes: number;
  prime_tonnage: number;
  random_pipes: number;
  random_tonnage: number;
}

export interface DispatchEntry {
  id: string;
  date: string;
  size: string;
  thickness: string;
  length: string;
  prime_tonnage: number;
  prime_pieces: number;
  random_tonnage: number;
  random_pieces: number;
  party_name: string | null;
  vehicle_no: string | null;
  loading_slip_no: string | null;
  order_tat: string | null;
  weight_per_pipe: number | null;
  pdi: string | null;
  supervisor: string | null;
  delivery_location: string | null;
  remark: string | null;
  created_at: string;
}

export interface StockTotals {
  total_prime_tonnage: number;
  total_prime_pieces: number;
  total_random_tonnage: number;
  total_random_pieces: number;
  grand_total_tonnage: number;
  grand_total_pieces: number;
}

export interface StockSummaryRow {
  size: string;
  thickness: string;
  prime_tonnage: number;
  prime_pieces: number;
  random_tonnage: number;
  random_pieces: number;
}

export interface ReportProductionRow extends StockSummaryRow {
  scrap_tonnage: number;
  slit_wastage: number;
}

export interface PeriodTotals {
  total_mt: number;
  prime_mt: number;
  random_mt: number;
}

export interface EntryTotals {
  all_time: PeriodTotals;
  this_month: PeriodTotals;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ── API helpers ────────────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  success_count: number;
  error_count: number;
  errors: Array<{ row: number; message: string }>;
}

export const productionApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<{ success: boolean; data: ProductionEntry[]; pagination: Pagination }>(
      '/api/production', { params }
    ),
  create: (data: Partial<ProductionEntry>) =>
    api.post<{ success: boolean; data: ProductionEntry }>('/api/production', data),
  update: (id: string, data: Partial<ProductionEntry>) =>
    api.put<{ success: boolean; data: ProductionEntry }>(`/api/production/${id}`, data),
  delete: (id: string) =>
    api.delete<{ success: boolean; message: string }>(`/api/production/${id}`),
  millSummary: () =>
    api.get<{ success: boolean; data: MillSummaryRow[] }>('/api/production/mill-summary'),
  totals: () =>
    api.get<{ success: boolean } & EntryTotals>('/api/production/totals'),
  import: (rows: Record<string, string>[]) =>
    api.post<ImportResult>('/api/production/import', { rows }),
};

export const dispatchApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<{ success: boolean; data: DispatchEntry[]; pagination: Pagination }>(
      '/api/dispatch', { params }
    ),
  create: (data: Partial<DispatchEntry>) =>
    api.post<{ success: boolean; data: DispatchEntry }>('/api/dispatch', data),
  delete: (id: string) =>
    api.delete<{ success: boolean; message: string }>(`/api/dispatch/${id}`),
  totals: () =>
    api.get<{ success: boolean } & EntryTotals>('/api/dispatch/totals'),
  import: (rows: Record<string, string>[]) =>
    api.post<ImportResult>('/api/dispatch/import', { rows }),
};

export interface StockAsOfRow {
  size: string;
  thickness: string;
  total_tonnage: number;
}

export const stockApi = {
  get: (params?: Record<string, string>) =>
    api.get<{ success: boolean; totals: StockTotals; summary: StockSummaryRow[] }>(
      '/api/stock', { params }
    ),
  report: (params?: Record<string, string>) =>
    api.get<{
      success: boolean;
      production: ReportProductionRow[];
      dispatch: StockSummaryRow[];
      scrap: { total_scrap: number; total_slit_wastage: number };
    }>('/api/stock/report', { params }),
  asOf: (date: string) =>
    api.get<{ success: boolean; date: string; data: StockAsOfRow[] }>(
      '/api/stock/as-of', { params: { date } }
    ),
};
