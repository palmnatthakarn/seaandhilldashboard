'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import ReactECharts from 'echarts-for-react';
import {
  Building2, TrendingUp, TrendingDown, Award,
  ShoppingCart, BarChart3, Package, Activity, AlertTriangle,
  Users, DollarSign, Percent, Receipt, Layers,
} from 'lucide-react';
import { useComparison } from '@/lib/ComparisonContext';
import { useComparisonData } from '@/hooks/useComparisonData';
import { ComparisonDateFilter } from '@/components/comparison/ComparisonDateFilter';
import { cn } from '@/lib/utils';
import type { BranchComparisonData } from '@/lib/data/comparison';
import { ComparisonTable } from './ComparisonTable';

export const dynamic = 'force-dynamic';

/* ─── Branch color palette ─── */
const BRANCH_PALETTE = [
  { hex: '#6366f1', name: 'indigo' },
  { hex: '#10b981', name: 'emerald' },
  { hex: '#f59e0b', name: 'amber' },
  { hex: '#ef4444', name: 'rose' },
  { hex: '#06b6d4', name: 'cyan' },
  { hex: '#8b5cf6', name: 'violet' },
];

/* ─── Helper: SectionHeader ─── */
function SectionHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="px-6 pt-5 pb-3"
    >
      <h2 className="text-base font-bold text-foreground flex items-center gap-2">{icon}{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </motion.div>
  );
}

/* ─── Helper: Legend Dot ─── */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <motion.div
      className="flex items-center gap-1.5 text-xs"
      whileHover={{ x: 2 }}
    >
      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground truncate max-w-[120px]">{label}</span>
    </motion.div>
  );
}

export default function ComparisonPage() {
  const { selectedBranches, isLoaded } = useComparison();
  const { dateRange, setDateRange } = useDateRangeStore();

  // Use TanStack Query hook for data fetching
  const { data: branches = [], isLoading, error } = useComparisonData({
    dateRange,
    branches: selectedBranches,
    enabled: isLoaded && selectedBranches.length > 0,
  });

  /* ─── Formatting helpers ─── */
  const fmtM = (v: number) => `฿${(v / 1_000_000).toFixed(2)}M`;
  const fmtK = (v: number) =>
    Math.abs(v) >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : Math.abs(v) >= 1_000
      ? `${(v / 1_000).toFixed(0)}K`
      : v.toFixed(0);
  const fmtP = (v: number) => `${v.toFixed(1)}%`;
  const fmtFull = (v: number) => `฿${v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtCount = (v: number) => Math.round(v).toLocaleString('th-TH');

  /* ─── Computed ─── */
  const topBranch = branches[0] || null;
  const totalRevenueAll = useMemo(() => branches.reduce((sum: number, b: BranchComparisonData) => sum + b.totalSales, 0), [branches]);
  const totalExpenseAll = useMemo(() => branches.reduce((sum: number, b: BranchComparisonData) => sum + b.totalExpense, 0), [branches]);
  const totalProfitAll = useMemo(() => branches.reduce((sum: number, b: BranchComparisonData) => sum + b.netProfit, 0), [branches]);
  const totalOrdersAll = useMemo(() => branches.reduce((sum: number, b: BranchComparisonData) => sum + b.totalOrders, 0), [branches]);
  const totalCustomersAll = useMemo(() => branches.reduce((sum: number, b: BranchComparisonData) => sum + b.uniqueCustomers, 0), [branches]);
  const totalInventoryAll = useMemo(() => branches.reduce((sum: number, b: BranchComparisonData) => sum + b.inventoryValue, 0), [branches]);
  const totalDeadStockAll = useMemo(
    () => branches.reduce((sum: number, b: BranchComparisonData) => sum + b.deadStockValue, 0),
    [branches]
  );

  /* ─── Short branch name helper ─── */
  const shortName = (name: string) => name.replace(/บริษัท\s*|จำกัด/g, '').trim().substring(0, 20);

  /* ─══════════════════════════════════════════════════════════════════
     CHART OPTIONS
     ══════════════════════════════════════════════════════════════════ */

  /* 1. Sales vs Expense vs Profit - Grouped Bar Chart */
  const salesExpenseProfitChart = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const name = params[0]?.axisValue || '';
          let html = `<div class="font-semibold mb-1">${name}</div>`;
          params.forEach((p: any) => {
            html += `<div style="display:flex;align-items:center;gap:6px"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmtFull(p.value)}</div>`;
          });
          return html;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, right: 20, bottom: 50, left: 50, containLabel: true },
      xAxis: {
        type: 'category',
        data: branches.map((b: BranchComparisonData) => shortName(b.branchName)),
        axisLabel: { rotate: 20, fontSize: 10 },
      },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
      series: [
        {
          name: 'ยอดขาย',
          type: 'bar',
          data: branches.map((b: BranchComparisonData) => b.totalSales),
          itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'ค่าใช้จ่าย',
          type: 'bar',
          data: branches.map((b: BranchComparisonData) => b.totalExpense),
          itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'กำไร',
          type: 'bar',
          data: branches.map((b: BranchComparisonData) => b.netProfit),
          itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [branches]
  );

  /* 2. Profit Margin & Growth - Bar + Line Combo */
  const marginGrowthChart = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          const name = params[0]?.axisValue || '';
          let html = `<div style="font-weight:600;margin-bottom:4px">${name}</div>`;
          params.forEach((p: any) => {
            html += `<div style="display:flex;align-items:center;gap:6px"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmtP(p.value)}</div>`;
          });
          return html;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, right: 60, bottom: 50, left: 50, containLabel: true },
      xAxis: {
        type: 'category',
        data: branches.map((b: BranchComparisonData) => shortName(b.branchName)),
        axisLabel: { rotate: 20, fontSize: 10 },
      },
      yAxis: [
        { type: 'value', name: 'Margin %', position: 'left', axisLabel: { formatter: '{value}%' } },
        { type: 'value', name: 'Growth %', position: 'right', axisLabel: { formatter: '{value}%' } },
      ],
      series: [
        {
          name: 'Profit Margin',
          type: 'bar',
          data: branches.map((b: BranchComparisonData) => b.profitMargin),
          itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Sales Growth',
          type: 'line',
          yAxisIndex: 1,
          data: branches.map((b: BranchComparisonData) => b.salesGrowth),
          lineStyle: { width: 3 },
          itemStyle: { color: '#10b981' },
          symbol: 'circle',
          symbolSize: 8,
        },
      ],
    }),
    [branches]
  );

  /* 3. Sales Share - Pie Chart */
  const salesShareChart = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          return `<div style="font-weight:600;margin-bottom:4px">${params.name}</div><div>${fmtFull(params.value)} (${params.percent.toFixed(1)}%)</div>`;
        },
      },
      legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['45%', '75%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: branches.map((b: BranchComparisonData, i: number) => ({
            name: shortName(b.branchName),
            value: b.totalSales,
            itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
          })),
        },
      ],
    }),
    [branches]
  );

  /* 4. Inventory Comparison - Stacked Bar (Stock Value + Dead Stock) */
  const inventoryChart = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const name = params[0]?.axisValue || '';
          let html = `<div style="font-weight:600;margin-bottom:4px">${name}</div>`;
          params.forEach((p: any) => {
            html += `<div style="display:flex;align-items:center;gap:6px"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmtFull(p.value)}</div>`;
          });
          return html;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, right: 20, bottom: 50, left: 50, containLabel: true },
      xAxis: {
        type: 'category',
        data: branches.map((b: BranchComparisonData) => shortName(b.branchName)),
        axisLabel: { rotate: 20, fontSize: 10 },
      },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
      series: [
        {
          name: 'มูลค่าสต็อก',
          type: 'bar',
          stack: 'inv',
          data: branches.map((b: BranchComparisonData) => b.inventoryValue - b.deadStockValue),
          itemStyle: { color: '#06b6d4', borderRadius: [0, 0, 0, 0] },
        },
        {
          name: 'Dead Stock',
          type: 'bar',
          stack: 'inv',
          data: branches.map((b: BranchComparisonData) => b.deadStockValue),
          itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [branches]
  );

  /* 5. Inventory Turnover - Horizontal Bar */
  const turnoverChart = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => `${params[0].name}: ${params[0].value.toFixed(2)}x`,
      },
      grid: { top: 10, right: 40, bottom: 20, left: 10, containLabel: true },
      xAxis: { type: 'value', axisLabel: { formatter: '{value}x' } },
      yAxis: {
        type: 'category',
        data: branches.map((b: BranchComparisonData) => shortName(b.branchName)).reverse(),
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: [...branches]
            .reverse()
            .map((b: BranchComparisonData, i: number) => ({
              value: b.inventoryTurnover,
              itemStyle: {
                color: BRANCH_PALETTE[(branches.length - 1 - i) % BRANCH_PALETTE.length].hex,
                borderRadius: [0, 4, 4, 0],
              },
            })),
          barWidth: '60%',
        },
      ],
    }),
    [branches]
  );

  /* 6. Customer Metrics - Radar Chart */
  const customerRadarChart = useMemo(() => {
    const maxCustomers = Math.max(...branches.map((b: BranchComparisonData) => b.uniqueCustomers), 1);
    const maxTransactions = Math.max(...branches.map((b: BranchComparisonData) => b.totalTransactions), 1);
    return {
      tooltip: {
        formatter: (params: any) => {
          if (!params.value) return '';
          const [customers, repeatRate, transactions] = params.value;
          return `<div style="font-weight:600;margin-bottom:4px">${params.name}</div><div>ลูกค้า: ${fmtCount(customers)}</div><div>Repeat %: ${fmtP(repeatRate)}</div><div>Transactions: ${fmtCount(transactions)}</div>`;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      radar: {
        indicator: [
          { name: 'ลูกค้า', max: maxCustomers },
          { name: 'Repeat %', max: 100 },
          { name: 'Transactions', max: maxTransactions },
        ],
        radius: '60%',
      },
      series: [
        {
          type: 'radar',
          data: branches.map((b: BranchComparisonData, i: number) => ({
            name: shortName(b.branchName),
            value: [b.uniqueCustomers, b.repeatCustomerRate, b.totalTransactions],
            lineStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
            areaStyle: {
              color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex,
              opacity: 0.15,
            },
            itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
          })),
        },
      ],
    };
  }, [branches]);

  /* 7. Monthly Sales Trend - Multi-Line */
  const monthlyTrendChart = useMemo(() => {
    const allMonths = new Set<string>();
    branches.forEach((b: BranchComparisonData) => b.monthlySales.forEach((m: any) => allMonths.add(m.month)));
    const months = Array.from(allMonths).sort();

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const name = params[0]?.axisValue || '';
          let html = `<div style="font-weight:600;margin-bottom:4px">${name}</div>`;
          params.forEach((p: any) => {
            html += `<div style="display:flex;align-items:center;gap:6px"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmtFull(p.value)}</div>`;
          });
          return html;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 30, right: 20, bottom: 50, left: 50, containLabel: true },
      xAxis: { type: 'category', data: months, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
      series: branches.map((b: BranchComparisonData, i: number) => ({
        name: shortName(b.branchName),
        type: 'line',
        smooth: true,
        data: months.map((m: string) => {
          const found = b.monthlySales.find((ms: any) => ms.month === m);
          return found ? found.sales : 0;
        }),
        lineStyle: { width: 2.5 },
        itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
        symbol: 'circle',
        symbolSize: 6,
      })),
    };
  }, [branches]);

  /* 8. Top Products Comparison - Horizontal Grouped Bar */
  const topProductsChart = useMemo(() => {
    const products: { name: string; branch: string; sales: number; color: string }[] = [];
    branches.forEach((b: BranchComparisonData, i: number) => {
      b.topProducts.slice(0, 2).forEach((p: any) => {
        products.push({
          name: p.productName.substring(0, 20),
          branch: shortName(b.branchName),
          sales: p.sales,
          color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex,
        });
      });
    });
    products.sort((a, b) => b.sales - a.sales);
    const top10 = products.slice(0, 10);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const name = params[0]?.axisValue || '';
          const val = params[0]?.value ?? 0;
          return `<div style="font-weight:600;margin-bottom:4px">${name}</div><div>ยอดขาย: ${fmtFull(val)}</div>`;
        },
      },
      grid: { top: 10, right: 40, bottom: 20, left: 10, containLabel: true },
      xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `฿${fmtK(v)}` } },
      yAxis: {
        type: 'category',
        data: top10.map((p: any) => p.name).reverse(),
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: top10
            .reverse()
            .map((p: any) => ({
              value: p.sales,
              itemStyle: {
                color: p.color,
                borderRadius: [0, 4, 4, 0],
              },
            })),
          barWidth: '60%',
        },
      ],
    };
  }, [branches]);

  /* ═══ Render ═══ */
  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-wider font-semibold">
            <BarChart3 className="h-4 w-4" />
            <span>Comparison Dashboard</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            เปรียบเทียบผลการดำเนินงาน
          </h1>
        </div>
        <ComparisonDateFilter value={dateRange} onChange={setDateRange} />
      </motion.div>

      {/* Loading or not loaded */}
      {!isLoaded || isLoading ? (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="h-64 rounded-3xl bg-muted/20 animate-pulse" />
          <div className="grid gap-6 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="h-28 rounded-xl bg-muted/20 animate-pulse"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.1 }}
              />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <motion.div
                key={i}
                className="h-80 rounded-xl bg-muted/20 animate-pulse"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
              />
            ))}
          </div>
        </motion.div>
      ) : error || branches.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center py-24 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-lg font-semibold text-foreground">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
          <p className="text-sm text-muted-foreground mt-1">
            กรุณาเลือกกิจการจากแถบด้านบนเพื่อเปรียบเทียบ
          </p>
        </motion.div>
      ) : (
        <motion.div
          className="space-y-6 pb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.1 }}
        >
          {/* ─────────────────────────────────────────────────────────
              SECTION 1: Hero - Top Performer
              ───────────────────────────────────────────────────────── */}
          {topBranch && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-xl shadow-indigo-500/25"
            >
              <motion.div
                className="absolute top-0 right-0 p-8 opacity-10"
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              >
                <Award className="h-48 w-48 rotate-12" />
              </motion.div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    className="rounded-xl bg-white/20 p-2 backdrop-blur-sm"
                    whileHover={{ rotate: 10, scale: 1.1 }}
                  >
                    <Award className="h-6 w-6 text-yellow-300" />
                  </motion.div>
                  <span className="text-indigo-100 font-medium">กิจการยอดขายสูงสุด</span>
                </div>
                <h2 className="text-3xl font-bold mb-1">{topBranch.branchName}</h2>
                <p className="text-indigo-200 mb-8">
                  ทำยอดขายได้คิดเป็น{' '}
                  {totalRevenueAll > 0 ? ((topBranch.totalSales / totalRevenueAll) * 100).toFixed(1) : 0}% ของทั้งหมด
                </p>
                <motion.div
                  className="grid gap-6 grid-cols-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ staggerChildren: 0.1 }}
                >
                  {[
                    { label: 'ยอดขาย', value: fmtM(topBranch.totalSales) },
                    { label: 'กำไรสุทธิ', value: fmtM(topBranch.netProfit) },
                    { label: 'Margin', value: `${topBranch.profitMargin.toFixed(1)}%` },
                    { label: 'ต่อบิล', value: `฿${Math.round(topBranch.avgTicketSize).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                    { label: 'ลูกค้า', value: topBranch.uniqueCustomers.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
                    { label: 'Turnover', value: `${topBranch.inventoryTurnover.toFixed(2)}x` },
                  ].map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <p className="text-indigo-200 text-sm mb-1">{item.label}</p>
                      <p className="text-2xl font-bold">{item.value}</p>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────────────
              SECTION 2: Sales vs Expense vs Profit + Sales Share
              ───────────────────────────────────────────────────────── */}
          <motion.div
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<DollarSign className="h-4 w-4 text-indigo-600" />}
                title="ยอดขาย vs ค่าใช้จ่าย vs กำไร"
                desc="เปรียบเทียบรายได้ ค่าใช้จ่าย และกำไรแต่ละกิจการ"
              />
              <div className="px-4 pb-4">
                <ReactECharts option={salesExpenseProfitChart} style={{ height: 320 }} />
              </div>
            </motion.div>

            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<Layers className="h-4 w-4 text-violet-600" />}
                title="สัดส่วนยอดขาย"
                desc="สัดส่วนยอดขายแต่ละกิจการ"
              />
              <div className="px-4 pb-4">
                <ReactECharts option={salesShareChart} style={{ height: 320 }} />
              </div>
            </motion.div>
          </motion.div>

          {/* ─────────────────────────────────────────────────────────
              SECTION 3: Margin & Growth + Monthly Trend
              ───────────────────────────────────────────────────────── */}
          <motion.div
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<Percent className="h-4 w-4 text-violet-600" />}
                title="Profit Margin & Sales Growth"
                desc="อัตรากำไรและอัตราเติบโตของยอดขาย"
              />
              <div className="px-4 pb-4">
                <ReactECharts option={marginGrowthChart} style={{ height: 300 }} />
              </div>
            </motion.div>

            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                title="แนวโน้มยอดขายรายเดือน"
                desc="เปรียบเทียบยอดขายย้อนหลัง 6 เดือน"
              />
              <div className="px-4 pb-4">
                <ReactECharts option={monthlyTrendChart} style={{ height: 300 }} />
              </div>
            </motion.div>
          </motion.div>

          {/* ─────────────────────────────────────────────────────────
              SECTION 4: Inventory Health
              ───────────────────────────────────────────────────────── */}
          <motion.div
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<Package className="h-4 w-4 text-cyan-600" />}
                title="มูลค่าสต็อก & Dead Stock"
                desc="เปรียบเทียบมูลค่าสินค้าคงคลังและสินค้าไม่เคลื่อนไหว"
              />
              <div className="px-4 pb-4">
                <ReactECharts option={inventoryChart} style={{ height: 300 }} />
              </div>
            </motion.div>

            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<Activity className="h-4 w-4 text-emerald-600" />}
                title="อัตราหมุนเวียนสต็อก"
                desc="Inventory Turnover แต่ละกิจการ"
              />
              <div className="px-4 pb-4">
                <ReactECharts option={turnoverChart} style={{ height: 300 }} />
              </div>
            </motion.div>
          </motion.div>

          {/* ─────────────────────────────────────────────────────────
              SECTION 5: Customer Metrics + Top Products
              ───────────────────────────────────────────────────────── */}
          <motion.div
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<Users className="h-4 w-4 text-violet-600" />}
                title="ตัวชี้วัดลูกค้า"
                desc="จำนวนลูกค้า, Repeat Rate, Transactions"
              />
              <div className="px-4 pb-4 flex items-center justify-center">
                <ReactECharts option={customerRadarChart} style={{ height: 300, width: '100%' }} />
              </div>
            </motion.div>

            <motion.div
              className="rounded-2xl border bg-card shadow-sm overflow-hidden"
              whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            >
              <SectionHeader
                icon={<BarChart3 className="h-4 w-4 text-amber-600" />}
                title="สินค้าขายดี"
                desc="Top 10 สินค้าจากทุกกิจการ"
              />
              <div className="px-4 pb-4">
                <ReactECharts option={topProductsChart} style={{ height: 300 }} />
              </div>
            </motion.div>
          </motion.div>

          {/* ─────────────────────────────────────────────────────────
              SECTION 6: Comparison Table
              ───────────────────────────────────────────────────────── */}
          <motion.div
            className="rounded-2xl border bg-card p-6 shadow-sm"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
          >
            <div className="mb-6">
              <h3 className="font-bold text-xl mb-1">อันดับประสิทธิภาพกิจการ</h3>
              <p className="text-muted-foreground text-sm">
                เปรียบเทียบยอดขาย กำไร สต็อก ลูกค้า และแนวโน้ม
              </p>
            </div>
            <ComparisonTable data={branches} />
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
