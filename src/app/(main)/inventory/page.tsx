'use client';

import { useDateRangeStore } from '@/store/useDateRangeStore';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useBranchStore } from '@/store/useBranchStore';
import { KPICard } from '@/components/KPICard';
import { DataCard } from '@/components/DataCard';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorBoundary, ErrorDisplay } from '@/components/ErrorBoundary';
import { KPICardSkeleton, ChartSkeleton, TableSkeleton } from '@/components/LoadingSkeleton';
import { StockMovementChart } from '@/components/inventory/StockMovementChart';
import { LowStockTable } from '@/components/inventory/LowStockTable';
import { OverstockTable } from '@/components/inventory/OverstockTable';
import { SlowMovingTable } from '@/components/inventory/SlowMovingTable';
import { InventoryTurnoverChart } from '@/components/inventory/InventoryTurnoverChart';
import { StockByBranchChart } from '@/components/inventory/StockByBranchChart';
import { Package, AlertTriangle, AlertCircle, TrendingDown } from 'lucide-react';
import { getDateRange } from '@/lib/dateRanges';
import type { DateRange, InventoryKPIs, StockMovement, LowStockItem, OverstockItem, SlowMovingItem, InventoryTurnover, StockByBranch } from '@/lib/data/types';
import {
  getInventoryValueQuery,
  getTotalItemsQuery,
  getLowStockCountQuery,
  getOverstockCountQuery,
  getStockMovementQuery,
  getLowStockItemsQuery,
  getOverstockItemsQuery,
  getSlowMovingItemsQuery,
  getInventoryTurnoverQuery,
  getStockByBranchQuery,
} from '@/lib/data/inventory-queries';

export default function InventoryPage() {
  const { dateRange, setDateRange } = useDateRangeStore();
  const selectedBranches = useBranchStore((s) => s.selectedBranches);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['inventoryData', dateRange, selectedBranches],
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
        movementRes,
        lowStockRes,
        overstockRes,
        slowMovingRes,
        turnoverRes,
        branchRes,
      ] = await Promise.all([
        fetch(`/api/inventory/kpis?${params}`),
        fetch(`/api/inventory/stock-movement?${params}`),
        fetch(`/api/inventory/low-stock?${params}`),
        fetch(`/api/inventory/overstock?${params}`),
        fetch(`/api/inventory/slow-moving?${params}`),
        fetch(`/api/inventory/turnover?${params}`),
        fetch(`/api/inventory/by-branch?${params}`),
      ]);

      if (!kpisRes.ok) throw new Error('Failed to fetch KPIs');
      if (!movementRes.ok) throw new Error('Failed to fetch stock movement');
      if (!lowStockRes.ok) throw new Error('Failed to fetch low stock items');
      if (!overstockRes.ok) throw new Error('Failed to fetch overstock items');
      if (!slowMovingRes.ok) throw new Error('Failed to fetch slow moving items');
      if (!turnoverRes.ok) throw new Error('Failed to fetch inventory turnover');
      if (!branchRes.ok) throw new Error('Failed to fetch stock by branch');

      const [kpisData, movementData, lowStockData, overstockData, slowMovingData, turnoverData, branchData] = await Promise.all([
        kpisRes.json(),
        movementRes.json(),
        lowStockRes.json(),
        overstockRes.json(),
        slowMovingRes.json(),
        turnoverRes.json(),
        branchRes.json(),
      ]);

      return {
        kpis: kpisData.data as InventoryKPIs,
        stockMovement: movementData.data as StockMovement[],
        lowStockItems: lowStockData.data as LowStockItem[],
        overstockItems: overstockData.data as OverstockItem[],
        slowMovingItems: slowMovingData.data as SlowMovingItem[],
        inventoryTurnover: turnoverData.data as InventoryTurnover[],
        stockByBranch: branchData.data as StockByBranch[],
      };
    }
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'เกิดข้อผิดพลาดในการโหลดข้อมูล' : null;
  const kpis = data?.kpis;
  const stockMovement = data?.stockMovement || [];
  const lowStockItems = data?.lowStockItems || [];
  const overstockItems = data?.overstockItems || [];
  const slowMovingItems = data?.slowMovingItems || [];
  const inventoryTurnover = data?.inventoryTurnover || [];
  const stockByBranch = data?.stockByBranch || [];

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
    const hasDecimals = value % 1 !== 0;
    return `฿${value.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatNumber = (value: number) => {
    const hasDecimals = value % 1 !== 0;
    return value.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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
            คลังสินค้าและสต็อก
          </h1>
          <p className="text-muted-foreground mt-1">
            ภาพรวมสินค้าคงคลัง การเคลื่อนไหว และการจัดการสต็อก
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
            title="มูลค่าสินค้าคงคลัง"
            value={formatCurrency(kpis.totalInventoryValue.value)}
            icon={Package}
            detailTitle="รายละเอียดมูลค่าสินค้าคงคลัง"
            detailNote="แสดงมูลค่ารวมของสินค้าคงคลังตามช่วงเวลาที่เลือก"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'สถานะภาพรวม', value: 'ใช้ติดตามมูลค่าคงเหลือของคลัง' },
            ]}
            queryInfo={{
              query: getInventoryValueQuery(dateRange),
              format: 'JSONEachRow',
            }}
          />
          <KPICard
            title="จำนวนรายการสินค้า"
            value={formatNumber(kpis.totalItemsInStock.value)}
            icon={Package}
            detailTitle="รายละเอียดจำนวนรายการสินค้า"
            detailNote="จำนวนรายการสินค้าที่มีอยู่ในคลังปัจจุบัน"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'การใช้งาน', value: 'ใช้ตรวจความครอบคลุมของ SKU ในคลัง' },
            ]}
            queryInfo={{
              query: getTotalItemsQuery(dateRange),
              format: 'JSONEachRow',
            }}
          />
          <KPICard
            title="สินค้าใกล้หมด"
            value={formatNumber(kpis.lowStockAlerts.value)}
            icon={AlertTriangle}
            trendUp={false}
            className={kpis.lowStockAlerts.value > 0 ? 'border-yellow-500/50' : ''}
            detailTitle="รายละเอียดสินค้าใกล้หมด"
            detailNote="จำนวนรายการที่ต่ำกว่าระดับ Reorder Point และควรเติมสต็อก"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'ความเร่งด่วน', value: kpis.lowStockAlerts.value > 0 ? 'ควรวางแผนสั่งซื้อ' : 'ปกติ' },
            ]}
            queryInfo={{
              query: getLowStockCountQuery(dateRange),
              format: 'JSONEachRow',
            }}
          />
          <KPICard
            title="สินค้าเกินคลัง"
            value={formatNumber(kpis.overstockAlerts.value)}
            icon={AlertCircle}
            trendUp={false}
            className={kpis.overstockAlerts.value > 0 ? 'border-orange-500/50' : ''}
            detailTitle="รายละเอียดสินค้าเกินคลัง"
            detailNote="จำนวนรายการที่เกินระดับสูงสุดและมีความเสี่ยงสต็อกค้าง"
            detailItems={[
              { label: 'ช่วงวันที่', value: `${dateRange.start} ถึง ${dateRange.end}` },
              { label: 'ความเสี่ยง', value: kpis.overstockAlerts.value > 0 ? 'ต้นทุนจมสูงขึ้น' : 'ปกติ' },
            ]}
            queryInfo={{
              query: getOverstockCountQuery(dateRange),
              format: 'JSONEachRow',
            }}
          />
        </motion.div>
      ) : null}

      {/* Stock Movement Chart */}
      <motion.div variants={itemVariants}>
      <ErrorBoundary>
        <DataCard
          title="การเคลื่อนไหวสต็อก"
          description="จำนวนสินค้าซื้อเข้าและขายออกรายวัน"
          linkTo="/reports/inventory#stock-movement"
          queryInfo={{
            query: getStockMovementQuery(dateRange),
            format: 'JSONEachRow',
          }}
        >
          {loading ? (
            <ChartSkeleton />
          ) : (
            <StockMovementChart data={stockMovement} />
          )}
        </DataCard>
      </ErrorBoundary>
      </motion.div>

      {/* Low Stock & Overstock */}
      <motion.div variants={itemVariants} >
       {/* <ErrorBoundary>
          <DataCard
            className="h-full"
            title="สินค้าใกล้หมด"
            description="รายการสินค้าที่คงเหลือใช้งานได้ ≤ 7 วัน (อิงสถิติช่วงเวลาที่เลือก)"
            linkTo="/reports/inventory#low-stock"
            queryInfo={{
              query: getLowStockItemsQuery(dateRange),
              format: 'JSONEachRow',
            }}
          >
            {loading ? (
              <TableSkeleton rows={13} />
            ) : (
              <LowStockTable data={lowStockItems} height="500px" itemsPerPage={13} />
            )}
          </DataCard>
        </ErrorBoundary>*/}

        <ErrorBoundary>
          <DataCard
            className="h-full"
            title="สินค้าาไม่เคลื่อนไหว"
            description="รายการสินค้าที่ไม่ได้ขายมานานกว่า > 90 วัน (อิงสถิติช่วงเวลาที่เลือก)"
            linkTo="/reports/inventory#overstock"
            queryInfo={{
              query: getOverstockItemsQuery(dateRange),
              format: 'JSONEachRow',
            }}
          >
            {loading ? (
              <TableSkeleton rows={10} />
            ) : (
              <OverstockTable data={overstockItems} height="450px" />
            )}
          </DataCard>
        </ErrorBoundary>
      </motion.div>

      {/* Slow Moving Items */}
      <motion.div variants={itemVariants}>
      <ErrorBoundary>
        <DataCard
          title="สินค้าหมุนเวียนช้า"
          description="รายการสินค้าที่มีสต็อกคงค้างนานกว่า 90 วัน"
          linkTo="/reports/inventory#slow-moving"
          queryInfo={{
            query: getSlowMovingItemsQuery(dateRange),
            format: 'JSONEachRow',
          }}
        >
          {loading ? (
            <TableSkeleton rows={10} />
          ) : (
            <SlowMovingTable data={slowMovingItems} height="710px" />
          )}
        </DataCard>
      </ErrorBoundary>
      </motion.div>

      {/* Inventory Turnover & Stock by Branch */}
      <motion.div variants={itemVariants} className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
        <ErrorBoundary>
          <DataCard
            className="h-full"
            title="อัตราหมุนเวียนสินค้า"
            description="การหมุนเวียนและวันขายหมดตามหมวดสินค้า"
            linkTo="/reports/inventory#turnover"
            queryInfo={{
              query: getInventoryTurnoverQuery(dateRange),
              format: 'JSONEachRow',
            }}
          >
            {loading ? (
              <ChartSkeleton />
            ) : (
              <InventoryTurnoverChart data={inventoryTurnover} />
            )}
          </DataCard>
        </ErrorBoundary>

        <ErrorBoundary>
          <DataCard
            className="h-full"
            title="สต็อกแยกตามสาขา"
            description="มูลค่าและจำนวนรายการสินค้าในแต่ละสาขา"
            linkTo="/reports/inventory#by-branch"
            queryInfo={{
              query: getStockByBranchQuery(dateRange),
              format: 'JSONEachRow',
            }}
          >
            {loading ? (
              <ChartSkeleton />
            ) : (
              <StockByBranchChart data={stockByBranch} />
            )}
          </DataCard>
        </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}
