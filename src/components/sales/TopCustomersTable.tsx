'use client';

import { HorizontalBarChart, type HorizontalBarItem } from '@/components/charts/HorizontalBarChart';
import type { TopCustomer } from '@/lib/data/types';
import { fmtFull } from '@/lib/formatters';

interface TopCustomersTableProps {
  data: TopCustomer[];
  height?: string;
}

export function TopCustomersTable({ data, height = '400px' }: TopCustomersTableProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
  };

  const getRecencyStatus = (days: number) => {
    if (days <= 7) return { text: 'ซื้อล่าสุด', color: '#16a34a' };
    if (days <= 30) return { text: 'ปกติ', color: '#ca8a04' };
    if (days <= 60) return { text: 'ควรติดตาม', color: '#ea580c' };
    return { text: 'เสี่ยงหลุด', color: '#dc2626' };
  };

  // Transform TopCustomer[] to HorizontalBarItem[]
  const top10 = [...data]
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  const chartData: HorizontalBarItem[] = top10.map((item, index) => ({
    rank: index + 1,
    name: item.customerName,
    value: item.totalSpent,
    subLabel: item.customerCode,
    extraData: {
      orderCount: item.orderCount,
      avgOrderValue: item.avgOrderValue,
      lastOrderDate: item.lastOrderDate,
      daysSinceLastOrder: item.daysSinceLastOrder,
    },
  }));

  // Custom tooltip formatter
  const tooltipFormatter = (item: HorizontalBarItem, percentage: number) => {
    const extra = item.extraData || {};
    const recency = getRecencyStatus(extra.daysSinceLastOrder || 0);
    
    return `
      <div style="padding: 8px;">
        <div style="font-weight: 600; margin-bottom: 6px;">อันดับ ${item.rank}: ${item.name}</div>
        <div style="color: #666; font-size: 12px; margin-bottom: 4px;">รหัส: ${item.subLabel}</div>
        <div style="margin-top: 8px;">
          <div>ยอดซื้อสะสม: <b style="color: #3b82f6;">${fmtFull(item.value)}</b></div>
          <div>สัดส่วน: <b>${percentage}%</b> ของ Top 10</div>
          <div>จำนวนออเดอร์: <b>${extra.orderCount || 0}</b> ครั้ง</div>
          <div>เฉลี่ย/ออเดอร์: <b>${fmtFull(extra.avgOrderValue || 0)}</b></div>
          <div>ซื้อล่าสุด: <b>${formatDate(extra.lastOrderDate || '')}</b> (${extra.daysSinceLastOrder} วัน)</div>
          <div>สถานะ: <b style="color: ${recency.color};">${recency.text}</b></div>
        </div>
      </div>
    `;
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        ไม่มีข้อมูลลูกค้า
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
