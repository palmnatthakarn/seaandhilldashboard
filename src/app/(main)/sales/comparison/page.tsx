'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useComparison } from '@/lib/ComparisonContext';
import { ComparisonDateFilter } from '@/components/shared/comparison/ComparisonDateFilter';
import { KPIGrid } from '@/components/shared/comparison/SimpleKPICard';
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, Package, BarChart3,
  Users, Award, Trophy, Medal, Building2, Percent, Layers,
  Receipt, CreditCard,
} from 'lucide-react';
import { BRANCH_PALETTE, fmt, fmtShort, fmtNum, fmtK, shortName, GrowthBadge, SectionHeader, BranchDot } from '@/lib/comparisonUtils';
import { cn } from '@/lib/utils';
import type { SalesKPIs, TopProduct, SalesBySalesperson, TopCustomer, ARStatus, SalesTrendData } from '@/lib/data/types';

type ARStatusLike = ARStatus & {
  total_outstanding?: number | string;
  total_invoice_amount?: number | string;
  total_paid?: number | string;
};

const toChartNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getAROutstanding = (ar: ARStatusLike) => toChartNumber(ar.totalOutstanding ?? ar.total_outstanding);
const getARInvoiceAmount = (ar: ARStatusLike) => toChartNumber(ar.totalInvoiceAmount ?? ar.total_invoice_amount);
const getARChartAmount = (ar: ARStatusLike) => getAROutstanding(ar) || getARInvoiceAmount(ar) || toChartNumber(ar.totalPaid ?? ar.total_paid);

/* ─── Full branch data interface ─── */
interface BranchSalesData {
  branchKey: string;
  branchName: string;
  kpis: SalesKPIs | null;
  topProducts: TopProduct[];
  salesperson: SalesBySalesperson[];
  topCustomers: TopCustomer[];
  arStatus: ARStatus[];
  trendData: SalesTrendData[];
}

interface AxisTooltipItem {
  axisValue?: string;
  color: string;
  seriesName: string;
  value: number;
}

type AxisTooltipParams = AxisTooltipItem[];

interface PieTooltipItem {
  name: string;
  percent: number;
  value: number;
}


/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */

export default function SalesComparisonPage() {
  const { selectedBranches, availableBranches, isLoaded } = useComparison();
  const { dateRange, setDateRange } = useDateRangeStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BranchSalesData[]>([]);

  // Stable key to prevent infinite re-fetch from array reference changes
  const branchesKey = useMemo(() => selectedBranches.join(','), [selectedBranches]);
  /* ─── Fetch ALL endpoints per branch ─── */
  const fetchData = useCallback(async () => {
    if (!isLoaded || selectedBranches.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const branchKeys = selectedBranches.filter((k: string) => k !== 'ALL');

      const results = await Promise.all(
        branchKeys.map(async (branchKey): Promise<BranchSalesData> => {
          const branchInfo = availableBranches.find((b: { key: string; name: string }) => b.key === branchKey);
          const params = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end });
          params.append('branch', branchKey);

          try {
            const [kpisRes, productsRes, salespersonRes, customersRes, arRes, trendRes] = await Promise.all([
              fetch(`/api/sales/kpis?${params}`),
              fetch(`/api/sales/top-products?${params}`),
              fetch(`/api/sales/by-salesperson?${params}`),
              fetch(`/api/sales/top-customers?${params}`),
              fetch(`/api/sales/ar-status?${params}`),
              fetch(`/api/sales/trend?${params}`),
            ]);

            const [kpisJ, productsJ, salespersonJ, customersJ, arJ, trendJ] = await Promise.all([
              kpisRes.ok ? kpisRes.json() : { data: null },
              productsRes.ok ? productsRes.json() : { data: [] },
              salespersonRes.ok ? salespersonRes.json() : { data: [] },
              customersRes.ok ? customersRes.json() : { data: [] },
              arRes.ok ? arRes.json() : { data: [] },
              trendRes.ok ? trendRes.json() : { data: [] },
            ]);

            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              kpis: kpisJ.data,
              topProducts: productsJ.data || [],
              salesperson: salespersonJ.data || [],
              topCustomers: customersJ.data || [],
              arStatus: arJ.data || [],
              trendData: trendJ.data || [],
            };
          } catch (branchErr) {
            console.warn(`Failed to fetch data for branch ${branchKey}:`, branchErr);
            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              kpis: null, topProducts: [], salesperson: [],
              topCustomers: [], arStatus: [], trendData: [],
            };
          }
        })
      );
      setData(results);
    } catch (err) {
      console.error('Error fetching sales comparison:', err);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [branchesKey, dateRange, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Computed: totals ─── */
  const totals = useMemo(() => {
    const sum = (fn: (d: BranchSalesData) => number) => data.reduce((s, d) => s + fn(d), 0);
    return {
      sales: sum(d => d.kpis?.totalSales?.value || 0),
      profit: sum(d => d.kpis?.grossProfit?.value || 0),
      orders: sum(d => d.kpis?.totalOrders?.value || 0),
      customers: sum(d => d.topCustomers.length),
      avgOrder: data.length > 0 ? sum(d => d.kpis?.avgOrderValue?.value || 0) / data.length : 0,
      arOutstanding: sum(d => d.arStatus.reduce((s, ar) => s + getAROutstanding(ar), 0)),
    };
  }, [data]);

  /* ─── Computed: ranked by sales ─── */
  const rankedData = useMemo(() =>
    [...data].sort((a, b) => (b.kpis?.totalSales?.value || 0) - (a.kpis?.totalSales?.value || 0)), [data]);

  /* ═══════════════════════════════════════════════
     CHART OPTIONS
     ═══════════════════════════════════════════════ */

  /* 1. Sales vs Profit - Grouped Bar Chart */
  const salesProfitChart = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: AxisTooltipParams) => {
        const name = params[0]?.axisValue || '';
        let html = `<div style="font-weight:600;margin-bottom:4px">${name}</div>`;
        params.forEach((p) => {
          html += `<div style="display:flex;align-items:center;gap:6px"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmt(p.value)}</div>`;
        });
        return html;
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 30, right: 20, bottom: 50, left: 50, containLabel: true },
    xAxis: { type: 'category', data: rankedData.map(b => shortName(b.branchName)), axisLabel: { rotate: 20, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
    series: [
      { name: 'ยอดขาย', type: 'bar', data: rankedData.map(b => b.kpis?.totalSales?.value || 0), itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] } },
      { name: 'กำไรขั้นต้น', type: 'bar', data: rankedData.map(b => b.kpis?.grossProfit?.value || 0), itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } },
    ],
  }), [rankedData]);

  /* 2. Sales Share - Donut Pie */
  const salesShareChart = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: (params: PieTooltipItem) => `<div style="font-weight:600;margin-bottom:4px">${params.name}</div><div>${fmt(params.value)} (${params.percent.toFixed(1)}%)</div>` },
    legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['45%', '75%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: rankedData.map((b, i) => ({
        name: shortName(b.branchName),
        value: b.kpis?.totalSales?.value || 0,
        itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
      })),
    }],
  }), [rankedData]);

  /* 3. Margin & Growth - Bar + Line Combo */
  const marginGrowthChart = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: AxisTooltipParams) => {
        let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
        params.forEach((p) => {
          html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${Number(p.value).toFixed(2)}%</div>`;
        });
        return html;
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 30, right: 60, bottom: 50, left: 50, containLabel: true },
    xAxis: { type: 'category', data: rankedData.map(b => shortName(b.branchName)), axisLabel: { rotate: 20, fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'Margin %', position: 'left', axisLabel: { formatter: '{value}%' } },
      { type: 'value', name: 'Growth %', position: 'right', axisLabel: { formatter: '{value}%' } },
    ],
    series: [
      { name: 'Gross Margin', type: 'bar', data: rankedData.map(b => b.kpis?.grossMarginPct || 0), itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] } },
      { name: 'Sales Growth', type: 'line', yAxisIndex: 1, data: rankedData.map(b => b.kpis?.totalSales?.growthPercentage || 0), lineStyle: { width: 3 }, itemStyle: { color: '#10b981' }, symbol: 'circle', symbolSize: 8 },
    ],
  }), [rankedData]);

  /* 4. Orders & Avg Order Value - Bar + Line */
  const ordersChart = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: AxisTooltipParams) => {
        let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
        params.forEach((p) => {
          const val = p.seriesName === 'จำนวนออเดอร์'
            ? Math.round(p.value).toLocaleString('th-TH')
            : fmt(p.value);
          html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${val}</div>`;
        });
        return html;
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 30, right: 60, bottom: 50, left: 50, containLabel: true },
    xAxis: { type: 'category', data: rankedData.map(b => shortName(b.branchName)), axisLabel: { rotate: 20, fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'ออเดอร์', position: 'left' },
      { type: 'value', name: '฿/ออเดอร์', position: 'right', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
    ],
    series: [
      { name: 'จำนวนออเดอร์', type: 'bar', data: rankedData.map(b => b.kpis?.totalOrders?.value || 0), itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] } },
      { name: 'เฉลี่ยต่อบิล', type: 'line', yAxisIndex: 1, data: rankedData.map(b => b.kpis?.avgOrderValue?.value || 0), lineStyle: { width: 3 }, itemStyle: { color: '#06b6d4' }, symbol: 'circle', symbolSize: 8 },
    ],
  }), [rankedData]);

  /* 5. Sales Trend Multi-Line */
  const trendChart = useMemo(() => {
    const allDates = new Set<string>();
    data.forEach(d => d.trendData.forEach(t => allDates.add(t.date)));
    const dates = Array.from(allDates).sort();

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: AxisTooltipParams) => {
          let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
          params.forEach((p) => {
            html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmt(p.value)}</div>`;
          });
          return html;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, right: 20, bottom: 50, left: 50, containLabel: true },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
      series: rankedData.map((b, i) => ({
        name: shortName(b.branchName),
        type: 'line',
        smooth: true,
        data: dates.map(d => {
          const found = b.trendData.find(t => t.date === d);
          return found ? found.sales : 0;
        }),
        lineStyle: { width: 2.5 },
        itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
        symbol: 'circle',
        symbolSize: 6,
      })),
    };
  }, [data, rankedData]);

  /* 6. AR Outstanding - Stacked Bar */
  const arChart = useMemo(() => {
    const STATUS_COLORS: Record<string, string> = {
      'Paid': '#10b981', 'ชำระแล้ว': '#10b981',
      'Partial': '#f59e0b', 'ชำระบางส่วน': '#f59e0b',
      'Unpaid': '#ef4444', 'ยังไม่ชำระ': '#ef4444', 'ค้างชำระ': '#ef4444',
      'Overdue': '#dc2626', 'เกินกำหนด': '#dc2626',
    };
    const FALLBACK_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#dc2626', '#8b5cf6', '#06b6d4'];

    // รวม statusPayment ที่มีจริงจากข้อมูลทุกสาขา
    const allStatus = [...new Set(rankedData.flatMap(b => b.arStatus.map(a => a.statusPayment).filter(Boolean)))];

    if (allStatus.length === 0) {
      return { series: [] };
    }

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: AxisTooltipParams) => {
          let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
          params.forEach((p) => {
            if (p.value > 0) html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmt(p.value)}</div>`;
          });
          return html;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, right: 20, bottom: 50, left: 50, containLabel: true },
      xAxis: { type: 'category', data: rankedData.map(b => shortName(b.branchName)), axisLabel: { rotate: 20, fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
      series: allStatus.map((status, sIdx) => ({
        name: status,
        type: 'bar',
        stack: 'ar',
        data: rankedData.map(b => {
          const ar = b.arStatus.find(a => a.statusPayment === status);
          return ar ? getARChartAmount(ar) : 0;
        }),
        itemStyle: {
          color: STATUS_COLORS[status] || FALLBACK_COLORS[sIdx % FALLBACK_COLORS.length],
          borderRadius: sIdx === allStatus.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0],
        },
      })),
    };
  }, [rankedData]);

  /* 7. Top Products Comparison - Top 10 per branch */
  const topProductsByBranch = useMemo(() => {
    const groups = rankedData.map((branch, branchIndex) => ({
      branchKey: branch.branchKey,
      branchName: branch.branchName,
      shortBranchName: shortName(branch.branchName),
      color: BRANCH_PALETTE[branchIndex % BRANCH_PALETTE.length].hex,
      products: branch.topProducts.slice(0, 10).map((product) => ({
        name: product.itemName || 'N/A',
        sales: toChartNumber(product.totalSales),
      })),
    }));

    const maxSales = Math.max(
      ...groups.flatMap((group) => group.products.map((product) => product.sales)),
      1
    );

    return { groups, maxSales };
  }, [rankedData]);

  /* 8. Customer Metrics - Radar Chart */
  const customerRadarChart = useMemo(() => {
    const maxCustomers = Math.max(...data.map(d => d.topCustomers.length), 1);
    const maxSpent = Math.max(...data.flatMap(d => d.topCustomers.map(c => c.totalSpent)), 1);
    const maxOrders = Math.max(...data.flatMap(d => d.topCustomers.map(c => c.orderCount)), 1);

    return {
      tooltip: {},
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      radar: {
        indicator: [
          { name: 'จำนวนลูกค้า', max: maxCustomers },
          { name: 'ยอดซื้อสูงสุด', max: maxSpent },
          { name: 'ออเดอร์สูงสุด', max: maxOrders },
        ],
        radius: '60%',
      },
      series: [{
        type: 'radar',
        data: rankedData.map((b, i) => {
          const topC = b.topCustomers[0];
          return {
            name: shortName(b.branchName),
            value: [b.topCustomers.length, topC?.totalSpent || 0, topC?.orderCount || 0],
            lineStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
            areaStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex, opacity: 0.15 },
            itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
          };
        }),
      }],
    };
  }, [data, rankedData]);

  // Framer motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  /* ═══ Render ═══ */
  return (
    <motion.div 
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-widest font-semibold mb-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            เปรียบเทียบกิจการ
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">ยอดขาย ผลิตภัณฑ์ และลูกค้า</h1>
          <p className="text-sm text-muted-foreground mt-0.5">เปรียบเทียบข้อมูลการขาย สินค้า และลูกค้าทั้งหมดระหว่างกิจการ</p>
        </div>
        <ComparisonDateFilter value={dateRange} onChange={setDateRange} />
      </motion.div>

      {/* Loading / Empty */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted/20 animate-pulse" />)}
          </div>
          {[...Array(4)].map((_, i) => <div key={i} className="h-56 rounded-2xl bg-muted/20 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
            <TrendingDown className="h-8 w-8 text-rose-400" />
          </div>
          <p className="text-lg font-semibold text-foreground">เกิดข้อผิดพลาด</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            ลองใหม่อีกครั้ง
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-lg font-semibold text-foreground">ไม่มีข้อมูลเปรียบเทียบ</p>
          <p className="text-sm text-muted-foreground mt-1">กรุณาเลือกกิจการจากปุ่มด้านบนเพื่อเปรียบเทียบ</p>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════
             1) KPI Summary Cards
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants}>
            <KPIGrid
              columns={6}
              cards={[
                { icon: DollarSign, iconColor: 'text-indigo-600', label: 'ยอดขายรวม', value: totals.sales, barColor: 'bg-indigo-500', subText: `จาก ${data.length} กิจการ`, format: 'money' },
                { icon: TrendingUp, iconColor: 'text-emerald-600', label: 'กำไรขั้นต้นรวม', value: totals.profit, barColor: 'bg-emerald-500', subText: `${totals.sales > 0 ? ((totals.profit / totals.sales) * 100).toFixed(1) : 0}% margin`, format: 'money' },
                { icon: ShoppingCart, iconColor: 'text-amber-600', label: 'ออเดอร์รวม', value: totals.orders, barColor: 'bg-amber-500', format: 'number' },
                { icon: Receipt, iconColor: 'text-sky-600', label: 'เฉลี่ยต่อบิล', value: totals.avgOrder, barColor: 'bg-sky-500', format: 'money' },
                { icon: Users, iconColor: 'text-violet-600', label: 'ลูกค้า Top', value: totals.customers, barColor: 'bg-violet-500', format: 'number' },
                { icon: CreditCard, iconColor: 'text-rose-600', label: 'AR ค้างชำระ', value: totals.arOutstanding, barColor: 'bg-rose-500', format: 'money' },
              ]}
            />
          </motion.div>

          {/* ════════════════════════════════════════
             2) Hero - Top Performer
             ════════════════════════════════════════ 
          {rankedData[0] && (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-xl shadow-indigo-500/25">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Award className="h-48 w-48 rotate-12" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-xl bg-white/20 p-2 backdrop-blur-sm">
                    <Trophy className="h-6 w-6 text-yellow-300" />
                  </div>
                  <span className="text-indigo-100 font-medium">กิจการยอดขายสูงสุด</span>
                </div>
                <h2 className="text-3xl font-bold mb-1">{rankedData[0].branchName}</h2>
                <p className="text-indigo-200 mb-8">
                  ทำยอดขายได้คิดเป็น {totals.sales > 0 ? (((rankedData[0].kpis?.totalSales?.value || 0) / totals.sales) * 100).toFixed(1) : 0}% ของทั้งหมด
                </p>
                <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <p className="text-indigo-200 text-sm mb-1">ยอดขาย</p>
                    <p className="text-2xl font-bold">{fmtShort(rankedData[0].kpis?.totalSales?.value || 0)}</p>
                  </div>
                  <div>
                    <p className="text-indigo-200 text-sm mb-1">กำไรขั้นต้น</p>
                    <p className="text-2xl font-bold text-emerald-300">{fmtShort(rankedData[0].kpis?.grossProfit?.value || 0)}</p>
                  </div>
                  <div>
                    <p className="text-indigo-200 text-sm mb-1">Margin</p>
                    <p className="text-2xl font-bold">{(rankedData[0].kpis?.grossMarginPct || 0).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-indigo-200 text-sm mb-1">ออเดอร์</p>
                    <p className="text-2xl font-bold">{fmtNum(rankedData[0].kpis?.totalOrders?.value || 0)}</p>
                  </div>
                  <div>
                    <p className="text-indigo-200 text-sm mb-1">ต่อบิล</p>
                    <p className="text-2xl font-bold">{fmt(rankedData[0].kpis?.avgOrderValue?.value || 0)}</p>
                  </div>
                  <div>
                    <p className="text-indigo-200 text-sm mb-1">Growth</p>
                    <p className="text-2xl font-bold text-yellow-300">{(rankedData[0].kpis?.totalSales?.growthPercentage || 0).toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}*/}

          {/* ════════════════════════════════════════
             3) Ranking Table
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Trophy className="h-4 w-4 text-amber-500" />}
              title="อันดับยอดขายกิจการ"
              desc="จัดอันดับตามยอดขาย กำไร และประสิทธิภาพ"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-border/50 bg-muted/30">
                    {['#', 'กิจการ', 'ยอดขาย', 'กำไรขั้นต้น', 'Margin', 'ออเดอร์', 'เฉลี่ย/บิล', 'Growth', 'Salesperson', 'ลูกค้า Top'].map((h, i) => (
                      <th key={i} className={cn('py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap', i <= 1 ? 'text-left' : 'text-right', i === 0 && 'pl-6 w-12', i === 9 && 'pr-6')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankedData.map((d, idx) => {
                    const sales = d.kpis?.totalSales?.value || 0;
                    const profit = d.kpis?.grossProfit?.value || 0;
                    const margin = d.kpis?.grossMarginPct || 0;
                    const orders = d.kpis?.totalOrders?.value || 0;
                    const avgOrder = d.kpis?.avgOrderValue?.value || 0;
                    const growth = d.kpis?.totalSales?.growthPercentage || 0;
                    const RankIcon = idx === 0 ? Trophy : idx === 1 ? Award : idx === 2 ? Medal : null;
                    const rankColors = ['text-amber-500', 'text-gray-400', 'text-orange-400'];
                    return (
                      <tr key={d.branchKey} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 pl-6 pr-4">
                          {RankIcon ? <RankIcon className={cn('h-5 w-5', rankColors[idx])} /> : <span className="text-muted-foreground font-medium">{idx + 1}</span>}
                        </td>
                        <td className="py-3 px-4"><div className="flex items-center gap-2"><BranchDot idx={idx} /><span className="font-semibold text-foreground">{d.branchName}</span></div></td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(sales)} <GrowthBadge value={d.kpis?.totalSales?.growthPercentage} /></td>
                        <td className="py-3 px-4 text-right font-medium text-emerald-600">{fmtShort(profit)}</td>
                        <td className="py-3 px-4 text-right"><span className={cn('text-xs font-semibold px-2 py-1 rounded-lg', margin >= 30 ? 'bg-emerald-50 text-emerald-700' : margin >= 15 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700')}>{margin.toFixed(1)}%</span></td>
                        <td className="py-3 px-4 text-right font-medium">{fmtNum(orders)}</td>
                        <td className="py-3 px-4 text-right font-medium">{fmt(avgOrder)}</td>
                        <td className="py-3 px-4 text-right"><span className={cn('text-xs font-semibold px-2 py-1 rounded-lg', growth >= 10 ? 'bg-emerald-50 text-emerald-700' : growth >= 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700')}>{growth.toFixed(1)}%</span></td>
                        <td className="py-3 px-4 text-right font-medium">{d.salesperson.length}</td>
                        <td className="py-3 pr-6 pl-4 text-right font-medium">{d.topCustomers.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             4) Sales vs Profit + Sales Share
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<DollarSign className="h-4 w-4 text-indigo-600" />} title="ยอดขาย vs กำไรขั้นต้น" desc="เปรียบเทียบรายได้และกำไรแต่ละกิจการ" />
              <div className="px-6 pb-5">
                <ReactECharts option={salesProfitChart} style={{ height: 300 }} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<Layers className="h-4 w-4 text-violet-600" />} title="สัดส่วนยอดขาย" desc="สัดส่วนยอดขายแต่ละกิจการ" />
              <div className="px-6 pb-5">
                <ReactECharts option={salesShareChart} style={{ height: 300 }} />
              </div>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             5) Margin & Growth + Orders
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<Percent className="h-4 w-4 text-violet-600" />} title="Gross Margin & Sales Growth" desc="อัตรากำไรขั้นต้นและอัตราเติบโต" />
              <div className="px-6 pb-5">
                <ReactECharts option={marginGrowthChart} style={{ height: 300 }} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<ShoppingCart className="h-4 w-4 text-amber-600" />} title="ออเดอร์ & เฉลี่ยต่อบิล" desc="จำนวนออเดอร์และมูลค่าเฉลี่ยต่อบิล" />
              <div className="px-6 pb-5">
                <ReactECharts option={ordersChart} style={{ height: 300 }} />
              </div>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             6) Sales Trend
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} title="แนวโน้มยอดขาย" desc="เปรียบเทียบยอดขายรายวัน/รายเดือน" />
            <div className="px-6 pb-5">
              <ReactECharts option={trendChart} style={{ height: 320 }} />
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             7) Top Products + Customer Metrics
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden md:col-span-2">
              <SectionHeader icon={<Package className="h-4 w-4 text-amber-600" />} title="สินค้าขายดี Top 10" desc="Top 10 แยกตามกิจการ ใช้สเกลเดียวกันเพื่อเทียบข้ามกิจการ" />
              <div className="px-6 pb-5 overflow-x-auto">
                {topProductsByBranch.groups.some((group) => group.products.length > 0) ? (
                  <div
                    className="grid gap-5"
                    style={{
                      gridTemplateColumns: `repeat(${topProductsByBranch.groups.length}, minmax(280px, 1fr))`,
                      minWidth: `${Math.max(topProductsByBranch.groups.length, 1) * 280}px`,
                    }}
                  >
                    {topProductsByBranch.groups.map((group) => (
                      <div key={group.branchKey} className="min-w-0">
                        <div className="mb-3 flex items-center justify-between gap-3 border-b pb-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                            <h3 className="truncate text-sm font-semibold text-foreground" title={group.branchName}>
                              {group.shortBranchName}
                            </h3>
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground">Top {group.products.length}</span>
                        </div>

                        {group.products.length > 0 ? (
                          <div className="space-y-2.5">
                            {group.products.map((product, index) => (
                              <div key={`${group.branchKey}-${product.name}-${index}`} className="space-y-1">
                                <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                                  <span className="text-right font-medium text-muted-foreground">{index + 1}</span>
                                  <span className="truncate text-foreground" title={product.name}>{product.name}</span>
                                  <span className="font-medium tabular-nums text-muted-foreground">{fmtK(product.sales)}</span>
                                </div>
                                <div className="ml-7 h-2 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.max((product.sales / topProductsByBranch.maxSales) * 100, product.sales > 0 ? 2 : 0)}%`,
                                      backgroundColor: group.color,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="py-8 text-center text-xs text-muted-foreground">ไม่มีข้อมูลสินค้าขายดี</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">ไม่มีข้อมูลสินค้าขายดีในช่วงเวลานี้</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<Users className="h-4 w-4 text-violet-600" />} title="ตัวชี้วัดลูกค้า" desc="จำนวนลูกค้าและพฤติกรรมการซื้อ" />
              <div className="px-6 pb-5 flex items-center justify-center">
                <ReactECharts option={customerRadarChart} style={{ height: 300, width: '100%' }} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<CreditCard className="h-4 w-4 text-rose-600" />} title="สถานะลูกหนี้ (AR)" desc="เปรียบเทียบสถานะการชำระเงินของลูกค้า" />
              <div className="px-6 pb-5">
                {arChart.series && arChart.series.length > 0
                  ? <ReactECharts option={arChart} style={{ height: 300 }} />
                  : <p className="text-xs text-muted-foreground py-8 text-center">ไม่มีข้อมูลลูกหนี้ในช่วงเวลานี้</p>
                }
              </div>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             9) Top Products per Branch
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm p-6">
            <h3 className="font-bold text-lg mb-1">สินค้าขายดี Top 5 แต่ละกิจการ</h3>
            <p className="text-sm text-muted-foreground mb-6">เปรียบเทียบสินค้าที่ขายดีที่สุดในแต่ละกิจการ</p>
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {rankedData.map((branch, idx) => (
                <div key={branch.branchKey} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: BRANCH_PALETTE[idx % BRANCH_PALETTE.length].hex }} />
                    <h4 className="font-semibold text-sm">{branch.branchName}</h4>
                  </div>
                  <div className="space-y-2">
                    {branch.topProducts.slice(0, 5).map((product, pIdx) => (
                      <div key={pIdx} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-muted/30">
                        <span className="text-muted-foreground truncate max-w-[60%]">{pIdx + 1}. {product.itemName}</span>
                        <span className="font-semibold">{fmtShort(product.totalSales)}</span>
                      </div>
                    ))}
                    {branch.topProducts.length === 0 && <p className="text-sm text-muted-foreground py-2">ไม่พบข้อมูล</p>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             10) Salesperson Comparison
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm p-6">
            <h3 className="font-bold text-lg mb-1">Top พนักงานขายแต่ละกิจการ</h3>
            <p className="text-sm text-muted-foreground mb-6">เปรียบเทียบพนักงานขายยอดเยี่ยม</p>
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {rankedData.map((branch, idx) => (
                <div key={branch.branchKey} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: BRANCH_PALETTE[idx % BRANCH_PALETTE.length].hex }} />
                    <h4 className="font-semibold text-sm">{branch.branchName}</h4>
                  </div>
                  <div className="space-y-2">
                    {branch.salesperson.slice(0, 5).map((sp, sIdx) => (
                      <div key={sIdx} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-muted/30">
                        <span className="text-muted-foreground truncate max-w-[55%]">{sIdx + 1}. {sp.saleName}</span>
                        <div className="text-right">
                          <span className="font-semibold">{fmtShort(sp.totalSales)}</span>
                          <span className="text-xs text-muted-foreground ml-1">({sp.orderCount} บิล)</span>
                        </div>
                      </div>
                    ))}
                    {branch.salesperson.length === 0 && <p className="text-sm text-muted-foreground py-2">ไม่พบข้อมูล</p>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             11) Top Customers Comparison
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm p-6">
            <h3 className="font-bold text-lg mb-1">ลูกค้า Top 5 แต่ละกิจการ</h3>
            <p className="text-sm text-muted-foreground mb-6">เปรียบเทียบลูกค้าที่ซื้อมากที่สุด</p>
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {rankedData.map((branch, idx) => (
                <div key={branch.branchKey} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: BRANCH_PALETTE[idx % BRANCH_PALETTE.length].hex }} />
                    <h4 className="font-semibold text-sm">{branch.branchName}</h4>
                  </div>
                  <div className="space-y-2">
                    {branch.topCustomers.slice(0, 5).map((c, cIdx) => (
                      <div key={cIdx} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-muted/30">
                        <span className="text-muted-foreground truncate max-w-[55%]">{cIdx + 1}. {c.customerName}</span>
                        <div className="text-right">
                          <span className="font-semibold">{fmtShort(c.totalSpent)}</span>
                          <span className="text-xs text-muted-foreground ml-1">({c.orderCount} ครั้ง)</span>
                        </div>
                      </div>
                    ))}
                    {branch.topCustomers.length === 0 && <p className="text-sm text-muted-foreground py-2">ไม่พบข้อมูล</p>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

        </>
      )}
    </motion.div>
  );
}
