'use client';

import { useState } from 'react';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { formatSelectedBranchNames, useBranchStore } from '@/store/useBranchStore';
import { DataCard } from '@/components/DataCard';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorBoundary, ErrorDisplay } from '@/components/ErrorBoundary';
import { TableSkeleton } from '@/components/LoadingSkeleton';
import { PaginatedTable, type ColumnDef } from '@/components/PaginatedTable';
import { ReportTypeSelector, type ReportOption } from '@/components/ReportTypeSelector';
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  TrendingDown,
  RotateCw,
  MapPin
} from 'lucide-react';
import { getDateRange } from '@/lib/dateRanges';
import { exportStyledReport } from '@/lib/exportExcel';
import { exportStyledPdfReport } from '@/lib/exportPdf';
import { formatCurrency, formatNumber, formatDate } from '@/lib/formatters';
import { useReportHash } from '@/hooks/useReportHash';
import type {
  DateRange,
  StockMovement,
  LowStockItem,
  OverstockItem,
  SlowMovingItem,
  InventoryTurnover,
  StockByBranch,
} from '@/lib/data/types';
import {
  getStockMovementQuery,
  getLowStockItemsQuery,
  getOverstockItemsQuery,
  getSlowMovingItemsQuery,
  getInventoryTurnoverQuery,
  getStockByBranchQuery,
} from '@/lib/data/inventory-queries';

// Report types
type ReportType =
  | 'stock-movement'
  | 'low-stock'
  | 'overstock'
  | 'slow-moving'
  | 'turnover'
  | 'by-branch';

const reportOptions: ReportOption<ReportType>[] = [
  {
    value: 'stock-movement',
    label: 'การเคลื่อนไหวสต็อก',
    icon: Activity,
    description: 'รายการรับเข้าและจ่ายออกสินค้ารายวัน',
  },
  {
    value: 'low-stock',
    label: 'สินค้าใกล้หมด',
    icon: AlertTriangle,
    description: 'รายการสินค้าที่ต่ำกว่าจุดสั่งซื้อ',
  },
  {
    value: 'overstock',
    label: 'สินค้าเกินคลัง',
    icon: AlertCircle,
    description: 'รายการสินค้าที่เกินระดับสูงสุด',
  },
  {
    value: 'slow-moving',
    label: 'สินค้าขายช้า',
    icon: TrendingDown,
    description: 'รายการสินค้าที่มีอัตราการขายต่ำ',
  },
  {
    value: 'turnover',
    label: 'อัตราหมุนเวียนสินค้า',
    icon: RotateCw,
    description: 'อัตราหมุนเวียนสินค้าตามหมวดหมู่',
  },
  {
    value: 'by-branch',
    label: 'สต็อกตามสาขา',
    icon: MapPin,
    description: 'มูลค่าสินค้าคงคลังแยกตามสาขา/คลัง',
  },
];

export default function InventoryReportPage() {
  const { dateRange, setDateRange } = useDateRangeStore();
  const [selectedReport, setSelectedReport] = useState<ReportType>('stock-movement');
  const asOfDate = new Date().toISOString().split('T')[0];
  const selectedBranches = useBranchStore((s) => s.selectedBranches);
  const availableBranches = useBranchStore((s) => s.availableBranches);
  const selectedBranchLabel = formatSelectedBranchNames(selectedBranches, availableBranches);
  const withBranchSubtitle = (detail: string) => `กิจการ: ${selectedBranchLabel} | ${detail}`;

  // Handle URL hash for report selection
  useReportHash(reportOptions, setSelectedReport);

  const { data: reportData, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['inventoryReportData', selectedReport, dateRange, selectedBranches],
    queryFn: async () => {
      const appendBranches = (params: URLSearchParams) => {
        if (!selectedBranches.includes('ALL')) {
          selectedBranches.forEach((b) => params.append('branch', b));
        }
      };

      const commonParams = {
        start_date: dateRange.start,
        end_date: dateRange.end,
        as_of_date: asOfDate,
      };

      let endpoint = '';
      switch (selectedReport) {
        case 'stock-movement': {
          const params = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end });
          appendBranches(params);
          endpoint = `/api/inventory/stock-movement?${params}`;
          break;
        }
        case 'low-stock': {
          const params = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end });
          appendBranches(params);
          endpoint = `/api/inventory/low-stock?${params}`;
          break;
        }
        case 'overstock': {
          const params = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end });
          appendBranches(params);
          endpoint = `/api/inventory/overstock?${params}`;
          break;
        }
        case 'slow-moving': {
          const params = new URLSearchParams(commonParams);
          appendBranches(params);
          endpoint = `/api/inventory/slow-moving?${params}`;
          break;
        }
        case 'turnover': {
          const params = new URLSearchParams(commonParams);
          appendBranches(params);
          endpoint = `/api/inventory/turnover?${params}`;
          break;
        }
        case 'by-branch': {
          const params = new URLSearchParams({ as_of_date: asOfDate });
          appendBranches(params);
          endpoint = `/api/inventory/by-branch?${params}`;
          break;
        }
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch ${selectedReport} data`);

      const result = await response.json();
      return result.data;
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;

  const stockMovement: StockMovement[] = selectedReport === 'stock-movement' ? (reportData || []) : [];
  const lowStockItems: LowStockItem[] = selectedReport === 'low-stock' ? (reportData || []) : [];
  const overstockItems: OverstockItem[] = selectedReport === 'overstock' ? (reportData || []) : [];
  const slowMovingItems: SlowMovingItem[] = selectedReport === 'slow-moving' ? (reportData || []) : [];
  const inventoryTurnover: InventoryTurnover[] = selectedReport === 'turnover' ? (reportData || []) : [];
  const stockByBranch: StockByBranch[] = selectedReport === 'by-branch' ? (reportData || []) : [];

  const fetchReportData = () => { refetch(); };

  // Column definitions for Stock Movement
  const stockMovementColumns: ColumnDef<StockMovement>[] = [
    {
      key: 'date',
      header: 'วันที่',
      sortable: true,
      align: 'left',
      render: (item: StockMovement) => formatDate(item.date),
    },
    {
      key: 'valueIn',
      header: 'ซื้อเข้า (ต้นทุน)',
      sortable: true,
      align: 'right',
      render: (item: StockMovement) => (
        <span className="text-green-600 font-medium">฿{formatCurrency(item.valueIn || 0)}</span>
      ),
    },
    {
      key: 'valueOut',
      header: 'ขายออก (ต้นทุน)',
      sortable: true,
      align: 'right',
      render: (item: StockMovement) => (
        <span className="text-red-600 font-medium">฿{formatCurrency(item.valueOut || 0)}</span>
      ),
    },
    {
      key: 'net',
      header: 'สุทธิ (บาท)',
      sortable: false,
      align: 'right',
      render: (item: StockMovement) => {
        const net = (item.valueIn || 0) - (item.valueOut || 0);
        return (
          <span className={`font-semibold ${net >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {net >= 0 ? '+' : ''}฿{formatCurrency(net)}
          </span>
        );
      },
    },
  ];

  // Column definitions for Low Stock Items
  const lowStockColumns: ColumnDef<LowStockItem>[] = [
    {
      key: 'status',
      header: 'สถานะ',
      sortable: false,
      align: 'center',
      render: (item: LowStockItem) => {
        const color = item.daysOnHand <= 2 ? 'text-red-600' : item.daysOnHand <= 5 ? 'text-orange-600' : 'text-yellow-600';
        return <AlertTriangle className={`h-4 w-4 ${color} mx-auto`} />;
      },
    },
    {
      key: 'itemName',
      header: 'สินค้า',
      sortable: true,
      align: 'left',
      render: (item: LowStockItem) => (
        <div>
          <div className="font-medium">{item.itemName}</div>
          <div className="text-xs text-muted-foreground">{item.itemCode}</div>
        </div>
      ),
    },
    {
      key: 'brandName',
      header: 'แบรนด์',
      sortable: true,
      align: 'left',
    },
    {
      key: 'branchName',
      header: 'คลัง',
      sortable: true,
      align: 'left',
    },
    {
      key: 'qtyOnHand',
      header: 'คงเหลือ',
      sortable: true,
      align: 'right',
      render: (item: LowStockItem) => (
        <span className="font-medium">{formatNumber(item.qtyOnHand)}</span>
      ),
    },
    {
      key: 'avgDailySales',
      header: 'ยอดขาย/วัน',
      sortable: true,
      align: 'right',
      render: (item: LowStockItem) => formatNumber(item.avgDailySales),
    },
    {
      key: 'daysOnHand',
      header: 'เหลือขาย (วัน)',
      sortable: true,
      align: 'right',
      render: (item: LowStockItem) => {
        const color = item.daysOnHand <= 2 ? 'text-red-600' : item.daysOnHand <= 5 ? 'text-orange-600' : 'text-yellow-600';
        return (
          <span className={`font-medium ${color}`}>
            {item.daysOnHand === 999999 ? '-' : formatNumber(item.daysOnHand)}
          </span>
        );
      },
    },
    {
      key: 'stockValue',
      header: 'มูลค่า',
      sortable: true,
      align: 'right',
      render: (item: LowStockItem) => (
        <span className="font-medium">฿{formatCurrency(item.stockValue)}</span>
      ),
    },
  ];

  // Column definitions for Overstock Items
  const overstockColumns: ColumnDef<OverstockItem>[] = [
    {
      key: 'status',
      header: 'สถานะ',
      sortable: false,
      align: 'center',
      render: (item: OverstockItem) => {
        const color = item.daysOnHand > 365 ? 'text-red-600' : item.daysOnHand >= 180 ? 'text-yellow-600' : 'text-blue-600';
        return <AlertCircle className={`h-4 w-4 ${color} mx-auto`} />;
      },
    },
    {
      key: 'itemName',
      header: 'สินค้า',
      sortable: true,
      align: 'left',
      render: (item: OverstockItem) => (
        <div>
          <div className="font-medium">{item.itemName}</div>
          <div className="text-xs text-muted-foreground">{item.itemCode}</div>
        </div>
      ),
    },
    {
      key: 'brandName',
      header: 'แบรนด์',
      sortable: true,
      align: 'left',
    },
    {
      key: 'qtyOnHand',
      header: 'คงเหลือ',
      sortable: true,
      align: 'right',
      render: (item: OverstockItem) => formatNumber(item.qtyOnHand),
    },
    {
      key: 'avgDailySales',
      header: 'ยอดขาย/วัน',
      sortable: true,
      align: 'right',
      render: (item: OverstockItem) => formatNumber(item.avgDailySales),
    },
    {
      key: 'daysOnHand',
      header: 'จัดเก็บ (วัน)',
      sortable: true,
      align: 'right',
      render: (item: OverstockItem) => {
        const color = item.daysOnHand > 365 ? 'text-red-600' : item.daysOnHand >= 180 ? 'text-yellow-600' : 'text-blue-600';
        return (
          <span className={`font-medium ${color}`}>
            {item.daysOnHand === 999999 ? '♾️' : formatNumber(item.daysOnHand)}
          </span>
        );
      },
    },
    {
      key: 'stockValue',
      header: 'มูลค่าจม',
      sortable: true,
      align: 'right',
      render: (item: OverstockItem) => (
        <span className="font-medium text-muted-foreground">฿{formatCurrency(item.stockValue)}</span>
      ),
    },
  ];

  // Column definitions for Slow Moving Items
  const slowMovingColumns: ColumnDef<SlowMovingItem>[] = [
    {
      key: 'status',
      header: 'สถานะ',
      sortable: false,
      align: 'center',
      render: () => (
        <TrendingDown className="h-4 w-4 text-orange-600 mx-auto" />
      ),
    },
    {
      key: 'itemName',
      header: 'สินค้า',
      sortable: true,
      align: 'left',
      render: (item: SlowMovingItem) => (
        <div>
          <div className="font-medium">{item.itemName}</div>
          <div className="text-xs text-muted-foreground">{item.itemCode}</div>
        </div>
      ),
    },
    {
      key: 'categoryName',
      header: 'หมวดหมู่',
      sortable: true,
      align: 'left',
    },
    {
      key: 'qtyOnHand',
      header: 'คงเหลือ',
      sortable: true,
      align: 'right',
      render: (item: SlowMovingItem) => formatNumber(item.qtyOnHand),
    },
    {
      key: 'qtySold',
      header: 'ขายได้',
      sortable: true,
      align: 'right',
      render: (item: SlowMovingItem) => formatNumber(item.qtySold),
    },
    {
      key: 'daysOfStock',
      header: 'วันสต็อก',
      sortable: true,
      align: 'right',
      render: (item: SlowMovingItem) => (
        <span className={`font-medium ${item.daysOfStock > 180 ? 'text-red-600' : 'text-orange-600'}`}>
          {item.daysOfStock > 900 ? '999+' : formatNumber(item.daysOfStock)} วัน
        </span>
      ),
    },
    {
      key: 'stockValue',
      header: 'มูลค่า',
      sortable: true,
      align: 'right',
      render: (item: SlowMovingItem) => (
        <span className="font-medium">฿{formatCurrency(item.stockValue)}</span>
      ),
    },
  ];

  // Column definitions for Inventory Turnover
  const turnoverColumns: ColumnDef<InventoryTurnover>[] = [
    {
      key: 'itemName',
      header: 'หมวดหมู่',
      sortable: true,
      align: 'left',
      render: (item: InventoryTurnover) => (
        <span className="font-medium">{item.itemName}</span>
      ),
    },
    {
      key: 'avgInventoryValue',
      header: 'มูลค่าสต็อกเฉลี่ย',
      sortable: true,
      align: 'right',
      render: (item: InventoryTurnover) => (
        <span>฿{formatCurrency(item.avgInventoryValue)}</span>
      ),
    },
    {
      key: 'totalCOGS',
      header: 'ต้นทุนขาย',
      sortable: true,
      align: 'right',
      render: (item: InventoryTurnover) => (
        <span>฿{formatCurrency(item.totalCOGS)}</span>
      ),
    },
    {
      key: 'turnoverRatio',
      header: 'อัตราหมุนเวียน',
      sortable: true,
      align: 'right',
      render: (item: InventoryTurnover) => (
        <span className={`font-medium ${item.turnoverRatio >= 4 ? 'text-green-600' : item.turnoverRatio >= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
          {item.turnoverRatio.toFixed(2)} รอบ
        </span>
      ),
    },
    {
      key: 'daysToSell',
      header: 'วันขายหมด',
      sortable: true,
      align: 'right',
      render: (item: InventoryTurnover) => (
        <span className="text-muted-foreground">
          {item.daysToSell > 0 ? `${formatNumber(Math.round(item.daysToSell))} วัน` : '-'}
        </span>
      ),
    },
  ];

  // Column definitions for Stock By Branch
  const stockByBranchColumns: ColumnDef<StockByBranch>[] = [
    {
      key: 'branchCode',
      header: 'รหัสสาขา',
      sortable: true,
      align: 'left',
      render: (item: StockByBranch) => (
        <span className="font-mono text-xs">{item.branchCode}</span>
      ),
    },
    {
      key: 'branchName',
      header: 'ชื่อสาขา',
      sortable: true,
      align: 'left',
      render: (item: StockByBranch) => (
        <span className="font-medium">{item.branchName}</span>
      ),
    },
    {
      key: 'itemCount',
      header: 'จำนวนรายการ',
      sortable: true,
      align: 'right',
      render: (item: StockByBranch) => formatNumber(item.itemCount),
    },
    {
      key: 'qtyOnHand',
      header: 'จำนวนสินค้า',
      sortable: true,
      align: 'right',
      render: (item: StockByBranch) => formatNumber(item.qtyOnHand || 0),
    },
    {
      key: 'inventoryValue',
      header: 'มูลค่าสินค้า',
      sortable: true,
      align: 'right',
      render: (item: StockByBranch) => (
        <span className="font-medium text-blue-600">฿{formatCurrency(item.inventoryValue)}</span>
      ),
    },
  ];

  // Get current report option
  const currentReport = reportOptions.find(opt => opt.value === selectedReport);

  // Render report content based on selected type
  const renderReportContent = () => {
    switch (selectedReport) {
      case 'stock-movement':
        return (
          <PaginatedTable
            data={stockMovement}
            columns={stockMovementColumns}
            itemsPerPage={15}
            emptyMessage="ไม่มีข้อมูลการเคลื่อนไหวสต็อก"
            defaultSortKey="date"
            defaultSortOrder="desc"
            keyExtractor={(item: StockMovement) => item.date}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                valueIn: (data) => {
                  const total = data.reduce((sum, item) => sum + (item.valueIn || 0), 0);
                  return <span className="text-green-600 font-medium">฿{formatCurrency(total)}</span>;
                },
                valueOut: (data) => {
                  const total = data.reduce((sum, item) => sum + (item.valueOut || 0), 0);
                  return <span className="text-red-600 font-medium">฿{formatCurrency(total)}</span>;
                },
                net: (data) => {
                  const total = data.reduce((sum, item) => sum + ((item.valueIn || 0) - (item.valueOut || 0)), 0);
                  return (
                    <span className={`font-semibold ${total >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {total >= 0 ? '+' : ''}฿{formatCurrency(total)}
                    </span>
                  );
                },
              }
            }}
          />
        );

      case 'low-stock':
        return (
          <PaginatedTable
            data={lowStockItems}
            columns={lowStockColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีสินค้าใกล้หมด"
            defaultSortKey="qtyOnHand"
            defaultSortOrder="asc"
            keyExtractor={(item: LowStockItem) => item.itemCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                stockValue: (data) => {
                  const total = data.reduce((sum, item) => sum + item.stockValue, 0);
                  return <span className="font-bold text-blue-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'overstock':
        return (
          <PaginatedTable
            data={overstockItems}
            columns={overstockColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีสินค้าเกินคลัง"
            defaultSortKey="stockValue"
            defaultSortOrder="desc"
            keyExtractor={(item: OverstockItem) => item.itemCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                stockValue: (data) => {
                  const total = data.reduce((sum, item) => sum + item.stockValue, 0);
                  return <span className="font-bold text-red-600">฿{formatCurrency(total)}</span>;
                },
              }
            }}
          />
        );

      case 'slow-moving':
        return (
          <PaginatedTable
            data={slowMovingItems}
            columns={slowMovingColumns}
            itemsPerPage={15}
            emptyMessage="ไม่มีสินค้าขายช้า"
            defaultSortKey="stockValue"
            defaultSortOrder="desc"
            keyExtractor={(item: SlowMovingItem) => item.itemCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                stockValue: (data) => {
                  const total = data.reduce((sum, item) => sum + item.stockValue, 0);
                  return <span className="font-bold text-blue-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'turnover':
        return (
          <PaginatedTable
            data={inventoryTurnover}
            columns={turnoverColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลอัตราหมุนเวียน"
            defaultSortKey="turnoverRatio"
            defaultSortOrder="desc"
            keyExtractor={(item: InventoryTurnover) => item.itemName}
          />
        );

      case 'by-branch':
        return (
          <PaginatedTable
            data={stockByBranch}
            columns={stockByBranchColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลสต็อกตามสาขา"
            defaultSortKey="inventoryValue"
            defaultSortOrder="desc"
            keyExtractor={(item: StockByBranch) => item.branchCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                inventoryValue: (data) => {
                  const total = data.reduce((sum, item) => sum + item.inventoryValue, 0);
                  return <span className="font-bold text-blue-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      default:
        return null;
    }
  };

  // Get export function based on report type
  const getExportFunction = () => {
    switch (selectedReport) {
      case 'stock-movement':
        return () => exportStyledReport({
          data: stockMovement.map(item => ({ date: item.date, valueIn: item.valueIn || 0, valueOut: item.valueOut || 0 })),
          headers: { date: 'วันที่', valueIn: 'ซื้อเข้า (ต้นทุน)', valueOut: 'ขายออก (ต้นทุน)' },
          filename: 'การเคลื่อนไหวสต็อก',
          sheetName: 'Stock Movement',
          title: 'รายงานการเคลื่อนไหวสต็อก (ซื้อเข้า vs ขายออก)',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['valueIn', 'valueOut'],
          summaryConfig: {
            columns: {
              valueIn: 'sum',
              valueOut: 'sum',
            }
          }
        });

      case 'low-stock':
        return () => exportStyledReport({
          data: lowStockItems,
          headers: { itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', brandName: 'แบรนด์', branchName: 'สาขา', qtyOnHand: 'คงเหลือ', avgDailySales: 'ยอดขาย/วัน', daysOnHand: 'เหลือขาย (วัน)', stockValue: 'มูลค่า' },
          filename: 'สินค้าใกล้หมด',
          sheetName: 'Low Stock',
          title: 'รายงานสินค้าใกล้หมด',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['qtyOnHand', 'avgDailySales', 'daysOnHand'],
          currencyColumns: ['stockValue'],
          summaryConfig: {
            columns: {
              qtyOnHand: 'sum',
              stockValue: 'sum',
            }
          }
        });

      case 'overstock':
        return () => exportStyledReport({
          data: overstockItems,
          headers: { itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', brandName: 'แบรนด์', qtyOnHand: 'คงเหลือ', avgDailySales: 'ยอดขาย/วัน', daysOnHand: 'จัดเก็บ (วัน)', stockValue: 'มูลค่าจม' },
          filename: 'สินค้าเกินคลัง',
          sheetName: 'Overstock',
          title: 'รายงานสินค้าเกินคลัง',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['qtyOnHand', 'avgDailySales', 'daysOnHand'],
          currencyColumns: ['stockValue'],
          summaryConfig: {
            columns: {
              qtyOnHand: 'sum',
              stockValue: 'sum',
            }
          }
        });

      case 'slow-moving':
        return () => exportStyledReport({
          data: slowMovingItems,
          headers: { itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', categoryName: 'หมวดหมู่', qtyOnHand: 'คงเหลือ', qtySold: 'ขายได้', daysOfStock: 'วันสต็อก', stockValue: 'มูลค่า' },
          filename: 'สินค้าขายช้า',
          sheetName: 'Slow Moving',
          title: 'รายงานสินค้าขายช้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['qtyOnHand', 'qtySold', 'daysOfStock'],
          currencyColumns: ['stockValue'],
          summaryConfig: {
            columns: {
              qtyOnHand: 'sum',
              qtySold: 'sum',
              stockValue: 'sum',
            }
          }
        });

      case 'turnover':
        return () => exportStyledReport({
          data: inventoryTurnover,
          headers: { itemName: 'หมวดหมู่', avgInventoryValue: 'มูลค่าสต็อกเฉลี่ย', totalCOGS: 'ต้นทุนขาย', turnoverRatio: 'อัตราหมุนเวียน', daysToSell: 'วันขายหมด' },
          filename: 'อัตราหมุนเวียนสินค้า',
          sheetName: 'Inventory Turnover',
          title: 'รายงานอัตราหมุนเวียนสินค้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['avgInventoryValue', 'totalCOGS'],
          numberColumns: ['turnoverRatio', 'daysToSell'],
        });

      case 'by-branch':
        return () => exportStyledReport({
          data: stockByBranch,
          headers: { branchCode: 'รหัสสาขา', branchName: 'ชื่อสาขา', itemCount: 'จำนวนรายการ', qtyOnHand: 'จำนวนสินค้า', inventoryValue: 'มูลค่าสินค้า' },
          filename: 'สต็อกตามสาขา',
          sheetName: 'Stock by Branch',
          title: 'รายงานสต็อกตามสาขา',
          subtitle: withBranchSubtitle(`ณ วันที่ ${asOfDate}`),
          numberColumns: ['itemCount', 'qtyOnHand'],
          currencyColumns: ['inventoryValue'],
          summaryConfig: {
            columns: {
              itemCount: 'sum',
              qtyOnHand: 'sum',
              inventoryValue: 'sum',
            }
          }
        });

      default:
        return undefined;
    }
  };

  const getExportPdfFunction = () => {
    switch (selectedReport) {
      case 'stock-movement':
        return () => exportStyledPdfReport({
          data: stockMovement.map(item => ({ date: item.date, valueIn: item.valueIn || 0, valueOut: item.valueOut || 0 })),
          headers: { date: 'วันที่', valueIn: 'ซื้อเข้า (ต้นทุน)', valueOut: 'ขายออก (ต้นทุน)' },
          filename: 'การเคลื่อนไหวสต็อก',
          title: 'รายงานการเคลื่อนไหวสต็อก (ซื้อเข้า vs ขายออก)',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['valueIn', 'valueOut'],
          summaryConfig: {
            columns: {
              valueIn: 'sum',
              valueOut: 'sum',
            }
          }
        });

      case 'low-stock':
        return () => exportStyledPdfReport({
          data: lowStockItems,
          headers: { itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', brandName: 'แบรนด์', branchName: 'สาขา', qtyOnHand: 'คงเหลือ', avgDailySales: 'ยอดขาย/วัน', daysOnHand: 'เหลือขาย (วัน)', stockValue: 'มูลค่า' },
          filename: 'สินค้าใกล้หมด',
          title: 'รายงานสินค้าใกล้หมด',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['qtyOnHand', 'avgDailySales', 'daysOnHand'],
          currencyColumns: ['stockValue'],
          summaryConfig: {
            columns: {
              qtyOnHand: 'sum',
              stockValue: 'sum',
            }
          }
        });

      case 'overstock':
        return () => exportStyledPdfReport({
          data: overstockItems,
          headers: { itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', brandName: 'แบรนด์', qtyOnHand: 'คงเหลือ', avgDailySales: 'ยอดขาย/วัน', daysOnHand: 'จัดเก็บ (วัน)', stockValue: 'มูลค่าจม' },
          filename: 'สินค้าเกินคลัง',
          title: 'รายงานสินค้าเกินคลัง',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['qtyOnHand', 'avgDailySales', 'daysOnHand'],
          currencyColumns: ['stockValue'],
          summaryConfig: {
            columns: {
              qtyOnHand: 'sum',
              stockValue: 'sum',
            }
          }
        });

      case 'slow-moving':
        return () => exportStyledPdfReport({
          data: slowMovingItems,
          headers: { itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', categoryName: 'หมวดหมู่', qtyOnHand: 'คงเหลือ', qtySold: 'ขายได้', daysOfStock: 'วันสต็อก', stockValue: 'มูลค่า' },
          filename: 'สินค้าขายช้า',
          title: 'รายงานสินค้าขายช้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['qtyOnHand', 'qtySold', 'daysOfStock'],
          currencyColumns: ['stockValue'],
          summaryConfig: {
            columns: {
              qtyOnHand: 'sum',
              qtySold: 'sum',
              stockValue: 'sum',
            }
          }
        });

      case 'turnover':
        return () => exportStyledPdfReport({
          data: inventoryTurnover,
          headers: { itemName: 'หมวดหมู่', avgInventoryValue: 'มูลค่าสต็อกเฉลี่ย', totalCOGS: 'ต้นทุนขาย', turnoverRatio: 'อัตราหมุนเวียน', daysToSell: 'วันขายหมด' },
          filename: 'อัตราหมุนเวียนสินค้า',
          title: 'รายงานอัตราหมุนเวียนสินค้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['avgInventoryValue', 'totalCOGS'],
          numberColumns: ['turnoverRatio', 'daysToSell'],
        });

      case 'by-branch':
        return () => exportStyledPdfReport({
          data: stockByBranch,
          headers: { branchCode: 'รหัสสาขา', branchName: 'ชื่อสาขา', itemCount: 'จำนวนรายการ', qtyOnHand: 'จำนวนสินค้า', inventoryValue: 'มูลค่าสินค้า' },
          filename: 'สต็อกตามสาขา',
          title: 'รายงานสต็อกตามสาขา',
          subtitle: withBranchSubtitle(`ณ วันที่ ${asOfDate}`),
          numberColumns: ['itemCount', 'qtyOnHand'],
          currencyColumns: ['inventoryValue'],
          summaryConfig: {
            columns: {
              itemCount: 'sum',
              qtyOnHand: 'sum',
              inventoryValue: 'sum',
            }
          }
        });

      default:
        return undefined;
    }
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

  return (
    <motion.div 
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header with integrated controls */}
      <motion.div variants={itemVariants} className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">
              รายงานสินค้าคงคลัง
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              ข้อมูลรายงานคลังสินค้าและสต็อกในรูปแบบตาราง
            </p>
          </div>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>

        {/* Compact Report Type Selector */}
        <ReportTypeSelector
          value={selectedReport}
          options={reportOptions}
          onChange={(value) => setSelectedReport(value as ReportType)}
        />
      </motion.div>

      {/* Error Display */}
      {error && <motion.div variants={itemVariants}><ErrorDisplay error={error} onRetry={() => refetch()} /></motion.div>}

      {/* Report Content */}
      <motion.div variants={itemVariants}>
        <ErrorBoundary>
        <DataCard
          id={selectedReport}
          title={currentReport?.label || ''}
          description={currentReport?.description || ''}
          queryInfo={selectedReport === 'stock-movement' ? {
            query: getStockMovementQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'low-stock' ? {
            query: getLowStockItemsQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'overstock' ? {
            query: getOverstockItemsQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'slow-moving' ? {
            query: getSlowMovingItemsQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'turnover' ? {
            query: getInventoryTurnoverQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'by-branch' ? {
            query: getStockByBranchQuery(dateRange),
            format: 'JSONEachRow'
          } : undefined}
          onExportExcel={getExportFunction()}
          onExportPDF={getExportPdfFunction()}
        >
          {loading ? (
            <TableSkeleton rows={10} />
          ) : (
            renderReportContent()
          )}
        </DataCard>
      </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}
