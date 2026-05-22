'use client';

import { useCallback } from 'react';
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
import { PermissionGuard } from '@/components/PermissionGuard';
import { SalesTrendChart } from '@/components/sales/SalesTrendChart';
import { TopProductsTable } from '@/components/sales/TopProductsTable';
import { SalesByBranchChart } from '@/components/sales/SalesByBranchChart';
import { SalesByCategoryChart } from '@/components/sales/SalesByCategoryChart';
import { SalesBySalespersonTable } from '@/components/sales/SalesBySalespersonTable';
import { TopCustomersTable } from '@/components/sales/TopCustomersTable';
import { ARStatusChart } from '@/components/sales/ARStatusChart';
import { ShoppingCart, DollarSign, TrendingUp, Package } from 'lucide-react';
import { getDateRange } from '@/lib/dateRanges';
import Link from 'next/link';
import { formatGrowthPercentage } from '@/lib/comparison';
import type { DateRange, SalesKPIs, SalesTrendData, TopProduct, SalesByBranch, SalesByCategory, SalesBySalesperson, TopCustomer, ARStatus } from '@/lib/data/types';
import {
  getTotalSalesQuery,
  getGrossProfitQuery,
  getTotalOrdersQuery,
  getAvgOrderValueQuery,
  getSalesTrendQuery,
  getTopProductsQuery,
  getSalesBySalespersonQuery,
  getSalesByCategoryDetailQuery,
  getTopCustomersQuery,
  getARStatusQuery,
} from '@/lib/data/sales-queries';
export default function SalesPage() {
  const { dateRange, setDateRange } = useDateRangeStore();
  const selectedBranches = useBranchStore((s) => s.selectedBranches);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['salesData', dateRange, selectedBranches],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }

      // Fetch all data in parallel
      const [
        kpisRes,
        trendRes,
        productsRes,
        branchRes,
        categoryRes,
        categorySummaryRes,
        salespersonRes,
        customersRes,
        arRes,
      ] = await Promise.all([
        fetch(`/api/sales/kpis?${params}`),
        fetch(`/api/sales/trend?${params}`),
        fetch(`/api/sales/top-products?${params}`),
        fetch(`/api/sales/by-branch?${params}`),
        fetch(`/api/sales/by-category?${params}`),
        fetch(`/api/sales/by-category-summary?${params}`),
        fetch(`/api/sales/by-salesperson?${params}`),
        fetch(`/api/sales/top-customers?${params}`),
        fetch(`/api/sales/ar-status?${params}`),
      ]);

      if (!kpisRes.ok) throw new Error('Failed to fetch KPIs');
      if (!trendRes.ok) throw new Error('Failed to fetch trend data');
      if (!productsRes.ok) throw new Error('Failed to fetch top products');
      if (!branchRes.ok) throw new Error('Failed to fetch sales by branch');
      if (!categoryRes.ok) throw new Error('Failed to fetch sales by category');
      if (!categorySummaryRes.ok) throw new Error('Failed to fetch sales by category summary');
      if (!salespersonRes.ok) throw new Error('Failed to fetch sales by salesperson');
      if (!customersRes.ok) throw new Error('Failed to fetch top customers');
      if (!arRes.ok) throw new Error('Failed to fetch AR status');

      const [kpisData, trendDataRes, productsData, branchData, categoryData, categorySummaryData, salespersonData, customersData, arData] = await Promise.all([
        kpisRes.json(),
        trendRes.json(),
        productsRes.json(),
        branchRes.json(),
        categoryRes.json(),
        categorySummaryRes.json(),
        salespersonRes.json(),
        customersRes.json(),
        arRes.json(),
      ]);

      return {
        kpis: kpisData.data as SalesKPIs,
        trendData: trendDataRes.data as SalesTrendData[],
        topProducts: productsData.data as TopProduct[],
        salesByBranch: branchData.data as SalesByBranch[],
        salesByCategory: categoryData.data as SalesByCategory[],
        salesByCategorySummary: categorySummaryData.data as SalesByCategory[],
        salesBySalesperson: salespersonData.data as SalesBySalesperson[],
        topCustomers: customersData.data as TopCustomer[],
        arStatus: arData.data as ARStatus[],
      };
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;
  const kpis = data?.kpis;
  const trendData = data?.trendData || [];
  const topProducts = data?.topProducts || [];
  const salesByBranch = data?.salesByBranch || [];
  const salesByCategory = data?.salesByCategory || [];
  const salesByCategorySummaryData = data?.salesByCategorySummary || [];
  const salesBySalesperson = data?.salesBySalesperson || [];
  const topCustomers = data?.topCustomers || [];
  const arStatus = data?.arStatus || [];

  // Framer motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  const formatCurrency = (value: number) => {
    return `฿${value.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const salesCategoryColumns: KPIRecordsColumn[] = [
    { key: 'categoryCode', label: 'รหัสผังบัญชี' },
    { key: 'categoryName', label: 'ผังบัญชี' },
    { key: 'totalQtySold', label: 'จำนวนขาย', align: 'right' },
    { key: 'totalSales', label: 'ยอดขายรวม', align: 'right' },
  ];

  const salesByCategorySummary = Array.from(
    salesByCategory.reduce((map, item) => {
      const existing = map.get(item.categoryName) || {
        categoryCode: item.categoryCode,
        categoryName: item.categoryName,
        totalQtySold: 0,
        totalSales: 0,
      };

      existing.totalQtySold += item.totalQtySold;
      existing.totalSales += item.totalSales;
      map.set(item.categoryName, existing);
      return map;
    }, new Map<string, { categoryCode: string; categoryName: string; totalQtySold: number; totalSales: number }>())
      .values()
  ).sort((a, b) => b.totalSales - a.totalSales);

  const salesCategoryRows: KPIRecordsRow[] = salesByCategorySummary.map((item) => ({
    id: item.categoryName,
    cells: {
      categoryCode: item.categoryCode,
      categoryName: (
        <Link 
          href={`/reports/sales?report=by-category&categoryCode=${encodeURIComponent(item.categoryCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {item.categoryName}
        </Link>
      ),
      totalQtySold: item.totalQtySold.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalSales: formatCurrency(item.totalSales),
    },
  }));

  const salesOrderColumns: KPIRecordsColumn[] = [
    { key: 'categoryCode', label: 'รหัสผังบัญชี' },
    { key: 'categoryName', label: 'ผังบัญชี' },
    { key: 'orderCount', label: 'จำนวนออเดอร์', align: 'right' },
  ];

  const salesOrderRows: KPIRecordsRow[] = salesByCategorySummaryData.map((item) => ({
    id: item.categoryName,
    cells: {
      categoryCode: <span className="font-mono text-xs">{item.categoryCode}</span>,
      categoryName: (
        <Link 
          href={`/reports/sales?report=by-category&categoryCode=${encodeURIComponent(item.categoryCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {item.categoryName}
        </Link>
      ),
      orderCount: item.orderCount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
  }));

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
            ยอดขายและลูกค้า
          </h1>
          <p className="text-muted-foreground mt-1">
            ภาพรวมยอดขาย ผลิตภัณฑ์ และข้อมูลลูกค้า
          </p>
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </motion.div>

      {/* Error Display */}
      {error && (
        <ErrorDisplay error={error} onRetry={() => refetch()} />
      )}

      {/* KPI Cards */}
      <PermissionGuard componentKey="sales.kpis">
        {loading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <KPICardSkeleton key={i} />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="ยอดขายรวม"
              value={formatCurrency(kpis.totalSales.value)}
              trend={formatGrowthPercentage(kpis.totalSales.growthPercentage || 0)}
              trendUp={kpis.totalSales.trend === 'up'}
              icon={DollarSign}
              detailTitle="รายละเอียดยอดขายรวม"
              detailNote="สะท้อนยอดขายสุทธิรวมของช่วงเวลาที่เลือก"
              detailItems={[
                { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
                { label: 'สถานะแนวโน้ม', value: kpis.totalSales.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
              ]}
              detailContent={
                <KPIRecordsDetailContent
                  title="ยอดขายรวมตามผังบัญชี"
                  columns={salesCategoryColumns}
                  rows={salesCategoryRows}
                  reportHref="/reports/sales?report=by-category"
                  headerPrefix=""
                />
              }
              queryInfo={{
                query: getTotalSalesQuery(dateRange),
                format: 'JSONEachRow',
              }}
            />
            <KPICard
              title="กำไรขั้นต้น"
              value={formatCurrency(kpis.grossProfit.value)}
              trend={formatGrowthPercentage(kpis.grossProfit.growthPercentage || 0)}
              trendUp={kpis.grossProfit.trend === 'up'}
              icon={TrendingUp}
              subtitle={`Margin: ${(kpis.grossMarginPct ?? 0).toFixed(1)}%`}
              detailTitle="รายละเอียดกำไรขั้นต้น"
              detailNote="คำนวณจากยอดขายหักต้นทุนขาย"
              detailItems={[
                { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
                { label: 'Gross Margin', value: `${(kpis.grossMarginPct ?? 0).toFixed(1)}%` },
              ]}
              queryInfo={{
                query: getGrossProfitQuery(dateRange),
                format: 'JSONEachRow',
              }}
            />
            <KPICard
              title="จำนวนออเดอร์"
              value={kpis.totalOrders.value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              trend={formatGrowthPercentage(kpis.totalOrders.growthPercentage || 0)}
              trendUp={kpis.totalOrders.trend === 'up'}
              icon={ShoppingCart}
              detailTitle="รายละเอียดจำนวนออเดอร์"
              detailNote="นับจำนวนใบสั่งขายทั้งหมดในช่วงเวลาที่เลือก"
              detailItems={[
                { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
                { label: 'แนวโน้มคำสั่งซื้อ', value: kpis.totalOrders.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
              ]}
              detailContent={
                <KPIRecordsDetailContent
                  title="จำนวนออเดอร์ตามผังบัญชี"
                  columns={salesOrderColumns}
                  rows={salesOrderRows}
                  reportHref="/reports/sales?report=by-category"
                  headerPrefix=""
                />
              }
              queryInfo={{
                query: getTotalOrdersQuery(dateRange),
                format: 'JSONEachRow',
              }}
            />
            <KPICard
              title="ค่าเฉลี่ยต่อออเดอร์"
              value={formatCurrency(kpis.avgOrderValue.value)}
              trend={formatGrowthPercentage(kpis.avgOrderValue.growthPercentage || 0)}
              trendUp={kpis.avgOrderValue.trend === 'up'}
              icon={Package}
              detailTitle="รายละเอียดค่าเฉลี่ยต่อออเดอร์"
              detailNote="วัดมูลค่าซื้อเฉลี่ยต่อหนึ่งคำสั่งขาย"
              detailItems={[
                { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
                { label: 'แนวโน้มมูลค่าต่อออเดอร์', value: kpis.avgOrderValue.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
              ]}
              queryInfo={{
                query: getAvgOrderValueQuery(dateRange),
                format: 'JSONEachRow',
              }}
            />
          </div>
        ) : null}
      </PermissionGuard>

      {/* Sales Trend Chart */}
      <PermissionGuard componentKey="sales.trend">
        <ErrorBoundary>
          <DataCard
            title="แนวโน้มยอดขาย"
            description="ยอดขายและจำนวนออเดอร์รายวัน"
            linkTo="/reports/sales#sales-trend"
            queryInfo={{
              query: getSalesTrendQuery(dateRange.start, dateRange.end),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton />
            ) : (
              <SalesTrendChart data={trendData} />
            )}
          </DataCard>
        </ErrorBoundary>
      </PermissionGuard>

      {/* Top Products & Sales by Branch */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">


        <PermissionGuard componentKey="sales.by_branch">
          <ErrorBoundary>
            <DataCard
              title="ยอดขายแยกตามหมวดหมู่"
              description="เปรียบเทียบยอดขายของแต่ละหมวดหมู่"
              linkTo="/reports/sales#by-category"
              queryInfo={{
                query: getSalesByCategoryDetailQuery(dateRange.start, dateRange.end),
                format: 'JSONEachRow'
              }}
            >
              {loading ? (
                <ChartSkeleton />
              ) : (
                <SalesByCategoryChart data={salesByCategory} />
              )}
            </DataCard>
          </ErrorBoundary>
        </PermissionGuard>

        <PermissionGuard componentKey="sales.top_products">
          <ErrorBoundary>
            <DataCard
              title="สินค้าขายดี Top 10"
              description="รายการสินค้าที่มียอดขายสูงสุด"
              linkTo="/reports/sales#top-products"
              queryInfo={{
                query: getTopProductsQuery(dateRange.start, dateRange.end),
                format: 'JSONEachRow'
              }}
            >
              {loading ? (
                <TableSkeleton rows={10} />
              ) : (
                <TopProductsTable data={topProducts} />
              )}
            </DataCard>
          </ErrorBoundary>
        </PermissionGuard>

      </div>

      {/* Sales by Salesperson */}
      <PermissionGuard componentKey="sales.by_salesperson">
        <ErrorBoundary>
          <DataCard
            title="ยอดขายตามพนักงานขาย"
            description="ผลงานพนักงานขายแต่ละคน"
            linkTo="/reports/sales#by-salesperson"
            queryInfo={{
              query: getSalesBySalespersonQuery(dateRange.start, dateRange.end),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <TableSkeleton rows={10} />
            ) : (
              <SalesBySalespersonTable data={salesBySalesperson} />
            )}
          </DataCard>
        </ErrorBoundary>
      </PermissionGuard>

      {/* Top Customers & AR Status */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">

        <PermissionGuard componentKey="sales.top_customers">
          <ErrorBoundary>
            <DataCard
              title="ลูกค้า VIP Top 20"
              description="ลูกค้าที่มียอดซื้อสูงสุด"
              linkTo="/reports/sales#top-customers"
              queryInfo={{
                query: getTopCustomersQuery(dateRange.start, dateRange.end),
                format: 'JSONEachRow'
              }}
            >
              {loading ? (
                <TableSkeleton rows={10} />
              ) : (
                <TopCustomersTable data={topCustomers} />
              )}
            </DataCard>
          </ErrorBoundary>
        </PermissionGuard>

        <PermissionGuard componentKey="sales.ar_status">
          <ErrorBoundary>
            <DataCard
              title="สถานะลูกหนี้การค้า"
              description="สรุปยอดลูกหนี้ตามสถานะการชำระเงิน"
              linkTo="/reports/sales#ar-status"
              queryInfo={{
                query: getARStatusQuery(dateRange.start, dateRange.end),
                format: 'JSONEachRow'
              }}
            >
              {loading ? (
                <ChartSkeleton height="350px" />
              ) : (
                <ARStatusChart data={arStatus} height="350px" />
              )}
            </DataCard>
          </ErrorBoundary>
        </PermissionGuard>
      </div>
    </motion.div>
  );
}
