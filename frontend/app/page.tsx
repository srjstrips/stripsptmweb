'use client';

import { useEffect, useState } from 'react';
import { Factory, Truck, Package, AlertTriangle, TrendingUp } from 'lucide-react';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import { stockApi, productionApi, dispatchApi, StockTotals, StockSummaryRow, PeriodTotals } from '@/lib/api';
import Link from 'next/link';
import { format } from 'date-fns';

interface DashboardData {
  stockTotals: StockTotals;
  topStock: StockSummaryRow[];
  prodThisMonth: PeriodTotals;
  dispThisMonth: PeriodTotals;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [stockRes, prodTotalsRes, dispTotalsRes] = await Promise.all([
          stockApi.get(),
          productionApi.totals(),
          dispatchApi.totals(),
        ]);

        const topStock = [...stockRes.data.summary]
          .sort((a, b) =>
            (parseFloat(String(b.prime_tonnage)) + parseFloat(String(b.random_tonnage))) -
            (parseFloat(String(a.prime_tonnage)) + parseFloat(String(a.random_tonnage)))
          )
          .slice(0, 5);

        setData({
          stockTotals: stockRes.data.totals,
          topStock,
          prodThisMonth: prodTotalsRes.data.this_month,
          dispThisMonth: dispTotalsRes.data.this_month,
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={`Live overview · ${format(new Date(), 'dd MMM yyyy')}`}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="This Month Production (MT)"
          value={parseFloat(String(data?.prodThisMonth?.total_mt ?? 0)).toFixed(3)}
          sub={`Prime ${parseFloat(String(data?.prodThisMonth?.prime_mt ?? 0)).toFixed(3)} · Random ${parseFloat(String(data?.prodThisMonth?.random_mt ?? 0)).toFixed(3)}`}
          icon={Factory}
          color="blue"
        />
        <StatCard
          label="This Month Dispatch (MT)"
          value={parseFloat(String(data?.dispThisMonth?.total_mt ?? 0)).toFixed(3)}
          sub={`Prime ${parseFloat(String(data?.dispThisMonth?.prime_mt ?? 0)).toFixed(3)} · Random ${parseFloat(String(data?.dispThisMonth?.random_mt ?? 0)).toFixed(3)}`}
          icon={Truck}
          color="amber"
        />
        <StatCard
          label="Total Stock (MT)"
          value={parseFloat(String(data?.stockTotals?.grand_total_tonnage ?? 0)).toFixed(3)}
          sub={`${data?.stockTotals?.grand_total_pieces ?? 0} pieces in stock`}
          icon={TrendingUp}
          color="green"
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
