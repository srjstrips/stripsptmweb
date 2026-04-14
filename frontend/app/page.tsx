'use client';

import { useEffect, useState } from 'react';
import { Factory, Truck, Package, AlertTriangle, TrendingUp, Layers } from 'lucide-react';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import { stockApi, productionApi, dispatchApi, StockTotals, StockSummaryRow } from '@/lib/api';
import Link from 'next/link';
import { format } from 'date-fns';

interface DashboardData {
  totals: StockTotals;
  topStock: StockSummaryRow[];
  recentProduction: number;
  recentDispatch: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const monthStart = format(new Date(new Date().setDate(1)), 'yyyy-MM-dd');

        const [stockRes, prodRes, dispRes] = await Promise.all([
          stockApi.get(),
          productionApi.list({ date_from: monthStart, date_to: today, limit: 1 }),
          dispatchApi.list({ date_from: monthStart, date_to: today, limit: 1 }),
        ]);

        const topStock = [...stockRes.data.summary]
          .sort((a, b) =>
            (parseFloat(String(b.prime_tonnage)) + parseFloat(String(b.random_tonnage))) -
            (parseFloat(String(a.prime_tonnage)) + parseFloat(String(a.random_tonnage)))
          )
          .slice(0, 5);

        setData({
          totals: stockRes.data.totals,
          topStock,
          recentProduction: prodRes.data.pagination.total,
          recentDispatch: dispRes.data.pagination.total,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  const t = data?.totals;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={`Live overview · ${format(new Date(), 'dd MMM yyyy')}`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Prime Stock (MT)"
          value={parseFloat(String(t?.total_prime_tonnage ?? 0)).toFixed(3)}
          sub={`${t?.total_prime_pieces ?? 0} pieces`}
          icon={Package}
          color="blue"
        />
        <StatCard
          label="Random Stock (MT)"
          value={parseFloat(String(t?.total_random_tonnage ?? 0)).toFixed(3)}
          sub={`${t?.total_random_pieces ?? 0} pieces`}
          icon={Layers}
          color="amber"
        />
        <StatCard
          label="Grand Total (MT)"
          value={parseFloat(String(t?.grand_total_tonnage ?? 0)).toFixed(3)}
          sub={`${t?.grand_total_pieces ?? 0} total pieces`}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="This Month"
          value={`${data?.recentProduction ?? 0} prod.`}
          sub={`${data?.recentDispatch ?? 0} dispatch entries`}
          icon={Factory}
          color="slate"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { href: '/production', label: 'New Production Entry', icon: Factory, color: 'bg-blue-600 hover:bg-blue-700' },
          { href: '/dispatch',   label: 'New Dispatch Entry',   icon: Truck,   color: 'bg-amber-600 hover:bg-amber-700' },
          { href: '/stock',      label: 'View Live Stock',      icon: Package, color: 'bg-green-600 hover:bg-green-700' },
        ].map(({ href, label, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-5 py-4 rounded-xl text-white font-medium ${color} transition-colors shadow-sm`}
          >
            <Icon size={20} className="shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* Top Stock Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">Top Stock by Tonnage</h2>
          <Link href="/stock" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>
        {data?.topStock.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-slate-400 text-sm justify-center">
            <AlertTriangle size={16} /> No stock data yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-th">Size</th>
                  <th className="table-th">Thickness</th>
                  <th className="table-th text-right">Prime MT</th>
                  <th className="table-th text-right">Random MT</th>
                  <th className="table-th text-right">Total MT</th>
                </tr>
              </thead>
              <tbody>
                {data?.topStock.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="table-td font-medium">{row.size}</td>
                    <td className="table-td">{row.thickness}</td>
                    <td className="table-td text-right text-blue-700">
                      {parseFloat(String(row.prime_tonnage)).toFixed(3)}
                    </td>
                    <td className="table-td text-right text-amber-700">
                      {parseFloat(String(row.random_tonnage)).toFixed(3)}
                    </td>
                    <td className="table-td text-right font-semibold">
                      {(parseFloat(String(row.prime_tonnage)) + parseFloat(String(row.random_tonnage))).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
