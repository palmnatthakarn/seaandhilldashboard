'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { PurchaseTrendData } from '@/lib/data/types';
import { fmtCount, fmtFull } from '@/lib/formatters';

type TooltipParam = {
  axisValue?: string | number;
  marker?: string;
  seriesName?: string;
  value?: string | number | Array<string | number>;
};

function getTooltipNumber(value: TooltipParam['value']): number {
  const rawValue = Array.isArray(value) ? value[1] ?? value[0] : value;
  return typeof rawValue === 'number' ? rawValue : Number(rawValue) || 0;
}

interface PurchaseTrendChartProps {
  data: PurchaseTrendData[];
  height?: string;
}

export function PurchaseTrendChart({ data, height = '400px' }: PurchaseTrendChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = echarts.init(chartRef.current);

    const dates = data.map(item => {
      const date = new Date(item.month);
      return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
    });

    const purchaseData = data.map(item => item.totalPurchases);
    const orderData = data.map(item => item.poCount);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
        formatter: (params) => {
          const seriesParams = Array.isArray(params) ? params as TooltipParam[] : [params as TooltipParam];
          const date = seriesParams[0]?.axisValue;
          let result = `<div style="font-weight: bold; margin-bottom: 8px;">${date}</div>`;

          seriesParams.forEach((param) => {
            const valueNumber = getTooltipNumber(param.value);
            const value = param.seriesName === 'à¸¢à¸­à¸”à¸‹à¸·à¹‰à¸­'
              ? fmtFull(valueNumber)
              : `${fmtCount(valueNumber)} à¸£à¸²à¸¢à¸à¸²à¸£`;

            result += `<div style="margin-bottom: 4px;">
              ${param.marker} ${param.seriesName}: <strong>${value}</strong>
            </div>`;
          });

          return result;
        },
      },
      legend: {
        data: ['à¸¢à¸­à¸”à¸‹à¸·à¹‰à¸­', 'à¸ˆà¸³à¸™à¸§à¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ'],
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
          name: 'à¸¢à¸­à¸”à¸‹à¸·à¹‰à¸­ (à¸¿)',
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
          name: 'à¸ˆà¸³à¸™à¸§à¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ',
          position: 'right',
          axisLabel: {
            formatter: '{value}',
          },
        },
      ],
      series: [
        {
          name: 'à¸¢à¸­à¸”à¸‹à¸·à¹‰à¸­',
          type: 'line',
          data: purchaseData,
          smooth: true,
          yAxisIndex: 0,
          itemStyle: {
            color: '#f59e0b',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(245, 158, 11, 0.3)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.05)' },
            ]),
          },
        },
        {
          name: 'à¸ˆà¸³à¸™à¸§à¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ',
          type: 'bar',
          data: orderData,
          yAxisIndex: 1,
          itemStyle: {
            color: '#8b5cf6',
            borderRadius: [4, 4, 0, 0],
          },
          barMaxWidth: 28,
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
        <p className="text-muted-foreground text-sm">à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥</p>
      </div>
    );
  }

  return <div ref={chartRef} style={{ height, width: '100%' }} />;
}
