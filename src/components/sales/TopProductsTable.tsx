'use client';

import { HorizontalBarChart, type HorizontalBarItem } from '@/components/charts/HorizontalBarChart';
import type { TopProduct } from '@/lib/data/types';
import { fmtFull, fmtCount } from '@/lib/formatters';

interface TopProductsChartProps {
  data: TopProduct[];
  height?: string;
}

export function TopProductsTable({ data, height = '400px' }: TopProductsChartProps) {

  // Transform TopProduct[] to HorizontalBarItem[]
  const top10 = [...data]
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 10);

  const chartData: HorizontalBarItem[] = top10.map((item, index) => ({
    rank: index + 1,
    name: item.itemName,
    value: item.totalSales,
    subLabel: `${item.brandName} • ${item.categoryName}`,
    extraData: {
      totalQtySold: item.totalQtySold,
      unitCode: item.unitCode,
      profitMarginPct: item.profitMarginPct,
      brandName: item.brandName,
      categoryName: item.categoryName,
    },
  }));

  // Custom tooltip formatter
  const tooltipFormatter = (item: HorizontalBarItem, percentage: number) => {
    const extra = item.extraData || {};
    const profitColor = extra.profitMarginPct >= 30 ? '#16a34a' : extra.profitMarginPct >= 15 ? '#ca8a04' : '#dc2626';
    
    return `
      <div style="padding: 8px;">
        <div style="font-weight: 600; margin-bottom: 6px;">อันดับ ${item.rank}: ${item.name}</div>
        <div style="color: #666; font-size: 12px; margin-bottom: 4px;">${item.subLabel}</div>
        <div style="margin-top: 8px;">
          <div>ยอดขาย: <b style="color: #3b82f6;">${fmtFull(item.value)}</b></div>
          <div>สัดส่วน: <b>${percentage}%</b> ของ Top 10</div>
          <div>จำนวนขาย: <b>${fmtCount(extra.totalQtySold || 0)}</b> ${extra.unitCode || 'ชิ้น'}</div>
          <div>กำไรขั้นต้น: <b style="color: ${profitColor};">${(extra.profitMarginPct || 0).toFixed(1)}%</b></div>
        </div>
      </div>
    `;
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        ไม่มีข้อมูลสินค้า
      </div>
    );
  }

  return (
    <HorizontalBarChart
      data={chartData}
      height={height}
      tooltipFormatter={tooltipFormatter}
      showLegend={true}
      showPercentage={true}
      fontSize={12}
      gridLeft={200}
      gridRight={120}
    />
  );
}
