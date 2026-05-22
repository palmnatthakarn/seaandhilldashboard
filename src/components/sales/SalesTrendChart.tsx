'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { SalesTrendData } from '@/lib/data/types';
import { fmtFull, fmtCount } from '@/lib/formatters';

interface SalesTrendChartProps {
  data: SalesTrendData[];
  height?: string;
}

export function SalesTrendChart({ data, height = '400px' }: SalesTrendChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = echarts.init(chartRef.current);

    const dates = data.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
    });

    const salesData = data.map(item => item.sales);
    const orderData = data.map(item => item.orderCount);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
        formatter: (params: any) => {
          const date = params[0].axisValue;
          let result = `<div style="font-weight: bold; margin-bottom: 8px;">${date}</div>`;

          params.forEach((param: any) => {
            const value = param.seriesName === 'ยอดขาย'
              ? fmtFull(param.value)
              : `${fmtCount(param.value)} รายการ`;

            result += `<div style="margin-bottom: 4px;">
              ${param.marker} ${param.seriesName}: <strong>${value}</strong>
            </div>`;
          });

          return result;
        },
      },
      legend: {
        data: ['ยอดขาย', 'จำนวนออเดอร์'],
        top: 0,
      },
      grid: {
        left: 80,
        right: 80,
        bottom: 60,
        top: 60,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: true,
        axisLabel: {
          margin: 12,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'ยอดขาย (฿)',
          position: 'left',
          axisLabel: {
            formatter: (value: number) => {
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
              if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
              return value.toString();
            },
          },
        },
        {
          type: 'value',
          name: 'จำนวนออเดอร์',
          position: 'right',
          axisLabel: {
            formatter: '{value}',
          },
        },
      ],
      series: [
        {
          name: 'ยอดขาย',
          type: 'line',
          data: salesData,
          smooth: true,
          yAxisIndex: 0,
          itemStyle: {
            color: '#10b981',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.05)' },
            ]),
          },
        },
        {
          name: 'จำนวนออเดอร์',
          type: 'bar',
          data: orderData,
          yAxisIndex: 1,
          itemStyle: {
            color: '#3b82f6',
          },
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
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground text-sm">ไม่มีข้อมูล</p>
      </div>
    );
  }

  return <div ref={chartRef} style={{ height, width: '100%' }} />;
}
