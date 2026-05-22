'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { CategoryBreakdown } from '@/lib/data/types';

// Matches ECharts default color palette
const CHART_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#67c23a',
  '#e6a23c', '#f56c6c', '#409eff', '#909399', '#c23531',
  '#2f4554', '#61a0a8', '#d48265', '#91c7ae', '#749f83',
  '#ca8622', '#bda29a', '#6e7074', '#546570', '#c4ccd3',
  '#f05b72', '#ef5b9c', '#f47920', '#905a3d', '#fab27b',
  '#2a5caa', '#444693', '#726930', '#b2d235', '#6d8346',
  '#ac6767', '#1d953f', '#6950a1', '#918597', '#f9a52f',
];

interface RevenueExpenseBreakdownProps {
  revenueData: CategoryBreakdown[];
  expenseData: CategoryBreakdown[];
  height?: string;
}

function DonutSection({
  data,
  seriesName,
  title,
  chartHeight,
}: {
  data: CategoryBreakdown[];
  seriesName: string;
  title: string;
  chartHeight: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const total = data.reduce((sum, d) => sum + Math.abs(d.amount), 0);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    const chart = echarts.init(chartRef.current);
    const option: echarts.EChartsOption = {
      color: CHART_COLORS,
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = Number(params.value).toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return `<div style="max-width:220px"><div style="font-weight:bold;margin-bottom:4px;white-space:normal">${params.name}</div><div>฿${value} (${params.percent.toFixed(1)}%)</div></div>`;
        },
      },
      legend: { show: false },
      series: [
        {
          name: seriesName,
          type: 'pie',
          radius: ['42%', '75%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 13, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
          },
          data: data.map(item => ({
            value: Math.abs(item.amount),
            name: item.accountName || item.accountGroup,
          })),
        },
      ],
    };
    chart.setOption(option);
    const resizeObserver = new ResizeObserver(() => { if (!chart.isDisposed()) chart.resize(); });
    resizeObserver.observe(chartRef.current);
    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [data, seriesName]);

  return (
    <div className="flex flex-col">
      <h3 className="text-sm font-medium mb-3">{title}</h3>

      {data.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: chartHeight }}>
          <p className="text-muted-foreground text-sm">ไม่มีข้อมูล</p>
        </div>
      ) : (
        <>
          {/* Donut chart — no legend inside */}
          <div ref={chartRef} style={{ height: chartHeight, width: '100%' }} />

          {/* Custom scrollable legend grid below chart */}
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {data.map((item, i) => {
                const pct = total > 0 ? ((Math.abs(item.amount) / total) * 100).toFixed(1) : '0.0';
                const name = item.accountName || item.accountGroup;
                return (
                  <div key={i} className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span
                      className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1"
                      title={name}
                    >
                      {name}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function RevenueExpenseBreakdown({
  revenueData,
  expenseData,
  height = '220px',
}: RevenueExpenseBreakdownProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
      <DonutSection
        data={revenueData}
        seriesName="รายได้"
        title="รายได้ตามผังบัญชี"
        chartHeight={height}
      />
      <DonutSection
        data={expenseData}
        seriesName="ค่าใช้จ่าย"
        title="ค่าใช้จ่ายตามผังบัญชี"
        chartHeight={height}
      />
    </div>
  );
}