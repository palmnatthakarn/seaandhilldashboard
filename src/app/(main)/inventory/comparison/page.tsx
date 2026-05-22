'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useComparison } from '@/lib/ComparisonContext';
import { ComparisonDateFilter } from '@/components/comparison/ComparisonDateFilter';
import { KPIGrid } from '@/components/comparison/SimpleKPICard';
import {
  Package, AlertTriangle, AlertCircle, BarChart3,
  TrendingUp, RefreshCw, Clock, Boxes,
  Building2, Trophy, Medal, Award, Calendar, DollarSign,
} from 'lucide-react';
import { BRANCH_PALETTE, fmt, fmtShort, fmtNum, fmtK, shortName, SectionHeader, BranchDot } from '@/lib/comparisonUtils';
import { cn } from '@/lib/utils';
import type { InventoryKPIs, TopProduct, InventoryTurnover, SlowMovingItem } from '@/lib/data/types';

/* ─── Branch data interface ─── */
interface BranchInventoryData {
  branchKey: string;
  branchName: string;
  totalValue: number;
  totalItems: number;
  turnoverRate: number;
  deadStockValue: number;
  deadStockPercent: number;
  lowStockCount: number;
  overstockCount: number;
  slowMovingCount: number;
  avgStockDays: number;
  stockToSalesRatio: number;
  topProducts: TopProduct[];
  aging0to30: number;
  aging31to60: number;
  aging61to90: number;
  aging90plus: number;
}

/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */

export default function InventoryComparisonPage() {
  const { selectedBranches, availableBranches, isLoaded } = useComparison();
  const { dateRange, setDateRange } = useDateRangeStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BranchInventoryData[]>([]);

  // Stable key to prevent infinite re-fetch from array reference changes
  const branchesKey = useMemo(() => selectedBranches.join(','), [selectedBranches]);

  /* ─── Fetch data from multiple endpoints and combine ─── */
  const fetchData = useCallback(async () => {
    if (!isLoaded || selectedBranches.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const branchKeys = selectedBranches.filter((k: string) => k !== 'ALL');

      const results = await Promise.all(
        branchKeys.map(async (branchKey): Promise<BranchInventoryData> => {
          const branchInfo = availableBranches.find((b: { key: string; name: string }) => b.key === branchKey);
          const params = new URLSearchParams({
            as_of_date: dateRange.end,
            start_date: dateRange.start,
            end_date: dateRange.end,
          });
          params.append('branch', branchKey);

          try {
            const [kpisRes, productsRes, turnoverRes, slowMovingRes] = await Promise.all([
              fetch(`/api/inventory/kpis?${params}`),
              fetch(`/api/inventory/top-products?${params}`),
              fetch(`/api/inventory/turnover?${params}`),
              fetch(`/api/inventory/slow-moving?${params}`),
            ]);

            const [kpisData, productsData, turnoverJson, slowMovingJson] = await Promise.all([
              kpisRes.ok ? kpisRes.json() : { data: null },
              productsRes.ok ? productsRes.json() : { data: [] },
              turnoverRes.ok ? turnoverRes.json() : { data: [] },
              slowMovingRes.ok ? slowMovingRes.json() : { data: [] },
            ]);

            const kpis = kpisData.data as InventoryKPIs | null;
            const topProducts = (productsData.data || []).slice(0, 5) as TopProduct[];
            const turnoverItems = (turnoverJson.data || []) as InventoryTurnover[];
            const slowMovingItems = (slowMovingJson.data || []) as SlowMovingItem[];

            const totalValue = kpis?.totalInventoryValue?.value || 0;
            const totalItems = kpis?.totalItemsInStock?.value || 0;
            const turnoverRate = turnoverItems.length > 0
              ? turnoverItems.reduce((s, t) => s + t.turnoverRatio, 0) / turnoverItems.length
              : 0;
            const deadStockValue = slowMovingItems.reduce((s, item) => s + item.stockValue, 0);
            const deadStockPercent = totalValue > 0 ? (deadStockValue / totalValue) * 100 : 0;
            const slowMovingCount = slowMovingItems.length;

            // Stock aging from real turnover data — grouped by days-to-sell per category
            const aging0to30 = turnoverItems.filter(t => t.daysToSell <= 30).reduce((s, t) => s + t.avgInventoryValue, 0);
            const aging31to60 = turnoverItems.filter(t => t.daysToSell > 30 && t.daysToSell <= 60).reduce((s, t) => s + t.avgInventoryValue, 0);
            const aging61to90 = turnoverItems.filter(t => t.daysToSell > 60 && t.daysToSell <= 90).reduce((s, t) => s + t.avgInventoryValue, 0);
            const aging90plus = turnoverItems.filter(t => t.daysToSell > 90).reduce((s, t) => s + t.avgInventoryValue, 0);

            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              totalValue,
              totalItems,
              turnoverRate,
              deadStockValue,
              deadStockPercent,
              lowStockCount: kpis?.lowStockAlerts?.value || 0,
              overstockCount: kpis?.overstockAlerts?.value || 0,
              slowMovingCount,
              avgStockDays: turnoverRate > 0 ? 365 / turnoverRate : 0,
              stockToSalesRatio: 1 / (turnoverRate || 1),
              topProducts,
              aging0to30,
              aging31to60,
              aging61to90,
              aging90plus,
            };
          } catch (err) {
            console.warn(`Failed to fetch data for branch ${branchKey}:`, err);
            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              totalValue: 0, totalItems: 0, turnoverRate: 0,
              deadStockValue: 0, deadStockPercent: 0,
              lowStockCount: 0, overstockCount: 0, slowMovingCount: 0,
              avgStockDays: 0, stockToSalesRatio: 0, topProducts: [],
              aging0to30: 0, aging31to60: 0, aging61to90: 0, aging90plus: 0,
            };
          }
        })
      );

      setData(results);
    } catch (err) {
      console.error('Error fetching inventory comparison:', err);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [branchesKey, dateRange, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Computed totals ─── */
  const totals = useMemo(() => ({
    totalValue: data.reduce((s, d) => s + d.totalValue, 0),
    totalItems: data.reduce((s, d) => s + d.totalItems, 0),
    deadStockValue: data.reduce((s, d) => s + d.deadStockValue, 0),
    lowStockCount: data.reduce((s, d) => s + d.lowStockCount, 0),
    avgTurnover: data.length > 0 ? data.reduce((s, d) => s + d.turnoverRate, 0) / data.length : 0,
  }), [data]);

  /* ─══════════════════════════════════════════════════════════════════
     CHART OPTIONS
     ══════════════════════════════════════════════════════════════════ */

  /* 1. Inventory Value Distribution - Grouped Bar */
  const inventoryValueChart = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const name = params[0]?.axisValue || '';
        let html = `<div style="font-weight:600;margin-bottom:4px;">${name}</div>`;
        params.forEach((p: any) => {
          html += `<div style="display:flex;align-items:center;gap:6px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmt(p.value)}</div>`;
        });
        return html;
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 30, right: 20, bottom: 50, left: 60, containLabel: true },
    xAxis: { type: 'category', data: data.map(b => shortName(b.branchName)), axisLabel: { rotate: 20, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtShort(v) } },
    series: [
      { name: 'มูลค่าสต็อก', type: 'bar', data: data.map(b => b.totalValue), itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] } },
      { name: 'Dead Stock', type: 'bar', data: data.map(b => b.deadStockValue), itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] } },
    ],
  }), [data]);

  /* 2. Turnover Rate Comparison - Horizontal Bar */
  const turnoverChart = useMemo(() => ({
    tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0].name}: ${params[0].value.toFixed(2)}x` },
    grid: { top: 10, right: 40, bottom: 20, left: 10, containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: '{value}x' } },
    yAxis: { type: 'category', data: [...data].reverse().map(b => shortName(b.branchName)), axisLabel: { fontSize: 10 } },
    series: [{
      type: 'bar',
      data: [...data].reverse().map((b, i) => ({
        value: b.turnoverRate,
        itemStyle: { color: BRANCH_PALETTE[(data.length - 1 - i) % BRANCH_PALETTE.length].hex, borderRadius: [0, 4, 4, 0] },
      })),
      barWidth: '60%',
    }],
  }), [data]);

  /* 3. Stock Aging Analysis - Stacked Bar */
  const agingChart = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
        params.forEach((p: any) => {
          html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmt(p.value)}</div>`;
        });
        return html;
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 30, right: 20, bottom: 50, left: 60, containLabel: true },
    xAxis: { type: 'category', data: data.map(b => shortName(b.branchName)), axisLabel: { rotate: 20, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtShort(v) } },
    series: [
      { name: '0-30 วัน', type: 'bar', stack: 'age', data: data.map(b => b.aging0to30), itemStyle: { color: '#10b981' } },
      { name: '31-60 วัน', type: 'bar', stack: 'age', data: data.map(b => b.aging31to60), itemStyle: { color: '#f59e0b' } },
      { name: '61-90 วัน', type: 'bar', stack: 'age', data: data.map(b => b.aging61to90), itemStyle: { color: '#f97316' } },
      { name: '90+ วัน', type: 'bar', stack: 'age', data: data.map(b => b.aging90plus), itemStyle: { color: '#ef4444' } },
    ],
  }), [data]);

  /* 4. Dead Stock % - Donut Chart */
  const deadStockChart = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['45%', '75%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: data.map((b, i) => ({
        name: shortName(b.branchName),
        value: b.deadStockPercent,
        itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
      })),
    }],
  }), [data]);

  /* 5. Top Products Comparison */
  const topProductsChart = useMemo(() => {
    const products: { name: string; branch: string; sales: number; color: string }[] = [];
    data.forEach((b, i) => {
      b.topProducts.slice(0, 3).forEach(p => {
        products.push({
          name: (p.itemName || '').substring(0, 20),
          branch: shortName(b.branchName),
          sales: p.totalSales || 0,
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
          let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
          params.forEach((p: any) => {
            html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${fmt(p.value)}</div>`;
          });
          return html;
        },
      },
      grid: { top: 10, right: 40, bottom: 20, left: 10, containLabel: true },
      xAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtShort(v) } },
      yAxis: { type: 'category', data: top10.map(p => p.name).reverse(), axisLabel: { fontSize: 10 } },
      series: [{
        type: 'bar',
        data: top10.reverse().map(p => ({ value: p.sales, itemStyle: { color: p.color, borderRadius: [0, 4, 4, 0] } })),
        barWidth: '60%',
      }],
    };
  }, [data]);

  /* 6. Stock Coverage Days - Radar */
  const coverageRadarChart = useMemo(() => ({
    tooltip: {},
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    radar: {
      indicator: data.map(b => ({ name: shortName(b.branchName), max: 180 })),
      radius: '65%',
    },
    series: [{
      type: 'radar',
      data: [{
        name: 'วันที่สต็อกพอขาย',
        value: data.map(b => b.avgStockDays),
        lineStyle: { color: '#6366f1', width: 2 },
        areaStyle: { color: '#6366f1', opacity: 0.2 },
        itemStyle: { color: '#6366f1' },
      }],
    }],
  }), [data]);

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">สินค้าคงคลัง</h1>
          <p className="text-sm text-muted-foreground mt-0.5">เปรียบเทียบมูลค่าสต็อก อัตราหมุนเวียน และสถานะคลังสินค้า</p>
        </div>
        <ComparisonDateFilter value={dateRange} onChange={setDateRange} />
      </motion.div>

      {/* Loading / Empty */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted/20 animate-pulse" />)}
          </div>
          {[...Array(3)].map((_, i) => <div key={i} className="h-64 rounded-2xl bg-muted/20 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-rose-400" />
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
              columns={5}
              cards={[
                { 
                  icon: DollarSign, 
                  iconColor: 'text-indigo-600',
                  label: 'มูลค่าสต็อกรวม', 
                  value: totals.totalValue, 
                  barColor: 'bg-indigo-500', 
                  subText: `จาก ${data.length} กิจการ`, 
                  format: 'money' 
                },
                { 
                  icon: Boxes, 
                  iconColor: 'text-emerald-600',
                  label: 'รายการสินค้า', 
                  value: totals.totalItems, 
                  barColor: 'bg-emerald-500', 
                  format: 'number' 
                },
                { 
                  icon: RefreshCw, 
                  iconColor: 'text-sky-600',
                  label: 'อัตราหมุนเวียนเฉลี่ย', 
                  value: totals.avgTurnover, 
                  barColor: 'bg-sky-500', 
                  format: 'turnover', 
                  subText: 'x/ปี' 
                },
                { 
                  icon: AlertCircle, 
                  iconColor: 'text-rose-600',
                  label: 'Dead Stock', 
                  value: totals.deadStockValue, 
                  barColor: 'bg-rose-500', 
                  format: 'money', 
                  subText: `${totals.totalValue > 0 ? ((totals.deadStockValue / totals.totalValue) * 100).toFixed(1) : 0}%` 
                },
                { 
                  icon: AlertTriangle, 
                  iconColor: 'text-amber-600',
                  label: 'สินค้าใกล้หมด', 
                  value: totals.lowStockCount, 
                  barColor: 'bg-amber-500', 
                  format: 'number' 
                },
              ]}
            />
          </motion.div>
 {/* ════════════════════════════════════════
             4) Detailed Ranking Table
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<BarChart3 className="h-4 w-4 text-primary" />}
              title="อันดับประสิทธิภาพการบริหารสต็อก"
              desc="เปรียบเทียบรายละเอียดการบริหารสต็อกระหว่างกิจการ"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">กิจการ</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">มูลค่าสต็อก</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">รายการ</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Turnover</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">สต็อกพอขาย</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Dead %</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">ใกล้หมด</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">เกินคลัง</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].sort((a, b) => b.turnoverRate - a.turnoverRate).map((branch, idx) => {
                    const medals = [
                      <Trophy key="1" className="h-5 w-5 text-amber-500" />,
                      <Medal key="2" className="h-5 w-5 text-slate-400" />,
                      <Award key="3" className="h-5 w-5 text-amber-700" />,
                    ];
                    return (
                      <tr key={branch.branchKey} className="border-t hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-center">{idx < 3 ? medals[idx] : idx + 1}</td>
                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                          <BranchDot idx={data.findIndex(d => d.branchKey === branch.branchKey)} />
                          {branch.branchName}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{fmtShort(branch.totalValue)}</td>
                        <td className="px-4 py-3 text-right">{fmtNum(branch.totalItems)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-semibold', branch.turnoverRate >= 6 ? 'text-emerald-600' : branch.turnoverRate >= 3 ? 'text-amber-600' : 'text-rose-600')}>
                            {branch.turnoverRate.toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">{Math.round(branch.avgStockDays)} วัน</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-semibold', branch.deadStockPercent < 10 ? 'text-emerald-600' : branch.deadStockPercent < 20 ? 'text-amber-600' : 'text-rose-600')}>
                            {branch.deadStockPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(branch.lowStockCount > 0 && 'text-amber-600 font-semibold')}>
                            {branch.lowStockCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(branch.overstockCount > 0 && 'text-rose-600 font-semibold')}>
                            {branch.overstockCount}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
          {/* ════════════════════════════════════════
             2) Best Performer Hero Card
             ════════════════════════════════════════ 
          {bestPerformer && (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-cyan-700 p-8 text-white shadow-xl shadow-emerald-500/25">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Trophy className="h-48 w-48 rotate-12" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-xl bg-white/20 p-2 backdrop-blur-sm">
                    <Trophy className="h-6 w-6 text-yellow-300" />
                  </div>
                  <span className="text-emerald-100 font-medium">อัตราหมุนเวียนสูงสุด</span>
                </div>
                <h2 className="text-3xl font-bold mb-1">{bestPerformer.branchName}</h2>
                <p className="text-emerald-200 mb-8">
                  จัดการสต็อกได้อย่างมีประสิทธิภาพด้วยอัตราหมุนเวียน {bestPerformer.turnoverRate.toFixed(2)}x ต่อปี
                </p>
                <div className="grid gap-6 grid-cols-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <p className="text-emerald-200 text-sm mb-1">มูลค่าสต็อก</p>
                    <p className="text-2xl font-bold">{fmtShort(bestPerformer.totalValue)}</p>
                  </div>
                  <div>
                    <p className="text-emerald-200 text-sm mb-1">Turnover</p>
                    <p className="text-2xl font-bold text-yellow-300">{bestPerformer.turnoverRate.toFixed(2)}x</p>
                  </div>
                  <div>
                    <p className="text-emerald-200 text-sm mb-1">วันที่สต็อกพอขาย</p>
                    <p className="text-2xl font-bold">{Math.round(bestPerformer.avgStockDays)} วัน</p>
                  </div>
                  <div>
                    <p className="text-emerald-200 text-sm mb-1">Dead Stock</p>
                    <p className="text-2xl font-bold">{bestPerformer.deadStockPercent.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-emerald-200 text-sm mb-1">รายการสินค้า</p>
                    <p className="text-2xl font-bold">{fmtNum(bestPerformer.totalItems)}</p>
                  </div>
                  <div>
                    <p className="text-emerald-200 text-sm mb-1">ใกล้หมด</p>
                    <p className="text-2xl font-bold">{bestPerformer.lowStockCount}</p>
                  </div>
                </div>
              </div>
            </div>
          )}*/}

          {/* ════════════════════════════════════════
             3) Charts Section
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<Package className="h-4 w-4 text-indigo-600" />} title="มูลค่าสต็อกและ Dead Stock" desc="เปรียบเทียบมูลค่าสต็อกและสินค้าไม่เคลื่อนไหว" />
              <div className="px-4 pb-4">
                <ReactECharts option={inventoryValueChart} style={{ height: 320 }} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<RefreshCw className="h-4 w-4 text-emerald-600" />} title="อัตราหมุนเวียนสต็อก" desc="Inventory Turnover Rate (x/ปี)" />
              <div className="px-4 pb-4">
                <ReactECharts option={turnoverChart} style={{ height: 320 }} />
              </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<Clock className="h-4 w-4 text-amber-600" />} title="การแบ่งอายุสต็อก" desc="Stock Aging Analysis" />
              <div className="px-4 pb-4">
                <ReactECharts option={agingChart} style={{ height: 320 }} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<AlertCircle className="h-4 w-4 text-rose-600" />} title="สัดส่วน Dead Stock" desc="เปอร์เซ็นต์สินค้าไม่เคลื่อนไหว" />
              <div className="px-4 pb-4">
                <ReactECharts option={deadStockChart} style={{ height: 320 }} />
              </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<TrendingUp className="h-4 w-4 text-sky-600" />} title="สินค้าขายดี Top 10" desc="สินค้าที่มียอดขายสูงสุดจากทุกกิจการ" />
              <div className="px-4 pb-4">
                <ReactECharts option={topProductsChart} style={{ height: 320 }} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader icon={<Calendar className="h-4 w-4 text-violet-600" />} title="วันที่สต็อกพอขาย" desc="Stock Coverage Days" />
              <div className="px-4 pb-4 flex items-center justify-center">
                <ReactECharts option={coverageRadarChart} style={{ height: 320, width: '100%' }} />
              </div>
            </div>
          </motion.div>

         
        </>
      )}
    </motion.div>
  );
}
