'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDateRangeStore } from '@/store/useDateRangeStore';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { formatSelectedBranchNames, useBranchStore } from '@/store/useBranchStore';
import { DataCard } from '@/components/DataCard';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorBoundary, ErrorDisplay } from '@/components/ErrorBoundary';
import { TableSkeleton } from '@/components/LoadingSkeleton';
import { PaginatedTable, type ColumnDef } from '@/components/PaginatedTable';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ReportTypeSelector, type ReportOption } from '@/components/ReportTypeSelector';
import { ReportPeriodFilter, getMonthsFromDateRange, type PeriodType } from '@/components/ReportPeriodFilter';
import { useReportPeriodFilter } from '@/hooks/useReportPeriodFilter';
import { TopProductsComparisonTable, type TopProductPivotRow } from '@/components/TopProductsComparisonTable';
import {
  TrendingUp,
  Users,
  ShoppingBag,
  MapPin,
  UserCheck,
  CreditCard,
  FolderTree,
} from 'lucide-react';
import { exportStyledReport } from '@/lib/exportExcel';
import { exportStyledPdfReport, prewarmPdfFonts } from '@/lib/exportPdf';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/formatters';
import { useReportHash } from '@/hooks/useReportHash';
import type {
  DateRange,
  SalesAnalysisData,
  TopProduct,
  TopProductByBranch,
  SalesByBranch,
  SalesByCategory,
  SalesBySalesperson,
  TopCustomer,
  ARStatus,
} from '@/lib/data/types';

// Report types
type ReportType =
  | 'sales-trend'
  | 'top-products'
  | 'by-branch'
  | 'by-category'
  | 'by-salesperson'
  | 'top-customers'
  | 'ar-status';

const reportOptions: ReportOption<ReportType>[] = [
  {
    value: 'sales-trend',
    label: 'รายงานวิเคราะห์ยอดขาย',
    icon: TrendingUp,
    description: 'รายละเอียดการขายแยกตามหมวดหมู่สินค้า',
  },
  {
    value: 'top-products',
    label: 'สินค้าขายดี',
    icon: ShoppingBag,
    description: 'สินค้าที่มียอดขายสูงสุด',
  },
  {
    value: 'by-branch',
    label: 'ยอดขายตามสาขา',
    icon: MapPin,
    description: 'ยอดขายแยกตามสาขา/คลัง',
  },
  {
    value: 'by-category',
    label: 'ยอดขายตามหมวดหมู่',
    icon: FolderTree,
    description: 'ยอดขายแยกตามหมวดหมู่สินค้า',
  },
  {
    value: 'by-salesperson',
    label: 'ยอดขายตามพนักงาน',
    icon: UserCheck,
    description: 'ยอดขายแยกตามพนักงานขาย',
  },
  {
    value: 'top-customers',
    label: 'ลูกค้ารายสำคัญ',
    icon: Users,
    description: 'ลูกค้าที่มียอดซื้อสูงสุด',
  },
  {
    value: 'ar-status',
    label: 'สถานะลูกหนี้การค้า',
    icon: CreditCard,
    description: 'สรุปสถานะการชำระเงินของลูกค้า',
  },
];

const periodFilterReports = new Set<ReportType>([
  'top-products',
]);

function formatDateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clampDateRange(range: DateRange, bounds: DateRange): DateRange {
  return {
    start: range.start < bounds.start ? bounds.start : range.start,
    end: range.end > bounds.end ? bounds.end : range.end,
  };
}

function getPeriodDateRange(periodKey: string, periodType: PeriodType, bounds: DateRange): DateRange {
  if (!periodKey) return bounds;

  if (periodType === 'yearly') {
    return clampDateRange({ start: `${periodKey}-01-01`, end: `${periodKey}-12-31` }, bounds);
  }

  if (periodType === 'quarterly') {
    const [year, quarterText] = periodKey.split('-Q');
    const quarter = Number(quarterText || '1');
    const startMonth = (quarter - 1) * 3;
    const start = new Date(Number(year), startMonth, 1);
    const end = new Date(Number(year), startMonth + 3, 0);
    return clampDateRange({ start: formatDateParam(start), end: formatDateParam(end) }, bounds);
  }

  if (periodType === 'half-yearly') {
    const [year, halfText] = periodKey.split('-H');
    const half = Number(halfText || '1');
    const startMonth = half === 1 ? 0 : 6;
    const start = new Date(Number(year), startMonth, 1);
    const end = new Date(Number(year), startMonth + 6, 0);
    return clampDateRange({ start: formatDateParam(start), end: formatDateParam(end) }, bounds);
  }

  const [year, month] = periodKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return clampDateRange({ start: formatDateParam(start), end: formatDateParam(end) }, bounds);
}

function SalesReportContent() {
  const { dateRange, setDateRange } = useDateRangeStore();
  const [selectedReport, setSelectedReport] = useState<ReportType>('sales-trend');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const selectedBranches = useBranchStore((s) => s.selectedBranches);
  const availableBranches = useBranchStore((s) => s.availableBranches);
  const selectedBranchLabel = formatSelectedBranchNames(selectedBranches, availableBranches);
  const withBranchSubtitle = (detail: string) => `กิจการ: ${selectedBranchLabel} | ${detail}`;

  // Category filter for Sales Analysis report
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { filter: salesFilter, setFilter: setSalesFilter } = useReportPeriodFilter();
  const showPeriodFilter = periodFilterReports.has(selectedReport);

  // Handle URL hash for report selection
  useReportHash(reportOptions, setSelectedReport);

  // ✅ อ่าน URL query params เมื่อเข้าหน้า (จากการกด drill-down ใน Dashboard)
  const searchParams = useSearchParams();
  const normalizeFilterValue = (value?: string | null) => {
    const trimmed = (value || '').trim();
    return trimmed || 'N/A';
  };
  const urlCategoryCode = searchParams.get('categoryCode');
  const urlCategoryName = searchParams.get('categoryName');

  useEffect(() => {
    const reportParam  = searchParams.get('report');
    const startDateParam = searchParams.get('start_date');
    const endDateParam   = searchParams.get('end_date');

    // เซ็ต report type ถ้ามีใน params
    if (reportParam && reportOptions.some(opt => opt.value === reportParam)) {
      setSelectedReport(reportParam as ReportType);
    }
    if (urlCategoryCode) {
      setSelectedCategory(normalizeFilterValue(urlCategoryCode));
    }
    if (urlCategoryName) {
      setCategoryFilter(urlCategoryName);
    }

    // เซ็ต date range ถ้ามีใน params
    if (startDateParam && endDateParam) {
      setDateRange({ start: startDateParam, end: endDateParam });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // รันแค่ครั้งเดียวตอน mount
  useEffect(() => {
    setSelectedCategory(selectedReport === 'by-category' && urlCategoryCode ? normalizeFilterValue(urlCategoryCode) : 'ALL');
    setCategoryFilter(selectedReport === 'sales-trend' && urlCategoryName ? urlCategoryName : 'all');
  }, [selectedReport, urlCategoryCode, urlCategoryName]);

  // Pre-warm PDF font cache in background when page mounts
  useEffect(() => {
    prewarmPdfFonts();
  }, []);

  const topProductsDateRange = useMemo<DateRange>(() => {
    if (selectedReport !== 'top-products') return dateRange;

    if (salesFilter.viewMode === 'normal' && salesFilter.selectedPeriod) {
      return getPeriodDateRange(salesFilter.selectedPeriod, salesFilter.periodType, dateRange);
    }

    if (salesFilter.viewMode === 'comparison' && (salesFilter.compareA || salesFilter.compareB)) {
      const ranges = [salesFilter.compareA, salesFilter.compareB]
        .filter(Boolean)
        .map((period) => getPeriodDateRange(period, salesFilter.periodType, dateRange));
      if (ranges.length === 0) return dateRange;
      return {
        start: ranges.reduce((min, range) => (range.start < min ? range.start : min), ranges[0].start),
        end: ranges.reduce((max, range) => (range.end > max ? range.end : max), ranges[0].end),
      };
    }

    return dateRange;
  }, [dateRange, salesFilter, selectedReport]);

  const topProductsDateRanges = useMemo<DateRange[]>(() => {
    if (selectedReport !== 'top-products') return [dateRange];

    if (salesFilter.viewMode === 'normal' && salesFilter.selectedPeriod) {
      return [getPeriodDateRange(salesFilter.selectedPeriod, salesFilter.periodType, dateRange)];
    }

    if (salesFilter.viewMode === 'comparison' && (salesFilter.compareA || salesFilter.compareB)) {
      return [salesFilter.compareA, salesFilter.compareB]
        .filter(Boolean)
        .map((period) => getPeriodDateRange(period, salesFilter.periodType, dateRange));
    }

    return [dateRange];
  }, [dateRange, salesFilter, selectedReport]);

  const topProductsSubtitleDateRange = selectedReport === 'top-products' ? topProductsDateRange : dateRange;

  const { data: reportData, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['salesReportData', selectedReport, dateRange, topProductsDateRange, selectedBranches, salesFilter],
    queryFn: async () => {
      const reportDateRange = selectedReport === 'top-products' ? topProductsDateRange : dateRange;
      const params = new URLSearchParams({
        start_date: reportDateRange.start,
        end_date: reportDateRange.end,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }

      let endpoint = '';
      switch (selectedReport) {
        case 'sales-trend':
          endpoint = `/api/sales/analysis?${params}`;
          break;
        case 'top-products':
          endpoint = `/api/sales/top-products?${params}`;
          break;
        case 'by-branch':
          endpoint = `/api/sales/by-branch?${params}`;
          break;
        case 'by-category':
          endpoint = `/api/sales/by-category?${params}`;
          break;
        case 'by-salesperson':
          endpoint = `/api/sales/by-salesperson?${params}`;
          break;
        case 'top-customers':
          endpoint = `/api/sales/top-customers?${params}`;
          break;
        case 'ar-status':
          endpoint = `/api/sales/ar-status?${params}`;
          break;
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch ${selectedReport} data`);

      const result = await response.json();
      return result.data;
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;

  const salesAnalysis: SalesAnalysisData[] = selectedReport === 'sales-trend' ? (reportData || []) : [];
  const topProducts: TopProduct[] = selectedReport === 'top-products' ? (reportData || []) : [];
  const salesByBranch: SalesByBranch[] = selectedReport === 'by-branch' ? (reportData || []) : [];
  const salesByCategory: SalesByCategory[] = selectedReport === 'by-category' ? (reportData || []) : [];
  const salesBySalesperson: SalesBySalesperson[] = selectedReport === 'by-salesperson' ? (reportData || []) : [];
  const topCustomers: TopCustomer[] = selectedReport === 'top-customers' ? (reportData || []) : [];
  const arStatus: ARStatus[] = selectedReport === 'ar-status' ? (reportData || []) : [];

  // Available months for period filter
  const salesAvailableMonths = useMemo(
    () => getMonthsFromDateRange(dateRange.start, dateRange.end),
    [dateRange]
  );

  // Query for top-products branch comparison data
  const isTopProductsComparison = selectedReport === 'top-products' && salesFilter.viewMode === 'comparison';
  const { data: topProductsByBranchRaw } = useQuery<TopProductByBranch[]>({
    queryKey: ['topProductsByBranch', topProductsDateRanges, selectedBranches, salesFilter],
    queryFn: async () => {
      const results = await Promise.all(topProductsDateRanges.map(async (range) => {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end });
        if (!selectedBranches.includes('ALL')) {
          selectedBranches.forEach((b) => params.append('branch', b));
        }
        const response = await fetch(`/api/sales/top-products-by-branch?${params}`);
        if (!response.ok) throw new Error('Failed to fetch top-products-by-branch');
        const result = await response.json();
        return result.data as TopProductByBranch[];
      }));
      return results.flat();
    },
    enabled: isTopProductsComparison,
  });

  // Pivot top-products-by-branch data into rows with branch columns
  const comparisonBranches = useMemo(() => {
    const realBranches = availableBranches.filter((b) => b.key !== 'ALL');
    const selected = selectedBranches.includes('ALL')
      ? realBranches
      : realBranches.filter((b) => selectedBranches.includes(b.key));
    const byName = new Map<string, { key: string; name: string; branchKeys: string[] }>();

    selected.forEach((branch) => {
      const existing = byName.get(branch.name);
      if (existing) {
        existing.branchKeys.push(branch.key);
        return;
      }
      byName.set(branch.name, { key: branch.key, name: branch.name, branchKeys: [branch.key] });
    });

    return Array.from(byName.values());
  }, [selectedBranches, availableBranches]);

  const comparisonBranchKeyMap = useMemo(() => {
    const map = new Map<string, string>();
    comparisonBranches.forEach((branch) => {
      branch.branchKeys.forEach((branchKey) => map.set(branchKey, branch.key));
    });
    return map;
  }, [comparisonBranches]);

  const topProductsPivotRows = useMemo<TopProductPivotRow[]>(() => {
    if (!topProductsByBranchRaw?.length) return [];
    const byItem = new Map<string, TopProductPivotRow>();
    topProductsByBranchRaw.forEach((row) => {
      const itemKey = `${row.itemCode}::${row.unitCode}`;
      if (!byItem.has(itemKey)) {
        byItem.set(itemKey, { itemCode: row.itemCode, itemName: row.itemName, unitCode: row.unitCode, totalSalesAll: 0 });
      }
      const item = byItem.get(itemKey)!;
      const branchKey = comparisonBranchKeyMap.get(row.branchSync) || row.branchSync;
      item[`${branchKey}_qty`] = Number(item[`${branchKey}_qty`] || 0) + row.totalQtySold;
      item[`${branchKey}_sales`] = Number(item[`${branchKey}_sales`] || 0) + row.totalSales;
      item.totalSalesAll = (item.totalSalesAll as number) + row.totalSales;
    });
    return Array.from(byItem.values()).sort((a, b) => (b.totalSalesAll as number) - (a.totalSalesAll as number));
  }, [comparisonBranchKeyMap, topProductsByBranchRaw]);

  // Column definitions for Sales Analysis
  const salesAnalysisColumns: ColumnDef<SalesAnalysisData>[] = [
    {
      key: 'categoryName',
      header: 'หมวดสินค้า',
      sortable: true,
      align: 'left',
      className: 'font-medium',
    },
    {
      key: 'docDate',
      header: 'เอกสารวันที่',
      sortable: true,
      align: 'center',
      render: (item: SalesAnalysisData) => formatDate(item.docDate),
    },
    {
      key: 'docNo',
      header: 'เอกสารเลขที่',
      sortable: true,
      align: 'left',
      render: (item: SalesAnalysisData) => <span className="font-mono text-xs">{item.docNo}</span>,
    },
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      align: 'left',
      render: (item: SalesAnalysisData) => <span className="font-mono text-xs">{item.itemCode}</span>,
    },
    {
      key: 'itemName',
      header: 'ชื่อสินค้า',
      sortable: true,
      align: 'left',
      className: 'max-w-[200px] truncate',
      render: (item: SalesAnalysisData) => <span title={item.itemName}>{item.itemName}</span>,
    },
    {
      key: 'unitCode',
      header: 'หน่วยนับ',
      sortable: true,
      align: 'center',
    },
    {
      key: 'qty',
      header: 'จำนวน',
      sortable: true,
      align: 'right',
      render: (item: SalesAnalysisData) => formatNumber(item.qty),
    },
    {
      key: 'price',
      header: 'ราคา',
      sortable: true,
      align: 'right',
      render: (item: SalesAnalysisData) => formatCurrency(item.price),
    },
    {
      key: 'discountAmount',
      header: 'มูลค่าส่วนลด',
      sortable: true,
      align: 'right',
      render: (item: SalesAnalysisData) => item.discountAmount > 0 ? <span className="text-red-500">-{formatCurrency(item.discountAmount)}</span> : '-',
    },
    {
      key: 'totalAmount',
      header: 'รวมมูลค่า',
      sortable: true,
      align: 'right',
      render: (item: SalesAnalysisData) => (
        <span className="font-medium text-green-600">
          ฿{formatCurrency(item.totalAmount)}
        </span>
      ),
    },
  ];

  // Column definitions for Top Products (normal mode)
  const topProductsColumns: ColumnDef<TopProduct>[] = [
    {
      key: 'rank',
      header: '#',
      sortable: false,
      align: 'center',
      render: (_item: TopProduct, index?: number) => (
        <span className="text-muted-foreground">{(index || 0) + 1}</span>
      ),
    },
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      align: 'left',
      render: (item: TopProduct) => (
        <span className="font-mono text-xs text-muted-foreground">{item.itemCode}</span>
      ),
    },
    {
      key: 'itemName',
      header: 'สินค้า',
      sortable: true,
      align: 'left',
      render: (item: TopProduct) => (
        <span className="font-medium">{item.itemName}</span>
      ),
    },
    {
      key: 'unitCode',
      header: 'หน่วยนับ',
      sortable: true,
      align: 'left',
      render: (item: TopProduct) => (
        <span className="text-muted-foreground">{item.unitCode || '-'}</span>
      ),
    },
    {
      key: 'totalQtySold',
      header: 'จำนวน',
      sortable: true,
      align: 'right',
      render: (item: TopProduct) => formatNumber(item.totalQtySold),
    },
    {
      key: 'totalSales',
      header: 'ยอดขาย',
      sortable: true,
      align: 'right',
      render: (item: TopProduct) => (
        <span className="font-medium text-green-600">
          ฿{formatCurrency(item.totalSales)}
        </span>
      ),
    },
  ];

  // Column definitions for Sales by Branch
  const salesByBranchColumns: ColumnDef<SalesByBranch>[] = [
    {
      key: 'branchCode',
      header: 'รหัสสาขา',
      sortable: true,
      align: 'left',
      render: (item: SalesByBranch) => (
        <span className="font-mono text-xs">{item.branchCode}</span>
      ),
    },
    {
      key: 'branchName',
      header: 'ชื่อสาขา',
      sortable: true,
      align: 'left',
      render: (item: SalesByBranch) => (
        <span className="font-medium">{item.branchName}</span>
      ),
    },
    {
      key: 'orderCount',
      header: 'จำนวนออเดอร์',
      sortable: true,
      align: 'right',
      render: (item: SalesByBranch) => formatNumber(item.orderCount),
    },
    {
      key: 'totalSales',
      header: 'ยอดขาย',
      sortable: true,
      align: 'right',
      render: (item: SalesByBranch) => (
        <span className="font-medium text-green-600">
          ฿{formatCurrency(item.totalSales)}
        </span>
      ),
    },
    {
      key: 'avgPerOrder',
      header: 'ยอดเฉลี่ย/ออเดอร์',
      sortable: false,
      align: 'right',
      render: (item: SalesByBranch) => {
        const avg =
          item.orderCount > 0 ? item.totalSales / item.orderCount : 0;
        return <span>฿{formatCurrency(avg)}</span>;
      },
    },
  ];

  // Column definitions for Sales by Category
  const salesByCategoryColumns: ColumnDef<SalesByCategory>[] = [
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      align: 'left',
      render: (item: SalesByCategory) => (
        <span className="font-mono text-xs">{item.itemCode}</span>
      ),
    },
    {
      key: 'itemName',
      header: 'ชื่ตสินค้า',
      sortable: true,
      align: 'left',
      render: (item: SalesByCategory) => (
        <span className="font-medium">{item.itemName}</span>
      ),
    },
    {
      key: 'orderCount',
      header: 'ออเดอร์ (ต่อสินค้า)',
      sortable: true,
      align: 'right',
      render: (item: SalesByCategory) => formatNumber(item.orderCount),
    },
    {
      key: 'totalQtySold',
      header: 'จำนวนขาย',
      sortable: true,
      align: 'right',
      render: (item: SalesByCategory) => formatNumber(item.totalQtySold),
    },
    {
      key: 'totalSales',
      header: 'ยอดขาย',
      sortable: true,
      align: 'right',
      render: (item: SalesByCategory) => (
        <span className="font-medium text-green-600">
          ฿{formatCurrency(item.totalSales)}
        </span>
      ),
    },
    {
      key: 'totalProfit',
      header: 'กำไร',
      sortable: true,
      align: 'right',
      render: (item: SalesByCategory) => (
        <span className="font-medium text-blue-600">
          ฿{formatCurrency(item.totalProfit)}
        </span>
      ),
    },
    {
      key: 'profitMarginPct',
      header: 'อัตรากำไร',
      sortable: true,
      align: 'right',
      render: (item: SalesByCategory) => {
        const color =
          item.profitMarginPct >= 30
            ? 'text-green-600'
            : item.profitMarginPct >= 15
              ? 'text-yellow-600'
              : 'text-red-600';
        return (
          <span className={`font-medium ${color}`}>
            {formatPercent(item.profitMarginPct)}
          </span>
        );
      },
    },
  ];

  // Column definitions for Sales by Salesperson
  const salesBySalespersonColumns: ColumnDef<SalesBySalesperson>[] = [
    {
      key: 'saleCode',
      header: 'รหัสพนักงาน',
      sortable: true,
      align: 'left',
      render: (item: SalesBySalesperson) => (
        <span className="font-mono text-xs">{item.saleCode}</span>
      ),
    },
    {
      key: 'saleName',
      header: 'ชื่อพนักงาน',
      sortable: true,
      align: 'left',
      render: (item: SalesBySalesperson) => (
        <span className="font-medium">{item.saleName}</span>
      ),
    },
    {
      key: 'customerCount',
      header: 'ลูกค้า',
      sortable: true,
      align: 'right',
      render: (item: SalesBySalesperson) => formatNumber(item.customerCount),
    },
    {
      key: 'orderCount',
      header: 'ออเดอร์',
      sortable: true,
      align: 'right',
      render: (item: SalesBySalesperson) => formatNumber(item.orderCount),
    },
    {
      key: 'totalSales',
      header: 'ยอดขาย',
      sortable: true,
      align: 'right',
      render: (item: SalesBySalesperson) => (
        <span className="font-medium text-green-600">
          ฿{formatCurrency(item.totalSales)}
        </span>
      ),
    },
    {
      key: 'avgOrderValue',
      header: 'ยอดเฉลี่ย/ออเดอร์',
      sortable: true,
      align: 'right',
      render: (item: SalesBySalesperson) => (
        <span>฿{formatCurrency(item.avgOrderValue)}</span>
      ),
    },
  ];

  // Column definitions for Top Customers
  const topCustomersColumns: ColumnDef<TopCustomer>[] = [
    {
      key: 'rank',
      header: '#',
      sortable: false,
      align: 'center',
      render: (_item: TopCustomer, index?: number) => (
        <span className="text-muted-foreground">{(index || 0) + 1}</span>
      ),
    },
    {
      key: 'customerName',
      header: 'ลูกค้า',
      sortable: true,
      align: 'left',
      render: (item: TopCustomer) => (
        <div>
          <div className="font-medium">{item.customerName}</div>
          <div className="text-xs text-muted-foreground">
            {item.customerCode}
          </div>
        </div>
      ),
    },
    {
      key: 'orderCount',
      header: 'ออเดอร์',
      sortable: true,
      align: 'right',
      render: (item: TopCustomer) => formatNumber(item.orderCount),
    },
    {
      key: 'totalSpent',
      header: 'ยอดซื้อรวม',
      sortable: true,
      align: 'right',
      render: (item: TopCustomer) => (
        <span className="font-medium text-green-600">
          ฿{formatCurrency(item.totalSpent)}
        </span>
      ),
    },
    {
      key: 'avgOrderValue',
      header: 'ยอดเฉลี่ย/ออเดอร์',
      sortable: true,
      align: 'right',
      render: (item: TopCustomer) => (
        <span>฿{formatCurrency(item.avgOrderValue)}</span>
      ),
    },
    {
      key: 'lastOrderDate',
      header: 'ซื้อล่าสุด',
      sortable: true,
      align: 'center',
      render: (item: TopCustomer) => formatDate(item.lastOrderDate),
    },
    {
      key: 'daysSinceLastOrder',
      header: 'วันที่ผ่านมา',
      sortable: true,
      align: 'center',
      render: (item: TopCustomer) => {
        const days = item.daysSinceLastOrder;
        const color =
          days <= 30
            ? 'text-green-600'
            : days <= 60
              ? 'text-yellow-600'
              : 'text-red-600';
        return <span className={`font-medium ${color}`}>{days} วัน</span>;
      },
    },
  ];

  // Column definitions for AR Status
  const arStatusColumns: ColumnDef<ARStatus>[] = [
    {
      key: 'statusPayment',
      header: 'สถานะชำระ',
      sortable: true,
      align: 'left',
      render: (item: ARStatus) => {
        const statusMap: { [key: string]: { label: string; color: string } } = {
          Paid: { label: 'ชำระแล้ว', color: 'text-green-600' },
          Partial: { label: 'ชำระบางส่วน', color: 'text-yellow-600' },
          Unpaid: { label: 'ยังไม่ชำระ', color: 'text-red-600' },
        };
        const status = statusMap[item.statusPayment] || {
          label: item.statusPayment || 'ไม่ระบุ',
          color: 'text-gray-600',
        };
        return (
          <span className={`font-medium ${status.color}`}>{status.label}</span>
        );
      },
    },
    {
      key: 'invoiceCount',
      header: 'จำนวนใบแจ้งหนี้',
      sortable: true,
      align: 'right',
      render: (item: ARStatus) => formatNumber(item.invoiceCount),
    },
    {
      key: 'totalInvoiceAmount',
      header: 'ยอดรวม',
      sortable: true,
      align: 'right',
      render: (item: ARStatus) => (
        <span>฿{formatCurrency(item.totalInvoiceAmount)}</span>
      ),
    },
    {
      key: 'totalPaid',
      header: 'ชำระแล้ว',
      sortable: true,
      align: 'right',
      render: (item: ARStatus) => (
        <span className="text-green-600">฿{formatCurrency(item.totalPaid)}</span>
      ),
    },
    {
      key: 'totalOutstanding',
      header: 'ค้างชำระ',
      sortable: true,
      align: 'right',
      render: (item: ARStatus) => (
        <span className="font-medium text-red-600">
          ฿{formatCurrency(item.totalOutstanding)}
        </span>
      ),
    },
    {
      key: 'paidPercent',
      header: '% ชำระ',
      sortable: false,
      align: 'right',
      render: (item: ARStatus) => {
        const pct =
          item.totalInvoiceAmount > 0
            ? (item.totalPaid / item.totalInvoiceAmount) * 100
            : 0;
        const color =
          pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';
        return <span className={`font-medium ${color}`}>{formatPercent(pct)}</span>;
      },
    },
  ];

  // Get current report option
  const currentReport = reportOptions.find(opt => opt.value === selectedReport);

  // Custom category sort order
  const CATEGORY_ORDER = [
    'รายได้-เครื่องดื่ม',
    'รายได้เครื่องดื่ม-บัคเก็ต คอกเทล',
    'รายได้-อาหาร',
    'รายได้-สินค้าที่ระลึก',
    'รายได้-สินค้าและบริการอื่น',
    'ส่วนลดจ่าย',
    'รายได้อื่น',
    'คอกเบียรับ',
    'รายได้ส่งเสริมการขาย',
    'รายได้จากทีมบริหาร',
    'รายได้อื่น-จากการเช่ารถยนต์',
  ];

  const sortByCustomOrder = (a: string, b: string) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, 'th-TH');
  };

  // Get unique categories from salesByCategory (for by-category report)
  const uniqueCategories = Array.from(
    new Set(salesByCategory.map(item => JSON.stringify({ 
      code: normalizeFilterValue(item.categoryCode),
      name: item.categoryName 
    })))
  ).map(str => JSON.parse(str) as { code: string; name: string })
   .sort((a, b) => sortByCustomOrder(a.name, b.name));

  // Get unique categories from salesAnalysis (for sales-trend report)
  const uniqueAnalysisCategories = Array.from(
    new Set(salesAnalysis.map(item => item.categoryName).filter(Boolean))
  ).sort(sortByCustomOrder);

  useEffect(() => {
    if (selectedReport === 'by-category' && selectedCategory !== 'ALL' && uniqueCategories.length > 0) {
      if (!uniqueCategories.some((cat) => cat.code === selectedCategory)) {
        setSelectedCategory('ALL');
      }
    }
    if (selectedReport === 'sales-trend' && categoryFilter !== 'all' && uniqueAnalysisCategories.length > 0) {
      if (!uniqueAnalysisCategories.includes(categoryFilter)) {
        setCategoryFilter('all');
      }
    }
  }, [selectedReport, selectedCategory, categoryFilter, uniqueCategories, uniqueAnalysisCategories]);

  // Filter salesByCategory by selected category
  const filteredSalesByCategory = selectedCategory === 'ALL' 
    ? salesByCategory 
    : salesByCategory.filter(item => normalizeFilterValue(item.categoryCode) === selectedCategory);

  const topProductsDateSubtitle = topProductsDateRanges.length > 1
    ? `ช่วงวันที่ ${topProductsDateRanges.map((range) => `${range.start} ถึง ${range.end}`).join(', ')}`
    : `ช่วงวันที่ ${topProductsSubtitleDateRange.start} ถึง ${topProductsSubtitleDateRange.end}`;

  const topProductsComparisonExport = useMemo(() => {
    const branchMetricKeys = comparisonBranches.flatMap((branch) => [
      {
        key: `${branch.key}_qty`,
        header: 'จำนวนขาย',
        type: 'number' as const,
      },
      {
        key: `${branch.key}_sales`,
        header: 'ยอดขาย',
        type: 'currency' as const,
      },
    ]);

    const data = topProductsPivotRows.map((row, index) => ({
      rank: index + 1,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unitCode: row.unitCode,
      ...Object.fromEntries(branchMetricKeys.map((column) => [column.key, Number(row[column.key] || 0)])),
      totalSalesAll: Number(row.totalSalesAll || 0),
    }));

    return {
      data,
      headers: {
        rank: '',
        itemCode: '',
        itemName: '',
        unitCode: '',
        ...Object.fromEntries(branchMetricKeys.map((column) => [column.key, column.header])),
        totalSalesAll: '',
      },
      numberColumns: branchMetricKeys.filter((column) => column.type === 'number').map((column) => column.key),
      currencyColumns: branchMetricKeys.filter((column) => column.type === 'currency').map((column) => column.key).concat(['totalSalesAll']),
      columnGroups: [
        { label: 'ลำดับ', span: 1 },
        { label: 'รหัสสินค้า', span: 1 },
        { label: 'สินค้า', span: 1 },
        { label: 'หน่วยนับ', span: 1 },
        ...comparisonBranches.map((branch) => ({ label: branch.name, span: 2 })),
        { label: 'รวมยอดขาย', span: 1 },
      ],
      summaryColumns: Object.fromEntries(
        branchMetricKeys.map((column) => [column.key, 'sum']).concat([
          ['totalSalesAll', 'sum'],
        ])
      ),
    };
  }, [comparisonBranches, topProductsPivotRows]);

  // Render report content based on selected type
  const renderReportContent = () => {
    switch (selectedReport) {
      case 'sales-trend':
        // Filter data
        const filteredData = categoryFilter === 'all'
          ? salesAnalysis
          : salesAnalysis.filter(item => item.categoryName === categoryFilter);

        return (
          <PaginatedTable
            paginationClassName="pr-[70px]"
            data={filteredData}
            columns={salesAnalysisColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลยอดขาย"
            defaultSortKey="docDate"
            defaultSortOrder="desc"
            keyExtractor={(item: SalesAnalysisData, index: number) => `${item.docNo}-${item.itemCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 6,
              values: {
                qty: (data) => {
                  const total = data.reduce((sum, item) => sum + item.qty, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                discountAmount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.discountAmount, 0);
                  return <span className="font-medium text-red-500">{formatCurrency(total)}</span>;
                },
                totalAmount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
                  return <span className="font-medium text-green-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'top-products':
        if (salesFilter.viewMode === 'comparison') {
          return (
            <TopProductsComparisonTable
              data={topProductsPivotRows}
              branches={comparisonBranches}
              dateRange={topProductsDateRange}
              itemsPerPage={10}
              emptyMessage="ไม่มีข้อมูลสินค้าขายดี"
            />
          );
        }
        return (
          <PaginatedTable
            data={topProducts}
            columns={topProductsColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลสินค้าขายดี"
            defaultSortKey="totalSales"
            defaultSortOrder="desc"
            keyExtractor={(item: TopProduct, index: number) => `${item.itemCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 4,
              values: {
                totalQtySold: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalQtySold, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                totalSales: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalSales, 0);
                  return <span className="font-medium text-green-600">฿{formatCurrency(total)}</span>;
                },
              }
            }}
          />
        );

      case 'by-branch':
        return (
          <PaginatedTable
            data={salesByBranch}
            columns={salesByBranchColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลสาขา"
            defaultSortKey="totalSales"
            defaultSortOrder="desc"
            keyExtractor={(item: SalesByBranch) => item.branchCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                orderCount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.orderCount, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                totalSales: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalSales, 0);
                  return <span className="font-medium text-green-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'by-category':
        return (
          <PaginatedTable
            data={filteredSalesByCategory}
            columns={salesByCategoryColumns}
            itemsPerPage={15}
            emptyMessage="ไม่มีข้อมูลหมวดหมู่"
            defaultSortKey="categoryName"
            defaultSortOrder="asc"
            keyExtractor={(item: SalesByCategory, index?: number) => `${item.categoryCode}-${item.itemCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 2,
              values: {
                orderCount: () => <span className="text-muted-foreground">-</span>,
                totalQtySold: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalQtySold, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                totalSales: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalSales, 0);
                  return <span className="font-medium text-green-600">฿{formatCurrency(total)}</span>;
                },
                totalProfit: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalProfit, 0);
                  return <span className="font-medium text-blue-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'by-salesperson':
        return (
          <PaginatedTable
            data={salesBySalesperson}
            columns={salesBySalespersonColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลพนักงานขาย"
            defaultSortKey="totalSales"
            defaultSortOrder="desc"
            keyExtractor={(item: SalesBySalesperson) => item.saleCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                orderCount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.orderCount, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                totalSales: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalSales, 0);
                  return <span className="font-medium text-green-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'top-customers':
        return (
          <PaginatedTable
            data={topCustomers}
            columns={topCustomersColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลลูกค้า"
            defaultSortKey="totalSpent"
            defaultSortOrder="desc"
            keyExtractor={(item: TopCustomer) => item.customerCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                orderCount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.orderCount, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                totalSpent: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalSpent, 0);
                  return <span className="font-medium text-green-600">฿{formatCurrency(total)}</span>;
                },
                avgOrderValue: (data) => {
                  const totalAvg = data.reduce((sum, item) => {
                    const avg = item.orderCount > 0 ? item.avgOrderValue : 0;
                    return sum + avg;
                  }, 0);
                  return <span className="font-medium">฿{formatCurrency(totalAvg)}</span>;
                }
              }
            }}
          />
        );

      case 'ar-status':
        return (
          <PaginatedTable
            data={arStatus}
            columns={arStatusColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลลูกหนี้"
            defaultSortKey="totalOutstanding"
            defaultSortOrder="desc"
            keyExtractor={(item: ARStatus) => item.statusPayment}
          />
        );

      default:
        return null;
    }
  };

  // Get export function based on report type
  const getExportFunction = () => {
    switch (selectedReport) {
      case 'sales-trend':
        return () => {
          const categoryName = categoryFilter === 'all' ? 'ทั้งหมด' : categoryFilter;
          const filteredData = categoryFilter === 'all'
            ? salesAnalysis
            : salesAnalysis.filter(item => item.categoryName === categoryFilter);

          return exportStyledReport({
            data: filteredData,
            headers: { 
              categoryName: 'หมวดสินค้า', 
              docDate: 'เอกสารวันที่', 
              docNo: 'เอกสารเลขที่', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              unitCode: 'หน่วยนับ', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              discountAmount: 'มูลค่าส่วนลด',
              totalAmount: 'รวมมูลค่า' 
            },
            filename: `รายงานวิเคราะห์ยอดขาย_${categoryName}`,
            sheetName: 'Sales Analysis',
            title: `รายงานวิเคราะห์ยอดขาย - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            currencyColumns: ['price', 'discountAmount', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                discountAmount: 'sum',
                totalAmount: 'sum'
              }
            }
          });
        };

      case 'top-products':
        return () => {
          if (salesFilter.viewMode === 'comparison') {
            return exportStyledReport({
              data: topProductsComparisonExport.data,
              headers: topProductsComparisonExport.headers,
              filename: 'สินค้าขายดี_เปรียบเทียบสาขา',
              sheetName: 'Top Products',
              title: 'รายงานสินค้าขายดี - เปรียบเทียบสาขา',
              subtitle: withBranchSubtitle(topProductsDateSubtitle),
              numberColumns: topProductsComparisonExport.numberColumns,
              currencyColumns: topProductsComparisonExport.currencyColumns,
              columnGroups: topProductsComparisonExport.columnGroups,
              summaryConfig: {
                columns: topProductsComparisonExport.summaryColumns,
              },
            });
          }

          return exportStyledReport({
          data: topProducts,
          headers: { itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', unitCode: 'หน่วยนับ', brandName: 'แบรนด์', categoryName: 'หมวดหมู่', totalQtySold: 'จำนวนขาย', totalSales: 'ยอดขาย', totalProfit: 'กำไร', profitMarginPct: 'อัตรากำไร (%)' },
          filename: 'สินค้าขายดี',
          sheetName: 'Top Products',
          title: 'รายงานสินค้าขายดี',
          subtitle: withBranchSubtitle(topProductsDateSubtitle),
          numberColumns: ['totalQtySold'],
          currencyColumns: ['totalSales', 'totalProfit'],
          percentColumns: ['profitMarginPct'],
          summaryConfig: {
            columns: {
              totalQtySold: 'sum',
              totalSales: 'sum',
              totalProfit: 'sum',
            }
          }
          });
        };

      case 'by-branch':
        return () => exportStyledReport({
          data: salesByBranch,
          headers: { branchCode: 'รหัสสาขา', branchName: 'ชื่อสาขา', orderCount: 'จำนวนออเดอร์', totalSales: 'ยอดขาย' },
          filename: 'ยอดขายตามสาขา',
          sheetName: 'Sales by Branch',
          title: 'รายงานยอดขายตามสาขา',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['orderCount'],
          currencyColumns: ['totalSales'],
          summaryConfig: {
            columns: {
              orderCount: 'sum',
              totalSales: 'sum',
            }
          }
        });

      case 'by-category':
        return () => {
          const categoryName = selectedCategory === 'ALL' 
            ? 'ทั้งหมด' 
            : uniqueCategories.find(c => c.code === selectedCategory)?.name || 'ไม่ระบุ';
          
          return exportStyledReport({
            data: filteredSalesByCategory,
            headers: { categoryCode: 'รหัสหมวดหมู่', categoryName: 'ชื่อหมวดหมู่', itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', orderCount: 'จำนวนออเดอร์', totalQtySold: 'จำนวนขาย', totalSales: 'ยอดขาย', totalProfit: 'กำไร', profitMarginPct: 'อัตรากำไร (%)' },
            filename: `ยอดขายตามหมวดหมู่_${categoryName}`,
            sheetName: 'Sales by Category',
            title: `รายงานยอดขายตามหมวดหมู่ - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['orderCount', 'totalQtySold'],
            currencyColumns: ['totalSales', 'totalProfit'],
            percentColumns: ['profitMarginPct'],
            summaryConfig: {
              columns: {
                orderCount: 'sum',
                totalQtySold: 'sum',
                totalSales: 'sum',
                totalProfit: 'sum',
              }
            }
          });
        };

      case 'by-salesperson':
        return () => exportStyledReport({
          data: salesBySalesperson,
          headers: { saleCode: 'รหัสพนักงาน', saleName: 'ชื่อพนักงาน', customerCount: 'ลูกค้า', orderCount: 'ออเดอร์', totalSales: 'ยอดขาย', avgOrderValue: 'ยอดเฉลี่ย/ออเดอร์' },
          filename: 'ยอดขายตามพนักงาน',
          sheetName: 'Sales by Salesperson',
          title: 'รายงานยอดขายตามพนักงาน',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['customerCount', 'orderCount'],
          currencyColumns: ['totalSales', 'avgOrderValue'],
          summaryConfig: {
            columns: {
              customerCount: 'sum',
              orderCount: 'sum',
              totalSales: 'sum',
            }
          }
        });

      case 'top-customers':
        return () => exportStyledReport({
          data: topCustomers,
          headers: { customerCode: 'รหัสลูกค้า', customerName: 'ชื่อลูกค้า', orderCount: 'จำนวนออเดอร์', totalSpent: 'ยอดซื้อรวม', avgOrderValue: 'ยอดเฉลี่ย/ออเดอร์', lastOrderDate: 'ซื้อล่าสุด', daysSinceLastOrder: 'วันที่ผ่านมา' },
          filename: 'ลูกค้ารายสำคัญ',
          sheetName: 'Top Customers',
          title: 'รายงานลูกค้ารายสำคัญ',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['orderCount', 'daysSinceLastOrder'],
          currencyColumns: ['totalSpent', 'avgOrderValue'],
          summaryConfig: {
            columns: {
              orderCount: 'sum',
              totalSpent: 'sum',
              avgOrderValue: 'avg',
            }
          }
        });

      case 'ar-status':
        return () => exportStyledReport({
          data: arStatus,
          headers: { statusPayment: 'สถานะชำระ', invoiceCount: 'จำนวนใบแจ้งหนี้', totalInvoiceAmount: 'ยอดรวม', totalPaid: 'ชำระแล้ว', totalOutstanding: 'ค้างชำระ' },
          filename: 'สถานะลูกหนี้การค้า',
          sheetName: 'AR Status',
          title: 'รายงานสถานะลูกหนี้การค้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['invoiceCount'],
          currencyColumns: ['totalInvoiceAmount', 'totalPaid', 'totalOutstanding'],
          summaryConfig: {
            columns: {
              invoiceCount: 'sum',
              totalInvoiceAmount: 'sum',
              totalPaid: 'sum',
              totalOutstanding: 'sum',
            }
          }
        });

      default:
        return undefined;
    }
  };

  const getExportPdfFunction = () => {
    switch (selectedReport) {
      case 'sales-trend':
        return () => {
          const categoryName = categoryFilter === 'all' ? 'ทั้งหมด' : categoryFilter;
          const filteredData = categoryFilter === 'all'
            ? salesAnalysis
            : salesAnalysis.filter(item => item.categoryName === categoryFilter);

          return exportStyledPdfReport({
            data: filteredData,
            headers: { 
              categoryName: 'หมวดสินค้า', 
              docDate: 'เอกสารวันที่', 
              docNo: 'เอกสารเลขที่', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              unitCode: 'หน่วยนับ', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              discountAmount: 'มูลค่าส่วนลด',
              totalAmount: 'รวมมูลค่า' 
            },
            filename: `รายงานวิเคราะห์ยอดขาย_${categoryName}`,
            title: `รายงานวิเคราะห์ยอดขาย - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            currencyColumns: ['price', 'discountAmount', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                discountAmount: 'sum',
                totalAmount: 'sum'
              }
            }
          });
        };

      case 'top-products':
        return () => {
          if (salesFilter.viewMode === 'comparison') {
            return exportStyledPdfReport({
              data: topProductsComparisonExport.data,
              headers: topProductsComparisonExport.headers,
              filename: 'สินค้าขายดี_เปรียบเทียบสาขา',
              title: 'รายงานสินค้าขายดี - เปรียบเทียบสาขา',
              subtitle: withBranchSubtitle(topProductsDateSubtitle),
              numberColumns: topProductsComparisonExport.numberColumns,
              currencyColumns: topProductsComparisonExport.currencyColumns,
              columnGroups: topProductsComparisonExport.columnGroups,
              tableLayout: { verticalGrid: true },
              summaryConfig: {
                columns: topProductsComparisonExport.summaryColumns,
              },
            });
          }

          return exportStyledPdfReport({
          data: topProducts.map((item, index) => ({ rank: index + 1, ...item })),
          headers: { rank: 'ลำดับ', itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', unitCode: 'หน่วยนับ', brandName: 'แบรนด์', categoryName: 'หมวดหมู่', totalQtySold: 'จำนวนขาย', totalSales: 'ยอดขาย', totalProfit: 'กำไร', profitMarginPct: 'อัตรากำไร (%)' },
          filename: 'สินค้าขายดี',
          title: 'รายงานสินค้าขายดี',
          subtitle: withBranchSubtitle(topProductsDateSubtitle),
          numberColumns: ['totalQtySold'],
          currencyColumns: ['totalSales', 'totalProfit'],
          percentColumns: ['profitMarginPct'],
          summaryConfig: {
            columns: {
              totalQtySold: 'sum',
              totalSales: 'sum',
              totalProfit: 'sum',
            }
          }
          });
        };

      case 'by-branch':
        return () => exportStyledPdfReport({
          data: salesByBranch,
          headers: { branchCode: 'รหัสสาขา', branchName: 'ชื่อสาขา', orderCount: 'จำนวนออเดอร์', totalSales: 'ยอดขาย' },
          filename: 'ยอดขายตามสาขา',
          title: 'รายงานยอดขายตามสาขา',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['orderCount'],
          currencyColumns: ['totalSales'],
          summaryConfig: {
            columns: {
              orderCount: 'sum',
              totalSales: 'sum',
            }
          }
        });

      case 'by-category':
        return () => {
          const categoryName = selectedCategory === 'ALL'
            ? 'ทั้งหมด'
            : uniqueCategories.find(c => c.code === selectedCategory)?.name || 'ไม่ระบุ';

          return exportStyledPdfReport({
            data: filteredSalesByCategory,
            headers: { categoryCode: 'รหัสหมวดหมู่', categoryName: 'ชื่อหมวดหมู่', itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', orderCount: 'จำนวนออเดอร์', totalQtySold: 'จำนวนขาย', totalSales: 'ยอดขาย', totalProfit: 'กำไร', profitMarginPct: 'อัตรากำไร (%)' },
            filename: `ยอดขายตามหมวดหมู่_${categoryName}`,
            title: `รายงานยอดขายตามหมวดหมู่ - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['orderCount', 'totalQtySold'],
            currencyColumns: ['totalSales', 'totalProfit'],
            percentColumns: ['profitMarginPct'],
            summaryConfig: {
              columns: {
                orderCount: 'sum',
                totalQtySold: 'sum',
                totalSales: 'sum',
                totalProfit: 'sum',
              }
            }
          });
        };

      case 'by-salesperson':
        return () => exportStyledPdfReport({
          data: salesBySalesperson,
          headers: { saleCode: 'รหัสพนักงาน', saleName: 'ชื่อพนักงาน', customerCount: 'ลูกค้า', orderCount: 'ออเดอร์', totalSales: 'ยอดขาย', avgOrderValue: 'ยอดเฉลี่ย/ออเดอร์' },
          filename: 'ยอดขายตามพนักงาน',
          title: 'รายงานยอดขายตามพนักงาน',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['customerCount', 'orderCount'],
          currencyColumns: ['totalSales', 'avgOrderValue'],
          summaryConfig: {
            columns: {
              customerCount: 'sum',
              orderCount: 'sum',
              totalSales: 'sum',
            }
          }
        });

      case 'top-customers':
        return () => exportStyledPdfReport({
          data: topCustomers,
          headers: { customerCode: 'รหัสลูกค้า', customerName: 'ชื่อลูกค้า', orderCount: 'จำนวนออเดอร์', totalSpent: 'ยอดซื้อรวม', avgOrderValue: 'ยอดเฉลี่ย/ออเดอร์', lastOrderDate: 'ซื้อล่าสุด', daysSinceLastOrder: 'วันที่ผ่านมา' },
          filename: 'ลูกค้ารายสำคัญ',
          title: 'รายงานลูกค้ารายสำคัญ',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['orderCount', 'daysSinceLastOrder'],
          currencyColumns: ['totalSpent', 'avgOrderValue'],
          summaryConfig: {
            columns: {
              orderCount: 'sum',
              totalSpent: 'sum',
              avgOrderValue: 'avg',
            }
          }
        });

      case 'ar-status':
        return () => exportStyledPdfReport({
          data: arStatus,
          headers: { statusPayment: 'สถานะชำระ', invoiceCount: 'จำนวนใบแจ้งหนี้', totalInvoiceAmount: 'ยอดรวม', totalPaid: 'ชำระแล้ว', totalOutstanding: 'ค้างชำระ' },
          filename: 'สถานะลูกหนี้การค้า',
          title: 'รายงานสถานะลูกหนี้การค้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['invoiceCount'],
          currencyColumns: ['totalInvoiceAmount', 'totalPaid', 'totalOutstanding'],
          summaryConfig: {
            columns: {
              invoiceCount: 'sum',
              totalInvoiceAmount: 'sum',
              totalPaid: 'sum',
              totalOutstanding: 'sum',
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
              รายงานยอดขายและลูกค้า
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              ข้อมูลรายงานยอดขาย สินค้า และลูกค้าในรูปแบบตาราง
            </p>
          </div>

          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>

        {/* Compact Report Type Selector + Period Filter */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <ReportTypeSelector
            value={selectedReport}
            options={reportOptions}
            onChange={(value) => setSelectedReport(value as ReportType)}
          />
          {showPeriodFilter && (
            <ReportPeriodFilter
              value={salesFilter}
              onChange={setSalesFilter}
              availableMonths={salesAvailableMonths}
              className="ml-auto"
            />
          )}
        </div>
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
          onExportExcel={getExportFunction()}
          onExportPDF={getExportPdfFunction()}
          headerExtra={
            selectedReport === 'by-category' ? (
              <div className="flex items-center gap-2">
                <label htmlFor="category-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  หมวดหมู่:
                </label>
                <SearchableSelect
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  options={[
                    { value: 'ALL', label: 'ทั้งหมด' },
                    ...uniqueCategories.map((cat) => ({ value: cat.code, label: cat.name })),
                  ]}
                  className="w-full sm:w-[250px]"
                />
              </div>
            ) : selectedReport === 'sales-trend' ? (
              <div className="flex items-center gap-2">
                <label htmlFor="analysis-category-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  หมวดหมู่:
                </label>
                <SearchableSelect
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={[
                    { value: 'all', label: 'ทั้งหมด' },
                    ...uniqueAnalysisCategories.map((name) => ({ value: name, label: name })),
                  ]}
                  className="w-full sm:w-[250px]"
                />
              </div>
            ) : undefined
          }
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

export default function SalesReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">กำลังโหลด...</div>}>
      <SalesReportContent />
    </Suspense>
  );
}
