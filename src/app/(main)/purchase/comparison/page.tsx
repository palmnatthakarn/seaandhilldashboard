'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useComparison } from '@/lib/ComparisonContext';
import { ComparisonDateFilter } from '@/components/comparison/ComparisonDateFilter';
import { KPIGrid } from '@/components/comparison/SimpleKPICard';
import {
  ShoppingBag, Package, FileText, Users, CreditCard, BarChart3,
  TrendingUp, Building2, Trophy, Medal, Award,
  Receipt, AlertCircle,
} from 'lucide-react';
import { BRANCH_PALETTE, fmt, fmtShort, fmtNum, fmtK, shortName, GrowthBadge, SectionHeader, BranchDot } from '@/lib/comparisonUtils';
import { cn } from '@/lib/utils';
import type { PurchaseKPIs, TopSupplier, PurchaseTrendData, PurchaseByCategory, APOutstanding } from '@/lib/data/types';

/* ─── Full branch data interface ─── */
interface BranchPurchaseData {
  branchKey: string;
  branchName: string;
  kpis: PurchaseKPIs | null;
  topSuppliers: TopSupplier[];
  trendData: PurchaseTrendData[];
  byCategory: PurchaseByCategory[];
  apOutstanding: APOutstanding[];
  totalPurchaseValue: number;
  poCount: number;
  avgPOValue: number;
  supplierCount: number;
  apOutstandingTotal: number;
  apOverdue: number;
  itemsPurchased: number;
}

/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */

export default function PurchaseComparisonPage() {
  const { selectedBranches, availableBranches, isLoaded } = useComparison();
  const { dateRange, setDateRange } = useDateRangeStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BranchPurchaseData[]>([]);

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
        branchKeys.map(async (branchKey): Promise<BranchPurchaseData> => {
          const branchInfo = availableBranches.find((b: { key: string; name: string }) => b.key === branchKey);
          const params = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end });
          params.append('branch', branchKey);

          try {
            const [kpisRes, suppliersRes, trendRes, categoryRes, apRes] = await Promise.all([
              fetch(`/api/purchase/kpis?${params}`),
              fetch(`/api/purchase/top-suppliers?${params}`),
              fetch(`/api/purchase/trend?${params}`),
              fetch(`/api/purchase/by-category?${params}`),
              fetch(`/api/purchase/ap-outstanding?${params}`),
            ]);

            const [kpisJ, suppliersJ, trendJ, categoryJ, apJ] = await Promise.all([
              kpisRes.ok ? kpisRes.json() : { data: null },
              suppliersRes.ok ? suppliersRes.json() : { data: [] },
              trendRes.ok ? trendRes.json() : { data: [] },
              categoryRes.ok ? categoryRes.json() : { data: [] },
              apRes.ok ? apRes.json() : { data: [] },
            ]);

            const kpis = kpisJ.data as PurchaseKPIs | null;
            const totalPurchaseValue = kpis?.totalPurchases?.value || 0;
            const poCount = kpis?.totalPOCount?.value || 0;
            const avgPOValue = kpis?.avgPOValue?.value || 0;
            const itemsPurchased = kpis?.totalItemsPurchased?.value || 0;
            const apData = apJ.data || [];
            const apOutstandingTotal = apData.reduce((s: number, ap: APOutstanding) => s + ap.totalOutstanding, 0);
            const apOverdue = apData.reduce((s: number, ap: APOutstanding) => s + ap.overdueAmount, 0);
            const supplierCount = (suppliersJ.data || []).length;

            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              kpis,
              topSuppliers: suppliersJ.data || [],
              trendData: trendJ.data || [],
              byCategory: categoryJ.data || [],
              apOutstanding: apData,
              totalPurchaseValue,
              poCount,
              avgPOValue,
              supplierCount,
              apOutstandingTotal,
              apOverdue,
              itemsPurchased,
            };
          } catch (branchErr) {
            console.warn(`Failed to fetch data for branch ${branchKey}:`, branchErr);
            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              kpis: null, topSuppliers: [], trendData: [], byCategory: [], apOutstanding: [],
              totalPurchaseValue: 0, poCount: 0, avgPOValue: 0,
              supplierCount: 0, apOutstandingTotal: 0, apOverdue: 0, itemsPurchased: 0,
            };
          }
        })
      );
      setData(results);
    } catch (err) {
      console.error('Error fetching purchase comparison:', err);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [branchesKey, dateRange, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Computed: totals ─── */
  const totals = useMemo(() => ({
    totalPurchaseValue: data.reduce((s, d) => s + d.totalPurchaseValue, 0),
    poCount: data.reduce((s, d) => s + d.poCount, 0),
    avgPOValue: data.length > 0 ? data.reduce((s, d) => s + d.avgPOValue, 0) / data.length : 0,
    supplierCount: data.reduce((s, d) => s + d.supplierCount, 0),
    apOutstandingTotal: data.reduce((s, d) => s + d.apOutstandingTotal, 0),
    itemsPurchased: data.reduce((s, d) => s + d.itemsPurchased, 0),
  }), [data]);

  /* ─── Computed: ranked by purchase value ─── */
  const rankedData = useMemo(() =>
    [...data].sort((a, b) => b.totalPurchaseValue - a.totalPurchaseValue), [data]);

  // Framer motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">การจัดซื้อ</h1>
          <p className="text-sm text-muted-foreground mt-0.5">เปรียบเทียบข้อมูลการจัดซื้อและซัพพลายเออร์ระหว่างกิจการ</p>
        </div>
        <ComparisonDateFilter value={dateRange} onChange={setDateRange} />
      </motion.div>

      {/* Loading / Empty */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted/20 animate-pulse" />)}
          </div>
          {[...Array(4)].map((_, i) => <div key={i} className="h-56 rounded-2xl bg-muted/20 animate-pulse" />)}
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
             1) KPI Summary Cards (6 cards)
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants}>
            <KPIGrid
              columns={6}
              cards={[
                { icon: ShoppingBag, iconColor: 'text-indigo-600', label: 'มูลค่าการจัดซื้อรวม', value: totals.totalPurchaseValue, barColor: 'bg-indigo-500', subText: `จาก ${data.length} กิจการ`, format: 'money' },
                { icon: FileText, iconColor: 'text-emerald-600', label: 'ใบสั่งซื้อ (PO)', value: totals.poCount, barColor: 'bg-emerald-500', format: 'number' },
                { icon: Receipt, iconColor: 'text-amber-600', label: 'เฉลี่ยต่อ PO', value: totals.avgPOValue, barColor: 'bg-amber-500', format: 'money' },
                { icon: Users, iconColor: 'text-violet-600', label: 'ซัพพลายเออร์', value: totals.supplierCount, barColor: 'bg-violet-500', format: 'number' },
                { icon: CreditCard, iconColor: 'text-rose-600', label: 'เจ้าหนี้คงค้าง (AP)', value: totals.apOutstandingTotal, barColor: 'bg-rose-500', format: 'money' },
                { icon: Package, iconColor: 'text-cyan-600', label: 'รายการสินค้า', value: totals.itemsPurchased, barColor: 'bg-cyan-500', format: 'number' },
              ]}
            />
          </motion.div>
      {/* ════════════════════════════════════════
             8) Ranking Table
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Trophy className="h-4 w-4 text-amber-500" />}
              title="อันดับประสิทธิภาพการจัดซื้อ"
              desc="จัดอันดับตามมูลค่าการจัดซื้อ พร้อมตัวชี้วัดสำคัญ"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-border/50 bg-muted/30">
                    {['#', 'กิจการ', 'มูลค่าซื้อ', 'จำนวน PO', 'เฉลี่ยต่อ PO', 'Suppliers', 'AP คงค้าง', 'AP เกินกำหนด'].map((h, i) => (
                      <th key={i} className={cn('py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap', i <= 1 ? 'text-left' : 'text-right', i === 0 && 'pl-6 w-12', i === 7 && 'pr-6')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankedData.map((d, idx) => {
                    const RankIcon = idx === 0 ? Trophy : idx === 1 ? Award : idx === 2 ? Medal : null;
                    const rankColors = ['text-amber-500', 'text-gray-400', 'text-orange-400'];
                    const overduePercent = d.apOutstandingTotal > 0 ? (d.apOverdue / d.apOutstandingTotal) * 100 : 0;
                    return (
                      <tr key={d.branchKey} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 pl-6 pr-4">
                          {RankIcon ? <RankIcon className={cn('h-5 w-5', rankColors[idx])} /> : <span className="text-muted-foreground font-medium">{idx + 1}</span>}
                        </td>
                        <td className="py-3 px-4"><div className="flex items-center gap-2"><BranchDot idx={idx} /><span className="font-semibold text-foreground">{d.branchName}</span></div></td>
                        <td className="py-3 px-4 text-right font-bold text-indigo-600">{fmtShort(d.totalPurchaseValue)} <GrowthBadge value={d.kpis?.totalPurchases?.growthPercentage} /></td>
                        <td className="py-3 px-4 text-right font-medium">{fmtNum(d.poCount)}</td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(d.avgPOValue)}</td>
                        <td className="py-3 px-4 text-right font-medium">{fmtNum(d.supplierCount)} ราย</td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(d.apOutstandingTotal)}</td>
                        <td className="py-3 pr-6 pl-4 text-right">
                          <span className={cn('text-xs font-semibold px-2 py-1 rounded-lg', overduePercent > 20 ? 'bg-rose-50 text-rose-700' : overduePercent > 10 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                            {fmtShort(d.apOverdue)} ({overduePercent.toFixed(0)}%)
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
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-xl shadow-indigo-500/25">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Trophy className="h-48 w-48 rotate-12" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-xl bg-white/20 p-2 backdrop-blur-sm">
                    <Trophy className="h-6 w-6 text-yellow-300" />
                  </div>
                  <span className="text-sm font-semibold uppercase tracking-wider opacity-90">กิจการที่มีประสิทธิภาพสูงสุด</span>
                </div>
                <h3 className="text-3xl font-bold mb-6">{bestPerformer.branchName}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs opacity-75 mb-1">มูลค่าการจัดซื้อ</p>
                    <p className="text-2xl font-bold">{fmtShort(bestPerformer.totalPurchaseValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-75 mb-1">จำนวน PO</p>
                    <p className="text-2xl font-bold">{fmtNum(bestPerformer.poCount)}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-75 mb-1">ซัพพลายเออร์</p>
                    <p className="text-2xl font-bold">{fmtNum(bestPerformer.supplierCount)}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-75 mb-1">เฉลี่ยต่อ PO</p>
                    <p className="text-2xl font-bold">{fmtShort(bestPerformer.avgPOValue)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}*/}

          {/* ════════════════════════════════════════
             3) Purchase Value Comparison (Ranked Bar Chart)
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<BarChart3 className="h-4 w-4 text-indigo-500" />}
              title="มูลค่าการจัดซื้อเปรียบเทียบ"
              desc="เปรียบเทียบมูลค่าการจัดซื้อของแต่ละกิจการ (เรียงตามมูลค่าสูงสุด)"
            />
            <div className="px-6 pb-5">
              {(() => {
                const option = {
                  tooltip: {
                    trigger: 'axis' as const,
                    axisPointer: { type: 'shadow' as const },
                    backgroundColor: '#fff',
                    borderColor: '#e2e8f0',
                    textStyle: { color: '#1e293b', fontSize: 12 },
                    extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                    formatter: (params: any) => {
                      const p = params[0];
                      return `<div style="font-weight:600;margin-bottom:4px;">${p.name}</div><div>${p.seriesName}: ${fmt(p.value)}</div>`;
                    },
                  },
                  grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                  xAxis: {
                    type: 'category' as const,
                    data: rankedData.map(d => shortName(d.branchName)),
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { color: '#475569', fontSize: 11, rotate: 15, fontWeight: 500 },
                  },
                  yAxis: {
                    type: 'value' as const,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#f1f5f9' } },
                    axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) },
                  },
                  series: [{
                    name: 'มูลค่าการจัดซื้อ',
                    type: 'bar' as const,
                    data: rankedData.map((d, i) => ({
                      value: d.totalPurchaseValue,
                      itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex, borderRadius: [4, 4, 0, 0] },
                    })),
                    barMaxWidth: 48,
                  }],
                };
                return <ReactECharts option={option} style={{ height: 300 }} opts={{ renderer: 'svg' }} />;
              })()}
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {/* ════════════════════════════════════════
               4) PO Count & Avg PO Value (Bar + Line Combo)
               ════════════════════════════════════════ */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader
                icon={<FileText className="h-4 w-4 text-emerald-500" />}
                title="จำนวน PO และค่าเฉลี่ย"
                desc="เปรียบเทียบจำนวนใบสั่งซื้อและค่าเฉลี่ยต่อใบ"
              />
              <div className="px-6 pb-5">
                {(() => {
                  const option = {
                    tooltip: {
                      trigger: 'axis' as const,
                      axisPointer: { type: 'cross' as const },
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      textStyle: { color: '#1e293b', fontSize: 12 },
                      extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                      formatter: (params: any) => {
                        let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
                        params.forEach((p: any) => {
                          const val = p.seriesName === 'จำนวน PO'
                            ? Math.round(p.value).toLocaleString('th-TH')
                            : fmt(p.value);
                          html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${val}</div>`;
                        });
                        return html;
                      },
                    },
                    legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                    grid: { top: 16, right: 50, bottom: 40, left: 50, containLabel: true },
                    xAxis: {
                      type: 'category' as const,
                      data: rankedData.map(d => shortName(d.branchName)),
                      axisLabel: { color: '#475569', fontSize: 10, rotate: 15 },
                    },
                    yAxis: [
                      {
                        type: 'value' as const,
                        name: 'จำนวน PO',
                        position: 'left' as const,
                        axisLabel: { color: '#94a3b8', fontSize: 11 },
                        splitLine: { lineStyle: { color: '#f1f5f9' } },
                      },
                      {
                        type: 'value' as const,
                        name: 'เฉลี่ยต่อ PO',
                        position: 'right' as const,
                        axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) },
                      },
                    ],
                    series: [
                      {
                        name: 'จำนวน PO',
                        type: 'bar' as const,
                        data: rankedData.map(d => d.poCount),
                        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
                        barMaxWidth: 32,
                      },
                      {
                        name: 'เฉลี่ยต่อ PO',
                        type: 'line' as const,
                        yAxisIndex: 1,
                        data: rankedData.map(d => d.avgPOValue),
                        lineStyle: { width: 3 },
                        itemStyle: { color: '#f59e0b' },
                        symbol: 'circle',
                        symbolSize: 8,
                      },
                    ],
                  };
                  return <ReactECharts option={option} style={{ height: 280 }} opts={{ renderer: 'svg' }} />;
                })()}
              </div>
            </div>

            {/* ════════════════════════════════════════
               5) Top Suppliers Distribution
               ════════════════════════════════════════ */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader
                icon={<Users className="h-4 w-4 text-violet-500" />}
                title="ซัพพลายเออร์หลัก"
                desc="แสดงจำนวนซัพพลายเออร์ของแต่ละกิจการ"
              />
              <div className="px-6 pb-5">
                {(() => {
                  const option = {
                    tooltip: {
                      trigger: 'item' as const,
                      formatter: '{b}: {c} ราย ({d}%)',
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      textStyle: { color: '#1e293b', fontSize: 12 },
                      extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                    },
                    legend: { orient: 'vertical' as const, right: 10, top: 'center', textStyle: { color: '#64748b', fontSize: 11 } },
                    series: [{
                      type: 'pie' as const,
                      radius: ['45%', '75%'],
                      center: ['35%', '50%'],
                      avoidLabelOverlap: true,
                      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                      label: { show: false },
                      data: rankedData.map((d, i) => ({
                        name: shortName(d.branchName),
                        value: d.supplierCount,
                        itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
                      })),
                    }],
                  };
                  return <ReactECharts option={option} style={{ height: 280 }} opts={{ renderer: 'svg' }} />;
                })()}
              </div>
            </div>

            {/* ════════════════════════════════════════
               6) AP Outstanding (Stacked Bar)
               ════════════════════════════════════════ */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader
                icon={<CreditCard className="h-4 w-4 text-rose-500" />}
                title="เจ้าหนี้คงค้าง (AP)"
                desc="เปรียบเทียบยอดเจ้าหนี้คงค้างและเกินกำหนดชำระ"
              />
              <div className="px-6 pb-5">
                {(() => {
                  const option = {
                    tooltip: {
                      trigger: 'axis' as const,
                      axisPointer: { type: 'shadow' as const },
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      textStyle: { color: '#1e293b', fontSize: 12 },
                      extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                      formatter: (params: any) => {
                        let html = `<div class="font-semibold mb-1">${params[0].axisValue}</div>`;
                        params.forEach((p: any) => {
                          html += `<div style="display:flex;align-items:center;gap:6px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmt(p.value)}</div>`;
                        });
                        return html;
                      },
                    },
                    legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                    grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                    xAxis: {
                      type: 'category' as const,
                      data: rankedData.map(d => shortName(d.branchName)),
                      axisLabel: { color: '#475569', fontSize: 10, rotate: 15 },
                    },
                    yAxis: {
                      type: 'value' as const,
                      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) },
                      splitLine: { lineStyle: { color: '#f1f5f9' } },
                    },
                    series: [
                      {
                        name: 'ยอดปกติ',
                        type: 'bar' as const,
                        stack: 'total',
                        data: rankedData.map(d => d.apOutstandingTotal - d.apOverdue),
                        itemStyle: { color: '#f59e0b', borderRadius: [0, 0, 0, 0] },
                        barMaxWidth: 36,
                      },
                      {
                        name: 'เกินกำหนด',
                        type: 'bar' as const,
                        stack: 'total',
                        data: rankedData.map(d => d.apOverdue),
                        itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] },
                      },
                    ],
                  };
                  return <ReactECharts option={option} style={{ height: 280 }} opts={{ renderer: 'svg' }} />;
                })()}
              </div>
            </div>

            {/* ════════════════════════════════════════
               7) Purchase Trend (Multi-line)
               ════════════════════════════════════════ */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader
                icon={<TrendingUp className="h-4 w-4 text-cyan-500" />}
                title="แนวโน้มการจัดซื้อ"
                desc="เปรียบเทียบแนวโน้มมูลค่าจัดซื้อตามเวลา"
              />
              <div className="px-6 pb-5">
                {(() => {
                  const allMonths = new Set<string>();
                  data.forEach(d => d.trendData.forEach(t => allMonths.add(t.month)));
                  const months = Array.from(allMonths).sort();

                  const option = {
                    tooltip: {
                      trigger: 'axis' as const,
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      textStyle: { color: '#1e293b', fontSize: 12 },
                      extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                      formatter: (params: any) => {
                        let html = `<div style="font-weight:600;margin-bottom:4px;">${params[0].axisValue}</div>`;
                        params.forEach((p: any) => {
                          html += `<div style="display:flex;align-items:center;gap:6px;margin-top:2px;"><span style="background:${p.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${p.seriesName}: ${fmt(p.value)}</div>`;
                        });
                        return html;
                      },
                    },
                    legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                    grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                    xAxis: {
                      type: 'category' as const,
                      data: months,
                      axisLabel: { color: '#475569', fontSize: 10 },
                    },
                    yAxis: {
                      type: 'value' as const,
                      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) },
                      splitLine: { lineStyle: { color: '#f1f5f9' } },
                    },
                    series: rankedData.map((d, i) => ({
                      name: shortName(d.branchName),
                      type: 'line' as const,
                      smooth: true,
                      data: months.map(m => {
                        const found = d.trendData.find(t => t.month === m);
                        return found ? found.totalPurchases : 0;
                      }),
                      lineStyle: { width: 2.5 },
                      itemStyle: { color: BRANCH_PALETTE[i % BRANCH_PALETTE.length].hex },
                      symbol: 'circle',
                      symbolSize: 6,
                    })),
                  };
                  return <ReactECharts option={option} style={{ height: 280 }} opts={{ renderer: 'svg' }} />;
                })()}
              </div>
            </div>
          </motion.div>

    
        </>
      )}
    </motion.div>
  );
}
