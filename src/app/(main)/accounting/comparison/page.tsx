'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import ReactECharts from 'echarts-for-react';
import { motion } from 'framer-motion';
import { useComparison } from '@/lib/ComparisonContext';
import { ComparisonDateFilter } from '@/components/shared/comparison/ComparisonDateFilter';
import { KPIGrid } from '@/components/shared/comparison/SimpleKPICard';
import {
  Wallet, CreditCard, PiggyBank, TrendingUp, TrendingDown,
  BarChart3, Trophy, Award, Medal, Building2,
  Scale, Receipt, Layers,
} from 'lucide-react';
import { BRANCH_PALETTE, fmt, fmtShort, GrowthBadge, SectionHeader, BranchDot } from '@/lib/comparisonUtils';
import { cn } from '@/lib/utils';
import type {
  AccountingKPIs, ProfitLossData,
  BalanceSheetItem, CashFlowData, AgingItem, CategoryBreakdown,
} from '@/lib/data/types';

/* ─── Full branch data interface ─── */
interface BranchAccountingData {
  branchKey: string;
  branchName: string;
  kpis: AccountingKPIs | null;
  profitLoss: ProfitLossData[];
  balanceSheet: BalanceSheetItem[];
  cashFlow: CashFlowData[];
  arAging: AgingItem[];
  apAging: AgingItem[];
  revenueBreakdown: CategoryBreakdown[];
  expenseBreakdown: CategoryBreakdown[];
}

/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */

export default function AccountingComparisonPage() {
  const { selectedBranches, availableBranches, isLoaded } = useComparison();
  const { dateRange, setDateRange } = useDateRangeStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BranchAccountingData[]>([]);

  // Stable key to prevent infinite re-fetch from array reference changes
  const branchesKey = useMemo(() => selectedBranches.join(','), [selectedBranches]);

  /* ─── Fetch ALL 7 endpoints per branch ─── */
  const fetchData = useCallback(async () => {
    if (!isLoaded || selectedBranches.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const branchKeys = selectedBranches.filter((k: string) => k !== 'ALL');

      const results = await Promise.all(
        branchKeys.map(async (branchKey): Promise<BranchAccountingData> => {
          const branchInfo = availableBranches.find((b: { key: string; name: string }) => b.key === branchKey);
          const dateParams = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end });
          dateParams.append('branch', branchKey);

          try {
            const [kpisRes, plRes, bsRes, cfRes, arRes, apRes, brkRes] = await Promise.all([
              fetch(`/api/accounting/kpis?${dateParams}`),
              fetch(`/api/accounting/profit-loss?${dateParams}`),
              fetch(`/api/accounting/balance-sheet?${dateParams}`),
              fetch(`/api/accounting/cash-flow?${dateParams}`),
              fetch(`/api/accounting/ar-aging?${dateParams}`),
              fetch(`/api/accounting/ap-aging?${dateParams}`),
              fetch(`/api/accounting/revenue-expense-breakdown?${dateParams}`),
            ]);

            const [kpisJ, plJ, bsJ, cfJ, arJ, apJ, brkJ] = await Promise.all([
              kpisRes.ok ? kpisRes.json() : { data: null },
              plRes.ok ? plRes.json() : { data: [] },
              bsRes.ok ? bsRes.json() : { data: [] },
              cfRes.ok ? cfRes.json() : { data: [] },
              arRes.ok ? arRes.json() : { data: [] },
              apRes.ok ? apRes.json() : { data: [] },
              brkRes.ok ? brkRes.json() : { data: { revenue: [], expenses: [] } },
            ]);

            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              kpis: kpisJ.data,
              profitLoss: plJ.data || [],
              balanceSheet: bsJ.data || [],
              cashFlow: cfJ.data || [],
              arAging: arJ.data || [],
              apAging: apJ.data || [],
              revenueBreakdown: brkJ.data?.revenue || [],
              expenseBreakdown: brkJ.data?.expenses || [],
            };
          } catch (branchErr) {
            console.warn(`Failed to fetch data for branch ${branchKey}:`, branchErr);
            return {
              branchKey,
              branchName: branchInfo?.name || `กิจการ ${branchKey}`,
              kpis: null,
              profitLoss: [], balanceSheet: [], cashFlow: [],
              arAging: [], apAging: [], revenueBreakdown: [], expenseBreakdown: [],
            };
          }
        })
      );
      setData(results);
    } catch (err) {
      console.error('Error fetching accounting comparison:', err);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [branchesKey, dateRange, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Computed: totals ─── */
  const totals = useMemo(() => {
    const sum = (fn: (d: BranchAccountingData) => number) => data.reduce((s, d) => s + fn(d), 0);
    const revenue = sum(d => d.kpis?.revenue?.value || 0);
    const expenses = sum(d => d.kpis?.expenses?.value || 0);
    return {
      revenue, expenses, netProfit: revenue - expenses,
      assets: sum(d => d.kpis?.assets?.value || 0),
      liabilities: sum(d => d.kpis?.liabilities?.value || 0),
      equity: sum(d => d.kpis?.equity?.value || 0),
    };
  }, [data]);

  /* ─── Computed: ranked by net profit ─── */
  const rankedData = useMemo(() =>
    [...data].sort((a, b) => {
      const pA = (a.kpis?.revenue?.value || 0) - (a.kpis?.expenses?.value || 0);
      const pB = (b.kpis?.revenue?.value || 0) - (b.kpis?.expenses?.value || 0);
      return pB - pA;
    }), [data]);

  /* ─── Account group name mapping (Thai chart of accounts) ─── */
  const ACCOUNT_GROUP_NAMES: Record<string, string> = {
    // รายได้ (Income)
    '41': 'รายได้จากการขาย',
    '42': 'รายได้อื่น',
    // ค่าใช้จ่าย (Expenses)
    '51': 'ต้นทุนขาย',
    '52': 'ค่าใช้จ่ายในการขาย',
    '53': 'ค่าใช้จ่ายในการบริหาร',
    '54': 'ค่าใช้จ่ายอื่น',
    '55': 'ต้นทุนการผลิต',
    // สินทรัพย์ (Assets)
    '11': 'สินทรัพย์หมุนเวียน',
    '12': 'สินทรัพย์ไม่หมุนเวียน',
    // หนี้สิน (Liabilities)
    '21': 'หนี้สินหมุนเวียน',
    '22': 'หนี้สินไม่หมุนเวียน',
    // ส่วนของเจ้าของ (Equity)
    '31': 'ทุน',
    '32': 'กำไรสะสม',
    '33': 'องค์ประกอบอื่นของส่วนของเจ้าของ',
  };
  const getGroupLabel = (code: string, fallbackName: string) => {
    const mapped = ACCOUNT_GROUP_NAMES[code];
    if (mapped) return `${code} - ${mapped}`;
    // If code looks like a 2-digit number, show it with fallback name
    if (/^\d{2}$/.test(code)) return `${code} - ${fallbackName}`;
    return fallbackName;
  };

  /* ─── Balance sheet type grouping ─── */
  const groupBalanceSheet = (items: BalanceSheetItem[]) => {
    const groups: Record<string, number> = {};
    items.forEach(item => {
      groups[item.typeName] = (groups[item.typeName] || 0) + item.balance;
    });
    return groups;
  };

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">บัญชีและการเงิน</h1>
          <p className="text-sm text-muted-foreground mt-0.5">เปรียบเทียบข้อมูลทางบัญชีและการเงินทั้งหมดระหว่างกิจการ</p>
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
            <Scale className="h-8 w-8 text-rose-400" />
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
             1) KPI Summary Cards (รวม)
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants}>
            <KPIGrid
              columns={5}
              cards={[
                { icon: TrendingUp, iconColor: 'text-emerald-600', label: 'รายได้รวม', value: totals.revenue, barColor: 'bg-emerald-500', subText: `จาก ${data.length} กิจการ`, format: 'money' },
                { icon: TrendingDown, iconColor: 'text-rose-600', label: 'ค่าใช้จ่ายรวม', value: totals.expenses, barColor: 'bg-rose-500', subText: `${totals.revenue > 0 ? ((totals.expenses / totals.revenue) * 100).toFixed(1) : 0}% ของรายได้`, format: 'money' },
                { icon: Wallet, iconColor: 'text-sky-600', label: 'สินทรัพย์รวม', value: totals.assets, barColor: 'bg-sky-500', format: 'money' },
                { icon: CreditCard, iconColor: 'text-amber-600', label: 'หนี้สินรวม', value: totals.liabilities, barColor: 'bg-amber-500', subText: `D/E ${totals.equity > 0 ? (totals.liabilities / totals.equity).toFixed(2) : '-'}`, format: 'money' },
                { icon: PiggyBank, iconColor: 'text-violet-600', label: 'ส่วนของทุนรวม', value: totals.equity, barColor: 'bg-violet-500', format: 'money' },
              ]}
            />
          </motion.div>
          {/* ════════════════════════════════════════
             3) อันดับผลประกอบการ (Profitability Ranking)
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Trophy className="h-4 w-4 text-amber-500" />}
              title="อันดับผลประกอบการ"
              desc="จัดอันดับตามกำไรสุทธิ พร้อมตัวชี้วัดสำคัญ"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-border/50 bg-muted/30">
                    {['#', 'กิจการ', 'รายได้', 'ค่าใช้จ่าย', 'กำไรสุทธิ', 'Margin', 'สินทรัพย์', 'หนี้สิน', 'ทุน', 'D/E'].map((h, i) => (
                      <th key={i} className={cn('py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap', i <= 1 ? 'text-left' : 'text-right', i === 0 && 'pl-6 w-12', i === 9 && 'pr-6')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankedData.map((d, idx) => {
                    const revenue = d.kpis?.revenue?.value || 0;
                    const expenses = d.kpis?.expenses?.value || 0;
                    const netProfit = revenue - expenses;
                    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
                    const assets = d.kpis?.assets?.value || 0;
                    const liabilities = d.kpis?.liabilities?.value || 0;
                    const equity = d.kpis?.equity?.value || 0;
                    const de = equity > 0 ? (liabilities / equity).toFixed(2) : '-';
                    const RankIcon = idx === 0 ? Trophy : idx === 1 ? Award : idx === 2 ? Medal : null;
                    const rankColors = ['text-amber-500', 'text-gray-400', 'text-orange-400'];
                    return (
                      <tr key={d.branchKey} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 pl-6 pr-4">
                          {RankIcon ? <RankIcon className={cn('h-5 w-5', rankColors[idx])} /> : <span className="text-muted-foreground font-medium">{idx + 1}</span>}
                        </td>
                        <td className="py-3 px-4"><div className="flex items-center gap-2"><BranchDot idx={idx} /><span className="font-semibold text-foreground">{d.branchName}</span></div></td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(revenue)} <GrowthBadge value={d.kpis?.revenue?.growthPercentage} /></td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(expenses)}</td>
                        <td className="py-3 px-4 text-right"><span className={cn('font-bold', netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{fmtShort(netProfit)}</span></td>
                        <td className="py-3 px-4 text-right"><span className={cn('text-xs font-semibold px-2 py-1 rounded-lg', margin >= 20 ? 'bg-emerald-50 text-emerald-700' : margin >= 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700')}>{margin.toFixed(1)}%</span></td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(assets)}</td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(liabilities)}</td>
                        <td className="py-3 px-4 text-right font-medium">{fmtShort(equity)}</td>
                        <td className="py-3 pr-6 pl-4 text-right"><span className={cn('text-xs font-semibold px-2 py-1 rounded-lg', de !== '-' && parseFloat(de) <= 1 ? 'bg-emerald-50 text-emerald-700' : de !== '-' && parseFloat(de) <= 2 ? 'bg-amber-50 text-amber-700' : de !== '-' ? 'bg-rose-50 text-rose-700' : 'bg-muted text-muted-foreground')}>{de}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {/* ════════════════════════════════════════
             2) รายได้ vs ค่าใช้จ่าย (Grouped Bar)
             ════════════════════════════════════════ */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader
                icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
                title="รายได้ vs ค่าใช้จ่าย"
                desc="เปรียบเทียบรายได้และค่าใช้จ่ายของแต่ละกิจการ (แท่งซ้อน)"
              />
              <div className="px-6 pb-5">
                {(() => {
                  const SERIES_COLORS = ['#10b981', '#f43f5e', '#6366f1'];
                  const seriesItems = [
                    { name: 'รายได้', color: SERIES_COLORS[0], getData: (d: BranchAccountingData) => d.kpis?.revenue?.value || 0 },
                    { name: 'ค่าใช้จ่าย', color: SERIES_COLORS[1], getData: (d: BranchAccountingData) => d.kpis?.expenses?.value || 0 },
                    { name: 'กำไรสุทธิ', color: SERIES_COLORS[2], getData: (d: BranchAccountingData) => Math.abs((d.kpis?.revenue?.value || 0) - (d.kpis?.expenses?.value || 0)) },
                  ];
                  const series = seriesItems.map((s, sIdx) => ({
                    name: s.name,
                    type: 'bar' as const,
                    stack: 'total',
                    barMaxWidth: 36,
                    itemStyle: { color: s.color, borderRadius: sIdx === seriesItems.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0] },
                    data: rankedData.map(d => s.getData(d)),
                  }));
                  const option = {
                    tooltip: {
                      trigger: 'axis' as const,
                      axisPointer: { type: 'shadow' as const },
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      textStyle: { color: '#1e293b', fontSize: 12 },
                      extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                      valueFormatter: (v: number) => fmt(v),
                    },
                    legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                    grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                    yAxis: { type: 'category' as const, data: rankedData.map(d => d.branchName), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 12, fontWeight: 600 } },
                    xAxis: { type: 'value' as const, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) } },
                    series,
                  };
                  return <ReactECharts option={option} style={{ height: Math.max(rankedData.length * 50, 200) }} opts={{ renderer: 'svg' }} />;
                })()}
              </div>
            </div>

            {/* ════════════════════════════════════════
             5) งบดุล — Stacked Bar Chart
             ════════════════════════════════════════ */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader
                icon={<Scale className="h-4 w-4 text-sky-500" />}
                title="งบดุล"
                desc="เปรียบเทียบสินทรัพย์ หนี้สิน และส่วนของผู้ถือหุ้น (แท่งซ้อน)"
              />
              <div className="px-6 pb-5">
                {(() => {
                  const allTypes = [...new Set(data.flatMap(d => d.balanceSheet.map(b => b.typeName)))];
                  if (allTypes.length === 0) return <p className="text-xs text-muted-foreground py-8 text-center">ไม่มีข้อมูล</p>;
                  const TYPE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4'];
                  const series = allTypes.map((typeName, tIdx) => ({
                    name: typeName,
                    type: 'bar' as const,
                    stack: 'total',
                    barMaxWidth: 36,
                    itemStyle: { color: TYPE_COLORS[tIdx % TYPE_COLORS.length], borderRadius: tIdx === allTypes.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0] },
                    data: data.map(d => {
                      const grouped = groupBalanceSheet(d.balanceSheet);
                      return Math.abs(grouped[typeName] || 0);
                    }),
                  }));
                  const option = {
                    tooltip: {
                      trigger: 'axis' as const,
                      axisPointer: { type: 'shadow' as const },
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      textStyle: { color: '#1e293b', fontSize: 12 },
                      extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                      valueFormatter: (v: number) => fmt(v),
                    },
                    legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                    grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                    yAxis: { type: 'category' as const, data: data.map(d => d.branchName), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 12, fontWeight: 600 } },
                    xAxis: { type: 'value' as const, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) } },
                    series,
                  };
                  return <ReactECharts option={option} style={{ height: Math.max(data.length * 50, 200) }} opts={{ renderer: 'svg' }} />;
                })()}
              </div>
            </div>
          </motion.div>


          {/* ════════════════════════════════════════
             4) กำไร-ขาดทุนสุทธิ รายเดือน — Stacked Area Chart
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Receipt className="h-4 w-4 text-indigo-500" />}
              title="กำไร-ขาดทุนสุทธิ รายเดือน"
              desc="เปรียบเทียบกำไรสุทธิรายเดือนของแต่ละกิจการ (กราฟพื้นที่ซ้อน)"
            />
            <div className="px-6 pb-5">
              {(() => {
                const allMonths = [...new Set(data.flatMap(d => d.profitLoss.map(p => p.month)))].sort();
                if (allMonths.length === 0) return <p className="text-xs text-muted-foreground py-8 text-center">ไม่มีข้อมูล</p>;
                const series = data.map((d, idx) => {
                  const hex = BRANCH_PALETTE[idx % BRANCH_PALETTE.length].hex;
                  return {
                    name: d.branchName,
                    type: 'line' as const,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 5,
                    showSymbol: true,
                    lineStyle: { width: 2, color: hex },
                    itemStyle: { color: hex },
                    areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: hex + '55' }, { offset: 1, color: hex + '08' }] } },
                    emphasis: { focus: 'series' as const, showSymbol: true, symbolSize: 6 },
                    data: allMonths.map(m => {
                      const pl = d.profitLoss.find(p => p.month === m);
                      if (!pl) return 0;
                      const netProfit = Number(pl.netProfit);
                      if (Number.isFinite(netProfit)) return netProfit;
                      return (Number(pl.revenue) || 0) - (Number(pl.expenses) || 0);
                    }),
                  };
                });
                const option = {
                  tooltip: {
                    trigger: 'axis' as const,
                    backgroundColor: '#fff',
                    borderColor: '#e2e8f0',
                    textStyle: { color: '#1e293b', fontSize: 12 },
                    extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                    valueFormatter: (v: number) => fmt(v),
                  },
                  legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                  grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                  xAxis: {
                    type: 'category' as const,
                    boundaryGap: false,
                    data: allMonths,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { color: '#64748b', fontSize: 11 },
                  },
                  yAxis: {
                    type: 'value' as const,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: '#f1f5f9' } },
                    axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) },
                  },
                  series,
                };
                return <ReactECharts option={option} style={{ height: 320 }} opts={{ renderer: 'svg' }} />;
              })()}
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             6) กระแสเงินสด
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Layers className="h-4 w-4 text-teal-500" />}
              title="กระแสเงินสด"
              desc="เปรียบเทียบกระแสเงินสดจากกิจกรรมดำเนินงาน ลงทุน และจัดหาเงิน"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-border/50 bg-muted/30">
                    {['กิจการ', 'ดำเนินงาน', 'ลงทุน', 'จัดหาเงิน', 'สุทธิ'].map((h, i) => (
                      <th key={i} className={cn('py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap', i === 0 ? 'text-left pl-6' : 'text-right', i === 4 && 'pr-6')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((d, idx) => {
                    const actCF = (act: string) => d.cashFlow.find(c => c.activityType === act);
                    const totalNet = d.cashFlow.reduce((s, c) => s + c.netCashFlow, 0);
                    return (
                      <tr key={d.branchKey} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-3 pl-6 pr-4"><div className="flex items-center gap-2"><BranchDot idx={idx} /><span className="font-semibold text-foreground">{d.branchName}</span></div></td>
                        {(['Operating', 'Investing', 'Financing'] as const).map(act => {
                          const cf = actCF(act);
                          const net = cf?.netCashFlow ?? 0;
                          return (
                            <td key={act} className="py-3 px-4 text-right">
                              <span className={cn('font-medium', net >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{cf ? fmtShort(net) : '-'}</span>
                            </td>
                          );
                        })}
                        <td className="py-3 pr-6 pl-4 text-right">
                          <span className={cn('font-bold px-2 py-1 rounded-lg', totalNet >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{fmtShort(totalNet)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             7) อายุลูกหนี้ (AR Aging) — Grouped Bar
             ════════════════════════════════════════ 
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<Users className="h-4 w-4 text-blue-500" />}
              title="อายุลูกหนี้ (AR Aging)"
              desc="เปรียบเทียบยอดค้างรับตามช่วงอายุหนี้ (กราฟแท่งกลุ่ม)"
            />
            <div className="px-6 pb-5">
              {(() => {
                const hasData = data.some(d => d.arAging.length > 0);
                if (!hasData) return <p className="text-xs text-muted-foreground py-8 text-center">ไม่มีข้อมูล</p>;
                const series = data.map((d, idx) => {
                  const buckets = groupAgingByBucket(d.arAging);
                  return {
                    name: d.branchName,
                    type: 'bar' as const,
                    barMaxWidth: 28,
                    itemStyle: { color: BRANCH_PALETTE[idx % BRANCH_PALETTE.length].hex, borderRadius: [4, 4, 0, 0] },
                    data: AGING_BUCKETS.map(b => buckets[b] || 0),
                  };
                });
                const option = {
                  tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const }, backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#1e293b', fontSize: 12 }, extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;', valueFormatter: (v: number) => fmt(v) },
                  legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                  grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                  xAxis: { type: 'category' as const, data: AGING_BUCKETS, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#64748b', fontSize: 10, interval: 0, rotate: data.length > 4 ? 15 : 0 } },
                  yAxis: { type: 'value' as const, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) } },
                  series,
                };
                return <ReactECharts option={option} style={{ height: 300 }} opts={{ renderer: 'svg' }} />;
              })()}
            </div>
          </div>*/}

          {/* ════════════════════════════════════════
             8) อายุเจ้าหนี้ (AP Aging) — Grouped Bar
             ════════════════════════════════════════ 
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<FileText className="h-4 w-4 text-orange-500" />}
              title="อายุเจ้าหนี้ (AP Aging)"
              desc="เปรียบเทียบยอดค้างจ่ายตามช่วงอายุหนี้ (กราฟแท่งกลุ่ม)"
            />
            <div className="px-6 pb-5">
              {(() => {
                const hasData = data.some(d => d.apAging.length > 0);
                if (!hasData) return <p className="text-xs text-muted-foreground py-8 text-center">ไม่มีข้อมูล</p>;
                const series = data.map((d, idx) => {
                  const buckets = groupAgingByBucket(d.apAging);
                  return {
                    name: d.branchName,
                    type: 'bar' as const,
                    barMaxWidth: 28,
                    itemStyle: { color: BRANCH_PALETTE[idx % BRANCH_PALETTE.length].hex, borderRadius: [4, 4, 0, 0] },
                    data: AGING_BUCKETS.map(b => buckets[b] || 0),
                  };
                });
                const option = {
                  tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const }, backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#1e293b', fontSize: 12 }, extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;', valueFormatter: (v: number) => fmt(v) },
                  legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 16 },
                  grid: { top: 16, right: 16, bottom: 40, left: 16, containLabel: true },
                  xAxis: { type: 'category' as const, data: AGING_BUCKETS, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#64748b', fontSize: 10, interval: 0, rotate: data.length > 4 ? 15 : 0 } },
                  yAxis: { type: 'value' as const, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => fmtShort(v) } },
                  series,
                };
                return <ReactECharts option={option} style={{ height: 300 }} opts={{ renderer: 'svg' }} />;
              })()}
            </div>
          </div>*/}

          {/* ════════════════════════════════════════
             9) รายได้ตามหมวด — Nightingale Rose (Polar Bar) แยกกิจการ
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
              title="รายได้ตามผังบัญชี"
              desc="สัดส่วนรายได้แยกตามหมวดบัญชีของแต่ละกิจการ (Nightingale Rose)"
            />
            <div className="px-6 pb-5">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {data.map((d, idx) => {
                  const CATEGORY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
                  const totalRev = d.revenueBreakdown.reduce((s, r) => s + r.amount, 0);

                  if (d.revenueBreakdown.length === 0) {
                    return (
                      <div key={d.branchKey} className="flex flex-col items-center py-6">
                        <div className="flex items-center gap-2 mb-2"><BranchDot idx={idx} /><span className="text-sm font-semibold text-foreground">{d.branchName}</span></div>
                        <p className="text-xs text-muted-foreground">ไม่มีข้อมูล</p>
                      </div>
                    );
                  }

                  const roseData = d.revenueBreakdown.map((r, rIdx) => ({
                    name: getGroupLabel(r.accountGroup, r.accountName),
                    value: r.amount,
                    itemStyle: {
                      color: {
                        type: 'linear' as const,
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                          { offset: 0, color: CATEGORY_COLORS[rIdx % CATEGORY_COLORS.length] },
                          { offset: 1, color: CATEGORY_COLORS[rIdx % CATEGORY_COLORS.length] + '99' },
                        ],
                      },
                      borderRadius: 6,
                    },
                  }));

                  const option = {
                    tooltip: {
                      trigger: 'item' as const,
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      textStyle: { color: '#1e293b', fontSize: 12 },
                      extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
                      formatter: (params: { name: string; value: number }) =>
                        `${params.name}<br/><strong>${fmt(params.value)}</strong> (${totalRev > 0 ? ((params.value / totalRev) * 100).toFixed(1) : 0}%)`,
                    },
                    series: [{
                      type: 'pie' as const,
                      roseType: 'area' as const,
                      radius: ['18%', '80%'],
                      center: ['50%', '50%'],
                      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 6 },
                      label: {
                        show: true,
                        fontSize: 10,
                        color: '#475569',
                        formatter: '{b}',
                        overflow: 'truncate' as const,
                        width: 70,
                      },
                      labelLine: { length: 8, length2: 6, lineStyle: { color: '#cbd5e1' } },
                      emphasis: {
                        label: { show: true, fontSize: 12, fontWeight: 'bold' as const },
                        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.15)' },
                      },
                      data: roseData,
                    }],
                    graphic: [{
                      type: 'text' as const,
                      left: 'center',
                      top: 'center',
                      style: { text: fmtShort(totalRev), fill: '#1e293b', fontSize: 13, fontWeight: 700, textAlign: 'center' as const },
                    }],
                  };

                  return (
                    <div key={d.branchKey}>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <BranchDot idx={idx} />
                        <span className="text-sm font-semibold text-foreground">{d.branchName}</span>
                      </div>
                      <ReactECharts option={option} style={{ height: 260 }} opts={{ renderer: 'svg' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════
             10) ค่าใช้จ่ายตามหมวด — Donut Charts
             ════════════════════════════════════════ */}
          <motion.div variants={itemVariants} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <SectionHeader
              icon={<TrendingDown className="h-4 w-4 text-rose-500" />}
              title="ค่าใช้จ่ายตามหมวด"
              desc="สัดส่วนค่าใช้จ่ายแยกตามหมวดบัญชีของแต่ละกิจการ (Donut)"
            />
            <div className="px-6 pb-5">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {data.map((d, idx) => {
                  const totalExp = d.expenseBreakdown.reduce((s, e) => s + e.amount, 0);
                  const DONUT_COLORS = ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#3b82f6', '#06b6d4', '#ec4899', '#84cc16'];
                  if (d.expenseBreakdown.length === 0) {
                    return (
                      <div key={d.branchKey} className="flex flex-col items-center py-6">
                        <div className="flex items-center gap-2 mb-2"><BranchDot idx={idx} /><span className="text-sm font-semibold text-foreground">{d.branchName}</span></div>
                        <p className="text-xs text-muted-foreground">ไม่มีข้อมูล</p>
                      </div>
                    );
                  }
                  const option = {
                    tooltip: { trigger: 'item' as const, backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#1e293b', fontSize: 12 }, extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br/>${fmt(p.value)} (${p.percent}%)` },
                    series: [{
                      type: 'pie' as const,
                      radius: ['45%', '72%'],
                      center: ['50%', '50%'],
                      avoidLabelOverlap: true,
                      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
                      label: { show: false },
                      emphasis: { label: { show: true, fontSize: 11, fontWeight: 'bold' as const } },
                      data: d.expenseBreakdown.map((e, eIdx) => ({
                        name: getGroupLabel(e.accountGroup, e.accountName),
                        value: e.amount,
                        itemStyle: { color: DONUT_COLORS[eIdx % DONUT_COLORS.length] },
                      })),
                    }],
                    graphic: [{
                      type: 'text' as const,
                      left: 'center',
                      top: 'center',
                      style: { text: fmtShort(totalExp), fill: '#1e293b', fontSize: 14, fontWeight: 700, textAlign: 'center' as const },
                    }],
                  };
                  return (
                    <div key={d.branchKey}>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <BranchDot idx={idx} />
                        <span className="text-sm font-semibold text-foreground">{d.branchName}</span>
                      </div>
                      <ReactECharts option={option} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
