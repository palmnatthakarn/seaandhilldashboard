'use client';

import { useDateRangeStore } from '@/store/useDateRangeStore';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useBranchStore } from '@/store/useBranchStore';
import { KPICard } from '@/components/KPICard';
import { KPIRecordsDetailContent, type KPIRecordsColumn, type KPIRecordsRow } from '@/components/KPIRecordsDetailContent';
import { DataCard } from '@/components/DataCard';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorBoundary, ErrorDisplay } from '@/components/ErrorBoundary';
import { KPICardSkeleton, ChartSkeleton, TableSkeleton } from '@/components/LoadingSkeleton';
import { ProfitLossChart } from '@/components/accounting/ProfitLossChart';
import { BalanceSheetChart } from '@/components/accounting/BalanceSheetChart';
import { CashFlowChart } from '@/components/accounting/CashFlowChart';
import { ARAgingTable } from '@/components/accounting/ARAgingTable';
import { APAgingTable } from '@/components/accounting/APAgingTable';
import { RevenueExpenseBreakdown } from '@/components/accounting/RevenueExpenseBreakdown';
import { ProductAccountBreakdownChart } from '@/components/accounting/ProductAccountBreakdownChart';
import { Wallet, CreditCard, PiggyBank, TrendingUp, TrendingDown } from 'lucide-react';
import { getDateRange } from '@/lib/dateRanges';
import { formatGrowthPercentage } from '@/lib/comparison';
import type { DateRange, AccountingKPIs, ProfitLossData, BalanceSheetItem, CashFlowData, AgingItem, CategoryBreakdown } from '@/lib/data/types';
import type { ProductAccountData } from '@/lib/data/types';
import {
  getAssetsQuery,
  getLiabilitiesQuery,
  getEquityQuery,
  getRevenueQuery,
  getExpensesQuery,
  getProfitLossQuery,
  getBalanceSheetQuery,
  getCashFlowQuery,
  getARAgingQuery,
  getAPAgingQuery,
  getRevenueBreakdownQuery,
  getExpenseBreakdownQuery,
  getProfitLossByProductCategoryQuery,
} from '@/lib/data/accounting-queries';

export default function AccountingPage() {
  const { dateRange, setDateRange } = useDateRangeStore();
  const selectedBranches = useBranchStore((s) => s.selectedBranches);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['accountingData', dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
      });

      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => {
          params.append('branch', b);
        });
      }

      // Fetch all data in parallel
      const [
        kpisRes,
        plRes,
        bsRes,
        cfRes,
        arRes,
        apRes,
        breakdownRes,
        productAccountRes,
      ] = await Promise.all([
        fetch(`/api/accounting/kpis?${params}`),
        fetch(`/api/accounting/profit-loss?${params}`),
        fetch(`/api/accounting/balance-sheet?${params}`),
        fetch(`/api/accounting/cash-flow?${params}`),
        fetch(`/api/accounting/ar-aging?${params}`),
        fetch(`/api/accounting/ap-aging?${params}`),
        fetch(`/api/accounting/revenue-expense-breakdown?${params}`),
        fetch(`/api/accounting/profit-loss-by-product?${params}`),
      ]);

      if (!kpisRes.ok) throw new Error('Failed to fetch KPIs');
      if (!plRes.ok) throw new Error('Failed to fetch P&L data');
      if (!bsRes.ok) throw new Error('Failed to fetch balance sheet');
      if (!cfRes.ok) throw new Error('Failed to fetch cash flow');
      if (!arRes.ok) throw new Error('Failed to fetch AR aging');
      if (!apRes.ok) throw new Error('Failed to fetch AP aging');
      if (!breakdownRes.ok) throw new Error('Failed to fetch breakdown');

      const [kpisData, plData, bsData, cfData, arData, apData, breakdownData, productAccountData] = await Promise.all([
        kpisRes.json(),
        plRes.json(),
        bsRes.json(),
        cfRes.json(),
        arRes.json(),
        apRes.json(),
        breakdownRes.json(),
        productAccountRes.ok ? productAccountRes.json() : Promise.resolve({ data: [] }),
      ]);

      // Transform balance sheet data - ensure account_type is present for filtering
      const transformedBalanceSheet = (bsData.data as any[]).map((item: any) => ({
        accountType: item.accountType,
        account_type: item.account_type, // The full account type (ASSETS, LIABILITIES, EQUITY)
        typeName: item.typeName,
        accountCode: item.accountCode,
        accountName: item.accountName,
        balance: item.balance,
      }));

      return {
        kpis: kpisData.data as AccountingKPIs,
        profitLoss: plData.data as ProfitLossData[],
        balanceSheet: transformedBalanceSheet as BalanceSheetItem[],
        cashFlow: cfData.data as CashFlowData[],
        arAging: arData.data as AgingItem[],
        apAging: apData.data as AgingItem[],
        revenueBreakdown: breakdownData.data.revenue as CategoryBreakdown[],
        expenseBreakdown: breakdownData.data.expenses as CategoryBreakdown[],
        productAccount: productAccountData.data as ProductAccountData[],
      };
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;
  const kpis = data?.kpis;
  const profitLossData = data?.profitLoss || [];
  const balanceSheetData = data?.balanceSheet || [];
  const cashFlowData = data?.cashFlow || [];
  const arAgingData = data?.arAging || [];
  const apAgingData = data?.apAging || [];
  const revenueBreakdown = data?.revenueBreakdown || [];
  const expenseBreakdown = data?.expenseBreakdown || [];
  const productAccountBreakdown = data?.productAccount || [];

  const formatCurrency = (value: number) => {
    const hasDecimals = value % 1 !== 0;
    return `฿${value.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const balanceSheetColumns: KPIRecordsColumn[] = [
    { key: 'accountCode', label: 'รหัสบัญชี' },
    { key: 'accountName', label: 'ชื่อบัญชี' },
    { key: 'balance', label: 'ยอดคงเหลือ', align: 'right' },
  ];

  const breakdownColumns: KPIRecordsColumn[] = [
    { key: 'accountGroup', label: 'รหัสบัญชี' },
    { key: 'accountName', label: 'ชื่อบัญชี' },
    { key: 'amount', label: 'จำนวนเงิน', align: 'right' },
    { key: 'percentage', label: 'สัดส่วน', align: 'right' },
  ];

  const mapBalanceRows = (items: BalanceSheetItem[]): KPIRecordsRow[] =>
    items.map((item, index) => ({
      id: `${item.accountCode}-${index}`,
      cells: {
        accountCode: item.accountCode,
        accountName: (
          <a
            href={`/reports/accounting?report=balance-sheet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
          >
            {item.accountName}
          </a>
        ),
        balance: formatCurrency(item.balance),
      },
    }));

  const assetAccounts = balanceSheetData.filter(
    (item) =>
      item.account_type?.toUpperCase() === 'ASSETS' ||
      item.typeName === 'สินทรัพย์' ||
      item.accountType === 'A'
  );
  const liabilityAccounts = balanceSheetData.filter(
    (item) =>
      item.account_type?.toUpperCase() === 'LIABILITIES' ||
      item.typeName === 'หนี้สิน' ||
      item.accountType === 'L'
  );
  const equityAccounts = balanceSheetData.filter(
    (item) =>
      item.account_type?.toUpperCase() === 'EQUITY' ||
      item.typeName === 'ส่วนของผู้ถือหุ้น' ||
      item.accountType === 'E'
  );

  const assetRows = mapBalanceRows(assetAccounts);
  const liabilityRows = mapBalanceRows(liabilityAccounts);
  const equityRows = mapBalanceRows(equityAccounts);

  const revenueRows: KPIRecordsRow[] = revenueBreakdown.map((item, index) => ({
    id: `${item.accountName}-${index}`,
    cells: {
      accountGroup: item.accountGroup,
      accountName: (
        <a
          href={`/reports/accounting?report=revenue-breakdown&accountCode=${encodeURIComponent(item.accountGroup)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
        >
          {item.accountName}
        </a>
      ),
      amount: formatCurrency(item.amount),
      percentage: `${item.percentage.toFixed(1)}%`,
    },
  }));

  const expenseRows: KPIRecordsRow[] = expenseBreakdown.map((item, index) => ({
    id: `${item.accountName}-${index}`,
    cells: {
      accountGroup: item.accountGroup,
      accountName: (
        <a
          href={`/reports/accounting?report=expense-breakdown&accountCode=${encodeURIComponent(item.accountGroup)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
        >
          {item.accountName}
        </a>
      ),
      amount: formatCurrency(item.amount),
      percentage: `${item.percentage.toFixed(1)}%`,
    },
  }));

  // Framer motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
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
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            บัญชีและการเงิน
          </h1>
          <p className="text-muted-foreground mt-1">
            ภาพรวมสถานะทางการเงินและผลประกอบการ
          </p>
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </motion.div>

      {/* Error Display */}
      {error && (
        <ErrorDisplay error={error} onRetry={() => refetch()} />
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <KPICardSkeleton key={i} />
          ))}
        </div>
      ) : kpis ? (
        <motion.div variants={itemVariants} className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <KPICard
            title="สินทรัพย์"
            value={formatCurrency(kpis.assets.value)}
            trend={formatGrowthPercentage(kpis.assets.growthPercentage || 0)}
            trendUp={kpis.assets.trend === 'up'}
            icon={Wallet}
            detailTitle="รายละเอียดสินทรัพย์"
            detailNote="มูลค่าสินทรัพย์รวมที่กิจการถือครองในช่วงเวลาที่เลือก"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มสินทรัพย์', value: kpis.assets.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="สินทรัพย์"
                columns={balanceSheetColumns}
                rows={assetRows}
                reportHref="/reports/accounting?report=balance-sheet&accountType=สินทรัพย์"
              />
            }
            expandHref="/reports/accounting?report=balance-sheet&accountType=สินทรัพย์"
            queryInfo={{
              query: getAssetsQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
          <KPICard
            title="หนี้สิน"
            value={formatCurrency(kpis.liabilities.value)}
            trend={formatGrowthPercentage(kpis.liabilities.growthPercentage || 0)}
            trendUp={kpis.liabilities.trend === 'down'} // Down is good for liabilities
            icon={CreditCard}
            detailTitle="รายละเอียดหนี้สิน"
            detailNote="มูลค่าหนี้สินรวม โดยแนวโน้มลดลงถือเป็นสัญญาณที่ดี"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มหนี้สิน', value: kpis.liabilities.trend === 'down' ? 'ลดลง (ดี)' : 'เพิ่มขึ้น' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="หนี้สิน"
                columns={balanceSheetColumns}
                rows={liabilityRows}
                reportHref="/reports/accounting?report=balance-sheet&accountType=หนี้สิน"
              />
            }
            expandHref="/reports/accounting?report=balance-sheet&accountType=หนี้สิน"
            queryInfo={{
              query: getLiabilitiesQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
          <KPICard
            title="ทุน"
            value={formatCurrency(kpis.equity.value)}
            trend={formatGrowthPercentage(kpis.equity.growthPercentage || 0)}
            trendUp={kpis.equity.trend === 'up'}
            icon={PiggyBank}
            detailTitle="รายละเอียดทุน"
            detailNote="แสดงส่วนของผู้ถือหุ้นและความแข็งแรงทางการเงิน"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มทุน', value: kpis.equity.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="ส่วนของผู้ถือหุ้น"
                columns={balanceSheetColumns}
                rows={equityRows}
                reportHref="/reports/accounting?report=balance-sheet&accountType=ส่วนของผู้ถือหุ้น"
              />
            }
            expandHref="/reports/accounting?report=balance-sheet&accountType=ส่วนของผู้ถือหุ้น"
            queryInfo={{
              query: getEquityQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
          <KPICard
            title="รายได้"
            value={formatCurrency(kpis.revenue.value)}
            trend={formatGrowthPercentage(kpis.revenue.growthPercentage || 0)}
            trendUp={kpis.revenue.trend === 'up'}
            icon={TrendingUp}
            detailTitle="รายละเอียดรายได้"
            detailNote="ยอดรายได้รวมที่เกิดขึ้นในช่วงเวลาที่เลือก"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มรายได้', value: kpis.revenue.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="รายได้"
                columns={breakdownColumns}
                rows={revenueRows}
                reportHref="/reports/accounting?report=revenue-breakdown"
                headerPrefix="รายการ"
                emptyPrefix="ไม่พบข้อมูล"
              />
            }
            expandHref="/reports/accounting?report=revenue-breakdown"
            queryInfo={{
              query: getRevenueQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
          <KPICard
            title="ค่าใช้จ่าย"
            value={formatCurrency(kpis.expenses.value)}
            trend={formatGrowthPercentage(kpis.expenses.growthPercentage || 0)}
            trendUp={kpis.expenses.trend === 'down'} // Down is good for expenses
            icon={TrendingDown}
            detailTitle="รายละเอียดค่าใช้จ่าย"
            detailNote="แนวโน้มลดลงของค่าใช้จ่ายช่วยปรับปรุงผลกำไร"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มค่าใช้จ่าย', value: kpis.expenses.trend === 'down' ? 'ลดลง (ดี)' : 'เพิ่มขึ้น' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="ค่าใช้จ่าย"
                columns={breakdownColumns}
                rows={expenseRows}
                reportHref="/reports/accounting?report=expense-breakdown"
                headerPrefix="รายการ"
                emptyPrefix="ไม่พบข้อมูล"
              />
            }
            expandHref="/reports/accounting?report=expense-breakdown"
            queryInfo={{
              query: getExpensesQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
        </motion.div>
      ) : null}

      {/* Profit & Loss Chart */}
      <ErrorBoundary>
        <motion.div variants={itemVariants}>
          <DataCard
            title="กำไร(ขาดทุน) สุทธิ"
            description="เปรียบเทียบรายได้ ค่าใช้จ่าย และกำไรสุทธิรายเดือน"
            linkTo="/reports/accounting#profit-loss"
            queryInfo={{
              query: getProfitLossQuery(dateRange),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton key="skeleton" />
            ) : (
              <ProfitLossChart key="chart" data={profitLossData} />
            )}
          </DataCard>
        </motion.div>
      </ErrorBoundary>

      {/* Balance Sheet & Cash Flow */}
      <motion.div variants={itemVariants} className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
        <ErrorBoundary>
          <DataCard
            title="งบดุล"
            description="สินทรัพย์ หนี้สิน และส่วนของผู้ถือหุ้น"
            linkTo="/reports/accounting#balance-sheet"
            queryInfo={{
              query: getBalanceSheetQuery(dateRange),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton key="skeleton" height="350px" />
            ) : (
              <BalanceSheetChart key="chart" data={balanceSheetData} height="350px" />
            )}
          </DataCard>
        </ErrorBoundary>

        <ErrorBoundary>
          <DataCard
            title="กระแสเงินสด"
            description="จากกิจกรรมดำเนินงาน ลงทุน และจัดหาเงิน"
            linkTo="/reports/accounting#cash-flow"
            queryInfo={{
              query: getCashFlowQuery(dateRange),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton key="skeleton" height="350px" />
            ) : (
              <CashFlowChart key="chart" data={cashFlowData} height="350px" />
            )}
          </DataCard>
        </ErrorBoundary>
      </motion.div>

      {/* AR & AP Aging */}
      <motion.div variants={itemVariants} className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
        <ErrorBoundary>
          <DataCard
            title="อายุลูกหนี้ (AR Aging)"
            description="รายการลูกหนี้ค้างชำระ"
            linkTo="/reports/accounting#ar-aging"
            queryInfo={{
              query: getARAgingQuery(dateRange),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <TableSkeleton key="skeleton" rows={8} />
            ) : (
              <ARAgingTable key="table" data={arAgingData} />
            )}
          </DataCard>
        </ErrorBoundary>

        <ErrorBoundary>
          <DataCard
            title="อายุเจ้าหนี้ (AP Aging)"
            description="รายการเจ้าหนี้ค้างชำระ"
            linkTo="/reports/accounting#ap-aging"
            queryInfo={{
              query: getAPAgingQuery(dateRange),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <TableSkeleton key="skeleton" rows={8} />
            ) : (
              <APAgingTable key="table" data={apAgingData} />
            )}
          </DataCard>
        </ErrorBoundary>
      </motion.div>

      {/* Revenue & Expense Breakdown */}
      <ErrorBoundary>
        <DataCard
          title="รายได้และค่าใช้จ่ายตามหมวด"
          description="สัดส่วนรายได้และค่าใช้จ่ายแยกตามประเภท"
          linkTo="/reports/accounting#revenue-breakdown"
          queryInfo={{
            query: `-- Revenue Breakdown\n${getRevenueBreakdownQuery(dateRange)}\n\n-- Expense Breakdown\n${getExpenseBreakdownQuery(dateRange)}`,
            format: 'JSONEachRow'
          }}
        >
          {loading ? (
            <div key="skeleton" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              <ChartSkeleton height="300px" />
              <ChartSkeleton height="300px" />
            </div>
          ) : (
            <RevenueExpenseBreakdown
              key="chart"
              revenueData={revenueBreakdown}
              expenseData={expenseBreakdown}
            />
          )}
        </DataCard>
      </ErrorBoundary>

        {/* Product Account Breakdown */}
        {/*  <ErrorBoundary>
          <motion.div variants={itemVariants}>
            <DataCard
              title="รายได้ / ทุน / ค่าใช้จ่าย ตามหมวดสินค้า"
              description="ผังบัญชี (INCOME / EQUITY / EXPENSES) จากการ JOIN ตารางขายกับตารางบัญชี"
              queryInfo={{
                query: getProfitLossByProductCategoryQuery(dateRange),
                format: 'JSONEachRow'
              }}
            >
              {loading ? (
                <ChartSkeleton key="skeleton" height="420px" />
              ) : (
                <ProductAccountBreakdownChart key="chart" data={productAccountBreakdown} />
              )}
            </DataCard>
          </motion.div>
        </ErrorBoundary>*/}

    </motion.div>
  );
}
