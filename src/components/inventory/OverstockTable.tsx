'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { PaginatedTable, type ColumnDef } from '../PaginatedTable';
import { AlertCircle, RotateCcw } from 'lucide-react';
import type { OverstockItem } from '@/lib/data/types';

interface OverstockChartProps {
  data: OverstockItem[];
  height?: string;
}

type ChartOverstockItem = OverstockItem & {
  status: string;
};

// Status categories - 3 levels based on stock value (capital tied up)
const STATUS_CONFIG = [
  { name: 'วิกฤติ', label: 'วิกฤติ (>100k)', color: '#dc2626' },
  { name: 'เตือน', label: 'เตือน (10k-100k)', color: '#eab308' },
  { name: 'ปกติ', label: 'ปกติ (<10k)', color: '#3b82f6' },
];

export function OverstockTable({ data, height = '300px' }: OverstockChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>('all');

  const getStatus = (stockValue: number): string => {
    if (stockValue > 100000) return 'วิกฤติ';
    if (stockValue >= 10000) return 'เตือน';
    return 'ปกติ';
  };

  const getSeverityColor = (status: string): string => {
    if (status === 'วิกฤติ') return 'text-red-600';
    if (status === 'เตือน') return 'text-yellow-600';
    return 'text-blue-600';
  };

  // Transform data with status
  const transformedData: ChartOverstockItem[] = data.map(item => {
    return {
      ...item,
      status: getStatus(item.stockValue),
    };
  });

  // Group items by status
  const statusCounts = STATUS_CONFIG.map(status => {
    const items = transformedData.filter(item => item.status === status.name);
    return {
      name: status.name,
      label: status.label,
      value: items.length,
      color: status.color,
    };
  }).filter(s => s.value > 0);

  // Filtered data based on selected status
  const filteredData = selectedStatus
    ? selectedStatus === 'all'
      ? transformedData
      : transformedData.filter(item => item.status === selectedStatus)
    : [];

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = echarts.init(chartRef.current);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          return `<div>
            <div style="font-weight: bold; margin-bottom: 4px;">${params.name}</div>
            <div>${params.value} รายการ (${params.percent.toFixed(1)}%)</div>
          </div>`;
        },
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        textStyle: {
          fontSize: 11,
        },
      },
      series: [
        {
          name: 'สถานะสินค้าไม่เคลื่อนไหว',
          type: 'pie',
          radius: ['36%', '70%'],
          center: ['45%', '36%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
            },
          },
          data: statusCounts.map(s => ({
            value: s.value,
            name: s.label,
            itemStyle: { color: s.color },
          })),
        },
      ],
    };

    chart.setOption(option);

    // Handle click event
    chart.on('click', (params: any) => {
      const clickedStatus = STATUS_CONFIG.find(s => s.label === params.name);
      if (clickedStatus) {
        setSelectedStatus(prev => prev === clickedStatus.name ? null : clickedStatus.name);
      }
    });

    const resizeObserver = new ResizeObserver(() => { if (!chart.isDisposed()) chart.resize(); });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.off('click');
      chart.dispose();
    };
  }, [data, statusCounts]);

  const formatNumber = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) return '0';
    return value.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) return '0';
    return value.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const columns: ColumnDef<ChartOverstockItem>[] = [
    {
      key: 'status',
      header: 'สถานะ',
      sortable: false,
      align: 'left',
      className: 'w-10',
      render: (item: ChartOverstockItem) => (
        <AlertCircle className={`h-4 w-4 ${getSeverityColor(item.status)}`} />
      ),
    },
    {
      key: 'itemName',
      header: 'สินค้า',
      sortable: true,
      align: 'left',
      className: 'w-100',
      render: (item: ChartOverstockItem) => (
        <div>
          <div className="font-medium">{item.itemName}</div>
          <div className="text-xs text-muted-foreground">
            {item.brandName} • {item.categoryName}
          </div>
        </div>
      ),
    },
    {
      key: 'qtyOnHand',
      header: 'คงเหลือ',
      sortable: true,
      align: 'right',
      className: 'w-10',
      render: (item: ChartOverstockItem) => formatNumber(item.qtyOnHand),
    },
    {
      key: 'unitCode',
      header: 'หน่วย',
      sortable: true,
      align: 'left',
      className: 'w-10',
      render: (item: ChartOverstockItem) => item.unitCode || '-',
    },
    {
      key: 'avgDailySales',
      header: 'ยอดขาย/วัน',
      sortable: true,
      align: 'right',
      className: 'w-10',
      render: (item: ChartOverstockItem) => formatNumber(item.avgDailySales),
    },

    {
      key: 'stockValue',
      header: 'มูลค่าจม',
      sortable: true,
      align: 'right',
      className: 'w-15',
      render: (item: ChartOverstockItem) => (
        <span className="font-medium text-muted-foreground">
          ฿{formatCurrency(item.stockValue)}
        </span>
      ),
    },
  ];

  // Calculate totals
  const totalItems = data.length;

  return (
    <div className="flex flex-col h-full">
      {/* Status buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_CONFIG.map(status => {
          const count = statusCounts.find(s => s.name === status.name)?.value || 0;
          const isSelected = selectedStatus === status.name;
          return (
            <button
              key={status.name}
              onClick={() => setSelectedStatus(prev => prev === status.name ? null : status.name)}
              className={`px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1 ${isSelected
                ? 'ring-2 ring-offset-2 scale-105'
                : 'hover:scale-102 opacity-80 hover:opacity-100'
                }`}
              style={{
                backgroundColor: `${status.color}20`,
                borderColor: status.color,
                borderWidth: 1,
                borderStyle: 'solid',
                color: status.color,
                // @ts-ignore - ringColor is handled via CSS variable
                '--tw-ring-color': status.color,
              } as React.CSSProperties}
            >
              <span>{status.label.split(' ')[0]}</span>
              <span className="font-bold">{count}</span>
              <span>รายการ</span>
            </button>
          );
        })}
        {/* Total button */}
        <button
          onClick={() => setSelectedStatus('all')}
          className={`px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${selectedStatus === 'all'
            ? 'ring-2 ring-offset-2 scale-105'
            : 'hover:scale-102 opacity-80 hover:opacity-100'
            }`}
          style={{
            backgroundColor: '#6b728020',
            borderColor: '#6b7280',
            borderWidth: 1,
            borderStyle: 'solid',
            color: '#6b7280',
            '--tw-ring-color': '#6b7280',
          } as React.CSSProperties}
        >
          <span>ทั้งหมด</span>
          <span className="font-bold">{transformedData.length}</span>
          <span>รายการ</span>
        </button>

        {selectedStatus && (
          <button
            onClick={() => setSelectedStatus(null)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-gray-700 dark:text-gray-700"
          >
            <RotateCcw size={16} />
          
          </button>
        )}
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="flex items-center justify-center shrink-0" style={{ height }}>
          <p className="text-muted-foreground text-sm">ไม่มีสินค้าไม่เคลื่อนไหว</p>
        </div>
      ) : (
        <div ref={chartRef} style={{ height, width: '100%' }} className="shrink-0" />
      )}

      {/* Detail Table - Show when status is selected */}
      {selectedStatus && (
        <div className="-mt-28 border-t pt-1 flex-1 flex flex-col min-h-[320px] relative z-10 bg-card rounded-b-xl">
          <div className="flex items-center gap-2 mb-0 shrink-0 pt-2 bg-card">
            <AlertCircle className={`h-5 w-5 ${selectedStatus === 'all' ? 'text-gray-600' : getSeverityColor(selectedStatus)}`} />
            <h4 className="font-semibold">
              {selectedStatus === 'all'
                ? `รายการสินค้าทั้งหมด (${filteredData.length} รายการ)`
                : `รายการสินค้าสถานะ "${selectedStatus}" (${filteredData.length} รายการ)`
              }
            </h4>
          </div>
          <div className="-mt-1 flex-1 flex flex-col min-h-0 bg-card pb-2">
            <PaginatedTable
              data={filteredData}
              columns={columns}
              itemsPerPage={5}
              emptyMessage="ไม่มีข้อมูล"
              keyExtractor={(item: ChartOverstockItem) => `${item.itemCode}-${item.branchName}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
