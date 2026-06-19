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
import { ReportPeriodFilter, getMonthsFromDateRange } from '@/components/ReportPeriodFilter';
import { useReportPeriodFilter } from '@/hooks/useReportPeriodFilter';
import { ProfitLossDetailTable, type PLDetailRow } from '@/components/accounting/ProfitLossDetailTable';
import {
  TrendingDown,
  Scale,
  Droplets,
  Clock,
  Users,
  PieChart,
  BookOpen,
} from 'lucide-react';
import { exportStyledReport } from '@/lib/exportExcel';
import { exportStyledPdfReport } from '@/lib/exportPdf';
import { formatCurrency, formatDate, formatMonth, formatNumber } from '@/lib/formatters';
import { useReportHash } from '@/hooks/useReportHash';
import type {
  DateRange,
  ProfitLossData,
  BalanceSheetItem,
  CashFlowData,
  AgingItem,
  CategoryBreakdown,
  ChartOfAccountItem,
  AccountProductItem,
} from '@/lib/data/types';
import {
  getProfitLossQuery,
  getBalanceSheetQuery,
  getCashFlowQuery,
  getARAgingQuery,
  getAPAgingQuery,
  getRevenueBreakdownQuery,
  getExpenseBreakdownQuery,
  getChartOfAccountsListQuery,
} from '@/lib/data/accounting-queries';

// Report types
type ReportType =
  | 'profit-loss'
  | 'balance-sheet'
  | 'cash-flow'
  | 'ar-aging'
  | 'ap-aging'
  | 'revenue-breakdown'
  | 'expense-breakdown'
  | 'chart-of-accounts';

const reportOptions: ReportOption<ReportType>[] = [
  {
    value: 'profit-loss',
    label: 'งบกำไรขาดทุน',
    icon: TrendingDown,
    description: 'รายได้ ค่าใช้จ่าย และกำไรสุทธิรายเดือน',
  },
  {
    value: 'balance-sheet',
    label: 'งบดุล',
    icon: Scale,
    description: 'รายการสินทรัพย์ หนี้สิน และส่วนของผู้ถือหุ้น',
  },
  {
    value: 'cash-flow',
    label: 'งบกระแสเงินสด',
    icon: Droplets,
    description: 'กระแสเงินสดจากกิจกรรมต่างๆ',
  },
  {
    value: 'ar-aging',
    label: 'อายุลูกหนี้',
    icon: Clock,
    description: 'รายการลูกหนี้ค้างชำระทั้งหมด',
  },
  {
    value: 'ap-aging',
    label: 'อายุเจ้าหนี้',
    icon: Users,
    description: 'รายการเจ้าหนี้ค้างชำระทั้งหมด',
  },
  {
    value: 'revenue-breakdown',
    label: 'รายได้ตามผังบัญชี',
    icon: PieChart,
    description: 'สัดส่วนรายได้แยกตามประเภทบัญชี',
  },
  {
    value: 'expense-breakdown',
    label: 'ค่าใช้จ่ายตามผังบัญชี',
    icon: PieChart,
    description: 'สัดส่วนค่าใช้จ่ายแยกตามประเภทบัญชี',
  },
  {
    value: 'chart-of-accounts',
    label: 'ยอดขายตามผังบัญชี',
    icon: BookOpen,
    description: 'รายการสินค้าสำหรับแต่ละผังบัญชีจากการ JOIN journal กับใบแจ้งหนี้',
  },
];

const periodFilterReports = new Set<ReportType>(['profit-loss']);

function AccountingReportContent() {
  const { dateRange, setDateRange } = useDateRangeStore();
  const searchParams = useSearchParams();
  
  // Initialize report type from URL params, fallback to 'profit-loss'
  const [selectedReport, setSelectedReport] = useState<ReportType>(() => {
    const reportFromUrl = searchParams.get('report');
    return (reportFromUrl as ReportType) || 'profit-loss';
  });

  const selectedBranches = useBranchStore((s) => s.selectedBranches);
  const availableBranches = useBranchStore((s) => s.availableBranches);
  const selectedBranchLabel = formatSelectedBranchNames(selectedBranches, availableBranches);
  const withBranchSubtitle = (detail: string) => `กิจการ: ${selectedBranchLabel} | ${detail}`;

  // Balance sheet filter - initialize from URL params
  const [balanceSheetTypeFilter, setBalanceSheetTypeFilter] = useState<string>(() => {
    const filterFromUrl = searchParams.get('accountType');
    return filterFromUrl || 'all';
  });

  const [selectedAccountCode, setSelectedAccountCode] = useState<string>(() => {
    return searchParams.get('accountCode') || '';
  });

  const { filter: plFilter, setFilter: setPlFilter } = useReportPeriodFilter();
  const showPeriodFilter = periodFilterReports.has(selectedReport);

  // Reset selected account code when switching away from revenue-breakdown / expense-breakdown / chart-of-accounts or when filters change
  useEffect(() => {
    if (selectedReport !== 'chart-of-accounts' && selectedReport !== 'revenue-breakdown' && selectedReport !== 'expense-breakdown') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAccountCode('');
    }
  }, [selectedReport, dateRange, selectedBranches]);

  // Effect to update report from URL after initial load
  useEffect(() => {
    const reportFromUrl = searchParams.get('report');
    if (reportFromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedReport(reportFromUrl as ReportType);
    }
    const accountCodeFromUrl = searchParams.get('accountCode');
    if (accountCodeFromUrl) {
      setSelectedAccountCode(accountCodeFromUrl);
    }
    const filterFromUrl = searchParams.get('accountType');
    if (filterFromUrl) {
      setBalanceSheetTypeFilter(filterFromUrl);
    }
  }, [searchParams]);

  // Handle URL hash for report selection
  useReportHash(reportOptions, setSelectedReport);

  const { data: reportData, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['accountingReportData', selectedReport, dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
      });

      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }

      let endpoint = '';
      switch (selectedReport) {
        case 'profit-loss':
          endpoint = `/api/accounting/profit-loss?${params}`;
          break;
        case 'balance-sheet':
          endpoint = `/api/accounting/balance-sheet?${params}`;
          break;
        case 'cash-flow':
          endpoint = `/api/accounting/cash-flow?${params}`;
          break;
        case 'ar-aging':
          endpoint = `/api/accounting/ar-aging?${params}`;
          break;
        case 'ap-aging':
          endpoint = `/api/accounting/ap-aging?${params}`;
          break;
        case 'revenue-breakdown':
        case 'expense-breakdown':
          endpoint = `/api/accounting/revenue-expense-breakdown?${params}`;
          break;
        case 'chart-of-accounts':
          endpoint = `/api/reports/accounting?${params}`;
          break;
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch ${selectedReport} data`);

      const result = await response.json();
      return result.data;
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;

  const profitLossData: ProfitLossData[] = selectedReport === 'profit-loss' ? (reportData || []) : [];
  const balanceSheetData: BalanceSheetItem[] = selectedReport === 'balance-sheet' ? (reportData || []) : [];
  const cashFlowData: CashFlowData[] = selectedReport === 'cash-flow' ? (reportData || []) : [];
  const arAgingData: AgingItem[] = selectedReport === 'ar-aging' ? (reportData || []) : [];
  const apAgingData: AgingItem[] = selectedReport === 'ap-aging' ? (reportData || []) : [];
  const revenueBreakdown: CategoryBreakdown[] = (selectedReport === 'revenue-breakdown' || selectedReport === 'expense-breakdown') ? (reportData?.revenue || []) : [];
  const expenseBreakdown: CategoryBreakdown[] = (selectedReport === 'expense-breakdown' || selectedReport === 'revenue-breakdown') ? (reportData?.expenses || []) : [];
  const chartOfAccountsList: ChartOfAccountItem[] = selectedReport === 'chart-of-accounts' ? (reportData || []) : [];

  const revenueAccountCodes = useMemo(
    () => new Set(revenueBreakdown.map((acc) => acc.accountGroup).filter(Boolean)),
    [revenueBreakdown]
  );
  const expenseAccountCodes = useMemo(
    () => new Set(expenseBreakdown.map((acc) => acc.accountGroup).filter(Boolean)),
    [expenseBreakdown]
  );

  useEffect(() => {
    if (!selectedAccountCode) return;
    if (selectedReport === 'revenue-breakdown' && revenueBreakdown.length > 0 && !revenueAccountCodes.has(selectedAccountCode)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAccountCode('');
    }
    if (selectedReport === 'expense-breakdown' && expenseBreakdown.length > 0 && !expenseAccountCodes.has(selectedAccountCode)) {
      setSelectedAccountCode('');
    }
  }, [selectedReport, selectedAccountCode, revenueBreakdown.length, expenseBreakdown.length, revenueAccountCodes, expenseAccountCodes]);

  // ---- Detailed P&L (by account code + month) ----
  const { data: plDetailRows = [], isLoading: plDetailLoading } = useQuery<PLDetailRow[]>({
    queryKey: ['plDetail', dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({ start_date: dateRange.start, end_date: dateRange.end });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      const res = await fetch(`/api/accounting/profit-loss-detail?${params}`);
      if (!res.ok) throw new Error('Failed to fetch P&L detail');
      const json = await res.json();
      return ((json.data || []) as Array<Record<string, unknown>>).map((r) => ({
        branchKey: String(r.branchKey),
        accountType: String(r.accountType),
        accountCode: String(r.accountCode),
        accountName: String(r.accountName),
        plGroup: String(r.plGroup || r.accountType),
        month: String(r.month),
        amount: Number(r.amount) || 0,
      })) as PLDetailRow[];
    },
    enabled: selectedReport === 'profit-loss',
  });

  // Available months for period filter
  const accountingAvailableMonths = useMemo(() => {
    if (selectedReport === 'profit-loss' && plDetailRows.length > 0)
      return Array.from(new Set(plDetailRows.map((r) => r.month))).filter(Boolean);
    if (selectedReport === 'ar-aging' && arAgingData.length > 0)
      return Array.from(new Set(arAgingData.map((r) => r.docDate.substring(0, 7)))).filter(Boolean);
    if (selectedReport === 'ap-aging' && apAgingData.length > 0)
      return Array.from(new Set(apAgingData.map((r) => r.docDate.substring(0, 7)))).filter(Boolean);
    return getMonthsFromDateRange(dateRange.start, dateRange.end);
  }, [selectedReport, plDetailRows, arAgingData, apAgingData, dateRange]);

  // Separate query for account products (triggered when user selects an account)
  const { data: accountProducts, isLoading: productsLoading } = useQuery<AccountProductItem[]>({
    queryKey: ['accountProducts', selectedAccountCode, dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      const response = await fetch(
        `/api/reports/accounting/${encodeURIComponent(selectedAccountCode)}?${params}`
      );
      if (!response.ok) throw new Error('Failed to fetch account products');
      const result = await response.json();
      return result.data as AccountProductItem[];
    },
    enabled: (selectedReport === 'chart-of-accounts' || selectedReport === 'revenue-breakdown' || selectedReport === 'expense-breakdown') && !!selectedAccountCode,
  });

  // Query for all details (when no account is selected)
  const { data: allRevenueDetails, isLoading: allRevenueLoading } = useQuery<AccountProductItem[]>({
    queryKey: ['allRevenueDetails', dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
        account_type: 'INCOME',
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      const response = await fetch(`/api/reports/accounting/all-details?${params}`);
      if (!response.ok) throw new Error('Failed to fetch all revenue details');
      const result = await response.json();
      return result.data as AccountProductItem[];
    },
    enabled: selectedReport === 'revenue-breakdown' && !selectedAccountCode,
  });

  const { data: allExpenseDetails, isLoading: allExpenseLoading } = useQuery<AccountProductItem[]>({
    queryKey: ['allExpenseDetails', dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
        account_type: 'EXPENSES',
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }
      const response = await fetch(`/api/reports/accounting/all-details?${params}`);
      if (!response.ok) throw new Error('Failed to fetch all expense details');
      const result = await response.json();
      return result.data as AccountProductItem[];
    },
    enabled: selectedReport === 'expense-breakdown' && !selectedAccountCode,
  });

  const fetchReportData = () => { refetch(); };

  const getAgingColor = (bucket: string): string => {
    switch (bucket) {
      case 'ยังไม่ครบกำหนด':
        return 'text-green-600';
      case '1-30 วัน':
        return 'text-yellow-600';
      case '31-60 วัน':
        return 'text-orange-600';
      case '61-90 วัน':
        return 'text-blue-600';
      default:
        return 'text-red-600 font-semibold';
    }
  };

  // Column definitions for Profit & Loss
  const profitLossColumns: ColumnDef<ProfitLossData>[] = [
    {
      key: 'month',
      header: 'เดือน',
      sortable: true,
      align: 'left',
      render: (item: ProfitLossData) => formatMonth(item.month),
    },
    {
      key: 'revenue',
      header: 'รายได้',
      sortable: true,
      align: 'right',
      render: (item: ProfitLossData) => (
        <span className="text-green-600 font-medium">฿{formatCurrency(item.revenue)}</span>
      ),
    },
    {
      key: 'expenses',
      header: 'ค่าใช้จ่าย',
      sortable: true,
      align: 'right',
      render: (item: ProfitLossData) => (
        <span className="text-red-600 font-medium">฿{formatCurrency(item.expenses)}</span>
      ),
    },
    {
      key: 'netProfit',
      header: 'กำไรสุทธิ',
      sortable: true,
      align: 'right',
      render: (item: ProfitLossData) => (
        <span className={`font-semibold ${item.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
          ฿{formatCurrency(item.netProfit)}
        </span>
      ),
    },
  ];

  // Column definitions for Balance Sheet
  const balanceSheetColumns: ColumnDef<BalanceSheetItem>[] = [
    {
      key: 'accountCode',
      header: 'รหัสบัญชี',
      sortable: true,
      align: 'left',
      render: (item: BalanceSheetItem) => (
        <span className="font-mono text-xs">{item.accountCode}</span>
      ),
    },
    {
      key: 'accountName',
      header: 'ชื่อบัญชี',
      sortable: true,
      align: 'left',
    },
    {
      key: 'typeName',
      header: 'ประเภท',
      sortable: true,
      align: 'center',
      render: (item: BalanceSheetItem) => (
        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${item.typeName === 'สินทรัพย์' ? 'bg-green-200 text-green-700' :
          item.typeName === 'หนี้สิน' ? 'bg-red-200 text-red-700' :
            'bg-blue-200 text-blue-700'
          }`}>
          {item.typeName}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'ยอดคงเหลือ',
      sortable: true,
      align: 'right',
      render: (item: BalanceSheetItem) => (
        <span className="font-medium">฿{formatCurrency(item.balance)}</span>
      ),
    },
  ];

  // Column definitions for Cash Flow
  const cashFlowColumns: ColumnDef<CashFlowData>[] = [
    {
      key: 'activityType',
      header: 'ประเภทกิจกรรม',
      sortable: false,
      align: 'left',
      render: (item: CashFlowData) => {
        const labels: Record<string, string> = {
          'Operating': 'กิจกรรมดำเนินงาน',
          'Investing': 'กิจกรรมลงทุน',
          'Financing': 'กิจกรรมจัดหาเงิน',
        };
        return <span className="font-medium">{labels[item.activityType] || item.activityType}</span>;
      },
    },
    {
      key: 'revenue',
      header: 'เงินสดรับ',
      sortable: true,
      align: 'right',
      render: (item: CashFlowData) => (
        <span className="text-green-600">฿{formatCurrency(item.revenue)}</span>
      ),
    },
    {
      key: 'expenses',
      header: 'เงินสดจ่าย',
      sortable: true,
      align: 'right',
      render: (item: CashFlowData) => (
        <span className="text-red-600">฿{formatCurrency(item.expenses)}</span>
      ),
    },
    {
      key: 'netCashFlow',
      header: 'กระแสเงินสดสุทธิ',
      sortable: true,
      align: 'right',
      render: (item: CashFlowData) => (
        <span className={`font-semibold ${item.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          ฿{formatCurrency(item.netCashFlow)}
        </span>
      ),
    },
  ];

  // Column definitions for AR/AP Aging
  const agingColumns: ColumnDef<AgingItem>[] = [
    {
      key: 'docNo',
      header: 'เลขที่เอกสาร',
      sortable: false,
      align: 'left',
      render: (item: AgingItem) => (
        <span className="font-mono text-xs">{item.docNo}</span>
      ),
    },
    {
      key: 'name',
      header: selectedReport === 'ar-aging' ? 'ลูกค้า' : 'ซัพพลายเออร์',
      sortable: true,
      align: 'left',
      render: (item: AgingItem) => (
        <div>
          <div className="font-medium">{item.name}</div>
          <div className="text-xs text-muted-foreground">{item.code}</div>
        </div>
      ),
    },
    {
      key: 'dueDate',
      header: 'วันครบกำหนด',
      sortable: true,
      align: 'right',
      render: (item: AgingItem) => (
        <span className="text-xs">{formatDate(item.dueDate)}</span>
      ),
    },
    {
      key: 'outstanding',
      header: 'ยอดค้างชำระ',
      sortable: true,
      align: 'right',
      render: (item: AgingItem) => (
        <span className="font-medium">฿{formatCurrency(item.outstanding)}</span>
      ),
    },
    {
      key: 'agingBucket',
      header: 'อายุหนี้',
      sortable: true,
      align: 'center',
      render: (item: AgingItem) => (
        <span className={getAgingColor(item.agingBucket)}>
          {item.agingBucket}
        </span>
      ),
    },
  ];

  // Column definitions for Category Breakdown (account summary)
  const breakdownColumns: ColumnDef<CategoryBreakdown>[] = [
    {
      key: 'accountGroup',
      header: 'รหัสบัญชี',
      sortable: true,
      align: 'left',
      render: (item: CategoryBreakdown) => (
        <span className="font-mono text-xs">{item.accountGroup}</span>
      ),
    },
    {
      key: 'accountName',
      header: 'ชื่อบัญชี',
      sortable: true,
      align: 'left',
    },
    {
      key: 'amount',
      header: 'จำนวนเงิน',
      sortable: true,
      align: 'right',
      render: (item: CategoryBreakdown) => (
        <span className={`font-medium ${selectedReport === 'revenue-breakdown' ? 'text-green-600' : 'text-red-600'}`}>
          ฿{formatCurrency(item.amount)}
        </span>
      ),
    },
    {
      key: 'percentage',
      header: 'สัดส่วน',
      sortable: true,
      align: 'right',
      render: (item: CategoryBreakdown) => (
        <span className="text-muted-foreground">{item.percentage.toFixed(1)}%</span>
      ),
    },
  ];

  // Get current report option
  const currentReport = reportOptions.find(opt => opt.value === selectedReport);

  const currentBreakdownData = selectedReport === 'revenue-breakdown' ? revenueBreakdown : expenseBreakdown;

  // Render report content based on selected type
  const renderReportContent = () => {
    switch (selectedReport) {
      case 'profit-loss': {
        return (
          <ProfitLossDetailTable
            rows={plDetailRows}
            loading={plDetailLoading}
            viewMode={plFilter.viewMode}
            periodType={plFilter.periodType}
            selectedPeriods={plFilter.selectedPeriod ? [plFilter.selectedPeriod] : []}
            comparePeriodA={plFilter.compareA}
            comparePeriodB={plFilter.compareB}
            branches={selectedBranches.includes('ALL')
              ? availableBranches
              : availableBranches.filter((branch) => selectedBranches.includes(branch.key))}
          />
        );
      }

      case 'balance-sheet':
        return (
          <PaginatedTable
            data={balanceSheetTypeFilter === 'all'
              ? balanceSheetData
              : balanceSheetData.filter(item => item.typeName === balanceSheetTypeFilter)
            }
            columns={balanceSheetColumns}
            itemsPerPage={15}
            emptyMessage="ไม่มีข้อมูลงบดุล"
            defaultSortKey="accountCode"
            defaultSortOrder="asc"
            keyExtractor={(item: BalanceSheetItem, index: number) => `${item.accountType}-${item.accountCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 2,
              values: {
                balance: (data) => {
                  const total = data.reduce((sum, item) => sum + item.balance, 0);
                  return (
                    <span className={`font-bold ${total >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      ฿{formatCurrency(total)}
                    </span>
                  );
                }
              }
            }}
          />
        );

      case 'cash-flow':
        return (
          <PaginatedTable
            data={cashFlowData}
            columns={cashFlowColumns}
            itemsPerPage={10}
            emptyMessage="ไม่มีข้อมูลกระแสเงินสด"
            keyExtractor={(item: CashFlowData) => item.activityType}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 1,
              values: {
                revenue: (data) => (
                  <span className="text-green-600 font-bold">
                    ฿{formatCurrency(data.reduce((sum, item) => sum + item.revenue, 0))}
                  </span>
                ),
                expenses: (data) => (
                  <span className="text-red-600 font-bold">
                    ฿{formatCurrency(data.reduce((sum, item) => sum + item.expenses, 0))}
                  </span>
                ),
                netCashFlow: (data) => {
                  const total = data.reduce((sum, item) => sum + item.netCashFlow, 0);
                  return (
                    <span className={`font-bold ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ฿{formatCurrency(total)}
                    </span>
                  );
                },
              }
            }}
          />
        );

      case 'ar-aging':
      case 'ap-aging':
        const agingData = selectedReport === 'ar-aging' ? arAgingData : apAgingData;
        return (
          <PaginatedTable
            data={agingData}
            columns={agingColumns}
            itemsPerPage={10}
            emptyMessage={selectedReport === 'ar-aging' ? 'ไม่มีลูกหนี้ค้างชำระ' : 'ไม่มีเจ้าหนี้ค้างชำระ'}
            defaultSortKey="outstanding"
            defaultSortOrder="desc"
            keyExtractor={(item: AgingItem, index: number) => `${item.code}-${item.docNo}-${index}`}
          />
        );

      case 'revenue-breakdown': {
        const revenueListColumns: ColumnDef<CategoryBreakdown>[] = [
          {
            key: 'accountGroup',
            header: 'รหัสบัญชี',
            sortable: true,
            align: 'left',
            render: (item: CategoryBreakdown) => (
              <span className="font-mono text-xs">{item.accountGroup}</span>
            ),
          },
          {
            key: 'accountName',
            header: 'ชื่อบัญชี',
            sortable: true,
            align: 'left',
            render: (item: CategoryBreakdown) => (
              <span className="font-medium">{item.accountName}</span>
            ),
          },
          {
            key: 'amount',
            header: 'ยอดรายได้',
            sortable: true,
            align: 'right',
            render: (item: CategoryBreakdown) => (
              <span className="font-medium text-green-600">฿{formatCurrency(item.amount)}</span>
            ),
          },
          {
            key: 'percentage',
            header: 'สัดส่วน',
            sortable: true,
            align: 'right',
            render: (item: CategoryBreakdown) => (
              <span className="text-muted-foreground">{item.percentage.toFixed(1)}%</span>
            ),
          },
        ];
        const productColumns: ColumnDef<AccountProductItem>[] = [
          {
            key: 'docDate',
            header: 'วันที่',
            sortable: true,
            align: 'center',
            render: (item) => formatDate(item.docDate),
          },
          {
            key: 'docNo',
            header: 'เลขที่เอกสาร',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.docNo}</span>,
          },
          {
            key: 'itemCode',
            header: 'รหัสสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.itemCode}</span>,
          },
          {
            key: 'itemName',
            header: 'ชื่อสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => (
              <span className={item.itemName === 'ไม่มีรายการสินค้า' ? 'text-muted-foreground italic' : ''}>
                {item.itemName}
              </span>
            ),
          },
          {
            key: 'qty',
            header: 'จำนวน',
            sortable: true,
            align: 'right',
            render: (item) => item.qty > 0 ? (item.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
          },
          {
            key: 'price',
            header: 'ราคา',
            sortable: true,
            align: 'right',
            render: (item) => item.price > 0 ? formatCurrency(item.price) : '-',
          },
          {
            key: 'debit',
            header: 'เดบิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-orange-600">
                {item.debit > 0 ? `฿${formatCurrency(item.debit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'credit',
            header: 'เครดิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-blue-600">
                {item.credit > 0 ? `฿${formatCurrency(item.credit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'amount',
            header: 'ยอดสุทธิ',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className={`font-semibold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ฿{formatCurrency(Math.abs(item.amount))}
              </span>
            ),
          },
        ];

        // Dropdown selected → show documents for that account
        if (selectedAccountCode) {
          return productsLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <PaginatedTable
              data={accountProducts || []}
              columns={productColumns}
              itemsPerPage={15}
              emptyMessage="ไม่พบเอกสารในผังบัญชีนี้"
              defaultSortKey="docDate"
              defaultSortOrder="desc"
              keyExtractor={(item, index) => `${item.docNo}-${item.itemCode}-${index}`}
              showSummary={true}
              summaryConfig={{
                labelColSpan: 4,
                values: {
                  qty: (data) => <span className="font-medium">{data.reduce((s, i) => s + i.qty, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
                  price: () => <span className="text-muted-foreground">-</span>,
                  debit: (data) => {
                    const uniqueDocs = new Map();
                    data.forEach(item => {
                      if (!uniqueDocs.has(item.docNo)) {
                        uniqueDocs.set(item.docNo, item.debit);
                      }
                    });
                    const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                    return (
                      <span className="font-bold text-orange-600">
                        ฿{formatCurrency(total)}
                      </span>
                    );
                  },
                  credit: (data) => {
                    const uniqueDocs = new Map();
                    data.forEach(item => {
                      if (!uniqueDocs.has(item.docNo)) {
                        uniqueDocs.set(item.docNo, item.credit);
                      }
                    });
                    const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                    return (
                      <span className="font-bold text-blue-600">
                        ฿{formatCurrency(total)}
                      </span>
                    );
                  },
                  amount: (data) => {
                    const uniqueDocs = new Map();
                    data.forEach(item => {
                      if (!uniqueDocs.has(item.docNo)) {
                        uniqueDocs.set(item.docNo, item.amount);
                      }
                    });
                    const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                    return (
                      <span className="font-bold text-green-600">
                        ฿{formatCurrency(total)}
                      </span>
                    );
                  },
                },
              }}
            />
          );
        }

        // ทั้งหมด → show all details with account name
        if (allRevenueLoading) {
          return <TableSkeleton rows={15} />;
        }

        const allRevenueColumns: ColumnDef<AccountProductItem>[] = [
          {
            key: 'docDate',
            header: 'วันที่',
            sortable: true,
            align: 'center',
            render: (item) => formatDate(item.docDate),
          },
          {
            key: 'docNo',
            header: 'เลขที่เอกสาร',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.docNo}</span>,
          },
          {
            key: 'accountName',
            header: 'ผังบัญชี',
            sortable: true,
            align: 'left',
            render: (item) => (
              <div className="flex flex-col">
                <span className="font-medium text-sm">{item.accountName}</span>
                <span className="font-mono text-xs text-muted-foreground">{item.accountCode}</span>
              </div>
            ),
          },
          {
            key: 'itemCode',
            header: 'รหัสสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.itemCode}</span>,
          },
          {
            key: 'itemName',
            header: 'ชื่อสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => (
              <span className={item.itemName === 'ไม่มีรายการสินค้า' ? 'text-muted-foreground italic' : ''}>
                {item.itemName}
              </span>
            ),
          },
          {
            key: 'qty',
            header: 'จำนวน',
            sortable: true,
            align: 'right',
            render: (item) => item.qty > 0 ? (item.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
          },
          {
            key: 'price',
            header: 'ราคา',
            sortable: true,
            align: 'right',
            render: (item) => item.price > 0 ? formatCurrency(item.price) : '-',
          },
          {
            key: 'credit',
            header: 'เครดิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-blue-600">
                {item.credit > 0 ? `฿${formatCurrency(item.credit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'amount',
            header: 'ยอดสุทธิ',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className={`font-semibold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ฿{formatCurrency(Math.abs(item.amount))}
              </span>
            ),
          },
        ];

        return (
          <PaginatedTable
            data={allRevenueDetails || []}
            columns={allRevenueColumns}
            itemsPerPage={20}
            emptyMessage="ไม่มีข้อมูลรายได้"
            defaultSortKey="docDate"
            defaultSortOrder="desc"
            keyExtractor={(item, index) => `${item.docNo}-${item.accountCode || 'na'}-${item.itemCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 5,
              values: {
                qty: (data) => <span className="font-medium">{data.reduce((s, i) => s + i.qty, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
                price: () => <span className="text-muted-foreground">-</span>,
                credit: (data) => {
                  const uniqueDocs = new Map();
                  data.forEach(item => {
                    const key = `${item.docNo}-${item.accountCode || 'na'}`;
                    if (!uniqueDocs.has(key)) {
                      uniqueDocs.set(key, item.credit);
                    }
                  });
                  const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum+ val, 0);
                  return (
                    <span className="font-bold text-blue-600">
                      ฿{formatCurrency(total)}
                    </span>
                  );
                },
                amount: (data) => {
                  const uniqueDocs = new Map();
                  data.forEach(item => {
                    const key = `${item.docNo}-${item.accountCode || 'na'}`;
                    if (!uniqueDocs.has(key)) {
                      uniqueDocs.set(key, item.amount);
                    }
                  });
                  const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                  return (
                    <span className="font-bold text-green-600">
                      ฿{formatCurrency(total)}
                    </span>
                  );
                },
              },
            }}
          />
        );
      }

      case 'expense-breakdown': {
        const expenseListColumns: ColumnDef<CategoryBreakdown>[] = [
          {
            key: 'accountGroup',
            header: 'รหัสบัญชี',
            sortable: true,
            align: 'left',
            render: (item: CategoryBreakdown) => (
              <span className="font-mono text-xs">{item.accountGroup}</span>
            ),
          },
          {
            key: 'accountName',
            header: 'ชื่อบัญชี',
            sortable: true,
            align: 'left',
            render: (item: CategoryBreakdown) => (
              <span className="font-medium">{item.accountName}</span>
            ),
          },
          {
            key: 'amount',
            header: 'ยอดค่าใช้จ่าย',
            sortable: true,
            align: 'right',
            render: (item: CategoryBreakdown) => (
              <span className="font-medium text-red-600">฿{formatCurrency(item.amount)}</span>
            ),
          },
          {
            key: 'percentage',
            header: 'สัดส่วน',
            sortable: true,
            align: 'right',
            render: (item: CategoryBreakdown) => (
              <span className="text-muted-foreground">{item.percentage.toFixed(1)}%</span>
            ),
          },
        ];
        const expenseProductColumns: ColumnDef<AccountProductItem>[] = [
          {
            key: 'docDate',
            header: 'วันที่',
            sortable: true,
            align: 'center',
            render: (item) => formatDate(item.docDate),
          },
          {
            key: 'docNo',
            header: 'เลขที่เอกสาร',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.docNo}</span>,
          },
          {
            key: 'itemCode',
            header: 'รหัสสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.itemCode}</span>,
          },
          {
            key: 'itemName',
            header: 'ชื่อสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => (
              <span className={item.itemName === 'ไม่มีรายการสินค้า' ? 'text-muted-foreground italic' : ''}>
                {item.itemName}
              </span>
            ),
          },
          {
            key: 'qty',
            header: 'จำนวน',
            sortable: true,
            align: 'right',
            render: (item) => item.qty > 0 ? (item.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
          },
          {
            key: 'price',
            header: 'ราคา',
            sortable: true,
            align: 'right',
            render: (item) => item.price > 0 ? formatCurrency(item.price) : '-',
          },
          {
            key: 'debit',
            header: 'เดบิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-orange-600">
                {item.debit > 0 ? `฿${formatCurrency(item.debit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'credit',
            header: 'เครดิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-blue-600">
                {item.credit > 0 ? `฿${formatCurrency(item.credit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'amount',
            header: 'ยอดสุทธิ',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className={`font-semibold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ฿{formatCurrency(Math.abs(item.amount))}
              </span>
            ),
          },
        ];

        // Dropdown selected → show documents for that account
        if (selectedAccountCode) {
          return productsLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <PaginatedTable
              data={accountProducts || []}
              columns={expenseProductColumns}
              itemsPerPage={15}
              emptyMessage="ไม่พบเอกสารในผังบัญชีนี้"
              defaultSortKey="docDate"
              defaultSortOrder="desc"
              keyExtractor={(item, index) => `${item.docNo}-${item.itemCode}-${index}`}
              showSummary={true}
              summaryConfig={{
                labelColSpan: 4,
                values: {
                  qty: (data) => <span className="font-medium">{data.reduce((s, i) => s + i.qty, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
                  price: () => <span className="text-muted-foreground">-</span>,
                  debit: (data) => (
                    <span className="font-bold text-orange-600">
                      ฿{formatCurrency(data.reduce((s, i) => s + i.debit, 0))}
                    </span>
                  ),
                  credit: (data) => (
                    <span className="font-bold text-blue-600">
                      ฿{formatCurrency(data.reduce((s, i) => s + i.credit, 0))}
                    </span>
                  ),
                  amount: (data) => (
                    <span className="font-bold text-red-600">
                      ฿{formatCurrency(Math.abs(data.reduce((s, i) => s + i.amount, 0)))}
                    </span>
                  ),
                },
              }}
            />
          );
        }

        // ทั้งหมด → show all expense details with account name
        if (allExpenseLoading) {
          return <TableSkeleton rows={15} />;
        }

        const allExpenseColumns: ColumnDef<AccountProductItem>[] = [
          {
            key: 'docDate',
            header: 'วันที่',
            sortable: true,
            align: 'center',
            render: (item) => formatDate(item.docDate),
          },
          {
            key: 'docNo',
            header: 'เลขที่เอกสาร',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.docNo}</span>,
          },
          {
            key: 'accountName',
            header: 'ผังบัญชี',
            sortable: true,
            align: 'left',
            render: (item) => (
              <div className="flex flex-col">
                <span className="font-medium text-sm">{item.accountName}</span>
                <span className="font-mono text-xs text-muted-foreground">{item.accountCode}</span>
              </div>
            ),
          },
          {
            key: 'itemCode',
            header: 'รหัสสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.itemCode}</span>,
          },
          {
            key: 'itemName',
            header: 'ชื่อสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => (
              <span className={item.itemName === 'ไม่มีรายการสินค้า' ? 'text-muted-foreground italic' : ''}>
                {item.itemName}
              </span>
            ),
          },
          {
            key: 'qty',
            header: 'จำนวน',
            sortable: true,
            align: 'right',
            render: (item) => item.qty > 0 ? (item.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
          },
          {
            key: 'price',
            header: 'ราคา',
            sortable: true,
            align: 'right',
            render: (item) => item.price > 0 ? formatCurrency(item.price) : '-',
          },
          {
            key: 'debit',
            header: 'เดบิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-orange-600">
                {item.debit > 0 ? `฿${formatCurrency(item.debit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'amount',
            header: 'ยอดสุทธิ',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className={`font-semibold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ฿{formatCurrency(Math.abs(item.amount))}
              </span>
            ),
          },
        ];

        return (
          <PaginatedTable
            data={allExpenseDetails || []}
            columns={allExpenseColumns}
            itemsPerPage={20}
            emptyMessage="ไม่มีข้อมูลค่าใช้จ่าย"
            defaultSortKey="docDate"
            defaultSortOrder="desc"
            keyExtractor={(item, index) => `${item.docNo}-${item.accountCode || 'na'}-${item.itemCode}-${index}`}
            showSummary={true}
            summaryConfig={{
              labelColSpan: 5,
              values: {
                qty: (data) => <span className="font-medium">{data.reduce((s, i) => s + i.qty, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
                price: () => <span className="text-muted-foreground">-</span>,
                debit: (data) => {
                  const uniqueDocs = new Map();
                  data.forEach(item => {
                    const key = `${item.docNo}-${item.accountCode || 'na'}`;
                    if (!uniqueDocs.has(key)) {
                      uniqueDocs.set(key, item.debit);
                    }
                  });
                  const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                  return (
                    <span className="font-bold text-orange-600">
                      ฿{formatCurrency(total)}
                    </span>
                  );
                },
                amount: (data) => {
                  const uniqueDocs = new Map();
                  data.forEach(item => {
                    const key = `${item.docNo}-${item.accountCode}`;
                    if (!uniqueDocs.has(key)) {
                      uniqueDocs.set(key, item.amount);
                    }
                  });
                  const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                  return (
                    <span className="font-bold text-red-600">
                      ฿{formatCurrency(Math.abs(total))}
                    </span>
                  );
                },
              },
            }}
          />
        );
      }

      case 'chart-of-accounts': {
        const accountTypeLabel: Record<string, string> = {
          INCOME: 'รายได้', EXPENSES: 'ค่าใช้จ่าย',
          ASSETS: 'สินทรัพย์', LIABILITIES: 'หนี้สิน', EQUITY: 'ส่วนของผู้ถือหุ้น',
        };
        const accountTypeColor: Record<string, string> = {
          INCOME: 'bg-green-100 text-green-700',
          EXPENSES: 'bg-red-100 text-red-700',
          ASSETS: 'bg-blue-100 text-blue-700',
          LIABILITIES: 'bg-orange-100 text-orange-700',
          EQUITY: 'bg-purple-100 text-purple-700',
        };
        const accountListColumns: import('@/components/PaginatedTable').ColumnDef<ChartOfAccountItem>[] = [
          {
            key: 'accountCode',
            header: 'รหัสบัญชี',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.accountCode}</span>,
          },
          {
            key: 'accountName',
            header: 'ชื่อบัญชี',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-medium">{item.accountName}</span>,
          },
          {
            key: 'accountType',
            header: 'ประเภท',
            sortable: true,
            align: 'center',
            render: (item) => (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                accountTypeColor[item.accountType] || 'bg-secondary text-secondary-foreground'
              }`}>
                {accountTypeLabel[item.accountType] || item.accountType}
              </span>
            ),
          },
          {
            key: 'netAmount',
            header: 'ยอดรายได้',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className={`font-medium ${item.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ฿{formatCurrency(item.netAmount)}
              </span>
            ),
          },
          {
            key: 'docCount',
            header: 'จำนวนเอกสาร',
            sortable: true,
            align: 'right',
            render: (item) => formatNumber(item.docCount),
          },
        ];
        const productColumns: import('@/components/PaginatedTable').ColumnDef<AccountProductItem>[] = [
          {
            key: 'docDate',
            header: 'วันที่',
            sortable: true,
            align: 'center',
            render: (item) => formatDate(item.docDate),
          },
          {
            key: 'docNo',
            header: 'เลขที่เอกสาร',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.docNo}</span>,
          },
          {
            key: 'itemCode',
            header: 'รหัสสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => <span className="font-mono text-xs">{item.itemCode}</span>,
          },
          {
            key: 'itemName',
            header: 'ชื่อสินค้า',
            sortable: true,
            align: 'left',
            render: (item) => (
              <span className={item.itemName === 'ไม่มีรายการสินค้า' ? 'text-muted-foreground italic' : ''}>
                {item.itemName}
              </span>
            ),
          },
          {
            key: 'qty',
            header: 'จำนวน',
            sortable: true,
            align: 'right',
            render: (item) => item.qty > 0 ? (item.qty).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
          },
          {
            key: 'price',
            header: 'ราคา',
            sortable: true,
            align: 'right',
            render: (item) => item.price > 0 ? formatCurrency(item.price) : '-',
          },
          {
            key: 'debit',
            header: 'เดบิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-orange-600">
                {item.debit > 0 ? `฿${formatCurrency(item.debit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'credit',
            header: 'เครดิต',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className="font-medium text-blue-600">
                {item.credit > 0 ? `฿${formatCurrency(item.credit)}` : '-'}
              </span>
            ),
          },
          {
            key: 'amount',
            header: 'ยอดสุทธิ',
            sortable: true,
            align: 'right',
            render: (item) => (
              <span className={`font-semibold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ฿{formatCurrency(Math.abs(item.amount))}
              </span>
            ),
          },
        ];
        const selectedAccount = chartOfAccountsList.find(a => a.accountCode === selectedAccountCode);
        return (
          <div className="space-y-0">
            {/* Top: Account list — clickable rows as category selector */}
            <PaginatedTable
              data={chartOfAccountsList}
              columns={accountListColumns}
              itemsPerPage={10}
              emptyMessage="ไม่มีข้อมูลผังบัญชี"
              defaultSortKey="netAmount"
              defaultSortOrder="desc"
              keyExtractor={(item) => item.accountCode}
              showSummary={true}
              summaryConfig={{
                labelColSpan: 3,
                values: {
                  netAmount: (data) => (
                    <span className="font-bold text-green-600">
                      ฿{formatCurrency(data.reduce((s, i) => s + i.netAmount, 0))}
                    </span>
                  ),
                  docCount: (data) => (
                    <span className="font-bold">{formatNumber(data.reduce((s, i) => s + i.docCount, 0))}</span>
                  ),
                },
              }}
              onRowClick={(item) =>
                setSelectedAccountCode(selectedAccountCode === item.accountCode ? '' : item.accountCode)
              }
              rowClassName={(item) =>
                item.accountCode === selectedAccountCode
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : ''
              }
            />
            {/* Bottom: Products for selected account */}
            {selectedAccountCode && (
              <div className="border-t-2 border-primary/30 pt-4 mt-2 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm">
                      {selectedAccount?.accountName || selectedAccountCode}
                    </span>
                    {selectedAccount && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        accountTypeColor[selectedAccount.accountType] || 'bg-secondary text-secondary-foreground'
                      }`}>
                        {accountTypeLabel[selectedAccount.accountType] || selectedAccount.accountType}
                      </span>
                    )}
                  </div>
                  {selectedAccount && (
                    <span className="text-muted-foreground text-xs">
                      ยอดสุทธิ: <span className="font-medium text-foreground">฿{formatCurrency(selectedAccount.netAmount)}</span>
                      {' · '}
                      เอกสาร: <span className="font-medium text-foreground">{formatNumber(selectedAccount.docCount)}</span>
                    </span>
                  )}
                </div>
                {productsLoading ? (
                  <TableSkeleton rows={6} />
                ) : (
                  <PaginatedTable
                    data={accountProducts || []}
                    columns={productColumns}
                    itemsPerPage={15}
                    emptyMessage="ไม่พบเอกสารในผังบัญชีนี้"
                    defaultSortKey="docDate"
                    defaultSortOrder="desc"
                    keyExtractor={(item, index) => `${item.docNo}-${item.itemCode}-${index}`}
                    showSummary={true}
                    summaryConfig={{
                      labelColSpan: 4,
                      values: {
                        qty: (data) => <span className="font-medium">{data.reduce((s, i) => s + i.qty, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
                        price: () => <span className="text-muted-foreground">-</span>,
                        debit: (data) => {
                          const uniqueDocs = new Map();
                          data.forEach(item => {
                            if (!uniqueDocs.has(item.docNo)) {
                              uniqueDocs.set(item.docNo, item.debit);
                            }
                          });
                          const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                          return (
                            <span className="font-bold text-orange-600">
                              ฿{formatCurrency(total)}
                            </span>
                          );
                        },
                        credit: (data) => {
                          const uniqueDocs = new Map();
                          data.forEach(item => {
                            if (!uniqueDocs.has(item.docNo)) {
                              uniqueDocs.set(item.docNo, item.credit);
                            }
                          });
                          const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                          return (
                            <span className="font-bold text-blue-600">
                              ฿{formatCurrency(total)}
                            </span>
                          );
                        },
                        amount: (data) => {
                          const uniqueDocs = new Map();
                          data.forEach(item => {
                            if (!uniqueDocs.has(item.docNo)) {
                              uniqueDocs.set(item.docNo, item.amount);
                            }
                          });
                          const total = Array.from(uniqueDocs.values()).reduce((sum, val) => sum + val, 0);
                          return (
                            <span className="font-bold text-green-600">
                              ฿{formatCurrency(total)}
                            </span>
                          );
                        },
                      },
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      }
    }
  };

  // Get export function based on report type
  const getExportFunction = () => {
    switch (selectedReport) {
      case 'profit-loss': {
        // Period filtering helpers (same logic as ProfitLossDetailTable)
        const getPeriodKey = (monthStr: string) => {
          if (plFilter.periodType === 'yearly') return monthStr.substring(0, 4);
          return monthStr;
        };
        const getQuarterStr = (monthStr: string) => {
          const y = monthStr.substring(0, 4);
          const m = parseInt(monthStr.substring(5, 7), 10);
          const q = Math.ceil(m / 3);
          return `${y}-Q${q}`;
        };
        const getHalfYearStr = (monthStr: string) => {
          const y = monthStr.substring(0, 4);
          const m = parseInt(monthStr.substring(5, 7), 10);
          return `${y}-H${m <= 6 ? 1 : 2}`;
        };
        const isKeyInPeriodFilter = (pKey: string, filterStr: string) => {
          if (filterStr === '__all__') return true;
          if (plFilter.periodType === 'quarterly') {
            return pKey.includes('-') && getQuarterStr(pKey) === filterStr;
          }
          if (plFilter.periodType === 'half-yearly') {
            return pKey.includes('-') && getHalfYearStr(pKey) === filterStr;
          }
          return pKey === filterStr;
        };

        // Get all available periods
        const allAvailableKeys = Array.from(new Set(plDetailRows.map((r) => getPeriodKey(r.month)))).sort();

        // Filter periods based on selection
        let displayPeriods: string[] = [];
        let periodsA: string[] = [];
        let periodsB: string[] = [];

        if (plFilter.viewMode === 'normal') {
          if (plFilter.selectedPeriod) {
            displayPeriods = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, plFilter.selectedPeriod));
          } else {
            displayPeriods = allAvailableKeys;
          }
        } else {
          // comparison mode
          if (plFilter.compareA) {
            periodsA = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, plFilter.compareA));
          }
          if (plFilter.compareB) {
            periodsB = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, plFilter.compareB));
          }
          displayPeriods = [...periodsA, ...periodsB];
        }

        const allMonthsExport = displayPeriods;
        const empty = (m: string) => [m, ''] as [string, string];
        const formatPeriodLabelExport = (pKey: string) => {
          if (plFilter.periodType === 'yearly') return pKey;
          return formatMonth(pKey);
        };

        const rowBranchKeysExport = Array.from(new Set(plDetailRows.map((r) => r.branchKey).filter(Boolean))) as string[];
        const comparisonBranchesExport = (selectedBranches.includes('ALL')
          ? availableBranches
          : availableBranches.filter((branch) => selectedBranches.includes(branch.key)))
          .filter((branch) => rowBranchKeysExport.includes(branch.key));
        const showBranchComparisonExport = plFilter.viewMode === 'comparison' && comparisonBranchesExport.length > 0;

        if (showBranchComparisonExport) {
          type BranchAcc = {
            branchKey: string;
            plGroup: string;
            accountCode: string;
            accountName: string;
            byMonth: Record<string, number>;
          };

          const branchMap = new Map<string, BranchAcc>();
          for (const r of plDetailRows) {
            const branchKey = r.branchKey || 'UNKNOWN';
            const pKey = getPeriodKey(r.month);
            const key = `${branchKey}__${r.plGroup}__${r.accountCode}`;
            if (!branchMap.has(key)) {
              branchMap.set(key, {
                branchKey,
                plGroup: r.plGroup,
                accountCode: r.accountCode,
                accountName: r.accountName,
                byMonth: {},
              });
            }
            const entry = branchMap.get(key)!;
            entry.byMonth[pKey] = (entry.byMonth[pKey] || 0) + r.amount;
          }

          const branchPeriodKeys = comparisonBranchesExport.flatMap((branch) =>
            allMonthsExport.map((period, periodIndex) => ({
              key: `branch_${branch.key}_${period}_${periodIndex}`,
              branchKey: branch.key,
              period,
            }))
          );

          const uniqueAccounts = (group: string) => Array.from(
            new Map(
              Array.from(branchMap.values())
                .filter((account) => account.plGroup === group)
                .map((account) => [account.accountCode, account])
            ).values()
          ).sort((a, b) => a.accountCode.localeCompare(b.accountCode));

          const branchValue = (branchKey: string, group: string, accountCode: string, period: string) =>
            branchMap.get(`${branchKey}__${group}__${accountCode}`)?.byMonth[period] || 0;

          const branchGroupValue = (branchKey: string, group: string, period: string) => {
            let sum = 0;
            for (const [key, account] of branchMap.entries()) {
              if (key.startsWith(`${branchKey}__${group}__`)) {
                sum += account.byMonth[period] || 0;
              }
            }
            return sum;
          };

          const branchRevenue = (branchKey: string, period: string) => branchGroupValue(branchKey, 'INCOME', period);
          const branchCOGS = (branchKey: string, period: string) => branchGroupValue(branchKey, 'COGS', period);
          const branchOperating = (branchKey: string, period: string) => branchGroupValue(branchKey, 'OPERATING', period);
          const branchOtherExp = (branchKey: string, period: string) => branchGroupValue(branchKey, 'OTHER_EXPENSE', period);
          const branchGrossProfit = (branchKey: string, period: string) => branchRevenue(branchKey, period) - branchCOGS(branchKey, period);
          const branchNetProfit = (branchKey: string, period: string) =>
            branchGrossProfit(branchKey, period) - branchOperating(branchKey, period) - branchOtherExp(branchKey, period);

          const branchSummary = (values: (branchKey: string, period: string) => number) => {
            const branchTotals = comparisonBranchesExport.map((branch) =>
              allMonthsExport.reduce((sum, period) => sum + values(branch.key, period), 0)
            );
            return {
              total: branchTotals.reduce((sum, value) => sum + value, 0),
              diff: branchTotals.length >= 2 ? branchTotals[branchTotals.length - 1] - branchTotals[0] : 0,
            };
          };

          const makeBranchRow = (
            label: string,
            values: (branchKey: string, period: string) => number,
            accountCode = ''
          ): Record<string, unknown> => {
            const summary = branchSummary(values);
            return {
              accountCode,
              accountName: label,
              ...Object.fromEntries(branchPeriodKeys.map((column) => [column.key, values(column.branchKey, column.period)])),
              totalSum: summary.total,
              diff: summary.diff,
            };
          };

          const makeSectionRow = (label: string) => ({
            accountCode: '',
            accountName: `── ${label} ──`,
            ...Object.fromEntries(branchPeriodKeys.map((column) => [column.key, ''])),
            totalSum: '',
            diff: '',
          });

          const rows: Record<string, unknown>[] = [];
          const addGroup = (label: string, group: string, totalLabel: string, totalValues: (branchKey: string, period: string) => number) => {
            rows.push(makeSectionRow(label));
            uniqueAccounts(group).forEach((account) => {
              rows.push(makeBranchRow(
                account.accountName,
                (branchKey, period) => branchValue(branchKey, group, account.accountCode, period),
                account.accountCode
              ));
            });
            rows.push(makeBranchRow(totalLabel, totalValues));
          };

          addGroup('รายได้', 'INCOME', 'รายได้รวม', branchRevenue);
          addGroup('ต้นทุนขาย และหรือต้นทุนการให้บริการ', 'COGS', 'รวมต้นทุนขาย และหรือต้นทุนการให้บริการ', branchCOGS);
          rows.push(makeBranchRow('กำไรขั้นต้น', branchGrossProfit));
          addGroup('ค่าใช้จ่ายในการบริหาร', 'OPERATING', 'รวมค่าใช้จ่ายในการบริหาร', branchOperating);

          if (uniqueAccounts('OTHER_EXPENSE').length > 0) {
            addGroup('ค่าใช้จ่ายอื่น', 'OTHER_EXPENSE', 'รวมค่าใช้จ่ายอื่น', branchOtherExp);
          }

          rows.push(makeBranchRow('กำไร (ขาดทุน) สุทธิ', branchNetProfit));

          const branchHeaders: Record<string, string> = {
            accountCode: 'รหัสบัญชี',
            accountName: 'รายการ',
            ...Object.fromEntries(branchPeriodKeys.map((column) => [column.key, formatPeriodLabelExport(column.period)])),
            totalSum: 'ผลรวม',
            diff: 'ผลต่าง',
          };

          const branchColumnGroups = [
            { label: '', span: 2 },
            ...comparisonBranchesExport.map((branch) => ({ label: branch.name, span: allMonthsExport.length })),
            { label: '', span: 2 },
          ];

          const fmtPeriodLabel = (p: string) => p === '__all__' ? 'ทั้งหมด' : p;
          const subtitle = plFilter.compareA && plFilter.compareB
            ? withBranchSubtitle(`เปรียบเทียบ ${fmtPeriodLabel(plFilter.compareA)} กับ ${fmtPeriodLabel(plFilter.compareB)}`)
            : withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`);

          return () => exportStyledReport({
            data: rows,
            headers: branchHeaders,
            filename: 'รายงานงบกำไรขาดทุน',
            sheetName: 'Profit & Loss',
            title: 'รายงานงบกำไรขาดทุน',
            subtitle,
            currencyColumns: branchPeriodKeys.map((column) => column.key).concat(['totalSum', 'diff']),
            columnGroups: branchColumnGroups,
          });
        }
        
        const buildPLRows = () => {
          type Acc = { plGroup: string; accountCode: string; accountName: string; byMonth: Record<string, number> };
          const map = new Map<string, Acc>();
          for (const r of plDetailRows) {
            const key = `${r.plGroup}__${r.accountCode}`;
            const pKey = getPeriodKey(r.month);
            if (!map.has(key)) map.set(key, { plGroup: r.plGroup, accountCode: r.accountCode, accountName: r.accountName, byMonth: {} });
            const e = map.get(key)!;
            e.byMonth[pKey] = (e.byMonth[pKey] || 0) + r.amount;
          }
          const income    = Array.from(map.values()).filter((a) => a.plGroup === 'INCOME').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          const cogs      = Array.from(map.values()).filter((a) => a.plGroup === 'COGS').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          const operating = Array.from(map.values()).filter((a) => a.plGroup === 'OPERATING').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          const other     = Array.from(map.values()).filter((a) => a.plGroup === 'OTHER_EXPENSE').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          
          const sumMonth  = (accs: Acc[], m: string) => accs.reduce((s, a) => s + (a.byMonth[m] || 0), 0);
          const sumForPeriods = (accs: Acc[], periods: string[]) => periods.reduce((sum, p) => sum + sumMonth(accs, p), 0);
          const grandSum  = (accs: Acc[]) => sumForPeriods(accs, displayPeriods);
          const diffAmount = (accs: Acc[]) => {
            if (plFilter.viewMode !== 'comparison') return 0;
            return sumForPeriods(accs, periodsB) - sumForPeriods(accs, periodsA);
          };

          const rows: Record<string, unknown>[] = [];
          const blankRow = { accountCode: '', accountName: '', ...Object.fromEntries(allMonthsExport.map(empty)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) };
          
          // INCOME
          rows.push({ accountCode: '', accountName: '── รายได้ ──', ...Object.fromEntries(allMonthsExport.map(empty)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
          for (const a of income) { 
            const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
            const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
            rows.push({ 
              accountCode: a.accountCode, 
              accountName: a.accountName, 
              ...Object.fromEntries(allMonthsExport.map((m) => [m, a.byMonth[m] || 0])), 
              ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
            }); 
          }
          const revByM = Object.fromEntries(allMonthsExport.map((m) => [m, sumMonth(income, m)]));
          const grandRev = plFilter.viewMode === 'normal' ? grandSum(income) : sumForPeriods(income, periodsA) + sumForPeriods(income, periodsB);
          const diffRev = plFilter.viewMode === 'comparison' ? diffAmount(income) : undefined;
          rows.push({ accountCode: '', accountName: 'รายได้รวม', ...revByM, ...(plFilter.viewMode === 'normal' ? { total: grandRev } : { totalSum: grandRev, diff: diffRev }) });
          rows.push(blankRow);
          
          // COGS
          rows.push({ accountCode: '', accountName: '── ต้นทุนขาย และหรือต้นทุนการให้บริการ ──', ...Object.fromEntries(allMonthsExport.map(empty)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
          for (const a of cogs) { 
            const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
            const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
            rows.push({ 
              accountCode: a.accountCode, 
              accountName: a.accountName, 
              ...Object.fromEntries(allMonthsExport.map((m) => [m, a.byMonth[m] || 0])), 
              ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
            }); 
          }
          const cogsByM = Object.fromEntries(allMonthsExport.map((m) => [m, sumMonth(cogs, m)]));
          const grandCOGS = plFilter.viewMode === 'normal' ? grandSum(cogs) : sumForPeriods(cogs, periodsA) + sumForPeriods(cogs, periodsB);
          const diffCOGS = plFilter.viewMode === 'comparison' ? diffAmount(cogs) : undefined;
          rows.push({ accountCode: '', accountName: 'รวมต้นทุนขาย และหรือต้นทุนการให้บริการ', ...cogsByM, ...(plFilter.viewMode === 'normal' ? { total: grandCOGS } : { totalSum: grandCOGS, diff: diffCOGS }) });
          rows.push(blankRow);
          
          // GROSS PROFIT
          const grossByM = Object.fromEntries(allMonthsExport.map((m) => [m, (revByM[m] || 0) - (cogsByM[m] || 0)]));
          const grandGross = plFilter.viewMode === 'normal'
            ? grandRev - grandCOGS
            : (sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB)) + (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA));
          const diffGross = plFilter.viewMode === 'comparison'
            ? (sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB)) - (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA))
            : undefined;
          rows.push({ accountCode: '', accountName: 'กำไรขั้นต้น', ...grossByM, ...(plFilter.viewMode === 'normal' ? { total: grandGross } : { totalSum: grandGross, diff: diffGross }) });
          rows.push(blankRow);
          
          // OPERATING
          rows.push({ accountCode: '', accountName: '── ค่าใช้จ่ายในการดำเนินงาน ──', ...Object.fromEntries(allMonthsExport.map(empty)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
          for (const a of operating) { 
            const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
            const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
            rows.push({ 
              accountCode: a.accountCode, 
              accountName: a.accountName, 
              ...Object.fromEntries(allMonthsExport.map((m) => [m, a.byMonth[m] || 0])), 
              ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
            }); 
          }
          const opByM = Object.fromEntries(allMonthsExport.map((m) => [m, sumMonth(operating, m)]));
          const grandOp = plFilter.viewMode === 'normal' ? grandSum(operating) : sumForPeriods(operating, periodsA) + sumForPeriods(operating, periodsB);
          const diffOp = plFilter.viewMode === 'comparison' ? diffAmount(operating) : undefined;
          rows.push({ accountCode: '', accountName: 'รวมค่าใช้จ่ายในการดำเนินงาน', ...opByM, ...(plFilter.viewMode === 'normal' ? { total: grandOp } : { totalSum: grandOp, diff: diffOp }) });
          rows.push(blankRow);
          
          // OTHER EXPENSE
          let grandOther = 0;
          let diffOther: number | undefined = undefined;
          const otherByM: Record<string, number> = Object.fromEntries(allMonthsExport.map((m) => [m, 0]));
          if (other.length > 0) {
            rows.push({ accountCode: '', accountName: '── ค่าใช้จ่ายอื่น ──', ...Object.fromEntries(allMonthsExport.map(empty)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
            for (const a of other) { 
              const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
              const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
              rows.push({ 
                accountCode: a.accountCode, 
                accountName: a.accountName, 
                ...Object.fromEntries(allMonthsExport.map((m) => [m, a.byMonth[m] || 0])), 
                ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
              }); 
            }
            allMonthsExport.forEach((m) => { otherByM[m] = sumMonth(other, m); });
            grandOther = plFilter.viewMode === 'normal' ? grandSum(other) : sumForPeriods(other, periodsA) + sumForPeriods(other, periodsB);
            diffOther = plFilter.viewMode === 'comparison' ? diffAmount(other) : undefined;
            rows.push({ accountCode: '', accountName: 'รวมค่าใช้จ่ายอื่น', ...otherByM, ...(plFilter.viewMode === 'normal' ? { total: grandOther } : { totalSum: grandOther, diff: diffOther }) });
            rows.push(blankRow);
          }
          
          // NET PROFIT
          const netByM = Object.fromEntries(allMonthsExport.map((m) => [m, (grossByM[m] || 0) - (opByM[m] || 0) - (otherByM[m] || 0)]));
          const grandNet = plFilter.viewMode === 'normal'
            ? grandGross - grandOp - grandOther
            : ((sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB) - sumForPeriods(operating, periodsB) - sumForPeriods(other, periodsB)) +
               (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA) - sumForPeriods(operating, periodsA) - sumForPeriods(other, periodsA)));
          const diffNet = plFilter.viewMode === 'comparison'
            ? ((sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB) - sumForPeriods(operating, periodsB) - sumForPeriods(other, periodsB)) -
               (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA) - sumForPeriods(operating, periodsA) - sumForPeriods(other, periodsA)))
            : undefined;
          rows.push({ accountCode: '', accountName: 'กำไร (ขาดทุน) สุทธิ', ...netByM, ...(plFilter.viewMode === 'normal' ? { total: grandNet } : { totalSum: grandNet, diff: diffNet }) });
          return rows;
        };
        
        const plExportRows = buildPLRows();
        const baseHeaders: Record<string, string> = { 
          accountCode: 'รหัสบัญชี', 
          accountName: 'ผังบัญชี', 
          ...Object.fromEntries(allMonthsExport.map((m) => [m, formatMonth(m)]))
        };
        const plHeaders = plFilter.viewMode === 'normal'
          ? { ...baseHeaders, total: 'รวม' }
          : { ...baseHeaders, totalSum: 'ผลรวม', diff: 'ผลต่าง' };
        
        const currencyCols = plFilter.viewMode === 'normal'
          ? allMonthsExport.concat(['total'])
          : allMonthsExport.concat(['totalSum', 'diff']);
        
        const fmtPeriodLabelExcel = (p: string) => p === '__all__' ? 'ทั้งหมด' : p;
        const subtitle = plFilter.viewMode === 'comparison' && plFilter.compareA && plFilter.compareB
          ? withBranchSubtitle(`เปรียบเทียบ ${fmtPeriodLabelExcel(plFilter.compareA)} กับ ${fmtPeriodLabelExcel(plFilter.compareB)}`)
          : withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`);
        
        return () => exportStyledReport({ 
          data: plExportRows, 
          headers: plHeaders, 
          filename: 'รายงานงบกำไรขาดทุน', 
          sheetName: 'Profit & Loss', 
          title: 'รายงานงบกำไรขาดทุน', 
          subtitle, 
          currencyColumns: currencyCols 
        });
      }

      case 'balance-sheet':
        return () => exportStyledReport({
          data: balanceSheetTypeFilter === 'all'
            ? balanceSheetData
            : balanceSheetData.filter(item => item.typeName === balanceSheetTypeFilter),
          headers: { accountCode: 'รหัสบัญชี', accountName: 'ชื่อบัญชี', typeName: 'ประเภท', balance: 'ยอดคงเหลือ' },
          filename: 'รายงานงบดุล',
          sheetName: 'Balance Sheet',
          title: 'รายงานงบดุล',
          subtitle: withBranchSubtitle(`ณ วันที่ ${dateRange.end}`),
          currencyColumns: ['balance'],
          summaryConfig: {
            columns: {
              balance: 'sum',
            }
          }
        });

      case 'cash-flow':
        return () => exportStyledReport({
          data: cashFlowData,
          headers: { activityType: 'ประเภทกิจกรรม', revenue: 'เงินสดรับ', expenses: 'เงินสดจ่าย', netCashFlow: 'กระแสเงินสดสุทธิ' },
          filename: 'รายงานงบกระแสเงินสด',
          sheetName: 'Cash Flow',
          title: 'รายงานงบกระแสเงินสด',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['revenue', 'expenses', 'netCashFlow'],
          summaryConfig: {
            columns: {
              revenue: 'sum',
              expenses: 'sum',
              netCashFlow: 'sum',
            }
          }
        });

      case 'ar-aging':
        return () => exportStyledReport({
          data: arAgingData,
          headers: { docNo: 'เลขที่เอกสาร', code: 'รหัส', name: 'ลูกค้า', dueDate: 'วันครบกำหนด', outstanding: 'ยอดค้างชำระ', agingBucket: 'อายุหนี้' },
          filename: 'รายงานอายุลูกหนี้',
          sheetName: 'AR Aging',
          title: 'รายงานอายุลูกหนี้ (AR Aging)',
          subtitle: withBranchSubtitle(`ณ วันที่ ${new Date().toLocaleDateString('th-TH')}`),
          currencyColumns: ['outstanding'],
          summaryConfig: {
            columns: {
              outstanding: 'sum',
            }
          }
        });

      case 'ap-aging':
        return () => exportStyledReport({
          data: apAgingData,
          headers: { docNo: 'เลขที่เอกสาร', code: 'รหัส', name: 'ซัพพลายเออร์', dueDate: 'วันครบกำหนด', outstanding: 'ยอดค้างชำระ', agingBucket: 'อายุหนี้' },
          filename: 'รายงานอายุเจ้าหนี้',
          sheetName: 'AP Aging',
          title: 'รายงานอายุเจ้าหนี้ (AP Aging)',
          subtitle: withBranchSubtitle(`ณ วันที่ ${new Date().toLocaleDateString('th-TH')}`),
          currencyColumns: ['outstanding'],
          summaryConfig: {
            columns: {
              outstanding: 'sum',
            }
          }
        });

      case 'revenue-breakdown':
        return () => {
          const dataToExport = selectedAccountCode ? (accountProducts || []) : (allRevenueDetails || []);
          const filename = selectedAccountCode 
            ? `รายงานรายได้-${selectedAccountCode}`
            : 'รายงานรายได้ตามผังบัญชี-รายละเอียด';
          const title = selectedAccountCode
            ? `รายงานรายได้: ${selectedAccountCode}`
            : 'รายงานรายได้ตามผังบัญชี (รายละเอียดทั้งหมด)';
          
          return exportStyledReport({
            data: dataToExport,
            headers: { 
              docDate: 'วันที่', 
              docNo: 'เลขที่เอกสาร', 
              accountCode: 'รหัสบัญชี',
              accountName: 'ผังบัญชี', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              credit: 'เครดิต', 
              amount: 'ยอดสุทธิ' 
            },
            filename,
            sheetName: 'Revenue Details',
            title,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['qty'],
            currencyColumns: ['price', 'credit', 'amount'],
            summaryConfig: { 
              columns: { 
                qty: 'sum',
                credit: 'sum',
                amount: 'sum' 
              } 
            }
          });
        };

      case 'expense-breakdown':
        return () => {
          const dataToExport = selectedAccountCode ? (accountProducts || []) : (allExpenseDetails || []);
          const filename = selectedAccountCode 
            ? `รายงานค่าใช้จ่าย-${selectedAccountCode}`
            : 'รายงานค่าใช้จ่ายตามผังบัญชี-รายละเอียด';
          const title = selectedAccountCode
            ? `รายงานค่าใช้จ่าย: ${selectedAccountCode}`
            : 'รายงานค่าใช้จ่ายตามผังบัญชี (รายละเอียดทั้งหมด)';
          
          return exportStyledReport({
            data: dataToExport,
            headers: { 
              docDate: 'วันที่', 
              docNo: 'เลขที่เอกสาร', 
              accountCode: 'รหัสบัญชี',
              accountName: 'ผังบัญชี', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              debit: 'เดบิต', 
              amount: 'ยอดสุทธิ' 
            },
            filename,
            sheetName: 'Expense Details',
            title,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['qty'],
            currencyColumns: ['price', 'debit', 'amount'],
            summaryConfig: { 
              columns: { 
                qty: 'sum',
                debit: 'sum',
                amount: 'sum' 
              } 
            }
          });
        };

      case 'chart-of-accounts':
        if (!selectedAccountCode || !accountProducts?.length) return undefined;
        return () => exportStyledReport({
          data: accountProducts,
          headers: {
            docDate: 'วันที่',
            docNo: 'เลขที่เอกสาร',
            itemCode: 'รหัสสินค้า',
            itemName: 'ชื่อสินค้า',
            categoryName: 'หมวดสินค้า',
            unitCode: 'หน่วย',
            qty: 'จำนวน',
            price: 'ราคา',
            totalSales: 'ยอดขาย',
          },
          filename: `ยอดขายตามผังบัญชี-${selectedAccountCode}`,
          sheetName: 'Account Products',
          title: `ยอดขายตามผังบัญชี: ${selectedAccountCode}`,
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['price', 'totalSales'],
          summaryConfig: { columns: { qty: 'sum', totalSales: 'sum' } },
        });

      default:
        return undefined;
    }
  };

  const getExportPdfFunction = () => {
    switch (selectedReport) {
      case 'profit-loss': {
        // Period filtering helpers (same logic as ProfitLossDetailTable and Excel export)
        const getPeriodKey = (monthStr: string) => {
          if (plFilter.periodType === 'yearly') return monthStr.substring(0, 4);
          return monthStr;
        };
        const getQuarterStr = (monthStr: string) => {
          const y = monthStr.substring(0, 4);
          const m = parseInt(monthStr.substring(5, 7), 10);
          const q = Math.ceil(m / 3);
          return `${y}-Q${q}`;
        };
        const getHalfYearStr = (monthStr: string) => {
          const y = monthStr.substring(0, 4);
          const m = parseInt(monthStr.substring(5, 7), 10);
          return `${y}-H${m <= 6 ? 1 : 2}`;
        };
        const isKeyInPeriodFilter = (pKey: string, filterStr: string) => {
          if (filterStr === '__all__') return true;
          if (plFilter.periodType === 'quarterly') {
            return pKey.includes('-') && getQuarterStr(pKey) === filterStr;
          }
          if (plFilter.periodType === 'half-yearly') {
            return pKey.includes('-') && getHalfYearStr(pKey) === filterStr;
          }
          return pKey === filterStr;
        };

        // Get all available periods
        const allAvailableKeys = Array.from(new Set(plDetailRows.map((r) => getPeriodKey(r.month)))).sort();

        // Filter periods based on selection
        let displayPeriods: string[] = [];
        let periodsA: string[] = [];
        let periodsB: string[] = [];

        if (plFilter.viewMode === 'normal') {
          if (plFilter.selectedPeriod) {
            displayPeriods = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, plFilter.selectedPeriod));
          } else {
            displayPeriods = allAvailableKeys;
          }
        } else {
          // comparison mode
          if (plFilter.compareA) {
            periodsA = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, plFilter.compareA));
          }
          if (plFilter.compareB) {
            periodsB = allAvailableKeys.filter((p) => isKeyInPeriodFilter(p, plFilter.compareB));
          }
          displayPeriods = [...periodsA, ...periodsB];
        }

        const allMonthsExportPdf = displayPeriods;
        const empty2 = (m: string) => [m, ''] as [string, string];
        const formatPeriodLabelPdf = (pKey: string) => {
          if (plFilter.periodType === 'yearly') return pKey;
          return formatMonth(pKey);
        };

        const rowBranchKeysPdf = Array.from(new Set(plDetailRows.map((r) => r.branchKey).filter(Boolean))) as string[];
        const comparisonBranchesPdf = (selectedBranches.includes('ALL')
          ? availableBranches
          : availableBranches.filter((branch) => selectedBranches.includes(branch.key)))
          .filter((branch) => rowBranchKeysPdf.includes(branch.key));
        const showBranchComparisonExportPdf = plFilter.viewMode === 'comparison' && comparisonBranchesPdf.length > 0;

        if (showBranchComparisonExportPdf) {
          type BranchAcc = {
            branchKey: string;
            plGroup: string;
            accountCode: string;
            accountName: string;
            byMonth: Record<string, number>;
          };

          const branchMap = new Map<string, BranchAcc>();
          for (const r of plDetailRows) {
            const branchKey = r.branchKey || 'UNKNOWN';
            const pKey = getPeriodKey(r.month);
            const key = `${branchKey}__${r.plGroup}__${r.accountCode}`;
            if (!branchMap.has(key)) {
              branchMap.set(key, {
                branchKey,
                plGroup: r.plGroup,
                accountCode: r.accountCode,
                accountName: r.accountName,
                byMonth: {},
              });
            }
            const entry = branchMap.get(key)!;
            entry.byMonth[pKey] = (entry.byMonth[pKey] || 0) + r.amount;
          }

          const branchPeriodKeys = comparisonBranchesPdf.flatMap((branch) =>
            allMonthsExportPdf.map((period, periodIndex) => ({
              key: `branch_${branch.key}_${period}_${periodIndex}`,
              branchKey: branch.key,
              period,
            }))
          );

          const uniqueAccounts = (group: string) => Array.from(
            new Map(
              Array.from(branchMap.values())
                .filter((account) => account.plGroup === group)
                .map((account) => [account.accountCode, account])
            ).values()
          ).sort((a, b) => a.accountCode.localeCompare(b.accountCode));

          const branchValue = (branchKey: string, group: string, accountCode: string, period: string) =>
            branchMap.get(`${branchKey}__${group}__${accountCode}`)?.byMonth[period] || 0;

          const branchGroupValue = (branchKey: string, group: string, period: string) => {
            let sum = 0;
            for (const [key, account] of branchMap.entries()) {
              if (key.startsWith(`${branchKey}__${group}__`)) {
                sum += account.byMonth[period] || 0;
              }
            }
            return sum;
          };

          const branchRevenue = (branchKey: string, period: string) => branchGroupValue(branchKey, 'INCOME', period);
          const branchCOGS = (branchKey: string, period: string) => branchGroupValue(branchKey, 'COGS', period);
          const branchOperating = (branchKey: string, period: string) => branchGroupValue(branchKey, 'OPERATING', period);
          const branchOtherExp = (branchKey: string, period: string) => branchGroupValue(branchKey, 'OTHER_EXPENSE', period);
          const branchGrossProfit = (branchKey: string, period: string) => branchRevenue(branchKey, period) - branchCOGS(branchKey, period);
          const branchNetProfit = (branchKey: string, period: string) =>
            branchGrossProfit(branchKey, period) - branchOperating(branchKey, period) - branchOtherExp(branchKey, period);

          const branchSummary = (values: (branchKey: string, period: string) => number) => {
            const branchTotals = comparisonBranchesPdf.map((branch) =>
              allMonthsExportPdf.reduce((sum, period) => sum + values(branch.key, period), 0)
            );
            return {
              total: branchTotals.reduce((sum, value) => sum + value, 0),
              diff: branchTotals.length >= 2 ? branchTotals[branchTotals.length - 1] - branchTotals[0] : 0,
            };
          };

          const makeBranchRow = (
            label: string,
            values: (branchKey: string, period: string) => number,
            accountCode = ''
          ): Record<string, unknown> => {
            const summary = branchSummary(values);
            return {
              accountCode,
              accountName: label,
              ...Object.fromEntries(branchPeriodKeys.map((column) => [column.key, values(column.branchKey, column.period)])),
              totalSum: summary.total,
              diff: summary.diff,
            };
          };

          const makeSectionRow = (label: string) => ({
            accountCode: '',
            accountName: `── ${label} ──`,
            ...Object.fromEntries(branchPeriodKeys.map((column) => [column.key, ''])),
            totalSum: '',
            diff: '',
          });

          const rows: Record<string, unknown>[] = [];
          const addGroup = (label: string, group: string, totalLabel: string, totalValues: (branchKey: string, period: string) => number) => {
            rows.push(makeSectionRow(label));
            uniqueAccounts(group).forEach((account) => {
              rows.push(makeBranchRow(
                account.accountName,
                (branchKey, period) => branchValue(branchKey, group, account.accountCode, period),
                account.accountCode
              ));
            });
            rows.push(makeBranchRow(totalLabel, totalValues));
          };

          addGroup('รายได้', 'INCOME', 'รายได้รวม', branchRevenue);
          addGroup('ต้นทุนขาย และหรือต้นทุนการให้บริการ', 'COGS', 'รวมต้นทุนขาย และหรือต้นทุนการให้บริการ', branchCOGS);
          rows.push(makeBranchRow('กำไรขั้นต้น', branchGrossProfit));
          addGroup('ค่าใช้จ่ายในการบริหาร', 'OPERATING', 'รวมค่าใช้จ่ายในการบริหาร', branchOperating);

          if (uniqueAccounts('OTHER_EXPENSE').length > 0) {
            addGroup('ค่าใช้จ่ายอื่น', 'OTHER_EXPENSE', 'รวมค่าใช้จ่ายอื่น', branchOtherExp);
          }

          rows.push(makeBranchRow('กำไร (ขาดทุน) สุทธิ', branchNetProfit));

          const branchHeadersPdf: Record<string, string> = {
            accountCode: 'รหัสบัญชี',
            accountName: 'รายการ',
            ...Object.fromEntries(branchPeriodKeys.map((column) => [column.key, formatPeriodLabelPdf(column.period)])),
            totalSum: 'ผลรวม',
            diff: 'ผลต่าง',
          };

          const branchColumnGroupsPdf = [
            { label: '', span: 2 },
            ...comparisonBranchesPdf.map((branch) => ({ label: branch.name, span: allMonthsExportPdf.length })),
            { label: '', span: 2 },
          ];

          const fmtPeriodLabelPdfBranch = (p: string) => p === '__all__' ? 'ทั้งหมด' : p;
          const subtitlePdf = plFilter.compareA && plFilter.compareB
            ? withBranchSubtitle(`เปรียบเทียบ ${fmtPeriodLabelPdfBranch(plFilter.compareA)} กับ ${fmtPeriodLabelPdfBranch(plFilter.compareB)}`)
            : withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`);

          return () => exportStyledPdfReport({
            data: rows,
            headers: branchHeadersPdf,
            filename: 'รายงานงบกำไรขาดทุน',
            title: 'รายงานงบกำไรขาดทุน',
            subtitle: subtitlePdf,
            currencyColumns: branchPeriodKeys.map((column) => column.key).concat(['totalSum', 'diff']),
            columnGroups: branchColumnGroupsPdf,
          });
        }
        
        const buildPLRowsPdf = () => {
          type Acc = { plGroup: string; accountCode: string; accountName: string; byMonth: Record<string, number> };
          const map = new Map<string, Acc>();
          for (const r of plDetailRows) {
            const key = `${r.plGroup}__${r.accountCode}`;
            const pKey = getPeriodKey(r.month);
            if (!map.has(key)) map.set(key, { plGroup: r.plGroup, accountCode: r.accountCode, accountName: r.accountName, byMonth: {} });
            const e = map.get(key)!;
            e.byMonth[pKey] = (e.byMonth[pKey] || 0) + r.amount;
          }
          const income    = Array.from(map.values()).filter((a) => a.plGroup === 'INCOME').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          const cogs      = Array.from(map.values()).filter((a) => a.plGroup === 'COGS').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          const operating = Array.from(map.values()).filter((a) => a.plGroup === 'OPERATING').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          const other     = Array.from(map.values()).filter((a) => a.plGroup === 'OTHER_EXPENSE').sort((a, b) => a.accountCode.localeCompare(b.accountCode));
          
          const sumMonth  = (accs: Acc[], m: string) => accs.reduce((s, a) => s + (a.byMonth[m] || 0), 0);
          const sumForPeriods = (accs: Acc[], periods: string[]) => periods.reduce((sum, p) => sum + sumMonth(accs, p), 0);
          const grandSum  = (accs: Acc[]) => sumForPeriods(accs, displayPeriods);
          const diffAmount = (accs: Acc[]) => {
            if (plFilter.viewMode !== 'comparison') return 0;
            return sumForPeriods(accs, periodsB) - sumForPeriods(accs, periodsA);
          };

          const rows: Record<string, unknown>[] = [];
          const blankRow = { accountCode: '', accountName: '', ...Object.fromEntries(allMonthsExportPdf.map(empty2)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) };
          
          // INCOME
          rows.push({ accountCode: '', accountName: '── รายได้ ──', ...Object.fromEntries(allMonthsExportPdf.map(empty2)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
          for (const a of income) { 
            const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
            const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
            rows.push({ 
              accountCode: a.accountCode, 
              accountName: a.accountName, 
              ...Object.fromEntries(allMonthsExportPdf.map((m) => [m, a.byMonth[m] || 0])), 
              ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
            }); 
          }
          const revByM = Object.fromEntries(allMonthsExportPdf.map((m) => [m, sumMonth(income, m)]));
          const grandRev = plFilter.viewMode === 'normal' ? grandSum(income) : sumForPeriods(income, periodsA) + sumForPeriods(income, periodsB);
          const diffRev = plFilter.viewMode === 'comparison' ? diffAmount(income) : undefined;
          rows.push({ accountCode: '', accountName: 'รายได้รวม', ...revByM, ...(plFilter.viewMode === 'normal' ? { total: grandRev } : { totalSum: grandRev, diff: diffRev }) });
          rows.push(blankRow);
          
          // COGS
          rows.push({ accountCode: '', accountName: '── ต้นทุนขาย และหรือต้นทุนการให้บริการ ──', ...Object.fromEntries(allMonthsExportPdf.map(empty2)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
          for (const a of cogs) { 
            const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
            const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
            rows.push({ 
              accountCode: a.accountCode, 
              accountName: a.accountName, 
              ...Object.fromEntries(allMonthsExportPdf.map((m) => [m, a.byMonth[m] || 0])), 
              ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
            }); 
          }
          const cogsByM = Object.fromEntries(allMonthsExportPdf.map((m) => [m, sumMonth(cogs, m)]));
          const grandCOGS = plFilter.viewMode === 'normal' ? grandSum(cogs) : sumForPeriods(cogs, periodsA) + sumForPeriods(cogs, periodsB);
          const diffCOGS = plFilter.viewMode === 'comparison' ? diffAmount(cogs) : undefined;
          rows.push({ accountCode: '', accountName: 'รวมต้นทุนขาย และหรือต้นทุนการให้บริการ', ...cogsByM, ...(plFilter.viewMode === 'normal' ? { total: grandCOGS } : { totalSum: grandCOGS, diff: diffCOGS }) });
          rows.push(blankRow);
          
          // GROSS PROFIT
          const grossByM = Object.fromEntries(allMonthsExportPdf.map((m) => [m, (revByM[m] || 0) - (cogsByM[m] || 0)]));
          const grandGross = plFilter.viewMode === 'normal'
            ? grandRev - grandCOGS
            : (sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB)) + (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA));
          const diffGross = plFilter.viewMode === 'comparison'
            ? (sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB)) - (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA))
            : undefined;
          rows.push({ accountCode: '', accountName: 'กำไรขั้นต้น', ...grossByM, ...(plFilter.viewMode === 'normal' ? { total: grandGross } : { totalSum: grandGross, diff: diffGross }) });
          rows.push(blankRow);
          
          // OPERATING
          rows.push({ accountCode: '', accountName: '── ค่าใช้จ่ายในการดำเนินงาน ──', ...Object.fromEntries(allMonthsExportPdf.map(empty2)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
          for (const a of operating) { 
            const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
            const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
            rows.push({ 
              accountCode: a.accountCode, 
              accountName: a.accountName, 
              ...Object.fromEntries(allMonthsExportPdf.map((m) => [m, a.byMonth[m] || 0])), 
              ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
            }); 
          }
          const opByM = Object.fromEntries(allMonthsExportPdf.map((m) => [m, sumMonth(operating, m)]));
          const grandOp = plFilter.viewMode === 'normal' ? grandSum(operating) : sumForPeriods(operating, periodsA) + sumForPeriods(operating, periodsB);
          const diffOp = plFilter.viewMode === 'comparison' ? diffAmount(operating) : undefined;
          rows.push({ accountCode: '', accountName: 'รวมค่าใช้จ่ายในการดำเนินงาน', ...opByM, ...(plFilter.viewMode === 'normal' ? { total: grandOp } : { totalSum: grandOp, diff: diffOp }) });
          rows.push(blankRow);
          
          // OTHER EXPENSE
          let grandOther = 0;
          let diffOther: number | undefined = undefined;
          const otherByM: Record<string, number> = Object.fromEntries(allMonthsExportPdf.map((m) => [m, 0]));
          if (other.length > 0) {
            rows.push({ accountCode: '', accountName: '── ค่าใช้จ่ายอื่น ──', ...Object.fromEntries(allMonthsExportPdf.map(empty2)), ...(plFilter.viewMode === 'normal' ? { total: '' } : { totalSum: '', diff: '' }) });
            for (const a of other) { 
              const t = plFilter.viewMode === 'normal' ? grandSum([a]) : sumForPeriods([a], periodsA) + sumForPeriods([a], periodsB);
              const d = plFilter.viewMode === 'comparison' ? diffAmount([a]) : undefined;
              rows.push({ 
                accountCode: a.accountCode, 
                accountName: a.accountName, 
                ...Object.fromEntries(allMonthsExportPdf.map((m) => [m, a.byMonth[m] || 0])), 
                ...(plFilter.viewMode === 'normal' ? { total: t } : { totalSum: t, diff: d })
              }); 
            }
            allMonthsExportPdf.forEach((m) => { otherByM[m] = sumMonth(other, m); });
            grandOther = plFilter.viewMode === 'normal' ? grandSum(other) : sumForPeriods(other, periodsA) + sumForPeriods(other, periodsB);
            diffOther = plFilter.viewMode === 'comparison' ? diffAmount(other) : undefined;
            rows.push({ accountCode: '', accountName: 'รวมค่าใช้จ่ายอื่น', ...otherByM, ...(plFilter.viewMode === 'normal' ? { total: grandOther } : { totalSum: grandOther, diff: diffOther }) });
            rows.push(blankRow);
          }
          
          // NET PROFIT
          const netByM = Object.fromEntries(allMonthsExportPdf.map((m) => [m, (grossByM[m] || 0) - (opByM[m] || 0) - (otherByM[m] || 0)]));
          const grandNet = plFilter.viewMode === 'normal'
            ? grandGross - grandOp - grandOther
            : ((sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB) - sumForPeriods(operating, periodsB) - sumForPeriods(other, periodsB)) +
               (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA) - sumForPeriods(operating, periodsA) - sumForPeriods(other, periodsA)));
          const diffNet = plFilter.viewMode === 'comparison'
            ? ((sumForPeriods(income, periodsB) - sumForPeriods(cogs, periodsB) - sumForPeriods(operating, periodsB) - sumForPeriods(other, periodsB)) -
               (sumForPeriods(income, periodsA) - sumForPeriods(cogs, periodsA) - sumForPeriods(operating, periodsA) - sumForPeriods(other, periodsA)))
            : undefined;
          rows.push({ accountCode: '', accountName: 'กำไร (ขาดทุน) สุทธิ', ...netByM, ...(plFilter.viewMode === 'normal' ? { total: grandNet } : { totalSum: grandNet, diff: diffNet }) });
          return rows;
        };
        
        const plExportRowsPdf = buildPLRowsPdf();
        const baseHeadersPdf: Record<string, string> = { 
          accountCode: 'รหัสบัญชี', 
          accountName: 'ผังบัญชี', 
          ...Object.fromEntries(allMonthsExportPdf.map((m) => [m, formatMonth(m)]))
        };
        const plHeadersPdf = plFilter.viewMode === 'normal'
          ? { ...baseHeadersPdf, total: 'รวม' }
          : { ...baseHeadersPdf, totalSum: 'ผลรวม', diff: 'ผลต่าง' };
        
        const currencyColsPdf = plFilter.viewMode === 'normal'
          ? allMonthsExportPdf.concat(['total'])
          : allMonthsExportPdf.concat(['totalSum', 'diff']);
        
        const fmtPeriodLabelPdf = (p: string) => p === '__all__' ? 'ทั้งหมด' : p;
        const subtitlePdf = plFilter.viewMode === 'comparison' && plFilter.compareA && plFilter.compareB
          ? withBranchSubtitle(`เปรียบเทียบ ${fmtPeriodLabelPdf(plFilter.compareA)} กับ ${fmtPeriodLabelPdf(plFilter.compareB)}`)
          : withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`);
        
        return () => exportStyledPdfReport({ 
          data: plExportRowsPdf, 
          headers: plHeadersPdf, 
          filename: 'รายงานงบกำไรขาดทุน', 
          title: 'รายงานงบกำไรขาดทุน', 
          subtitle: subtitlePdf, 
          currencyColumns: currencyColsPdf 
        });
      }

      case 'balance-sheet':
        return () => exportStyledPdfReport({
          data: balanceSheetTypeFilter === 'all'
            ? balanceSheetData
            : balanceSheetData.filter(item => item.typeName === balanceSheetTypeFilter),
          headers: { accountCode: 'รหัสบัญชี', accountName: 'ชื่อบัญชี', typeName: 'ประเภท', balance: 'ยอดคงเหลือ' },
          filename: 'รายงานงบดุล',
          title: 'รายงานงบดุล',
          subtitle: withBranchSubtitle(`ณ วันที่ ${dateRange.end}`),
          currencyColumns: ['balance'],
          summaryConfig: {
            columns: {
              balance: 'sum',
            }
          }
        });

      case 'cash-flow':
        return () => exportStyledPdfReport({
          data: cashFlowData,
          headers: { activityType: 'ประเภทกิจกรรม', revenue: 'เงินสดรับ', expenses: 'เงินสดจ่าย', netCashFlow: 'กระแสเงินสดสุทธิ' },
          filename: 'รายงานงบกระแสเงินสด',
          title: 'รายงานงบกระแสเงินสด',
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['revenue', 'expenses', 'netCashFlow'],
          summaryConfig: {
            columns: {
              revenue: 'sum',
              expenses: 'sum',
              netCashFlow: 'sum',
            }
          }
        });

      case 'ar-aging':
        return () => exportStyledPdfReport({
          data: arAgingData,
          headers: { docNo: 'เลขที่เอกสาร', code: 'รหัส', name: 'ลูกค้า', dueDate: 'วันครบกำหนด', outstanding: 'ยอดค้างชำระ', agingBucket: 'อายุหนี้' },
          filename: 'รายงานอายุลูกหนี้',
          title: 'รายงานอายุลูกหนี้ (AR Aging)',
          subtitle: withBranchSubtitle(`ณ วันที่ ${new Date().toLocaleDateString('th-TH')}`),
          currencyColumns: ['outstanding'],
          summaryConfig: {
            columns: {
              outstanding: 'sum',
            }
          }
        });

      case 'ap-aging':
        return () => exportStyledPdfReport({
          data: apAgingData,
          headers: { docNo: 'เลขที่เอกสาร', code: 'รหัส', name: 'ซัพพลายเออร์', dueDate: 'วันครบกำหนด', outstanding: 'ยอดค้างชำระ', agingBucket: 'อายุหนี้' },
          filename: 'รายงานอายุเจ้าหนี้',
          title: 'รายงานอายุเจ้าหนี้ (AP Aging)',
          subtitle: withBranchSubtitle(`ณ วันที่ ${new Date().toLocaleDateString('th-TH')}`),
          currencyColumns: ['outstanding'],
          summaryConfig: {
            columns: {
              outstanding: 'sum',
            }
          }
        });

      case 'revenue-breakdown':
        return () => {
          const dataToExport = selectedAccountCode ? (accountProducts || []) : (allRevenueDetails || []);
          const filename = selectedAccountCode 
            ? `รายงานรายได้-${selectedAccountCode}`
            : 'รายงานรายได้ตามผังบัญชี-รายละเอียด';
          const title = selectedAccountCode
            ? `รายงานรายได้: ${selectedAccountCode}`
            : 'รายงานรายได้ตามผังบัญชี (รายละเอียดทั้งหมด)';
          
          return exportStyledPdfReport({
            data: dataToExport,
            headers: { 
              docDate: 'วันที่', 
              docNo: 'เลขที่เอกสาร', 
              accountCode: 'รหัสบัญชี',
              accountName: 'ผังบัญชี', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              credit: 'เครดิต', 
              amount: 'ยอดสุทธิ' 
            },
            filename,
            title,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['qty'],
            currencyColumns: ['price', 'credit', 'amount'],
            summaryConfig: { 
              columns: { 
                qty: 'sum',
                credit: 'sum',
                amount: 'sum' 
              } 
            }
          });
        };

      case 'expense-breakdown':
        return () => {
          const dataToExport = selectedAccountCode ? (accountProducts || []) : (allExpenseDetails || []);
          const filename = selectedAccountCode 
            ? `รายงานค่าใช้จ่าย-${selectedAccountCode}`
            : 'รายงานค่าใช้จ่ายตามผังบัญชี-รายละเอียด';
          const title = selectedAccountCode
            ? `รายงานค่าใช้จ่าย: ${selectedAccountCode}`
            : 'รายงานค่าใช้จ่ายตามผังบัญชี (รายละเอียดทั้งหมด)';
          
          return exportStyledPdfReport({
            data: dataToExport,
            headers: { 
              docDate: 'วันที่', 
              docNo: 'เลขที่เอกสาร', 
              accountCode: 'รหัสบัญชี',
              accountName: 'ผังบัญชี', 
              itemCode: 'รหัสสินค้า', 
              itemName: 'ชื่อสินค้า', 
              qty: 'จำนวน', 
              price: 'ราคา', 
              debit: 'เดบิต', 
              amount: 'ยอดสุทธิ' 
            },
            filename,
            title,
            subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
            numberColumns: ['qty'],
            currencyColumns: ['price', 'debit', 'amount'],
            summaryConfig: { 
              columns: { 
                qty: 'sum',
                debit: 'sum',
                amount: 'sum' 
              } 
            }
          });
        };

      case 'chart-of-accounts':
        if (!selectedAccountCode || !accountProducts?.length) return undefined;
        return () => exportStyledPdfReport({
          data: accountProducts,
          headers: {
            accountCode: 'รหัสผังบัญชี',
            accountName: 'ผังบัญชี',
            docDate: 'วันที่',
            docNo: 'เลขที่เอกสาร',
            itemCode: 'รหัสสินค้า',
            itemName: 'ชื่อสินค้า',
            categoryName: 'หมวดสินค้า',
            unitCode: 'หน่วย',
            qty: 'จำนวน',
            price: 'ราคา',
            totalSales: 'ยอดขาย',
          },
          filename: `ยอดขายตามผังบัญชี-${selectedAccountCode}`,
          title: `ยอดขายตามผังบัญชี: ${selectedAccountCode}`,
          subtitle: withBranchSubtitle(`ช่วงวันที่ ${dateRange.start} ถึง ${dateRange.end}`),
          currencyColumns: ['price', 'totalSales'],
          summaryConfig: { columns: { qty: 'sum', totalSales: 'sum' } },
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
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">
              รายงานบัญชี
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              ข้อมูลรายงานทางบัญชีและการเงินในรูปแบบตาราง
            </p>
          </div>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Compact Report Type Selector */}
          <ReportTypeSelector
            value={selectedReport}
            options={reportOptions}
            onChange={(value) => {
              setSelectedReport(value as ReportType);
              setSelectedAccountCode('');
            }}
          />
          {showPeriodFilter && (
            <ReportPeriodFilter
              value={plFilter}
              onChange={setPlFilter}
              availableMonths={accountingAvailableMonths}
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
          headerExtra={selectedReport === 'balance-sheet' ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">ประเภท:</label>
              <SearchableSelect
                value={balanceSheetTypeFilter}
                onChange={setBalanceSheetTypeFilter}
                options={[
                  { value: 'all', label: 'ทั้งหมด' },
                  { value: 'สินทรัพย์', label: 'สินทรัพย์' },
                  { value: 'หนี้สิน', label: 'หนี้สิน' },
                  { value: 'ส่วนของผู้ถือหุ้น', label: 'ส่วนของผู้ถือหุ้น' },
                ]}
                className="w-full sm:w-[200px]"
              />
            </div>
          ) : selectedReport === 'revenue-breakdown' ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">ผังบัญชี:</label>
              <SearchableSelect
                value={selectedAccountCode || 'ALL'}
                onChange={(value) => setSelectedAccountCode(value === 'ALL' ? '' : value)}
                options={[
                  { value: 'ALL', label: 'ทั้งหมด' },
                  ...revenueBreakdown
                    .filter((acc, i, arr) => arr.findIndex((a) => a.accountGroup === acc.accountGroup) === i)
                    .map((acc) => ({ value: acc.accountGroup, label: acc.accountName })),
                ]}
                className="w-full sm:w-[250px]"
              />
            </div>
          ) : selectedReport === 'expense-breakdown' ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">ผังบัญชี:</label>
              <SearchableSelect
                value={selectedAccountCode || 'ALL'}
                onChange={(value) => setSelectedAccountCode(value === 'ALL' ? '' : value)}
                options={[
                  { value: 'ALL', label: 'ทั้งหมด' },
                  ...expenseBreakdown
                    .filter((acc, i, arr) => arr.findIndex((a) => a.accountGroup === acc.accountGroup) === i)
                    .map((acc) => ({ value: acc.accountGroup, label: acc.accountName })),
                ]}
                className="w-full sm:w-[250px]"
              />
            </div>
          ) : undefined}
          queryInfo={selectedReport === 'profit-loss' ? {
            query: getProfitLossQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'balance-sheet' ? {
            query: getBalanceSheetQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'cash-flow' ? {
            query: getCashFlowQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'ar-aging' ? {
            query: getARAgingQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'ap-aging' ? {
            query: getAPAgingQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'revenue-breakdown' ? {
            query: getRevenueBreakdownQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'expense-breakdown' ? {
            query: getExpenseBreakdownQuery(dateRange),
            format: 'JSONEachRow'
          } : selectedReport === 'chart-of-accounts' ? {
            query: getChartOfAccountsListQuery(dateRange),
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

export default function AccountingReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">กำลังโหลด...</div>}>
      <AccountingReportContent />
    </Suspense>
  );
}
