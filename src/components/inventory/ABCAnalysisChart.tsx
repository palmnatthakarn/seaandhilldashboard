'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { PaginatedTable, type ColumnDef } from '../PaginatedTable';
import { RotateCcw } from 'lucide-react';
import type { ABCItem } from '@/lib/data/types';

interface ABCAnalysisChartProps {
  data: ABCItem[];
  height?: string;
}

const CLASS_CONFIG = [
  { name: 'A' as const, label: 'A — Critical', thaiDesc: 'ดูแลพิเศษ ห้ามขาดสต็อก', color: '#3b82f6', gradEnd: '#60a5fa' },
  { name: 'B' as const, label: 'B — Major',    thaiDesc: 'ติดตามสม่ำเสมอ',          color: '#f59e0b', gradEnd: '#fbbf24' },
  { name: 'C' as const, label: 'C — Minor',    thaiDesc: 'พิจารณาลดจำนวน SKU',      color: '#94a3b8', gradEnd: '#cbd5e1' },
];

type ABCClass = 'A' | 'B' | 'C';

const formatCurr = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
};

const getClassCfg = (cls: ABCClass) => CLASS_CONFIG.find((c) => c.name === cls)!;

export function ABCAnalysisChart({ data, height = '320px' }: ABCAnalysisChartProps) {
  const chartRef    = useRef<HTMLDivElement>(null);
  const chartInst   = useRef<echarts.ECharts | null>(null);
  const dataRef     = useRef<ABCItem[]>(data);           // stable ref for tooltip closure
  const [selectedClass, setSelectedClass] = useState<ABCClass | null>(null);

  // keep dataRef current on every render without re-running the chart effect
  dataRef.current = data;

  // ── summary (UI only, not used in chart) ──────────────────────────────────
  const totalSales = data.reduce((s, i) => s + i.totalSalesValue, 0);
  const totalStock = data.reduce((s, i) => s + i.stockValue, 0);
  const summary = CLASS_CONFIG.map((cfg) => {
    const items    = data.filter((i) => i.abcClass === cfg.name);
    const salesVal = items.reduce((s, i) => s + i.totalSalesValue, 0);
    const stockVal = items.reduce((s, i) => s + i.stockValue, 0);
    return {
      ...cfg,
      count:    items.length,
      itemsPct: data.length > 0  ? (items.length / data.length)  * 100 : 0,
      salesPct: totalSales  > 0  ? (salesVal / totalSales)        * 100 : 0,
      stockPct: totalStock  > 0  ? (stockVal / totalStock)        * 100 : 0,
    };
  });

  // ── initialize chart once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    chartInst.current = chart;

    // tooltip uses dataRef so it always reads the latest data without re-init
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
        formatter: (params: any) => {
          const idx  = params[0]?.dataIndex ?? 0;
          const item = dataRef.current[idx];
          if (!item) return '';
          const cfg  = getClassCfg(item.abcClass);
          return `
            <div style="font-weight:bold;margin-bottom:6px;max-width:220px;white-space:normal;">${item.itemName}</div>
            <div style="margin-bottom:4px;">
              Class <strong style="color:${cfg.color}">${item.abcClass}</strong>
              &nbsp;·&nbsp;${item.brandName}
            </div>
            <div style="margin-bottom:4px;">
              ${params[0]?.marker ?? ''} ยอดขาย:
              <strong>฿${Number(item.totalSalesValue).toLocaleString('th-TH', { maximumFractionDigits: 0 })}</strong>
            </div>
            <div>
              สัดส่วน: ${item.salesPct.toFixed(2)}%
              &nbsp;·&nbsp;สะสม: <strong>${item.cumulativePct.toFixed(2)}%</strong>
            </div>
          `;
        },
      },
      legend: {
        data: ['ยอดขาย', 'สะสม %'],
        top: 4, right: 8,
        itemWidth: 12, itemHeight: 12,
        textStyle: { fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: [],
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'ยอดขาย (฿)',
          nameTextStyle: { fontSize: 11 },
          position: 'left',
          axisLabel: { formatter: (v: number) => formatCurr(v), fontSize: 11 },
          splitLine: { lineStyle: { type: 'dashed', opacity: 0.35 } },
        },
        {
          type: 'value',
          name: '%',
          nameTextStyle: { fontSize: 11 },
          position: 'right',
          min: 0, max: 100,
          axisLabel: { formatter: '{value}%', fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      series: [
        { name: 'ยอดขาย', type: 'bar',  yAxisIndex: 0, barMaxWidth: 24, barMinWidth: 1, data: [] },
        {
          name: 'สะสม %', type: 'line', yAxisIndex: 1,
          smooth: true, symbol: 'none',
          lineStyle: { width: 2.5, color: '#6366f1' },
          itemStyle: { color: '#6366f1' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(99,102,241,0.15)' },
              { offset: 1, color: 'rgba(99,102,241,0.02)' },
            ]),
          },
          markLine: {
            silent: true, symbol: 'none',
            data: [
              {
                yAxis: 80,
                lineStyle: { type: 'dashed', color: '#3b82f6', width: 1.5 },
                label: { formatter: 'A / B  80%', color: '#3b82f6', fontSize: 11, position: 'end' },
              },
              {
                yAxis: 95,
                lineStyle: { type: 'dashed', color: '#f59e0b', width: 1.5 },
                label: { formatter: 'B / C  95%', color: '#f59e0b', fontSize: 11, position: 'end' },
              },
            ],
          },
          data: [],
        },
      ],
    });

    const ro = new ResizeObserver(() => { if (!chart.isDisposed()) chart.resize(); });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartInst.current = null;
    };
  }, []); // init once — never re-runs

  // ── update data when it changes ───────────────────────────────────────────
  useEffect(() => {
    const chart = chartInst.current;
    if (!chart || chart.isDisposed() || data.length === 0) return;

    const hasZoom = data.length > 60;

    chart.setOption({
      grid: {
        top: 36, left: '3%', right: 64,
        bottom: hasZoom ? 52 : 24,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: data.map((_, i) => i + 1),
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      ...(hasZoom ? {
        dataZoom: [
          {
            type: 'slider', xAxisIndex: 0,
            bottom: 4, height: 20,
            start: 0,
            end: Math.min(100, Math.round((60 / data.length) * 100)),
            borderColor: 'transparent',
            fillerColor: 'rgba(99,102,241,0.15)',
            handleStyle: { color: '#6366f1' },
          },
          { type: 'inside', xAxisIndex: 0 },
        ],
      } : {}),
      series: [
        {
          name: 'ยอดขาย',
          data: data.map((item) => ({
            value: item.totalSalesValue,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: getClassCfg(item.abcClass).color },
                { offset: 1, color: getClassCfg(item.abcClass).gradEnd },
              ]),
            },
          })),
        },
        {
          name: 'สะสม %',
          data: data.map((item) => item.cumulativePct),
        },
      ],
    });
  }, [data]); // only data — no closure leak

  // ── table ─────────────────────────────────────────────────────────────────
  const filteredData = selectedClass
    ? data.filter((i) => i.abcClass === selectedClass)
    : data;

  const formatCurrency = (v: number) =>
    v.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const columns: ColumnDef<ABCItem>[] = [
    {
      key: 'rank',
      header: '#',
      sortable: false,
      align: 'center',
      render: (_: ABCItem, index: number) => (
        <span className="text-xs text-muted-foreground">{index + 1}</span>
      ),
    },
    {
      key: 'abcClass',
      header: 'Class',
      sortable: true,
      align: 'center',
      render: (item: ABCItem) => {
        const cfg = getClassCfg(item.abcClass);
        return (
          <span
            className="px-2 py-0.5 rounded text-xs font-bold"
            style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}` }}
          >
            {item.abcClass}
          </span>
        );
      },
    },
    {
      key: 'itemName',
      header: 'สินค้า',
      sortable: true,
      align: 'left',
      render: (item: ABCItem) => (
        <div>
          <div className="font-medium">{item.itemName}</div>
          <div className="text-xs text-muted-foreground">{item.brandName} • {item.categoryName}</div>
        </div>
      ),
    },
    {
      key: 'totalSalesValue',
      header: 'ยอดขาย',
      sortable: true,
      align: 'right',
      render: (item: ABCItem) => <span className="font-medium">฿{formatCurrency(item.totalSalesValue)}</span>,
    },
    {
      key: 'salesPct',
      header: 'สัดส่วน',
      sortable: true,
      align: 'right',
      render: (item: ABCItem) => (
        <span className="text-muted-foreground">{item.salesPct.toFixed(2)}%</span>
      ),
    },
    {
      key: 'cumulativePct',
      header: 'สะสม %',
      sortable: true,
      align: 'right',
      render: (item: ABCItem) => {
        const cfg = getClassCfg(item.abcClass);
        return (
          <span className="text-xs font-medium" style={{ color: cfg.color }}>
            {item.cumulativePct.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: 'qtyOnHand',
      header: 'คงเหลือ',
      sortable: true,
      align: 'right',
      render: (item: ABCItem) =>
        item.qtyOnHand.toLocaleString('th-TH', { maximumFractionDigits: 2 }),
    },
    {
      key: 'stockValue',
      header: 'มูลค่าสต็อก',
      sortable: true,
      align: 'right',
      render: (item: ABCItem) => (
        <span className="text-muted-foreground">฿{formatCurrency(item.stockValue)}</span>
      ),
    },
  ];

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-muted-foreground text-sm">ไม่มีข้อมูลยอดขายในช่วงเวลาที่เลือก</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {summary.map((s) => {
          const isSelected = selectedClass === s.name;
          return (
            <button
              key={s.name}
              onClick={() => setSelectedClass((prev) => (prev === s.name ? null : s.name))}
              className={`px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                isSelected
                  ? 'ring-2 ring-offset-2 scale-105'
                  : 'hover:scale-102 opacity-80 hover:opacity-100'
              }`}
              style={{
                backgroundColor: `${s.color}20`,
                borderColor: s.color,
                borderWidth: 1,
                borderStyle: 'solid',
                color: s.color,
                '--tw-ring-color': s.color,
              } as React.CSSProperties}
            >
              <span>{s.label}</span>
              <span className="font-bold">{s.count}</span>
              <span>รายการ</span>
              <span className="opacity-60 text-xs ml-0.5">({s.salesPct.toFixed(1)}%)</span>
            </button>
          );
        })}

        {selectedClass && (
          <button
            onClick={() => setSelectedClass(null)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Pareto chart */}
      <div ref={chartRef} style={{ height, width: '100%' }} />

      {/* Table */}
      <div className="border-t pt-3">
        <div className="flex items-center gap-2 mb-3">
          {selectedClass ? (
            <>
              <span
                className="px-2 py-0.5 rounded text-xs font-bold"
                style={{
                  backgroundColor: `${getClassCfg(selectedClass).color}20`,
                  color: getClassCfg(selectedClass).color,
                  border: `1px solid ${getClassCfg(selectedClass).color}`,
                }}
              >
                {selectedClass}
              </span>
              <span className="text-sm font-semibold">
                {getClassCfg(selectedClass).label} ({filteredData.length} รายการ)
              </span>
              <span className="text-xs text-muted-foreground">
                — {getClassCfg(selectedClass).thaiDesc}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">
              สินค้าทั้งหมด ({filteredData.length} รายการ)
            </span>
          )}
        </div>

        <PaginatedTable
          data={filteredData}
          columns={columns}
          itemsPerPage={10}
          emptyMessage="ไม่มีข้อมูล"
          defaultSortKey="totalSalesValue"
          defaultSortOrder="desc"
          keyExtractor={(item) => item.itemCode}
        />
      </div>
    </div>
  );
}
