'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
import { PaginatedTable } from '@/components/PaginatedTable';
import { PurchaseTrendChart } from '@/components/purchase/PurchaseTrendChart';
import { HorizontalBarChart, type HorizontalBarItem } from '@/components/charts/HorizontalBarChart';
import { PurchaseByCategoryChart } from '@/components/purchase/PurchaseByCategoryChart';
import { PurchaseByBrandChart } from '@/components/purchase/PurchaseByBrandChart';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ShoppingBag, Package, TrendingDown, FileText } from 'lucide-react';
import { getDateRange } from '@/lib/dateRanges';
import { formatGrowthPercentage } from '@/lib/comparison';
import { formatNumber, formatCurrency } from '@/lib/utils';
import type { DateRange, PurchaseKPIs, PurchaseTrendData, TopSupplier, PurchaseByCategory, PurchaseByBrand, APOutstanding, PurchaseChartOfAccountItem, PurchaseItemsByAccount } from '@/lib/data/types';
import {
  getTotalPurchasesQuery,
  getTotalItemsPurchasedQuery,
  getTotalOrdersQuery,
  getAvgOrderValueQuery,
  getPurchaseTrendQuery,
  getTopSuppliersQuery,
  getPurchaseByCategoryQuery,
  getPurchaseByBrandQuery,
  getAPOutstandingQuery,
  getPurchaseItemsByAccountQuery,
  getPurchaseByCategorySummaryQuery,
} from '@/lib/data/purchase-queries';

export default function PurchasePage() {
  const { dateRange, setDateRange } = useDateRangeStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const selectedBranches = useBranchStore((s) => s.selectedBranches);

  // Reset category filter when date range changes
  useEffect(() => {
    setSelectedCategory('ALL');
  }, [dateRange]);

  // Reset account filter when date range changes
  useEffect(() => {
    setSelectedAccount('ALL');
  }, [dateRange]);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['purchaseData', dateRange, selectedBranches],
    queryFn: async () => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const fetchWithFallback = async <T,>(url: string, fallback: T, label: string): Promise<T> => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const res = await fetch(url);
            if (!res.ok) {
              console.warn(`[purchase] ${label} failed: ${res.status} ${res.statusText}`);
              return fallback;
            }

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
              console.warn(`[purchase] ${label} returned non-JSON response`);
              return fallback;
            }

            const json = await res.json();
            return (json?.data as T) ?? fallback;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown network error';

            // Retry once for transient network issues while dev server is rebuilding/restarting.
            if (attempt < 2) {
              await sleep(250);
              continue;
            }

            console.warn(`[purchase] ${label} request error: ${message}`);
            return fallback;
          }
        }

        return fallback;
      };

      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
      });
      if (!selectedBranches.includes('ALL')) {
        selectedBranches.forEach((b) => params.append('branch', b));
      }

      // Fetch all data in parallel
      const [
        kpis,
        trendData,
        topSuppliers,
        purchaseByCategory,
        purchaseByCategorySummary,
        purchaseByAssetSummary,
        purchaseByBrand,
        apOutstanding,
        chartOfAccounts,
      ] = await Promise.all([
        fetchWithFallback<PurchaseKPIs>(`/api/purchase/kpis?${params}`, {
          totalPurchases: { value: 0, previousValue: 0, growth: 0, growthPercentage: 0, trend: 'neutral' },
          totalItemsPurchased: { value: 0, previousValue: 0, growth: 0, growthPercentage: 0, trend: 'neutral' },
          totalPOCount: { value: 0, previousValue: 0, growth: 0, growthPercentage: 0, trend: 'neutral' },
          totalOrders: { value: 0, previousValue: 0, growth: 0, growthPercentage: 0, trend: 'neutral' },
          avgPOValue: { value: 0, previousValue: 0, growth: 0, growthPercentage: 0, trend: 'neutral' },
          avgOrderValue: { value: 0, previousValue: 0, growth: 0, growthPercentage: 0, trend: 'neutral' },
          apOutstanding: { value: 0, previousValue: 0, growth: 0, growthPercentage: 0, trend: 'neutral' },
        }, 'kpis'),
        fetchWithFallback<PurchaseTrendData[]>(`/api/purchase/trend?${params}`, [], 'trend'),
        fetchWithFallback<TopSupplier[]>(`/api/purchase/top-suppliers?${params}&limit=5000`, [], 'top-suppliers'),
        fetchWithFallback<PurchaseByCategory[]>(`/api/purchase/by-category?${params}`, [], 'by-category'),
        fetchWithFallback<PurchaseByCategory[]>(`/api/purchase/by-category-summary?${params}`, [], 'by-category-summary-expenses'),
        fetchWithFallback<PurchaseByCategory[]>(`/api/purchase/by-category-summary?${params}&account_type=ASSETS`, [], 'by-category-summary-assets'),
        fetchWithFallback<PurchaseByBrand[]>(`/api/purchase/by-brand?${params}`, [], 'by-brand'),
        fetchWithFallback<APOutstanding[]>(`/api/purchase/ap-outstanding?${params}`, [], 'ap-outstanding'),
        fetchWithFallback<PurchaseChartOfAccountItem[]>(`/api/purchase/chart-of-accounts?${params}`, [], 'chart-of-accounts'),
      ]);

      return {
        kpis,
        trendData,
        topSuppliers,
        purchaseByCategory,
        purchaseByCategorySummary,
        purchaseByAssetSummary,
        purchaseByBrand,
        apOutstanding,
        chartOfAccounts,
      };
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;
  const kpis = data?.kpis;
  const trendData = data?.trendData || [];
  const topSuppliers = data?.topSuppliers || [];
  const purchaseByCategory = data?.purchaseByCategory || [];
  const purchaseByCategorySummary = data?.purchaseByCategorySummary || [];
  const purchaseByAssetSummary = data?.purchaseByAssetSummary || [];
  const purchaseByBrand = data?.purchaseByBrand || [];
  const apOutstanding = (data?.apOutstanding || []).slice(0, 20);
  const chartOfAccounts = data?.chartOfAccounts || [];

  // Fetch items by selected account
  const { data: itemsByAccountData, isLoading: itemsByAccountLoading } = useQuery({
    queryKey: ['purchaseItemsByAccount', dateRange, selectedAccount, selectedBranches],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          start_date: dateRange.start,
          end_date: dateRange.end,
          account_code: selectedAccount,
        });
        if (!selectedBranches.includes('ALL')) {
          selectedBranches.forEach((b) => params.append('branch', b));
        }

        const res = await fetch(`/api/purchase/items-by-account?${params}`);
        if (!res.ok) {
          console.warn(`[purchase] items-by-account failed: ${res.status} ${res.statusText}`);
          return [];
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.warn('[purchase] items-by-account returned non-JSON response');
          return [];
        }

        const json = await res.json();
        return json.data as PurchaseItemsByAccount[];
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown network error';
        console.warn(`[purchase] items-by-account request error: ${message}`);
        return [];
      }
    },
    enabled: !!dateRange.start && !!dateRange.end,
  });

  const itemsByAccount = itemsByAccountData || [];

  // Framer motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };



  const purchaseCategoryColumns: KPIRecordsColumn[] = [
    { key: 'categoryCode', label: 'รหัสผังบัญชี' },
    { key: 'categoryName', label: 'ผังบัญชี' },
    { key: 'totalQty', label: 'จำนวน (ชิ้น)', align: 'right' },
    { key: 'totalPurchaseValue', label: 'ยอดค่าใช้จ่าย', align: 'right' },
  ];

  const combinedCategorySummary = [...purchaseByCategorySummary, ...purchaseByAssetSummary];

  const purchaseCategoryRows: KPIRecordsRow[] = combinedCategorySummary.map((item) => ({
    id: `${item.categoryCode}-${item.categoryName}`,
    cells: {
      categoryCode: <span className="font-mono text-xs">{item.categoryCode}</span>,
      categoryName: (
        <Link 
          href={`/reports/purchase?report=expense-by-account&accountCode=${encodeURIComponent(item.categoryCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {item.categoryName}
        </Link>
      ),
      totalQty: formatNumber(item.totalQty || 0),
      totalPurchaseValue: formatCurrency(item.totalPurchaseValue),
    },
  }));

  // Column definitions for purchase order summary (by Supplier)
  const purchaseOrderSupplierColumns: KPIRecordsColumn[] = [
    { key: 'supplierCode', label: 'รหัสซัพพลายเออร์' },
    { key: 'supplierName', label: 'ชื่อซัพพลายเออร์' },
    { key: 'orderCount', label: 'จำนวนออเดอร์', align: 'right' },
  ];

  const purchaseOrderSupplierRows: KPIRecordsRow[] = topSuppliers.map((item) => ({
    id: item.supplierCode,
    cells: {
      supplierCode: <span className="font-mono text-xs">{item.supplierCode}</span>,
      supplierName: (
        <Link 
          href={`/reports/purchase?report=supplier-detail&supplierCode=${encodeURIComponent(item.supplierCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {item.supplierName}
        </Link>
      ),
      orderCount: formatNumber(item.poCount || 0, 0),
    },
  }));

  // Aggregate purchase by category data for Pie Chart (sum all items per category)
  const aggregatedPurchaseByCategory = (() => {
    const categoryMap = new Map<string, PurchaseByCategory>();
    
    purchaseByCategory.forEach(item => {
      const key = item.categoryCode;
      const existing = categoryMap.get(key);
      
      if (existing) {
        existing.totalQty += item.totalQty;
        existing.totalPurchaseValue += item.totalPurchaseValue;
      } else {
        categoryMap.set(key, {
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          itemCode: '', // Not used in aggregated data
          itemName: '', // Not used in aggregated data
          totalQty: item.totalQty,
          totalPurchaseValue: item.totalPurchaseValue,
          uniqueItems: item.uniqueItems,
        });
      }
    });
    
    return Array.from(categoryMap.values());
  })();

  // Calculate unique categories and filtered data
  const uniqueCategories = Array.from(
    new Set(purchaseByCategory.map(item => JSON.stringify({ code: item.categoryCode, name: item.categoryName })))
  )
    .map(str => JSON.parse(str))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));

  const filteredPurchaseByCategory = selectedCategory === 'ALL'
    ? purchaseByCategory
    : purchaseByCategory.filter(item => item.categoryCode === selectedCategory);

  // Column definitions for purchase items by account
  const purchaseItemsByAccountColumns = [
    {
      key: 'docDate',
      header: 'วันที่',
      sortable: true,
      render: (item: PurchaseItemsByAccount) => (
        <span className="text-xs">{item.docDate}</span>
      ),
    },
    {
      key: 'docNo',
      header: 'เลขที่เอกสาร',
      sortable: true,
      render: (item: PurchaseItemsByAccount) => (
        <span className="font-mono text-xs">{item.docNo}</span>
      ),
    },
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      render: (item: PurchaseItemsByAccount) => (
        <span className="font-mono text-xs">{item.itemCode}</span>
      ),
    },
    {
      key: 'itemName',
      header: 'ชื่อสินค้า',
      sortable: true,
      render: (item: PurchaseItemsByAccount) => (
        <span className="font-medium">{item.itemName}</span>
      ),
    },
    {
      key: 'categoryName',
      header: 'หมวดหมู่สินค้า',
      sortable: true,
      render: (item: PurchaseItemsByAccount) => (
        <span className="text-xs text-muted-foreground">{item.categoryName}</span>
      ),
    },
    {
      key: 'qty',
      header: 'จำนวน',
      align: 'right' as const,
      sortable: true,
      render: (item: PurchaseItemsByAccount) => (
        <span>{formatNumber(item.qty)} {item.unitCode}</span>
      ),
    },
    {
      key: 'price',
      header: 'ราคา/หน่วย',
      align: 'right' as const,
      sortable: true,
      render: (item: PurchaseItemsByAccount) => formatCurrency(item.price),
    },
    {
      key: 'totalAmount',
      header: 'มูลค่ารวม',
      align: 'right' as const,
      sortable: true,
      render: (item: PurchaseItemsByAccount) => formatCurrency(item.totalAmount),
    },
  ];

  // Column definitions for purchase by category (old - keep for pie chart)
  const purchaseByCategoryColumns = [
    {
      key: 'itemCode',
      header: 'รหัสสินค้า',
      sortable: true,
      render: (item: PurchaseByCategory) => (
        <span className="font-mono text-xs">{item.itemCode}</span>
      ),
    },
    {
      key: 'itemName',
      header: 'ชื่อสินค้า',
      sortable: true,
      render: (item: PurchaseByCategory) => (
        <span className="font-medium">{item.itemName}</span>
      ),
    },
    {
      key: 'totalQty',
      header: 'จำนวนที่ซื้อ',
      align: 'right' as const,
      sortable: true,
      render: (item: PurchaseByCategory) => formatNumber(item.totalQty),
    },
    {
      key: 'totalPurchaseValue',
      header: 'มูลค่าทั้งหมด',
      align: 'right' as const,
      sortable: true,
      render: (item: PurchaseByCategory) => formatCurrency(item.totalPurchaseValue),
    },
  ];

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
            การจัดซื้อและซัพพลายเออร์
          </h1>
          <p className="text-muted-foreground mt-1">
            ภาพรวมการจัดซื้อ ซัพพลายเออร์ และยอดเจ้าหนี้
          </p>
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </motion.div>

      {/* Error Display */}
      {error && (
        <motion.div variants={itemVariants}><ErrorDisplay error={error} onRetry={() => refetch()} /></motion.div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <motion.div variants={itemVariants} className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <KPICardSkeleton key={i} />
          ))}
        </motion.div>
      ) : kpis ? (
        <motion.div variants={itemVariants} className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard
            title="ยอดซื้อรวม"
            value={formatCurrency(kpis.totalPurchases.value)}
            trend={formatGrowthPercentage(kpis.totalPurchases.growthPercentage || 0)}
            trendUp={kpis.totalPurchases.trend === 'down'} // Down is good for purchases (cost reduction)
            icon={ShoppingBag}
            detailTitle="รายละเอียดยอดซื้อรวม"
            detailNote="ใช้ประเมินภาพรวมต้นทุนการจัดซื้อในช่วงเวลาที่เลือก"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มต้นทุน', value: kpis.totalPurchases.trend === 'down' ? 'ลดลง (ดี)' : 'เพิ่มขึ้น' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="ยอดซื้อตามผังบัญชี"
                columns={purchaseCategoryColumns}
                rows={purchaseCategoryRows}
                reportHref="/reports/purchase?report=by-category"
                headerPrefix=""
              />
            }
            queryInfo={{
              query: getTotalPurchasesQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
          <KPICard
            title="จำนวนสินค้าที่ซื้อ"
            value={formatNumber(kpis.totalItemsPurchased.value, 0)}
            trend={formatGrowthPercentage(kpis.totalItemsPurchased.growthPercentage || 0)}
            trendUp={kpis.totalItemsPurchased.trend === 'up'}
            icon={Package}
            detailTitle="รายละเอียดจำนวนสินค้าที่ซื้อ"
            detailNote="แสดงปริมาณสินค้าที่รับเข้าจากการจัดซื้อทั้งหมด"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มจำนวนรับเข้า', value: kpis.totalItemsPurchased.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="จำนวนสินค้าตามผังบัญชี"
                columns={purchaseCategoryColumns}
                rows={purchaseCategoryRows}
                reportHref="/reports/purchase?report=by-category"
                headerPrefix=""
              />
            }
            queryInfo={{
              query: getTotalItemsPurchasedQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
          <KPICard
            title="จำนวนออเดอร์"
            value={formatNumber(kpis.totalOrders.value, 0)}
            trend={formatGrowthPercentage(kpis.totalOrders.growthPercentage || 0)}
            trendUp={kpis.totalOrders.trend === 'up'}
            icon={FileText}
            detailTitle="รายละเอียดจำนวนออเดอร์ซื้อ"
            detailNote="นับจำนวนใบสั่งซื้อทั้งหมดในช่วงเวลาที่เลือก"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มจำนวนใบสั่งซื้อ', value: kpis.totalOrders.trend === 'up' ? 'เพิ่มขึ้น' : 'ลดลง' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="จำนวนออเดอร์แบ่งตามซัพพลายเออร์"
                columns={purchaseOrderSupplierColumns}
                rows={purchaseOrderSupplierRows}
                reportHref="/reports/purchase?report=top-suppliers"
                headerPrefix=""
              />
            }
            queryInfo={{
              query: getTotalOrdersQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
          <KPICard
            title="ค่าเฉลี่ยต่อออเดอร์"
            value={formatCurrency(kpis.avgOrderValue.value)}
            trend={formatGrowthPercentage(kpis.avgOrderValue.growthPercentage || 0)}
            trendUp={kpis.avgOrderValue.trend === 'down'} // Down is good for avg order (efficiency)
            icon={TrendingDown}
            detailTitle="รายละเอียดค่าเฉลี่ยต่อออเดอร์ซื้อ"
            detailNote="ใช้ติดตามประสิทธิภาพมูลค่าต่อใบสั่งซื้อ"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'แนวโน้มต่อออเดอร์', value: kpis.avgOrderValue.trend === 'down' ? 'ลดลง (ดี)' : 'เพิ่มขึ้น' },
            ]}
            detailContent={
              <KPIRecordsDetailContent
                title="ยอดซื้อเฉลี่ยตามผังบัญชี"
                columns={purchaseCategoryColumns}
                rows={purchaseCategoryRows}
                reportHref="/reports/purchase?report=by-category"
                headerPrefix=""
              />
            }
            queryInfo={{
              query: getAvgOrderValueQuery(dateRange),
              format: 'JSONEachRow'
            }}
          />
        </motion.div>
      ) : null}

      {/* Purchase Trend Chart */}
      <motion.div variants={itemVariants}>
      <ErrorBoundary>
        <DataCard
          title="แนวโน้มการจัดซื้อ"
          description="ยอดซื้อและจำนวนออเดอร์รายวัน"
          linkTo="/reports/purchase#trend"
          queryInfo={{
            query: getPurchaseTrendQuery(dateRange),
            format: 'JSONEachRow'
          }}
        >
          {loading ? (
            <ChartSkeleton />
          ) : (
            <PurchaseTrendChart data={trendData} />
          )}
        </DataCard>
      </ErrorBoundary>
      </motion.div>

      <motion.div variants={itemVariants} className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">


        {/* Top Suppliers */}
        <ErrorBoundary>
          <DataCard
            className="h-full"
            title="ซัพพลายเออร์ยอดนิยม Top 20"
            description="รายการซัพพลายเออร์ที่มียอดซื้อสูงสุด"
            linkTo="/reports/purchase#top-suppliers"
            queryInfo={{
              query: getTopSuppliersQuery(dateRange),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton height="600px" />
            ) : (
              <HorizontalBarChart
                data={topSuppliers.slice(0, 20).map((supplier, index) => ({
                  rank: index + 1,
                  name: supplier.supplierName,
                  value: supplier.totalPurchases,
                  subLabel: supplier.supplierCode,
                  extraData: {
                    poCount: supplier.poCount,
                    avgPOValue: supplier.avgPOValue,
                    lastPurchaseDate: supplier.lastPurchaseDate,
                  },
                }))}
                height="500px"
              //  gridLeft={35}
                gridRight={90}
                yAxisLabelMargin={270}
                tooltipFormatter={(item, percentage) => {
                  const poCount = item.extraData?.poCount || 0;
                  const avgPOValue = item.extraData?.avgPOValue || 0;
                  const lastDate = item.extraData?.lastPurchaseDate
                    ? new Date(item.extraData.lastPurchaseDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
                    : '-';
                  return `
                  <div style="padding: 8px;">
                    <div style="font-weight: 6000; margin-bottom: 6px;">อันดับ ${item.rank}: ${item.name}</div>
                    <div style="color: #666; font-size: 12px; margin-bottom: 8px;">${item.subLabel}</div>
                    <div>ยอดซื้อ: <b style="color: #3b82f6;">฿${item.value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
                    <div>จำนวน PO: <b>${poCount} รายการ</b></div>
                    <div>เฉลี่ยต่อ PO: <b>฿${avgPOValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
                    <div>ซื้อล่าสุด: <b>${lastDate}</b></div>
                    <div>สัดส่วน: <b>${percentage}%</b></div>
                  </div>
                `;
                }}
              />
            )}
          </DataCard>
        </ErrorBoundary>

        <ErrorBoundary>
          <DataCard
            className="h-full"
            title="การซื้อตามผังบัญชีค่าใช้จ่าย"
            description="สัดส่วนค่าใช้จ่ายแยกตามผังบัญชี (account_type = EXPENSES)"
            linkTo="/reports/purchase#by-category"
            queryInfo={{
              query: getPurchaseByCategorySummaryQuery(dateRange, 'EXPENSES'),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton />
            ) : (
              <PurchaseByCategoryChart
                data={purchaseByCategorySummary.map(item => ({
                  categoryCode: item.categoryCode,
                  categoryName: item.categoryName,
                  itemCode: '',
                  itemName: '',
                  totalQty: 0,
                  totalPurchaseValue: item.totalPurchaseValue,
                  uniqueItems: 0,
                }))}
                valueLabel="ค่าใช้จ่าย"
              />
            )}
          </DataCard>
        </ErrorBoundary>
      </motion.div>

      {/* Purchase by Asset & Brand */}
      <motion.div variants={itemVariants} className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">

        <ErrorBoundary>
          <DataCard
            className="h-full"
            title="การซื้อตามผังบัญชีสินค้า (สินทรัพย์)"
            description="สัดส่วนมูลค่าสินค้าคงคลังแยกตามผังบัญชี (account_type = ASSETS)"
            linkTo="/reports/purchase#by-asset"
            queryInfo={{
              query: getPurchaseByCategorySummaryQuery(dateRange, 'ASSETS'),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton />
            ) : (
              <PurchaseByCategoryChart
                data={purchaseByAssetSummary.map(item => ({
                  categoryCode: item.categoryCode,
                  categoryName: item.categoryName,
                  itemCode: '',
                  itemName: '',
                  totalQty: 0,
                  totalPurchaseValue: item.totalPurchaseValue,
                  uniqueItems: 0,
                }))}
                valueLabel="มูลค่าสินค้า"
              />
            )}
          </DataCard>
        </ErrorBoundary>

        <ErrorBoundary>
          <DataCard
            className="h-full"
            title="การซื้อตามแบรนด์"
            description="Top 10 แบรนด์ที่ซื้อมากที่สุด"
            linkTo="/reports/purchase#by-brand"
            queryInfo={{
              query: getPurchaseByBrandQuery(dateRange),
              format: 'JSONEachRow'
            }}
          >
            {loading ? (
              <ChartSkeleton />
            ) : (
              <PurchaseByBrandChart data={purchaseByBrand} />
            )}
          </DataCard>
        </ErrorBoundary>
      </motion.div>

      {/* Purchase Items by Account - Detailed Table */}
      <motion.div variants={itemVariants}>
      <ErrorBoundary>
        <DataCard
          title="รายละเอียดสินค้าตามผังบัญชีค่าใช้จ่าย"
          description="รายการสินค้าทั้งหมดในแต่ละผังบัญชี"
          linkTo="/reports/purchase?report=expense-by-account"
          queryInfo={{
            query: getPurchaseItemsByAccountQuery(dateRange, selectedAccount),
            format: 'JSONEachRow'
          }}
          headerExtra={
            <SearchableSelect
              value={selectedAccount}
              onChange={setSelectedAccount}
              options={[
                { value: 'ALL', label: 'ทุกผังบัญชี' },
                ...Array.from(
                  new Map(
                    chartOfAccounts
                      .filter((account) => account.accountCode)
                      .map((account) => [
                        account.accountCode,
                        {
                          value: account.accountCode,
                          label: `${account.accountCode} - ${account.accountName}`,
                        },
                      ])
                  ).values()
                )
              ]}
              placeholder="เลือกผังบัญชี..."
              className="min-w-[300px]"
            />
          }
        >
          {itemsByAccountLoading ? (
            <TableSkeleton />
          ) : (
            <PaginatedTable
              data={itemsByAccount}
              columns={purchaseItemsByAccountColumns}
              keyExtractor={(item, index) => `${item.docNo}-${item.itemCode}-${index}`}
              itemsPerPage={15}
              emptyMessage="ไม่พบข้อมูลสินค้า"
              defaultSortKey="docDate"
              defaultSortOrder="desc"
            />
          )}
        </DataCard>
      </ErrorBoundary>
      </motion.div>

      {/* AP Outstanding */}
      <motion.div variants={itemVariants}>
      <ErrorBoundary>
        <DataCard
          title="สถานะเจ้าหนี้การค้า (AP) Top 20"
          description="ซัพพลายเออร์ที่มียอดค้างชำระสูงสุด"
          linkTo="/reports/purchase#ap-outstanding"
          queryInfo={{
            query: getAPOutstandingQuery(dateRange),
            format: 'JSONEachRow'
          }}
        >
          {loading ? (
            <ChartSkeleton height="600px" />
          ) : (
            <HorizontalBarChart
              data={apOutstanding.map((ap, index) => ({
                rank: index + 1,
                name: ap.supplierName,
                value: ap.totalOutstanding,
                subLabel: ap.supplierCode,
                extraData: {
                  overdueAmount: ap.overdueAmount,
                  notOverdueAmount: ap.totalOutstanding - ap.overdueAmount,
                  docCount: ap.docCount,
                  overduePercent: ap.totalOutstanding > 0
                    ? ((ap.overdueAmount / ap.totalOutstanding) * 100).toFixed(1)
                    : '0',
                },
              }))}
              height="500px"
              gridLeft={350}
              gridRight={40}
              yAxisLabelMargin={340}
              showRank={true}
              showLegend={false}
              getBarColor={(rank) => {
                // ใช้ gradient amber-orange สำหรับ AP (warning theme)
                const intensity = 0.9 - (rank - 1) * 0.04;
                return `rgba(245, 158, 11, ${Math.max(0.4, intensity)})`;
              }}
              tooltipFormatter={(item, percentage) => {
                const overdueAmount = item.extraData?.overdueAmount || 0;
                const notOverdueAmount = item.extraData?.notOverdueAmount || 0;
                const docCount = item.extraData?.docCount || 0;
                const overduePercent = item.extraData?.overduePercent || '0';
                const overduePercentNum = parseFloat(overduePercent);

                return `
                  <div style="padding: 10px; min-width: 300px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #1f2937;">อันดับ ${item.rank}: ${item.name}</div>
                    <div style="color: #6b7280; font-size: 11px; margin-bottom: 10px;">${item.subLabel}</div>
                    
                    <div style="margin-bottom: 8px; padding: 8px; background: #fef3c7; border-radius: 6px;">
                      <div style="color: #92400e; font-size: 11px; margin-bottom: 2px;">ยอดค้างชำระทั้งหมด</div>
                      <div style="font-size: 18px; font-weight: 700; color: #d97706;">฿${item.value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-bottom: 10px;">
                      <div style="flex: 1; padding: 6px; background: #dbeafe; border-radius: 4px;">
                        <div style="display: flex; align-items: center; margin-bottom: 2px;">
                          <span style="display: inline-block; width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; margin-right: 6px;"></span>
                          <span style="font-size: 10px; color: #1e40af;">ยังไม่ครบกำหนด</span>
                        </div>
                        <div style="font-weight: 600; color: #1e3a8a; font-size: 13px;">฿${notOverdueAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      
                      <div style="flex: 1; padding: 6px; background: #fee2e2; border-radius: 4px;">
                        <div style="display: flex; align-items: center; margin-bottom: 2px;">
                          <span style="display: inline-block; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; margin-right: 6px;"></span>
                          <span style="font-size: 10px; color: #991b1b;">เกินกำหนด</span>
                        </div>
                        <div style="font-weight: 600; color: #991b1b; font-size: 13px;">฿${overdueAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid #e5e7eb;">
                      <span style="font-size: 11px; color: #6b7280;">สัดส่วนเกินกำหนด</span>
                      <span style="font-weight: 700; font-size: 13px; color: ${overduePercentNum > 50 ? '#dc2626' : overduePercentNum > 30 ? '#f59e0b' : '#10b981'};">${overduePercent}%</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                      <span style="font-size: 11px; color: #6b7280;">จำนวนบิล</span>
                      <span style="font-weight: 600; color: #374151; font-size: 12px;">${docCount} รายการ</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid #e5e7eb;">
                      <span style="font-size: 11px; color: #6b7280;">สัดส่วนจากยอดค้างทั้งหมด</span>
                      <span style="font-weight: 600; color: #f59e0b; font-size: 12px;">${percentage}%</span>
                    </div>
                  </div>
                `;
              }}
            />
          )}
        </DataCard>
      </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}
