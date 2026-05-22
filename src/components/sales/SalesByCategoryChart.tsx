'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { SalesByCategory } from '@/lib/data/types';
import { fmtFull } from '@/lib/formatters';

interface SalesByCategoryChartProps {
  data: SalesByCategory[];
  height?: string;
}

export function SalesByCategoryChart({ data, height = '400px' }: SalesByCategoryChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = echarts.init(chartRef.current);

    // Debug: Log raw data
    console.log('🥧 Pie Chart Raw Data Count:', data.length);
    console.log('🥧 First 5 items:', data.slice(0, 5));
    
    // Aggregate data by category (sum all items per category)
    const categoryMap = new Map<string, { 
      categoryName: string; 
      categoryCode: string;
      totalSales: number; 
      orderCount: number;
    }>();
    
    data.forEach(item => {
      const existing = categoryMap.get(item.categoryCode);
      if (existing) {
        existing.totalSales += item.totalSales;
        existing.orderCount += item.orderCount;
      } else {
        categoryMap.set(item.categoryCode, {
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          totalSales: item.totalSales,
          orderCount: item.orderCount,
        });
      }
    });

    // Convert to array and sort by totalSales descending
    const aggregatedData = Array.from(categoryMap.values())
      .sort((a, b) => b.totalSales - a.totalSales);

    // Debug: Log aggregated data
    console.log('🥧 Pie Chart Aggregated Data:', aggregatedData);
    console.log('🥧 Total Sales Sum:', aggregatedData.reduce((sum, item) => sum + item.totalSales, 0));

    const categoryNames = aggregatedData.map(item => item.categoryName);
    const salesData = aggregatedData.map(item => item.totalSales);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          return `<div>
            <div style="font-weight: bold; margin-bottom: 4px;">${params.name}</div>
            <div>${params.marker} ยอดขาย: <strong>${fmtFull(params.value)}</strong></div>
            <div style="margin-top: 4px;">สัดส่วน: ${params.percent.toFixed(1)}%</div>
          </div>`;
        },
      },
      legend: {
        orient: 'horizontal',
        bottom: '0%',
        left: 'center',
        textStyle: {
          fontSize: 11,
        },
        type: 'scroll',
        itemGap: 15,
      },
      series: [
        {
          name: 'ยอดขาย',
          type: 'pie',
          radius: ['35%', '65%'],
          center: ['50%', '48%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
            position: 'outside',
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold',
              formatter: (params: any) => {
                return `${params.name}`;
              },
            },
            labelLine: {
              show: true,
            },
          },
          labelLine: {
            show: false,
          },
          data: categoryNames.map((name, index) => ({
            value: salesData[index],
            name: name,
          })),
        },
      ],
    };

    chart.setOption(option);

    // Cleanup
    return () => {
      chart.dispose();
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground">ไม่มีข้อมูล</p>
      </div>
    );
  }

  return <div ref={chartRef} style={{ width: '100%', height }} />;
}

