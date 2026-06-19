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
import { ReportPeriodFilter, filterRowsByReportPeriod, getPeriodKey, getMonthsFromDateRange } from '@/components/ReportPeriodFilter';
import { useReportPeriodFilter } from '@/hooks/useReportPeriodFilter';
import {
  TrendingUp,
  Users,
  FolderTree,
  Tag,
  CreditCard,
  Package,
} from 'lucide-react';
import { exportStyledReport } from '@/lib/exportExcel';
import { exportStyledPdfReport } from '@/lib/exportPdf';
import { formatCurrency, formatNumber, formatDate, formatMonth } from '@/lib/formatters';
import { useReportHash } from '@/hooks/useReportHash';
import type {
  DateRange,
  PurchaseAnalysisData,
  PurchaseTrendData,
  TopSupplier,
  PurchaseByCategory,
  PurchaseByBrand,
  APOutstanding,
  CategoryBreakdown,
  PurchaseItemsByAccount,
  SupplierPODetail,
  PurchaseItemEntry,
  ItemSupplierSummary,
  ItemPurchaseHistory,
} from '@/lib/data/types';

// Report types
type ReportType =
  | 'purchase-analysis'
  | 'purchase-trend'
  | 'top-suppliers'
  | 'by-brand'
  | 'ap-outstanding'
  | 'expense-by-account'
  | 'by-category'
  | 'supplier-detail'
  | 'item-by-supplier';

const reportOptions: ReportOption<ReportType>[] = [
  {
    value: 'purchase-analysis',
    label: 'รายงานวิเคราะห์ยอดซื้อสินค้า',
    icon: TrendingUp,
    description: 'รายละเอียดการจัดซื้อแยกตามหมวดหมู่สินค้า',
  },
  {
    value: 'purchase-trend',
    label: 'แนวโน้มการจัดซื้อ',
    icon: TrendingUp,
    description: 'ยอดจัดซื้อและจำนวนใบสั่งซื้อรายวัน',
  },
  {
    value: 'top-suppliers',
    label: 'ซัพพลายเออร์ยอดนิยม',
    icon: Users,
    description: 'ซัพพลายเออร์ที่มียอดซื้อสูงสุด',
  },
  {
    value: 'by-category',
    label: 'การซื้อตามหมวดหมู่',
    icon: FolderTree,
    description: 'ยอดจัดซื้อแยกตามหมวดหมู่สินค้า',
  },
  {
    value: 'by-brand',
    label: 'การซื้อตามแบรนด์',
    icon: Tag,
    description: 'ยอดจัดซื้อแยกตามแบรนด์สินค้า',
  },
  {
    value: 'ap-outstanding',
    label: 'สถานะเจ้าหนี้การค้า',
    icon: CreditCard,
    description: 'ยอดค้างชำระแยกตามซัพพลายเออร์',
  },
  {
    value: 'expense-by-account',
    label: 'ค่าใช้จ่ายตามผังบัญชี',
    icon: FolderTree,
    description: 'ค่าใช้จ่ายจากการซื้อแยกตามผังบัญชี',
  },
  {
    value: 'supplier-detail',
    label: 'รายละเอียดตามซัพพลายเออร์',
    icon: Users,
    description: 'รายการ PO และผังบัญชีแยกตามซัพพลายเออร์',
  },
  {
    value: 'item-by-supplier',
    label: 'สินค้าตามซัพพลายเออร์',
    icon: Package,
    description: 'เลือกสินค้าเพื่อดูว่าซื้อมาจากซัพพลายเออร์ไหนบ้าง',
  },
];

const periodFilterReports = new Set<ReportType>([
  'purchase-trend',
  'top-suppliers',
  'ap-outstanding',
  'expense-by-account',
  'supplier-detail',
]);

function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clampDateRange(range: DateRange, bounds: DateRange): DateRange {
  return {
    start: range.start < bounds.start ? bounds.start : range.start,
    end: range.end > bounds.end ? bounds.end : range.end,
  };
}

function getPeriodDateRange(periodKey: string, periodType: import('@/components/ReportPeriodFilter').PeriodType, bounds: DateRange): DateRange {
  if (!periodKey || periodKey === '__all__') return bounds;

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

function getReportPeriodDateRange(filter: import('@/components/ReportPeriodFilter').ReportPeriodFilterState, bounds: DateRange): DateRange {
  if (filter.viewMode === 'normal' && filter.selectedPeriod) {
    return getPeriodDateRange(filter.selectedPeriod, filter.periodType, bounds);
  }

  if (filter.viewMode === 'comparison' && (filter.compareA || filter.compareB)) {
    const ranges = [filter.compareA, filter.compareB]
      .filter(Boolean)
      .map((period) => getPeriodDateRange(period, filter.periodType, bounds));
    if (ranges.length === 0) return bounds;
    return {
      start: ranges.reduce((min, range) => (range.start < min ? range.start : min), ranges[0].start),
      end: ranges.reduce((max, range) => (range.end > max ? range.end : max), ranges[0].end),
    };
  }

  return bounds;
}

function getAggregateReportDateRange(selectedReport: ReportType, filter: import('@/components/ReportPeriodFilter').ReportPeriodFilterState, bounds: DateRange): DateRange {
  if (selectedReport !== 'top-suppliers' && selectedReport !== 'ap-outstanding') return bounds;
  return getReportPeriodDateRange(filter, bounds);
}

function PurchaseReportContent() {
  const searchParams = useSearchParams();
  const normalizeFilterValue = (value?: string | null) => {
    const trimmed = (value || '').trim();
    return trimmed || 'N/A';
  };
  const urlAccountCode = searchParams.get('accountCode');
  const urlCategoryCode = searchParams.get('categoryCode');
  const urlCategoryName = searchParams.get('categoryName');
  const urlSupplierCode = searchParams.get('supplierCode');

  const { dateRange, setDateRange } = useDateRangeStore();
  const [selectedReport, setSelectedReport] = useState<ReportType>('purchase-analysis');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  // Category filter for Purchase Analysis report
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { filter: purchaseFilter, setFilter: setPurchaseFilter } = useReportPeriodFilter();
  const showPeriodFilter = periodFilterReports.has(selectedReport);
  // Account code filter for expense-by-account report
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>(() => {
    return searchParams.get('accountCode') || '';
  });
  const [selectedSupplierCode, setSelectedSupplierCode] = useState<string>(() => {
    return searchParams.get('supplierCode') || '';
  });
  const [supplierAccountFilter, setSupplierAccountFilter] = useState<string>('ALL');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const selectedBranches = useBranchStore((s) => s.selectedBranches);
  const availableBranches = useBranchStore((s) => s.availableBranches);
  const selectedBranchLabel = formatSelectedBranchNames(selectedBranches, availableBranches);
  const withBranchSubtitle = (detail: string) => `กิจการ: ${selectedBranchLabel} | ${detail}`;
  const aggregateReportDateRange = useMemo(
    () => getAggregateReportDateRange(selectedReport, purchaseFilter, dateRange),
    [selectedReport, purchaseFilter, dateRange]
  );
  const exportDateRange = showPeriodFilter
    ? getReportPeriodDateRange(purchaseFilter, dateRange)
    : dateRange;

  // Handle URL hash for report selection
  useReportHash(reportOptions, setSelectedReport);

  // Effect to read accountCode from URL on load
  useEffect(() => {
    if (urlAccountCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAccountCode(urlAccountCode);
    }
    if (urlCategoryCode) {
      setSelectedCategory(normalizeFilterValue(urlCategoryCode));
    }
    if (urlCategoryName) {
      setCategoryFilter(urlCategoryName);
    }
    if (urlSupplierCode) {
      setSelectedSupplierCode(urlSupplierCode);
    }
  }, [urlAccountCode, urlCategoryCode, urlCategoryName, urlSupplierCode]);

  // Reset category filter when switching reports
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCategory(selectedReport === 'by-category' && urlCategoryCode ? normalizeFilterValue(urlCategoryCode) : 'ALL');
    setCategoryFilter(selectedReport === 'purchase-analysis' && urlCategoryName ? urlCategoryName : 'all');
    if (selectedReport !== 'expense-by-account' && !urlAccountCode) {
      setSelectedAccountCode('');
    }
  }, [selectedReport, urlAccountCode, urlCategoryCode, urlCategoryName]);

  const { data: reportData, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['purchaseReportData', selectedReport, dateRange, aggregateReportDateRange, selectedBranches, purchaseFilter],
    queryFn: async () => {
      const reportDateRange = selectedReport === 'top-suppliers' || selectedReport === 'ap-outstanding'
        ? aggregateReportDateRange
        : dateRange;
      const params = new URLSearchParams({
        start_date: reportDateRange.start,
        end_date: reportDateRange.end,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }

      let endpoint = '';
      switch (selectedReport) {
        case 'purchase-analysis':
          endpoint = `/api/purchase/analysis?${params}`;
          break;
        case 'purchase-trend':
          endpoint = `/api/purchase/trend?${params}`;
          break;
        case 'top-suppliers':
          endpoint = `/api/purchase/top-suppliers?${params}`;
          break;
        case 'by-category':
          endpoint = `/api/purchase/by-category?${params}`;
          break;
        case 'by-brand':
          endpoint = `/api/purchase/by-brand?${params}`;
          break;
        case 'ap-outstanding':
          endpoint = `/api/purchase/ap-outstanding?${params}`;
          break;
        case 'expense-by-account':
          endpoint = `/api/purchase/expense-breakdown?${params}`;
          break;
        case 'supplier-detail':
          endpoint = `/api/purchase/top-suppliers?${params}`;
          break;
        case 'item-by-supplier':
          return [];
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch ${selectedReport} data`);

      const result = await response.json();
      return result.data;
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;

  const purchaseAnalysis = useMemo<PurchaseAnalysisData[]>(
    () => selectedReport === 'purchase-analysis' ? (reportData || []) : [],
    [selectedReport, reportData]
  );
  const trendData = useMemo<PurchaseTrendData[]>(
    () => selectedReport === 'purchase-trend' ? (reportData || []) : [],
    [selectedReport, reportData]
  );

  // Apply period filter to trend data
  const periodFilteredTrend = useMemo(() => {
    if (purchaseFilter.viewMode === 'normal' && purchaseFilter.selectedPeriod) {
      return trendData.filter((r) => getPeriodKey(r.month.substring(0, 7), purchaseFilter.periodType) === purchaseFilter.selectedPeriod);
    }
    if (purchaseFilter.viewMode === 'comparison' && (purchaseFilter.compareA || purchaseFilter.compareB)) {
      return trendData.filter((r) => {
        const key = getPeriodKey(r.month.substring(0, 7), purchaseFilter.periodType);
        return (purchaseFilter.compareA && (purchaseFilter.compareA === '__all__' || key === purchaseFilter.compareA)) ||
               (purchaseFilter.compareB && (purchaseFilter.compareB === '__all__' || key === purchaseFilter.compareB));
      });
    }
    return trendData;
  }, [trendData, purchaseFilter]);

  const topSuppliers: TopSupplier[] = (selectedReport === 'top-suppliers' || selectedReport === 'supplier-detail') ? (reportData || []) : [];
  const purchaseByCategory: PurchaseByCategory[] = selectedReport === 'by-category' ? (reportData || []) : [];
  const purchaseByBrand: PurchaseByBrand[] = selectedReport === 'by-brand' ? (reportData || []) : [];
  const apOutstanding: APOutstanding[] = selectedReport === 'ap-outstanding' ? (reportData || []) : [];
  const expenseBreakdown: CategoryBreakdown[] = selectedReport === 'expense-by-account' ? (reportData?.expenses || []) : [];

  // Query for account items (always fetch for expense-by-account report)
  const { data: accountItems, isLoading: accountItemsLoading } = useQuery({
    queryKey: ['purchaseAccountItems', selectedAccountCode || 'ALL', dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
        account_code: selectedAccountCode || 'ALL',
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }

      const response = await fetch(`/api/purchase/items-by-account?${params}`);
      if (!response.ok) throw new Error('Failed to fetch account items');

      const result = await response.json();
      return result.data as PurchaseItemsByAccount[];
    },
    enabled: selectedReport === 'expense-by-account',
  });

  // Query for supplier details
  const { data: supplierDetails, isLoading: supplierDetailsLoading } = useQuery({
    queryKey: ['purchaseSupplierDetails', selectedSupplierCode || 'ALL', dateRange, selectedBranches],
    queryFn: async () => {
      if (!selectedSupplierCode) return [];
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
        supplier_code: selectedSupplierCode,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }

      const response = await fetch(`/api/purchase/supplier-po-details?${params}`);
      if (!response.ok) throw new Error('Failed to fetch supplier details');

      const result = await response.json();
      return result.data as SupplierPODetail[];
    },
    enabled: selectedReport === 'supplier-detail' && !!selectedSupplierCode,
  });

  // Query for distinct item list (for item-by-supplier report)
  const { data: purchaseItemList, isLoading: itemListLoading } = useQuery({
    queryKey: ['purchaseItemList', dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      const response = await fetch(`/api/purchase/item-list?${params}`);
      if (!response.ok) throw new Error('Failed to fetch item list');
      const result = await response.json();
      return result.data as PurchaseItemEntry[];
    },
    enabled: selectedReport === 'item-by-supplier',
  });

  // Query for suppliers by item
  const { data: itemSuppliers, isLoading: itemSuppliersLoading } = useQuery({
    queryKey: ['purchaseItemSuppliers', selectedItemCode, dateRange, selectedBranches],
    queryFn: async () => {
      if (!selectedItemCode) return [];
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
        item_code: selectedItemCode,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      const response = await fetch(`/api/purchase/suppliers-by-item?${params}`);
      if (!response.ok) throw new Error('Failed to fetch item suppliers');
      const result = await response.json();
      return result.data as ItemSupplierSummary[];
    },
    enabled: selectedReport === 'item-by-supplier' && !!selectedItemCode,
  });

  // Query for item purchase history (all PO rows for selected item)
  const { data: itemPurchaseHistory, isLoading: itemHistoryLoading } = useQuery({
    queryKey: ['purchaseItemHistory', selectedItemCode, dateRange, selectedBranches],
    queryFn: async () => {
      if (!selectedItemCode) return [];
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
        item_code: selectedItemCode,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      const response = await fetch(`/api/purchase/item-purchase-history?${params}`);
      if (!response.ok) throw new Error('Failed to fetch item purchase history');
      const result = await response.json();
      return result.data as ItemPurchaseHistory[];
    },
    enabled: selectedReport === 'item-by-supplier' && !!selectedItemCode,
  });

  // Available months for period filter
  const purchaseAvailableMonths = useMemo(() => {
    if (selectedReport === 'purchase-trend' && trendData.length > 0)
      return Array.from(new Set(trendData.map((r) => r.month.substring(0, 7)))).filter(Boolean);
    if (selectedReport === 'expense-by-account' && accountItems?.length)
      return Array.from(new Set(accountItems.map((r) => r.docDate.substring(0, 7)))).filter(Boolean);
    if (selectedReport === 'supplier-detail' && supplierDetails?.length)
      return Array.from(new Set(supplierDetails.map((r) => r.docDate.substring(0, 7)))).filter(Boolean);
    if (selectedReport === 'item-by-supplier' && itemPurchaseHistory?.length)
      return Array.from(new Set(itemPurchaseHistory.map((r) => r.docDate.substring(0, 7)))).filter(Boolean);
    return getMonthsFromDateRange(dateRange.start, dateRange.end);
  }, [selectedReport, trendData, accountItems, supplierDetails, itemPurchaseHistory, dateRange]);

  const periodFilteredAccountItems = useMemo(
    () => filterRowsByReportPeriod(accountItems || [], (r) => r.docDate.substring(0, 7), purchaseFilter),
    [accountItems, purchaseFilter]
  );

  const periodFilteredSupplierDetails = useMemo(
    () => filterRowsByReportPeriod(supplierDetails || [], (r) => r.docDate.substring(0, 7), purchaseFilter),
    [supplierDetails, purchaseFilter]
  );

  const periodFilteredItemHistory = useMemo(
    () => filterRowsByReportPeriod(itemPurchaseHistory || [], (r) => r.docDate.substring(0, 7), purchaseFilter),
    [itemPurchaseHistory, purchaseFilter]
  );

  // Column definitions for Purchase Analysis
  const purchaseAnalysisColumns: ColumnDef<PurchaseAnalysisData>[] = [
    {
      key: 'categoryName',
      header: 'หมวดสินค้า',
      sortable: true,
      align: 'left',
      className: 'font-medium sticky left-0 bg-background z-10 min-w-[100px]',
      render: (item: PurchaseAnalysisData) => (
        <div className="max-w-[110px] truncate" title={item.categoryName}>
          {item.categoryName}
        </div>
      ),
    },
    {
      key: 'docDate',
      header: 'วันที่',
      sortable: true,
      align: 'center',
      className: 'min-w-[85px]',
      render: (item: PurchaseAnalysisData) => formatDate(item.docDate),
    },
    {
      key: 'docNo',
      header: 'เลขที่',
      sortable: true,
      align: 'left',
      className: 'hidden xl:table-cell min-w-[110px]',
      render: (item: PurchaseAnalysisData) => <span className="font-mono text-xs">{item.docNo}</span>,
    },
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      align: 'left',
      className: 'hidden lg:table-cell min-w-[90px]',
      render: (item: PurchaseAnalysisData) => <span className="font-mono text-xs">{item.itemCode}</span>,
    },
    {
      key: 'itemName',
      header: 'ชื่อสินค้า',
      sortable: true,
      align: 'left',
      className: 'min-w-[130px]',
      render: (item: PurchaseAnalysisData) => (
        <div className="max-w-[160px] md:max-w-[200px] truncate" title={item.itemName}>
          {item.itemName}
        </div>
      ),
    },
    {
      key: 'unitCode',
      header: 'หน่วย',
      sortable: true,
      align: 'center',
      className: 'hidden xl:table-cell min-w-[60px]',
    },
    {
      key: 'qty',
      header: 'จำนวน',
      sortable: true,
      align: 'right',
      className: 'min-w-[70px]',
      render: (item: PurchaseAnalysisData) => item.qty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      key: 'price',
      header: 'ราคา',
      sortable: true,
      align: 'right',
      className: 'hidden xl:table-cell min-w-[85px]',
      render: (item: PurchaseAnalysisData) => formatCurrency(item.price),
    },
    {
      key: 'totalAmount',
      header: 'รวมมูลค่า',
      sortable: true,
      align: 'right',
      className: 'sticky right-0 bg-background z-10 min-w-[100px] font-semibold shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.1)]',
      render: (item: PurchaseAnalysisData) => (
        <span className="font-medium text-blue-600">
          ฿{formatCurrency(item.totalAmount)}
        </span>
      ),
    },
  ];

  // Column definitions for Purchase Trend
  const purchaseTrendColumns: ColumnDef<PurchaseTrendData>[] = [
    {
      key: 'month',
      header: 'เดือน',
      sortable: true,
      align: 'left',
      render: (item: PurchaseTrendData) => formatMonth(item.month),
    },
    {
      key: 'totalPurchases',
      header: 'ยอดจัดซื้อ',
      sortable: true,
      align: 'right',
      render: (item: PurchaseTrendData) => (
        <span className="font-medium text-blue-600">
          ฿{formatCurrency(item.totalPurchases)}
        </span>
      ),
    },
    {
      key: 'poCount',
      header: 'จำนวน PO',
      sortable: true,
      align: 'center',
      render: (item: PurchaseTrendData) => formatNumber(item.poCount),
    },
    {
      key: 'avgPOValue',
      header: 'ยอดเฉลี่ย/PO',
      sortable: true,
      align: 'right',
      render: (item: PurchaseTrendData) => {
        const avg = item.poCount > 0 ? item.totalPurchases / item.poCount : 0;
        return <span>฿{formatCurrency(avg)}</span>;
      },
    },
  ];

  // Column definitions for Top Suppliers
  const topSuppliersColumns: ColumnDef<TopSupplier>[] = [
    {
      key: 'rank',
      header: '#',
      sortable: false,
      align: 'center',
      render: (_item: TopSupplier, index?: number) => (
        <span className="text-muted-foreground">{(index || 0) + 1}</span>
      ),
    },
    {
      key: 'supplierName',
      header: 'ซัพพลายเออร์',
      sortable: true,
      align: 'left',
      render: (item: TopSupplier) => (
        <div>
          <div className="font-medium">{item.supplierName}</div>
          <div className="text-xs text-muted-foreground">{item.supplierCode}</div>
        </div>
      ),
    },
    {
      key: 'poCount',
      header: 'จำนวน PO',
      sortable: true,
      align: 'right',
      render: (item: TopSupplier) => formatNumber(item.poCount),
    },
    {
      key: 'totalPurchases',
      header: 'ยอดซื้อรวม',
      sortable: true,
      align: 'right',
      render: (item: TopSupplier) => (
        <span className="font-medium text-blue-600">
          ฿{formatCurrency(item.totalPurchases)}
        </span>
      ),
    },
    {
      key: 'avgPOValue',
      header: 'ยอดเฉลี่ย/PO',
      sortable: true,
      align: 'right',
      render: (item: TopSupplier) => (
        <span>฿{formatCurrency(item.avgPOValue)}</span>
      ),
    },
    {
      key: 'lastPurchaseDate',
      header: 'ซื้อล่าสุด',
      sortable: true,
      align: 'center',
      render: (item: TopSupplier) => formatDate(item.lastPurchaseDate),
    },
  ];

  // Column definitions for Purchase by Category
  const purchaseByCategoryColumns: ColumnDef<PurchaseByCategory>[] = [
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      align: 'left',
      render: (item: PurchaseByCategory) => (
        <span className="font-mono text-xs">{item.itemCode}</span>
      ),
    },
    {
      key: 'itemName',
      header: 'ชื่อสินค้า',
      sortable: true,
      align: 'left',
      render: (item: PurchaseByCategory) => (
        <span className="font-medium">{item.itemName}</span>
      ),
    },
    {
      key: 'totalQty',
      header: 'จำนวนซื้อ',
      sortable: true,
      align: 'right',
      render: (item: PurchaseByCategory) => formatNumber(item.totalQty),
    },
    {
      key: 'totalPurchaseValue',
      header: 'ยอดซื้อ',
      sortable: true,
      align: 'right',
      render: (item: PurchaseByCategory) => (
        <span className="font-medium text-blue-600">
          ฿{formatCurrency(item.totalPurchaseValue)}
        </span>
      ),
    },
  ];

  // Column definitions for Purchase by Brand
  const purchaseByBrandColumns: ColumnDef<PurchaseByBrand>[] = [
    {
      key: 'brandName',
      header: 'แบรนด์',
      sortable: true,
      align: 'left',
      render: (item: PurchaseByBrand) => (
        <span className="font-medium">{item.brandName}</span>
      ),
    },
    {
      key: 'uniqueItems',
      header: 'จำนวนรายการ',
      sortable: true,
      align: 'right',
      render: (item: PurchaseByBrand) => formatNumber(item.uniqueItems || 0),
    },
    {
      key: 'totalPurchaseValue',
      header: 'ยอดซื้อ',
      sortable: true,
      align: 'right',
      render: (item: PurchaseByBrand) => (
        <span className="font-medium text-blue-600">
          ฿{formatCurrency(item.totalPurchaseValue)}
        </span>
      ),
    },
  ];// Column definitions for AP Status
  // Column definitions for AP Outstanding
  const apOutstandingColumns: ColumnDef<APOutstanding>[] = [
    {
      key: 'supplierName',
      header: 'ซัพพลายเออร์',
      sortable: true,
      align: 'left',
      render: (item: APOutstanding) => (
        <div>
          <div className="font-medium">{item.supplierName}</div>
          <div className="text-xs text-muted-foreground">{item.supplierCode}</div>
        </div>
      ),
    },
    {
      key: 'docCount',
      header: 'จำนวนเอกสาร',
      sortable: true,
      align: 'right',
      render: (item: APOutstanding) => formatNumber(item.docCount),
    },


    {
      key: 'totalOutstanding',
      header: 'ยอดค้างชำระ',
      sortable: true,
      align: 'right',
      render: (item: APOutstanding) => (
        <span className="font-medium text-orange-600">
          ฿{formatCurrency(item.totalOutstanding)}
        </span>
      ),
    },
    {
      key: 'overdueAmount',
      header: 'ยอดเกินกำหนด',
      sortable: true,
      align: 'right',
      render: (item: APOutstanding) => (
        <span className={`font-medium ${item.overdueAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
          ฿{formatCurrency(item.overdueAmount)}
        </span>
      ),
    },
    {
      key: 'overduePercent',
      header: '% เกินกำหนด',
      sortable: false,
      align: 'right',
      render: (item: APOutstanding) => {
        const pct = item.totalOutstanding > 0
          ? (item.overdueAmount / item.totalOutstanding) * 100
          : 0;
        const color = pct >= 50 ? 'text-red-600' : pct >= 20 ? 'text-yellow-600' : 'text-green-600';
        return <span className={`font-medium ${color}`}>{pct.toFixed(1)}%</span>;
      },
    },
  ];

  // Get unique expense accounts for dropdown (deduplicate by accountGroup)
  const uniqueExpenseAccounts = Array.from(
    new Map(
      expenseBreakdown.map(acc => [
        acc.accountGroup, 
        { code: acc.accountGroup, name: acc.accountName }
      ])
    ).values()
  );

  // Column definitions for Account Items (Drill-down)
  const accountItemsColumns: ColumnDef<PurchaseItemsByAccount>[] = [
    {
      key: 'docDate',
      header: 'วันที่',
      sortable: true,
      align: 'center',
      width: '9%',
      render: (item: PurchaseItemsByAccount) => formatDate(item.docDate),
    },
    {
      key: 'docNo',
      header: 'เลขที่เอกสาร',
      sortable: true,
      align: 'left',
      width: '12%',
      render: (item: PurchaseItemsByAccount) => (
        <span className="font-mono text-xs">{item.docNo}</span>
      ),
    },
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      align: 'left',
      width: '10%',
      render: (item: PurchaseItemsByAccount) => (
        <span className="font-mono text-xs">{item.itemCode}</span>
      ),
    },
    {
      key: 'itemName',
      header: 'ชื่อสินค้า',
      sortable: true,
      align: 'left',
      width: '20%',
    },
    {
      key: 'categoryName',
      header: 'หมวดสินค้า',
      sortable: true,
      align: 'left',
      width: '12%',
      render: (item: PurchaseItemsByAccount) => (
        <span className="px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
          {item.categoryName}
        </span>
      ),
    },
    {
      key: 'unitCode',
      header: 'หน่วย',
      sortable: true,
      align: 'center',
      width: '7%',
    },
    {
      key: 'qty',
      header: 'จำนวน',
      sortable: true,
      align: 'right',
      width: '8%',
      render: (item: PurchaseItemsByAccount) => 
        (item.qty || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      key: 'price',
      header: 'ราคา',
      sortable: true,
      align: 'right',
      width: '10%',
      render: (item: PurchaseItemsByAccount) => formatCurrency(item.price),
    },
    {
      key: 'totalAmount',
      header: 'รวมมูลค่า',
      sortable: true,
      align: 'right',
      width: '12%',
      render: (item: PurchaseItemsByAccount) => (
        <span className="font-medium text-red-600">
          ฿{formatCurrency(item.totalAmount)}
        </span>
      ),
    },
  ];

  // Column definitions for Supplier PO Details
  const supplierPODetailColumns: ColumnDef<SupplierPODetail>[] = [
    {
      key: 'docDate',
      header: 'วันที่',
      sortable: true,
      align: 'center',
      width: '8%',
      render: (item: SupplierPODetail) => formatDate(item.docDate),
    },
    {
      key: 'docNo',
      header: 'เลขที่ PO',
      sortable: true,
      align: 'left',
      width: '10%',
      render: (item: SupplierPODetail) => (
        <span className="font-mono text-xs font-medium">{item.docNo}</span>
      ),
    },
    {
      key: 'accountCode',
      header: 'รหัสผังบัญชี',
      sortable: true,
      align: 'left',
      width: '8%',
      render: (item: SupplierPODetail) => (
        <span className="font-mono text-xs">{item.accountCode}</span>
      ),
    },
    {
      key: 'accountName',
      header: 'ชื่อผังบัญชีสินค้า/ค่าใช้จ่าย',
      sortable: true,
      align: 'left',
      width: '15%',
      render: (item: SupplierPODetail) => (
        <div className="text-sm font-medium">{item.accountName}</div>
      ),
    },
    {
      key: 'categoryName',
      header: 'หมวดสินค้า',
      sortable: true,
      align: 'left',
      width: '10%',
      render: (item: SupplierPODetail) => (
        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-100">
          {item.categoryName}
        </span>
      ),
    },
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      align: 'left',
      width: '8%',
      render: (item: SupplierPODetail) => (
        <span className="font-mono text-xs">{item.itemCode}</span>
      ),
    },
    {
      key: 'itemName',
      header: 'รายการสินค้า',
      sortable: true,
      align: 'left',
      width: '17%',
      render: (item: SupplierPODetail) => (
        <div className="text-sm">{item.itemName}</div>
      ),
    },
    {
      key: 'qty',
      header: 'จำนวน',
      sortable: true,
      align: 'right',
      width: '6%',
      render: (item: SupplierPODetail) => formatNumber(item.qty),
    },
    {
      key: 'unitCode',
      header: 'หน่วย',
      sortable: true,
      align: 'center',
      width: '6%',
    },
    {
      key: 'totalAmount',
      header: 'ยอดเงิน',
      sortable: true,
      align: 'right',
      width: '12%',
      render: (item: SupplierPODetail) => (
        <span className="font-semibold text-blue-700">
          ฿{formatCurrency(item.totalAmount)}
        </span>
      ),
    },
  ];

  // Column definitions for Item Suppliers
  const itemSupplierColumns: ColumnDef<ItemSupplierSummary>[] = [
    {
      key: 'rank',
      header: '#',
      sortable: false,
      align: 'center',
      render: (_item: ItemSupplierSummary, index?: number) => (
        <span className="text-muted-foreground">{(index || 0) + 1}</span>
      ),
    },
    {
      key: 'branchSync',
      header: 'กิจการ',
      sortable: true,
      align: 'left',
      render: (item: ItemSupplierSummary) => {
        const branch = availableBranches.find((b) => b.key === item.branchSync);
        return (
          <span className="text-sm">{branch?.name || item.branchSync}</span>
        );
      },
    },
    {
      key: 'supplierName',
      header: 'ซัพพลายเออร์',
      sortable: true,
      align: 'left',
      render: (item: ItemSupplierSummary) => (
        <div>
          <div className="font-medium">{item.supplierName || item.supplierCode}</div>
          {item.supplierName && (
            <div className="text-xs text-muted-foreground font-mono">{item.supplierCode}</div>
          )}
        </div>
      ),
    },
    {
      key: 'poCount',
      header: 'จำนวน PO',
      sortable: true,
      align: 'right',
      render: (item: ItemSupplierSummary) => formatNumber(item.poCount),
    },
    {
      key: 'totalQty',
      header: 'จำนวนซื้อ',
      sortable: true,
      align: 'right',
      render: (item: ItemSupplierSummary) =>
        item.totalQty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      key: 'avgPrice',
      header: 'ราคาเฉลี่ย',
      sortable: true,
      align: 'right',
      render: (item: ItemSupplierSummary) => <span>฿{formatCurrency(item.avgPrice)}</span>,
    },
    {
      key: 'totalAmount',
      header: 'ยอดซื้อรวม',
      sortable: true,
      align: 'right',
      render: (item: ItemSupplierSummary) => (
        <span className="font-semibold text-blue-700">฿{formatCurrency(item.totalAmount)}</span>
      ),
    },
    {
      key: 'lastPurchaseDate',
      header: 'ซื้อล่าสุด',
      sortable: true,
      align: 'center',
      render: (item: ItemSupplierSummary) => formatDate(item.lastPurchaseDate),
    },
  ];

  // Column definitions for Item Purchase History
  const itemHistoryColumns: ColumnDef<ItemPurchaseHistory>[] = [
    {
      key: 'docDate',
      header: 'วันที่',
      sortable: true,
      align: 'center',
      width: '9%',
      render: (item: ItemPurchaseHistory) => formatDate(item.docDate),
    },
    {
      key: 'docNo',
      header: 'เลขที่ PO',
      sortable: true,
      align: 'left',
      width: '12%',
      render: (item: ItemPurchaseHistory) => (
        <span className="font-mono text-xs font-medium">{item.docNo}</span>
      ),
    },
    {
      key: 'branchSync',
      header: 'กิจการ',
      sortable: true,
      align: 'left',
      width: '12%',
      render: (item: ItemPurchaseHistory) => {
        const branch = availableBranches.find((b) => b.key === item.branchSync);
        return (
          <span className="text-sm">{branch?.name || item.branchSync}</span>
        );
      },
    },
    {
      key: 'supplierName',
      header: 'ซัพพลายเออร์',
      sortable: true,
      align: 'left',
      width: '22%',
      render: (item: ItemPurchaseHistory) => (
        <div>
          <div className="font-medium">{item.supplierName || item.supplierCode}</div>
          {item.supplierName && (
            <div className="text-xs text-muted-foreground font-mono">{item.supplierCode}</div>
          )}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'จำนวน',
      sortable: true,
      align: 'right',
      width: '9%',
      render: (item: ItemPurchaseHistory) =>
        item.qty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      key: 'unitCode',
      header: 'หน่วย',
      sortable: true,
      align: 'center',
      width: '7%',
    },
    {
      key: 'price',
      header: 'ราคา/หน่วย',
      sortable: true,
      align: 'right',
      width: '12%',
      render: (item: ItemPurchaseHistory) => <span>฿{formatCurrency(item.price)}</span>,
    },
    {
      key: 'totalAmount',
      header: 'ยอดเงิน',
      sortable: true,
      align: 'right',
      width: '12%',
      render: (item: ItemPurchaseHistory) => (
        <span className="font-semibold text-blue-700">฿{formatCurrency(item.totalAmount)}</span>
      ),
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

  // Get unique categories from purchaseByCategory
  const uniqueCategories = Array.from(
    new Set(purchaseByCategory.map(item => JSON.stringify({ 
      code: normalizeFilterValue(item.categoryCode),
      name: item.categoryName 
    })))
  ).map(str => JSON.parse(str)).sort((a, b) => sortByCustomOrder(a.name, b.name));

  // Get unique categories from purchaseAnalysis (for purchase-analysis report)
  const uniqueAnalysisCategories = Array.from(
    new Set(purchaseAnalysis.map(item => item.categoryName).filter(Boolean))
  ).sort(sortByCustomOrder);

  useEffect(() => {
    if (selectedReport === 'by-category' && selectedCategory !== 'ALL' && uniqueCategories.length > 0) {
      if (!uniqueCategories.some((cat) => cat.code === selectedCategory)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedCategory('ALL');
      }
    }
    if (selectedReport === 'purchase-analysis' && categoryFilter !== 'all' && uniqueAnalysisCategories.length > 0) {
      if (!uniqueAnalysisCategories.includes(categoryFilter)) {
        setCategoryFilter('all');
      }
    }
  }, [selectedReport, selectedCategory, categoryFilter, uniqueCategories, uniqueAnalysisCategories]);

  // Filter purchaseByCategory by selected category
  const filteredPurchaseByCategory = selectedCategory === 'ALL' 
    ? purchaseByCategory 
    : purchaseByCategory.filter(item => normalizeFilterValue(item.categoryCode) === selectedCategory);

  // Filter purchaseAnalysis by selected category
  const filteredPurchaseAnalysis = categoryFilter === 'all'
    ? purchaseAnalysis
    : purchaseAnalysis.filter(item => item.categoryName === categoryFilter);

  // Render report content based on selected type
  const renderReportContent = () => {
    switch (selectedReport) {
      case 'purchase-analysis':
        return (
          <PaginatedTable
            paginationClassName="pr-[70px]"
            data={filteredPurchaseAnalysis}
            columns={purchaseAnalysisColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลยอดซื้อ"
            defaultSortKey="docDate"
            defaultSortOrder="desc"
            keyExtractor={(item: PurchaseAnalysisData, index: number) => `${item.docNo}-${item.itemCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 6,
              values: {
                qty: (data) => {
                  const total = data.reduce((sum, item) => sum + item.qty, 0);
                  return <span className="font-medium text-black">{total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
                },
                price: () => <span className="text-muted-foreground">-</span>,
                totalAmount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
                  return <span className="font-medium text-blue-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'purchase-trend':
        return (
          <PaginatedTable
            data={periodFilteredTrend}
            columns={purchaseTrendColumns}
            itemsPerPage={15}
            emptyMessage="ไม่มีข้อมูลการจัดซื้อ"
            defaultSortKey="month"
            defaultSortOrder="desc"
            keyExtractor={(item: PurchaseTrendData) => item.month}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                totalPurchases: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalPurchases, 0);
                  return <span className="font-medium text-blue-600">฿{formatCurrency(total)}</span>;
                },
                poCount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.poCount, 0);
                  return <span className="font-medium text-black">{total}</span>;
                },
                avgPOValue: (data) => {
                  const totalPurchases = data.reduce((sum, item) => sum + item.totalPurchases, 0);
                  const totalPOs = data.reduce((sum, item) => sum + item.poCount, 0);
                  const avg = totalPOs > 0 ? totalPurchases / totalPOs : 0;
                  return <span className="font-medium">฿{formatCurrency(avg)}</span>;
                }
              }
            }}
          />
        );

      case 'top-suppliers':
        return (
          <PaginatedTable
            data={topSuppliers}
            columns={topSuppliersColumns}
            itemsPerPage={15}
            emptyMessage="ไม่มีข้อมูลซัพพลายเออร์"
            defaultSortKey="totalPurchases"
            defaultSortOrder="desc"
            keyExtractor={(item: TopSupplier) => item.supplierCode}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                poCount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.poCount, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                totalPurchases: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalPurchases, 0);
                  return <span className="font-medium text-blue-600">฿{formatCurrency(total)}</span>;
                },
              }
            }}
          />
        );

      case 'by-category':
        return (
          <PaginatedTable
            data={filteredPurchaseByCategory}
            columns={purchaseByCategoryColumns}
            itemsPerPage={15}
            emptyMessage="ไม่มีข้อมูลหมวดหมู่"
            defaultSortKey="categoryName"
            defaultSortOrder="asc"
            keyExtractor={(item: PurchaseByCategory, index?: number) => `${item.categoryCode}-${item.itemCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 2,
              values: {
                totalQty: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalQty, 0);
                  return <span className="font-medium text-black">{formatNumber(total)}</span>;
                },
                totalPurchaseValue: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalPurchaseValue, 0);
                  return <span className="font-medium text-blue-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'by-brand':
        return (
          <PaginatedTable
            data={purchaseByBrand}
            columns={purchaseByBrandColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลแบรนด์"
            defaultSortKey="totalPurchase"
            defaultSortOrder="desc"
            keyExtractor={(item: PurchaseByBrand) => item.brandName}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                totalPurchaseValue: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalPurchaseValue, 0);
                  return <span className="font-medium text-blue-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'ap-outstanding':
        return (
          <PaginatedTable
            data={apOutstanding}
            columns={apOutstandingColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มียอดค้างชำระ"
            defaultSortKey="totalOutstanding"
            defaultSortOrder="desc"
            keyExtractor={(item: APOutstanding) => item.supplierCode}
          />
        );

      case 'expense-by-account':
        // Show items directly with dropdown filter (like sales analysis)
        return accountItemsLoading ? (
          <TableSkeleton rows={10} />
        ) : (
          <PaginatedTable
            data={periodFilteredAccountItems}
            columns={accountItemsColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลค่าใช้จ่าย"
            defaultSortKey="docDate"
            defaultSortOrder="desc"
            keyExtractor={(item: PurchaseItemsByAccount, index: number) => 
              `${item.docNo}-${item.itemCode}-${index}`
            }
            showSummary={true}
            summaryConfig={{
              labelColSpan: 6,
              values: {
                qty: (data) => {
                  const total = data.reduce((sum, item) => sum + (item.qty || 0), 0);
                  return <span className="font-medium text-black">
                    {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>;
                },
                price: () => <span className="text-muted-foreground">-</span>,
                totalAmount: (data) => {
                  const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
                  return <span className="font-medium text-red-600">฿{formatCurrency(total)}</span>;
                }
              }
            }}
          />
        );

      case 'supplier-detail':
        return supplierDetailsLoading ? (
          <TableSkeleton rows={10} />
        ) : (
          <div className="space-y-4">
            {!selectedSupplierCode && (
              <div className="flex flex-col items-center justify-center p-12 bg-muted/30 rounded-lg border border-dashed">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">กรุณาเลือกซัพพลายเออร์</h3>
                <p className="text-sm text-muted-foreground">เพื่อเรียกดูรายละเอียดการสั่งซื้อแยกตามผังบัญชีและหมวดสินค้า</p>
              </div>
            )}
            {selectedSupplierCode && (
              <PaginatedTable
                data={filteredSupplierDetails}
                columns={supplierPODetailColumns}
                itemsPerPage={20}
                emptyMessage="ไม่พบข้อมูลรายละเอียดซัพพลายเออร์"
                defaultSortKey="docDate"
                defaultSortOrder="desc"
                keyExtractor={(item: SupplierPODetail, index: number) => 
                  `${item.docNo}-${item.itemCode}-${item.accountCode}-${index}`
                }
                showSummary={true}
                summaryConfig={{
                  labelColSpan: 9,
                  values: {
                    totalAmount: (data) => {
                      const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
                      return <span className="font-semibold text-blue-700">฿{formatCurrency(total)}</span>;
                    }
                  }
                }}
              />
            )}
          </div>
        );

      case 'item-by-supplier': {
        const isLoadingItem = itemListLoading || itemSuppliersLoading || itemHistoryLoading;
        const selectedItemInfo = purchaseItemList?.find(i => i.itemCode === selectedItemCode);
        return isLoadingItem ? (
          <TableSkeleton rows={10} />
        ) : (
          <div className="space-y-6">
            {!selectedItemCode && (
              <div className="flex flex-col items-center justify-center p-12 bg-muted/30 rounded-lg border border-dashed">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">กรุณาเลือกสินค้า</h3>
                <p className="text-sm text-muted-foreground">เพื่อดูว่าสินค้านี้ซื้อมาจากซัพพลายเออร์ไหนบ้าง</p>
              </div>
            )}
            {selectedItemCode && (
              <>
                {/* Supplier summary */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    สรุปรายซัพพลายเออร์
                  </h3>
                  <PaginatedTable
                    data={itemSuppliers || []}
                    columns={itemSupplierColumns}
                    itemsPerPage={10}
                    emptyMessage="ไม่พบซัพพลายเออร์สำหรับสินค้านี้"
                    defaultSortKey="totalAmount"
                    defaultSortOrder="desc"
                    keyExtractor={(item: ItemSupplierSummary, index?: number) => `${item.supplierCode}-${index ?? 0}`}
                    showSummary={true}
                    summaryConfig={{
                      labelColSpan: 2,
                      values: {
                        poCount: (data) => {
                          const total = data.reduce((sum, item) => sum + item.poCount, 0);
                          return <span className="font-medium text-black">{formatNumber(total)}</span>;
                        },
                        totalQty: (data) => {
                          const total = data.reduce((sum, item) => sum + item.totalQty, 0);
                          return <span className="font-medium text-black">
                            {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>;
                        },
                        totalAmount: (data) => {
                          const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
                          return <span className="font-semibold text-blue-700">฿{formatCurrency(total)}</span>;
                        },
                      }
                    }}
                  />
                </div>

                {/* PO History */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    ประวัติรายการซื้อ
                    {selectedItemInfo && (
                      <span className="ml-2 normal-case font-normal text-foreground">
                        — {selectedItemInfo.itemName}
                        <span className="ml-1 text-xs text-muted-foreground">({periodFilteredItemHistory.length} รายการ)</span>
                      </span>
                    )}
                  </h3>
                  <PaginatedTable
                    data={periodFilteredItemHistory}
                    columns={itemHistoryColumns}
                    itemsPerPage={10}
                    emptyMessage="ไม่พบประวัติการสั่งซื้อในช่วงเวลานี้"
                    defaultSortKey="docDate"
                    defaultSortOrder="desc"
                    keyExtractor={(item: ItemPurchaseHistory, index: number) =>
                      `${item.docNo}-${item.supplierCode}-${index}`
                    }
                    showSummary={true}
                    summaryConfig={{
                      labelColSpan: 3,
                      values: {
                        qty: (data) => {
                          const total = data.reduce((sum, item) => sum + item.qty, 0);
                          return <span className="font-medium text-black">
                            {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>;
                        },
                        price: () => <span className="text-muted-foreground">-</span>,
                        totalAmount: (data) => {
                          const total = data.reduce((sum, item) => sum + item.totalAmount, 0);
                          return <span className="font-semibold text-blue-700">฿{formatCurrency(total)}</span>;
                        },
                      }
                    }}
                  />
                </div>
              </>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Get export function based on report type
  const getExportFunction = () => {
    switch (selectedReport) {
      case 'purchase-analysis':
        return () => {
          const categoryName = categoryFilter === 'all' ? 'ทั้งหมด' : categoryFilter;
          return exportStyledReport({
            data: filteredPurchaseAnalysis,
            headers: { 
              categoryName: 'หมวดสินค้า', 
              docDate: 'วันที่', 
              docNo: 'เลขที่', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              unitCode: 'หน่วย', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              totalAmount: 'รวมมูลค่า' 
            },
            filename: `รายงานวิเคราะห์ยอดซื้อสินค้า_${categoryName}`,
            sheetName: 'Purchase Analysis',
            title: `รายงานวิเคราะห์ยอดซื้อสินค้า - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
            currencyColumns: ['price', 'totalAmount', 'qty'],
            numberColumns: [],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      case 'purchase-trend':
        return () => {
          const dataWithAvg = periodFilteredTrend.map(item => ({
            ...item,
            avgPOValue: item.poCount > 0 ? item.totalPurchases / item.poCount : 0
          }));
          exportStyledReport({
            data: dataWithAvg,
            headers: { month: 'เดือน', totalPurchases: 'ยอดจัดซื้อ', poCount: 'จำนวน PO', avgPOValue: 'ยอดเฉลี่ย/PO' },
            filename: 'แนวโน้มการจัดซื้อ',
            sheetName: 'Purchase Trend',
            title: 'รายงานแนวโน้มการจัดซื้อ',
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
            currencyColumns: ['totalPurchases', 'avgPOValue'],
            numberColumns: ['poCount'],
            summaryConfig: {
              columns: {
                totalPurchases: 'sum',
                poCount: 'sum',
                avgPOValue: 'avg'
              }
            }
          });
        };

      case 'top-suppliers':
        return () => exportStyledReport({
          data: topSuppliers,
          headers: { supplierCode: 'รหัสซัพพลายเออร์', supplierName: 'ชื่อซัพพลายเออร์', poCount: 'ใบสั่งซื้อ', totalPurchases: 'ยอดซื้อรวม', avgPOValue: 'ยอดเฉลี่ย/ใบ', lastPurchaseDate: 'สั่งซื้อล่าสุด' },
          filename: 'ซัพพลายเออร์ยอดนิยม',
          sheetName: 'Top Suppliers',
          title: 'รายงานซัพพลายเออร์ยอดนิยม',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
          numberColumns: ['poCount'],
          currencyColumns: ['totalPurchases', 'avgPOValue'],
          summaryConfig: {
            columns: {
              poCount: 'sum',
              totalPurchases: 'sum',
            }
          }
        });

      case 'by-category':
        return () => {
          const categoryName = selectedCategory === 'ALL' 
            ? 'ทั้งหมด' 
            : uniqueCategories.find(c => c.code === selectedCategory)?.name || 'ไม่ระบุ';
          
          return exportStyledReport({
            data: filteredPurchaseByCategory,
            headers: { categoryCode: 'รหัสหมวดหมู่', categoryName: 'ชื่อหมวดหมู่', itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', totalQty: 'จำนวนซื้อ', totalPurchaseValue: 'ยอดซื้อ' },
            filename: `การซื้อตามหมวดหมู่_${categoryName}`,
            sheetName: 'By Category',
            title: `รายงานการซื้อตามหมวดหมู่ - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['totalQty'],
            currencyColumns: ['totalPurchaseValue'],
            summaryConfig: {
              columns: {
                totalQty: 'sum',
                totalPurchaseValue: 'sum',
              }
            }
          });
        };

      case 'by-brand':
        return () => exportStyledReport({
          data: purchaseByBrand,
          headers: { brandName: 'แบรนด์', itemCount: 'จำนวนรายการ', totalQty: 'จำนวนซื้อ', totalPurchase: 'ยอดซื้อ', percentage: 'สัดส่วน (%)' },
          filename: 'การซื้อตามแบรนด์',
          sheetName: 'By Brand',
          title: 'รายงานการซื้อตามแบรนด์',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['itemCount', 'totalQty'],
          currencyColumns: ['totalPurchase'],
          percentColumns: ['percentage'],
          summaryConfig: {
            columns: {
              totalQty: 'sum',
              totalPurchase: 'sum',
            }
          }
        });

      case 'ap-outstanding':
        return () => exportStyledReport({
          data: apOutstanding,
          headers: { supplierCode: 'รหัสซัพพลายเออร์', supplierName: 'ชื่อซัพพลายเออร์', docCount: 'จำนวนเอกสาร', totalOutstanding: 'ยอดค้างชำระ', overdueAmount: 'ยอดเกินกำหนด' },
          filename: 'สถานะเจ้าหนี้การค้า',
          sheetName: 'AP Outstanding',
          title: 'รายงานสถานะเจ้าหนี้การค้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
          currencyColumns: ['totalOutstanding', 'overdueAmount'],
          numberColumns: ['docCount'],
          summaryConfig: {
            columns: {
              docCount: 'sum',
              totalOutstanding: 'sum',
              overdueAmount: 'sum',
            }
          }
        });

      case 'expense-by-account':
        return () => {
          const accountName = selectedAccountCode 
            ? uniqueExpenseAccounts.find(acc => acc.code === selectedAccountCode)?.name || selectedAccountCode
            : 'ทั้งหมด';
          
          return exportStyledReport({
            data: periodFilteredAccountItems,
            headers: {
              docDate: 'วันที่',
              docNo: 'เลขที่เอกสาร',
              itemCode: 'รหัสสินค้า',
              itemName: 'ชื่อสินค้า',
              categoryName: 'หมวดสินค้า',
              unitCode: 'หน่วย',
              qty: 'จำนวน',
              price: 'ราคา',
              totalAmount: 'รวมมูลค่า'
            },
            filename: `ค่าใช้จ่ายตามผังบัญชี_${accountName}`,
            sheetName: 'Expense Items',
            title: `รายงานค่าใช้จ่ายตามผังบัญชี - ${accountName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            currencyColumns: ['price', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      case 'supplier-detail':
        return () => {
          const supplierName = selectedSupplierCode
            ? topSuppliers.find(s => s.supplierCode === selectedSupplierCode)?.supplierName || selectedSupplierCode
            : 'ทั้งหมด';

          const accountName = supplierAccountFilter !== 'ALL'
            ? uniqueSupplierAccounts.find(a => a.code === supplierAccountFilter)?.name || supplierAccountFilter
            : 'ทั้งหมด';

          return exportStyledReport({
            data: filteredSupplierDetails,
            headers: {
              docDate: 'วันที่',
              docNo: 'เลขที่ PO',
              accountCode: 'รหัสผังบัญชี',
              accountName: 'ชื่อผังบัญชี',
              categoryName: 'หมวดสินค้า',
              itemCode: 'รหัสสินค้า',
              itemName: 'สินค้า',
              qty: 'จำนวน',
              unitCode: 'หน่วย',
              price: 'ราคา',
              totalAmount: 'ยอดเงิน'
            },
            filename: `รายละเอียดตามซัพพลายเออร์_${supplierName}_${accountName}`,
            sheetName: 'Supplier Details',
            title: `รายงานรายละเอียดตามซัพพลายเออร์ - ${supplierName}`,
            subtitle: withBranchSubtitle(`ผังบัญชี: ${accountName} | ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            currencyColumns: ['price', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      case 'item-by-supplier':
        return () => {
          const item = purchaseItemList?.find(i => i.itemCode === selectedItemCode);
          const itemLabel = item ? `${item.itemCode}_${item.itemName}` : selectedItemCode;
          return exportStyledReport({
            data: periodFilteredItemHistory,
            headers: {
              docDate: 'วันที่',
              docNo: 'เลขที่ PO',
              supplierCode: 'รหัสซัพพลายเออร์',
              supplierName: 'ชื่อซัพพลายเออร์',
              qty: 'จำนวน',
              unitCode: 'หน่วย',
              price: 'ราคา/หน่วย',
              totalAmount: 'ยอดเงิน',
            },
            filename: `ประวัติซื้อสินค้า_${itemLabel}`,
            sheetName: 'Purchase History',
            title: `ประวัติการสั่งซื้อ: ${item?.itemName || selectedItemCode}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
            currencyColumns: ['price', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      default:
        return undefined;
    }
  };

  const getExportPdfFunction = () => {
    switch (selectedReport) {
      case 'purchase-analysis':
        return () => {
          const categoryName = categoryFilter === 'all' ? 'ทั้งหมด' : categoryFilter;
          return exportStyledPdfReport({
            data: filteredPurchaseAnalysis,
            headers: { 
              categoryName: 'หมวดสินค้า', 
              docDate: 'วันที่', 
              docNo: 'เลขที่', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              unitCode: 'หน่วย', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              totalAmount: 'รวมมูลค่า' 
            },
            filename: `รายงานวิเคราะห์ยอดซื้อสินค้า_${categoryName}`,
            title: `รายงานวิเคราะห์ยอดซื้อสินค้า - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
            currencyColumns: ['price', 'totalAmount', 'qty'],
            numberColumns: [],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      case 'purchase-trend':
        return () => {
          const dataWithAvg = periodFilteredTrend.map(item => ({
            ...item,
            avgPOValue: item.poCount > 0 ? item.totalPurchases / item.poCount : 0
          }));
          exportStyledPdfReport({
            data: dataWithAvg,
            headers: { month: 'เดือน', totalPurchases: 'ยอดจัดซื้อ', poCount: 'จำนวน PO', avgPOValue: 'ยอดเฉลี่ย/PO' },
            filename: 'แนวโน้มการจัดซื้อ',
            title: 'รายงานแนวโน้มการจัดซื้อ',
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
            currencyColumns: ['totalPurchases', 'avgPOValue'],
            numberColumns: ['poCount'],
            summaryConfig: {
              columns: {
                totalPurchases: 'sum',
                poCount: 'sum',
                avgPOValue: 'avg'
              }
            }
          });
        };

      case 'top-suppliers':
        return () => exportStyledPdfReport({
          data: topSuppliers,
          headers: { supplierCode: 'รหัสซัพพลายเออร์', supplierName: 'ชื่อซัพพลายเออร์', poCount: 'ใบสั่งซื้อ', totalPurchases: 'ยอดซื้อรวม', avgPOValue: 'ยอดเฉลี่ย/ใบ', lastPurchaseDate: 'สั่งซื้อล่าสุด' },
          filename: 'ซัพพลายเออร์ยอดนิยม',
          title: 'รายงานซัพพลายเออร์ยอดนิยม',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
          numberColumns: ['poCount'],
          currencyColumns: ['totalPurchases', 'avgPOValue'],
          summaryConfig: {
            columns: {
              poCount: 'sum',
              totalPurchases: 'sum',
            }
          }
        });

      case 'by-category':
        return () => {
          const categoryName = selectedCategory === 'ALL'
            ? 'ทั้งหมด'
            : uniqueCategories.find(c => c.code === selectedCategory)?.name || 'ไม่ระบุ';

          return exportStyledPdfReport({
            data: filteredPurchaseByCategory,
            headers: { categoryCode: 'รหัสหมวดหมู่', categoryName: 'ชื่อหมวดหมู่', itemCode: 'รหัสสินค้า', itemName: 'ชื่อสินค้า', totalQty: 'จำนวนซื้อ', totalPurchaseValue: 'ยอดซื้อ' },
            filename: `การซื้อตามหมวดหมู่_${categoryName}`,
            title: `รายงานการซื้อตามหมวดหมู่ - ${categoryName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['totalQty'],
            currencyColumns: ['totalPurchaseValue'],
            summaryConfig: {
              columns: {
                totalQty: 'sum',
                totalPurchaseValue: 'sum',
              }
            }
          });
        };

      case 'by-brand':
        return () => exportStyledPdfReport({
          data: purchaseByBrand,
          headers: { brandName: 'แบรนด์', itemCount: 'จำนวนรายการ', totalQty: 'จำนวนซื้อ', totalPurchase: 'ยอดซื้อ', percentage: 'สัดส่วน (%)' },
          filename: 'การซื้อตามแบรนด์',
          title: 'รายงานการซื้อตามแบรนด์',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          numberColumns: ['itemCount', 'totalQty'],
          currencyColumns: ['totalPurchase'],
          percentColumns: ['percentage'],
          summaryConfig: {
            columns: {
              totalQty: 'sum',
              totalPurchase: 'sum',
            }
          }
        });

      case 'ap-outstanding':
        return () => exportStyledPdfReport({
          data: apOutstanding,
          headers: { supplierCode: 'รหัสซัพพลายเออร์', supplierName: 'ชื่อซัพพลายเออร์', docCount: 'จำนวนเอกสาร', totalOutstanding: 'ยอดค้างชำระ', overdueAmount: 'ยอดเกินกำหนด' },
          filename: 'สถานะเจ้าหนี้การค้า',
          title: 'รายงานสถานะเจ้าหนี้การค้า',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
          currencyColumns: ['totalOutstanding', 'overdueAmount'],
          numberColumns: ['docCount'],
          summaryConfig: {
            columns: {
              docCount: 'sum',
              totalOutstanding: 'sum',
              overdueAmount: 'sum',
            }
          }
        });

      case 'expense-by-account':
        return () => {
          const accountName = selectedAccountCode 
            ? uniqueExpenseAccounts.find(acc => acc.code === selectedAccountCode)?.name || selectedAccountCode
            : 'ทั้งหมด';
          
          return exportStyledPdfReport({
            data: periodFilteredAccountItems,
            headers: {
              docDate: 'วันที่',
              docNo: 'เลขที่เอกสาร',
              itemCode: 'รหัสสินค้า',
              itemName: 'ชื่อสินค้า',
              categoryName: 'หมวดสินค้า',
              unitCode: 'หน่วย',
              qty: 'จำนวน',
              price: 'ราคา',
              totalAmount: 'รวมมูลค่า'
            },
            filename: `ค่าใช้จ่ายตามผังบัญชี_${accountName}`,
            title: `รายงานค่าใช้จ่ายตามผังบัญชี - ${accountName}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            currencyColumns: ['price', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      case 'supplier-detail':
        return () => {
          const supplierName = selectedSupplierCode
            ? topSuppliers.find(s => s.supplierCode === selectedSupplierCode)?.supplierName || selectedSupplierCode
            : 'ทั้งหมด';

          const accountName = supplierAccountFilter !== 'ALL'
            ? uniqueSupplierAccounts.find(a => a.code === supplierAccountFilter)?.name || supplierAccountFilter
            : 'ทั้งหมด';

          return exportStyledPdfReport({
            data: filteredSupplierDetails,
            headers: {
              docDate: 'วันที่',
              docNo: 'เลขที่ PO',
              accountCode: 'รหัสผังบัญชี',
              accountName: 'ชื่อผังบัญชี',
              categoryName: 'หมวดสินค้า',
              itemCode: 'รหัสสินค้า',
              itemName: 'สินค้า',
              qty: 'จำนวน',
              unitCode: 'หน่วย',
              price: 'ราคา',
              totalAmount: 'ยอดเงิน'
            },
            filename: `รายละเอียดตามซัพพลายเออร์_${supplierName}_${accountName}`,
            title: `รายงานรายละเอียดตามซัพพลายเออร์ - ${supplierName}`,
            subtitle: withBranchSubtitle(`ผังบัญชี: ${accountName} | ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            currencyColumns: ['price', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      case 'item-by-supplier':
        return () => {
          const item = purchaseItemList?.find(i => i.itemCode === selectedItemCode);
          const itemLabel = item ? `${item.itemCode}_${item.itemName}` : selectedItemCode;
          return exportStyledPdfReport({
            data: periodFilteredItemHistory,
            headers: {
              docDate: 'วันที่',
              docNo: 'เลขที่ PO',
              supplierCode: 'รหัสซัพพลายเออร์',
              supplierName: 'ชื่อซัพพลายเออร์',
              qty: 'จำนวน',
              unitCode: 'หน่วย',
              price: 'ราคา/หน่วย',
              totalAmount: 'ยอดเงิน',
            },
            filename: `ประวัติซื้อสินค้า_${itemLabel}`,
            title: `ประวัติการสั่งซื้อ: ${item?.itemName || selectedItemCode}`,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${exportDateRange.start} ถึง ${exportDateRange.end}`),
            currencyColumns: ['price', 'totalAmount'],
            numberColumns: ['qty'],
            summaryConfig: {
              columns: {
                qty: 'sum',
                totalAmount: 'sum',
              }
            }
          });
        };

      default:
        return undefined;
    }
  };

  // Get unique accounts from current supplierDetails
  const uniqueSupplierAccounts = Array.from(
    new Map(
      periodFilteredSupplierDetails.map(item => [
        item.accountCode,
        { code: item.accountCode, name: item.accountName }
      ])
    ).values()
  ).sort((a, b) => a.code.localeCompare(b.code));

  // Filter supplierDetails by selected account
  const filteredSupplierDetails = (selectedReport === 'supplier-detail' && supplierAccountFilter !== 'ALL')
    ? periodFilteredSupplierDetails.filter(item => item.accountCode === supplierAccountFilter)
    : periodFilteredSupplierDetails;

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
              รายงานการจัดซื้อ
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              ข้อมูลรายงานการจัดซื้อและซัพพลายเออร์ในรูปแบบตาราง
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
              value={purchaseFilter}
              onChange={setPurchaseFilter}
              availableMonths={purchaseAvailableMonths}
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
          queryInfo={undefined}
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
            ) : selectedReport === 'purchase-analysis' ? (
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
            ) : selectedReport === 'expense-by-account' ? (
              <div className="flex items-center gap-2">
                <label htmlFor="account-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  ผังบัญชี:
                </label>
                <SearchableSelect
                  value={selectedAccountCode || 'ALL'}
                  onChange={(value) => setSelectedAccountCode(value === 'ALL' ? '' : value)}
                  options={[
                    { value: 'ALL', label: 'ทั้งหมด' },
                    ...uniqueExpenseAccounts.map((acc) => ({ value: acc.code, label: `${acc.code} - ${acc.name}` })),
                  ]}
                  className="w-full sm:w-[250px]"
                />
              </div>
            ) : selectedReport === 'supplier-detail' ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="supplier-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                    ซัพพลายเออร์:
                  </label>
                  <SearchableSelect
                    value={selectedSupplierCode || 'ALL'}
                    onChange={(value) => {
                      setSelectedSupplierCode(value === 'ALL' ? '' : value);
                      setSupplierAccountFilter('ALL'); // Reset account filter when supplier changes
                    }}
                    options={[
                      { value: 'ALL', label: 'เลือกซัพพลายเออร์...' },
                      ...topSuppliers.map((s) => ({ value: s.supplierCode, label: s.supplierName?.trim() || s.supplierCode })),
                    ]}
                    className="w-full sm:w-[300px]"
                  />
                </div>
                {selectedSupplierCode && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="supplier-account-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                      ผังบัญชี:
                    </label>
                    <SearchableSelect
                      value={supplierAccountFilter}
                      onChange={setSupplierAccountFilter}
                      options={[
                        { value: 'ALL', label: 'ทั้งหมด' },
                        ...uniqueSupplierAccounts.map((acc) => ({ value: acc.code, label: `${acc.code} - ${acc.name}` })),
                      ]}
                      className="w-full sm:w-[250px]"
                    />
                  </div>
                )}
              </div>
            ) : selectedReport === 'item-by-supplier' ? (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  สินค้า:
                </label>
                <SearchableSelect
                  value={selectedItemCode || 'ALL'}
                  onChange={(value) => setSelectedItemCode(value === 'ALL' ? '' : value)}
                  options={[
                    { value: 'ALL', label: itemListLoading ? 'กำลังโหลด...' : 'เลือกสินค้า...' },
                    ...(purchaseItemList || []).map((item) => ({
                      value: item.itemCode,
                      label: `[${item.itemCode}] ${item.itemName}`,
                    })),
                  ]}
                  className="w-full sm:w-[380px]"
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

export default function PurchaseReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">กำลังโหลด...</div>}>
      <PurchaseReportContent />
    </Suspense>
  );
}
