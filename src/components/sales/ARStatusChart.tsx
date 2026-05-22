'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { ARStatus } from '@/lib/data/types';
import { fmtFull } from '@/lib/formatters';

interface ARStatusChartProps {
  data: ARStatus[];
  height?: string;
}

export function ARStatusChart({ data, height = '350px' }: ARStatusChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = echarts.init(chartRef.current);

    const statusLabels = data.map(item => item.statusPayment);
    const outstandingData = data.map(item => item.totalOutstanding);
    const paidData = data.map(item => item.totalPaid);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          const status = params[0].axisValue;
          let result = `<div style="font-weight: bold; margin-bottom: 8px;">${status}</div>`;

          params.forEach((param: any) => {
            result += `<div style="margin-bottom: 4px;">
              ${param.marker} ${param.seriesName}: <strong>${fmtFull(param.value)}</strong>
            </div>`;
          });

          return result;
        },
      },
      legend: {
        data: ['ยอดค้างชำระ', 'ยอดชำระแล้ว'],
        top: 0,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: statusLabels,
        axisLabel: {
          interval: 0,
          rotate: statusLabels.length > 3 ? 30 : 0,
        },
      },
      yAxis: {
        type: 'value',
        name: 'จำนวนเงิน (฿)',
        axisLabel: {
          formatter: (value: number) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
            return value.toString();
          },
        },
      },
      series: [
        {
          name: 'ยอดค้างชำระ',
          type: 'bar',
          stack: 'total',
          data: outstandingData,
          itemStyle: {
            color: '#ef4444',
          },
          label: {
            show: true,
            position: 'inside',
            formatter: (params: any) => {
              if (params.value === 0) return '';
              if (params.value >= 1000000) return `${(params.value / 1000000).toFixed(1)}M`;
              if (params.value >= 1000) return `${(params.value / 1000).toFixed(0)}K`;
              return params.value.toString();
            },
          },
        },
        {
          name: 'ยอดชำระแล้ว',
          type: 'bar',
          stack: 'total',
          data: paidData,
          itemStyle: {
            color: '#10b981',
          },
          label: {
            show: true,
            position: 'inside',
            formatter: (params: any) => {
              if (params.value === 0) return '';
              if (params.value >= 1000000) return `${(params.value / 1000000).toFixed(1)}M`;
              if (params.value >= 1000) return `${(params.value / 1000).toFixed(0)}K`;
              return params.value.toString();
            },
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
