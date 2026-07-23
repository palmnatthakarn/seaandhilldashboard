/**
 * Dashboard Overview Data Layer
 * ฟังก์ชันดึงข้อมูลสำหรับหน้า Dashboard หลัก
 */

import { clickhouse } from '../clickhouse';
import type { DateRange } from './types';
import { resolveBranchName, resolveBranchSyncName } from '../branch-names';

export interface DashboardKPIs {
  totalSales: number;
  salesGrowth: number | null;     // null = ไม่มีข้อมูลรอบก่อนหน้า
  totalOrders: number;
  ordersGrowth: number | null;
  totalCustomers: number;
  customersGrowth: number | null;
  avgOrderValue: number;
  avgOrderGrowth: number | null;
}

/**
 * คำนวณ % การเติบโต — return null ถ้าไม่มีข้อมูล period ก่อนหน้า
 */
function calcGrowthPct(current: number, prev: number): number | null {
  if (prev === 0) return null;  // ไม่มีข้อมูลรอบก่อน → แสดง "ไม่มีข้อมูล"
  return ((current - prev) / prev) * 100;
}

export interface SalesChartData {
  date: string;
  amount: number;
  orders: number;
}

export interface RevenueExpenseData {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
}

export interface BranchDailySummary {
  branchSync: string;
  branchName: string;
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
}

export interface RecentSale {
  docNo: string;
  customerName: string;
  totalAmount: number;
  docDate: string;
  statusPayment: string;
  branchName?: string;
}

export interface Alert {
  id: number;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'success' | 'error';
  timestamp?: string;
  branchSync?: string;
  branchName?: string;
  category?: 'lowStock' | 'overstock' | 'overdue';
  count?: number;
  amount?: number;
  actionLabel?: string;
}

function getAlertId(typeId: number, branchSync: string) {
  const hash = [...branchSync].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return typeId * 1000 + hash;
}

// Helper to build branch filter
function buildBranchFilter(branches?: string[]): { sql: string; params: Record<string, unknown> } {
  if (!branches || branches.length === 0 || branches.includes('ALL')) {
    return { sql: '', params: {} };
  }

  if (branches.length === 1) {
    return {
      sql: 'AND branch_sync = {branchSync:String}',
      params: { branchSync: branches[0] }
    };
  }

  return {
    sql: 'AND branch_sync IN {branchList:Array(String)}',
    params: { branchList: branches }
  };
}

function buildProductSalesKpiFilter(alias = 'sid'): string {
  return `
        AND ${alias}.status_cancel != 'Cancel'
        AND trim(${alias}.item_code) != ''
        AND trim(${alias}.item_name) != ''
        AND ${alias}.qty > 0
        AND ${alias}.sum_amount > 0
        AND trim(${alias}.unit_code) != ''
        AND ${alias}.doc_no NOT LIKE 'CRD%'
        AND ${alias}.doc_no NOT LIKE 'AOB%'
        AND ${alias}.doc_no NOT LIKE 'PRM%'
  `;
}

/**
 * Get Dashboard KPIs
 * ดึง KPIs หลักสำหรับ Dashboard
 */
export async function getDashboardKPIs(branchSync?: string[], dateRange?: DateRange): Promise<DashboardKPIs> {
  try {
    // ใช้ dateRange ที่ส่งมา หรือ default เป็นวันนี้
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
    const startDate = dateRange?.start || endDate;

    // คำนวณช่วงเวลาที่ผ่านมา (previous period) โดยใช้ระยะเวลาเท่ากัน
    const daysDiff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const prevEndDate = new Date(new Date(startDate).getTime() - 86400000).toISOString().split('T')[0]; // วันก่อน startDate
    const prevStartDate = new Date(new Date(prevEndDate).getTime() - (daysDiff - 1) * 86400000).toISOString().split('T')[0];

    const branchFilter = buildBranchFilter(branchSync);

    // ยอดขายรวมใช้บรรทัดรายการขายจริง ไม่ใช่ยอดท้ายบิล
    const revenueQuery = `
      WITH product_docs AS (
        SELECT
          si.branch_sync AS branch_sync,
          si.doc_no,
          any(si.customer_code) AS customer_code,
          sum(sid.sum_amount) AS product_sales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND toDate(si.doc_datetime) >= toDate({startDate:String})
          AND toDate(si.doc_datetime) <= toDate({endDate:String})
          ${buildProductSalesKpiFilter('sid')}
          ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
        GROUP BY si.branch_sync, si.doc_no
      )
      SELECT
        coalesce(sum(product_sales), 0) as currentSales,
        count() as currentOrders,
        uniq(customer_code) as currentCustomers
      FROM product_docs
      SETTINGS final = 1
    `;

    const prevRevenueQuery = `
      WITH product_docs AS (
        SELECT
          si.branch_sync AS branch_sync,
          si.doc_no,
          any(si.customer_code) AS customer_code,
          sum(sid.sum_amount) AS product_sales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND toDate(si.doc_datetime) >= toDate({prevStartDate:String})
          AND toDate(si.doc_datetime) <= toDate({prevEndDate:String})
          ${buildProductSalesKpiFilter('sid')}
          ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
        GROUP BY si.branch_sync, si.doc_no
      )
      SELECT
        coalesce(sum(product_sales), 0) as prevSales,
        count() as prevOrders,
        uniq(customer_code) as prevCustomers
      FROM product_docs
      SETTINGS final = 1
    `;

    const [revenueResult, prevRevenueResult] = await Promise.all([
      clickhouse.query({
        query: revenueQuery,
        query_params: {
          startDate,
          endDate,
          ...branchFilter.params
        },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: prevRevenueQuery,
        query_params: {
          prevStartDate,
          prevEndDate,
          ...branchFilter.params
        },
        format: 'JSONEachRow',
      }),
    ]);

    const revenueData = (await revenueResult.json())[0] as Record<string, unknown> || {};
    const prevRevenueData = (await prevRevenueResult.json())[0] as Record<string, unknown> || {};

    // --- ค่าปัจจุบัน ---
    const currentSales = Number(revenueData.currentSales) || 0;
    const currentOrders = Number(revenueData.currentOrders) || 0;
    const currentCustomers = Number(revenueData.currentCustomers) || 0;
    const currentAvgOrder = currentOrders > 0 ? Math.round(currentSales / currentOrders) : 0;

    // --- ค่า previous period (อาจเป็น 0 ถ้าไม่มีข้อมูล) ---
    const prevSales = Number(prevRevenueData.prevSales) || 0;
    const prevOrders = Number(prevRevenueData.prevOrders) || 0;
    const prevCustomers = Number(prevRevenueData.prevCustomers) || 0;
    const prevAvgOrder = prevOrders > 0 ? Math.round(prevSales / prevOrders) : 0;

    return {
      totalSales: currentSales,
      salesGrowth: calcGrowthPct(currentSales, prevSales),
      totalOrders: currentOrders,
      ordersGrowth: calcGrowthPct(currentOrders, prevOrders),
      totalCustomers: currentCustomers,
      customersGrowth: calcGrowthPct(currentCustomers, prevCustomers),
      avgOrderValue: currentAvgOrder,
      avgOrderGrowth: calcGrowthPct(currentAvgOrder, prevAvgOrder),
    };
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    throw error;
  }
}

export async function getBranchDailySummaries(branchSync?: string[], dateRange?: DateRange): Promise<BranchDailySummary[]> {
  try {
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
    const startDate = dateRange?.start || endDate;
    const branchFilter = buildBranchFilter(branchSync);

    const query = `
      WITH product_docs AS (
        SELECT
          si.branch_sync AS branch_sync,
          si.doc_no,
          any(si.customer_code) AS customer_code,
          sum(sid.sum_amount) AS product_sales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND toDate(si.doc_datetime) >= toDate({startDate:String})
          AND toDate(si.doc_datetime) <= toDate({endDate:String})
          ${buildProductSalesKpiFilter('sid')}
          ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
        GROUP BY si.branch_sync, si.doc_no
      )
      SELECT
        branch_sync,
        coalesce(sum(product_sales), 0) AS totalSales,
        count() AS totalOrders,
        uniq(customer_code) AS totalCustomers
      FROM product_docs
      GROUP BY branch_sync
      ORDER BY totalSales DESC
      SETTINGS final = 1
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        startDate,
        endDate,
        ...branchFilter.params,
      },
      format: 'JSONEachRow',
    });

    const rows = await result.json() as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const totalSales = Number(row.totalSales) || 0;
      const totalOrders = Number(row.totalOrders) || 0;

      return {
        branchSync: String(row.branch_sync || ''),
        branchName: resolveBranchName(String(row.branch_sync || '')),
        totalSales,
        totalOrders,
        totalCustomers: Number(row.totalCustomers) || 0,
        avgOrderValue: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0,
      };
    });
  } catch (error) {
    console.error('Error fetching branch daily summaries:', error);
    throw error;
  }
}

/**
 * Get Sales Chart Data
 * ดึงข้อมูลกราฟยอดขายตามช่วงวันที่
 */
export async function getSalesChartData(branchSync?: string[], dateRange?: DateRange): Promise<SalesChartData[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    // ใช้ dateRange ที่ส่งมา หรือ default เป็น 30 วันล่าสุด
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
    const startDate = dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const query = `
      WITH product_docs AS (
        SELECT
          toDate(si.doc_datetime) as date,
          si.branch_sync,
          si.doc_no,
          sum(sid.sum_amount) AS product_sales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND toDate(si.doc_datetime) >= toDate({startDate:String})
          AND toDate(si.doc_datetime) <= toDate({endDate:String})
          ${buildProductSalesKpiFilter('sid')}
          ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
        GROUP BY date, si.branch_sync, si.doc_no
      )
      SELECT
        date,
        sum(product_sales) as amount,
        count() as orders
      FROM product_docs
      GROUP BY date
      ORDER BY date ASC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        startDate,
        endDate,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      date: String(row.date),
      amount: Number(row.amount) || 0,
      orders: Number(row.orders) || 0,
    }));
  } catch (error) {
    console.error('Error fetching sales chart data:', error);
    throw error;
  }
}

/**
 * Get Revenue vs Expense Data
 * ดึงข้อมูลรายได้ vs ค่าใช้จ่ายตามช่วงวันที่ (กลุ่มเป็นรายเดือน)
 */
export async function getRevenueExpenseData(branchSync?: string[], dateRange?: DateRange): Promise<RevenueExpenseData[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    // ใช้ dateRange ที่ส่งมา หรือ default เป็น 12 เดือนล่าสุด
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
    const startDate = dateRange?.start || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Query revenue from actual sold item/detail lines.
    const revenueQuery = `
      SELECT
        formatDateTime(toStartOfMonth(si.doc_datetime), '%Y-%m') as month,
        sum(sid.sum_amount) as revenue
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND toDate(si.doc_datetime) >= toDate({startDate:String})
        AND toDate(si.doc_datetime) <= toDate({endDate:String})
        ${buildProductSalesKpiFilter('sid')}
        ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
      GROUP BY month
      ORDER BY month ASC
    `;

    // Query expenses from purchases
    let expenseQuery = `
      SELECT
        formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') as month,
        sum(total_amount) as expense
      FROM purchase_transaction
      WHERE status_cancel != 'Cancel'
        AND toDate(doc_datetime) >= toDate({startDate:String})
        AND toDate(doc_datetime) <= toDate({endDate:String})
        ${branchFilter.sql}
    `;

    expenseQuery += `
      GROUP BY month
      ORDER BY month ASC
    `;

    const [revenueResult, expenseResult] = await Promise.all([
      clickhouse.query({
        query: revenueQuery,
        query_params: {
          startDate,
          endDate,
          ...branchFilter.params
        },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: expenseQuery,
        query_params: {
          startDate,
          endDate,
          ...branchFilter.params
        },
        format: 'JSONEachRow',
      }),
    ]);

    const revenueData = await revenueResult.json() as Array<Record<string, unknown>>;
    const expenseData = await expenseResult.json() as Array<Record<string, unknown>>;

    // Create a map of expenses by month
    const expenseMap = new Map<string, number>();
    expenseData.forEach((row) => {
      expenseMap.set(String(row.month), Number(row.expense) || 0);
    });

    // Combine revenue and expense data
    const combined: RevenueExpenseData[] = revenueData.map((row) => {
      const month = String(row.month);
      const revenue = Number(row.revenue) || 0;
      const expense = expenseMap.get(month) || 0;
      return {
        month,
        revenue,
        expense,
        profit: revenue - expense,
      };
    });

    // Add any months that have expenses but no revenue
    expenseData.forEach((row) => {
      const month = String(row.month);
      if (!combined.find((item: RevenueExpenseData) => item.month === month)) {
        const expense = Number(row.expense) || 0;
        combined.push({
          month,
          revenue: 0,
          expense,
          profit: -expense,
        });
      }
    });

    // Sort by month
    combined.sort((a: RevenueExpenseData, b: RevenueExpenseData) => a.month.localeCompare(b.month));

    return combined;
  } catch (error) {
    console.error('Error fetching revenue/expense data:', error);
    throw error;
  }
}

/**
 * Get Recent Sales
 * ดึงรายการขายล่าสุด 10 รายการตามช่วงวันที่
 */
export async function getRecentSales(branchSync?: string[], dateRange?: DateRange, limit: number = 10): Promise<RecentSale[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    // ใช้ dateRange ที่ส่งมา หรือ default เป็น 30 วันล่าสุด
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
    const startDate = dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let query = `
      SELECT
        doc_no as docNo,
        customer_name as customerName,
        total_amount as totalAmount,
        toTimeZone(doc_datetime, 'Asia/Bangkok') as docDate,
        status_payment as statusPayment,
        branch_sync_name as branchName
      FROM saleinvoice_transaction
      WHERE status_cancel != 'Cancel'
        AND toDate(doc_datetime) >= toDate({startDate:String})
        AND toDate(doc_datetime) <= toDate({endDate:String})
        ${branchFilter.sql}
    `;

    query += `
      ORDER BY doc_datetime DESC
      LIMIT ${limit}
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        startDate,
        endDate,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      docNo: String(row.docNo),
      customerName: String(row.customerName || 'ไม่ระบุ'),
      totalAmount: Number(row.totalAmount) || 0,
      docDate: String(row.docDate),
      statusPayment: String(row.statusPayment || 'รอชำระ'),
      branchName: resolveBranchSyncName(String(row.branchName || '')) || '',
    }));
  } catch (error) {
    console.error('Error fetching recent sales:', error);
    throw error;
  }
}

/**
 * Get Dashboard Alerts
 * ดึงการแจ้งเตือนสำคัญต่างๆ
 */
export async function getDashboardAlerts(branchSync?: string[], dateRange?: DateRange): Promise<Alert[]> {
  try {
    const alerts: Alert[] = [];
    const today = new Date().toISOString().split('T')[0];
    const branchFilter = buildBranchFilter(branchSync);

    // 1. Low Stock Items
    // ใช้ subquery GROUP BY item_code เพื่อนับจำนวนสินค้า (SKU)
    // threshold = Days on Hand <= 7 (อิงจากอัตราขายย้อนหลัง 30 วัน)
    const lowStockQuery = `
      SELECT branch_sync, count(*) as count
      FROM (
        SELECT
          branch_sync,
          item_code,
          sum(qty) as totalQty,
          abs(sumIf(qty, qty < 0 AND toDate(doc_datetime) >= toDate({today:String}) - INTERVAL 30 DAY)) as totalOut30d,
          totalOut30d / 30 as avgDailyOut,
          if(avgDailyOut > 0, totalQty / avgDailyOut, 999999) as daysOnHand
        FROM stock_transaction
        WHERE toDate(doc_datetime) <= toDate({today:String})
          AND branch_sync != ''
          ${branchFilter.sql}
        GROUP BY branch_sync, item_code
        HAVING totalQty > 0 AND avgDailyOut > 0 AND daysOnHand <= 7
      )
      GROUP BY branch_sync
      ORDER BY branch_sync
      SETTINGS final = 1
    `;

    // 2. Overstock Items
    // threshold = Days on Hand > 90 (อิงจากอัตราขายย้อนหลัง 30 วัน)
    const overstockQuery = `
      SELECT branch_sync, count(*) as count
      FROM (
        SELECT
          branch_sync,
          item_code,
          sum(qty) as totalQty,
          abs(sumIf(qty, qty < 0 AND toDate(doc_datetime) >= toDate({today:String}) - INTERVAL 30 DAY)) as totalOut30d,
          totalOut30d / 30 as avgDailyOut,
          if(avgDailyOut > 0, totalQty / avgDailyOut, 999999) as daysOnHand
        FROM stock_transaction
        WHERE toDate(doc_datetime) <= toDate({today:String})
          AND branch_sync != ''
          ${branchFilter.sql}
        GROUP BY branch_sync, item_code
        HAVING totalQty > 0 AND daysOnHand > 90
      )
      GROUP BY branch_sync
      ORDER BY branch_sync
      SETTINGS final = 1
    `;

    // 3. Overdue Payments (AR)
    // นับเอกสารขายที่ค้างชำระเกินกำหนด
    const overdueQuery = `
      SELECT branch_sync, count(*) as count, sum(outstanding) as amount
      FROM (
        SELECT
          branch_sync,
          doc_no,
          total_amount - sum_pay_money as outstanding
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND branch_sync != ''
          AND status_payment IN ('Outstanding', 'Partially Paid')
          AND doc_type = 'CREDIT'
          AND due_date < today()
          AND (total_amount - sum_pay_money) > 0
          ${dateRange ? 'AND doc_datetime BETWEEN {startDate:String} AND {endDate:String}' : ''}
          ${branchFilter.sql}
      )
      GROUP BY branch_sync
      ORDER BY branch_sync
      SETTINGS final = 1
    `;

    const queryParams = {
      today,
      ...(dateRange ? { startDate: dateRange.start, endDate: dateRange.end } : {}),
      ...branchFilter.params
    };

    const branchNameQuery = `
      SELECT branch_sync, any(branch_sync_name) as branch_sync_name
      FROM saleinvoice_transaction
      WHERE branch_sync != ''
      GROUP BY branch_sync
    `;

    const [lowStockRes, overstockRes, overdueRes, branchNameRes] = await Promise.all([
      clickhouse.query({ query: lowStockQuery, query_params: queryParams, format: 'JSONEachRow' }),
      clickhouse.query({ query: overstockQuery, query_params: queryParams, format: 'JSONEachRow' }),
      clickhouse.query({ query: overdueQuery, query_params: queryParams, format: 'JSONEachRow' }),
      clickhouse.query({ query: branchNameQuery, format: 'JSONEachRow' }),
    ]);

    const lowStockRows = await lowStockRes.json() as Array<Record<string, unknown>>;
    const overstockRows = await overstockRes.json() as Array<Record<string, unknown>>;
    const overdueRows = await overdueRes.json() as Array<Record<string, unknown>>;
    const branchNameRows = await branchNameRes.json() as Array<{ branch_sync: string; branch_sync_name: string }>;

    const branchNameMap: Record<string, string> = {};
    branchNameRows.forEach((row) => {
      if (row.branch_sync) {
        branchNameMap[row.branch_sync] = resolveBranchSyncName(row.branch_sync_name) || `กิจการ ${row.branch_sync}`;
      }
    });

    const now = new Date().toISOString();

    lowStockRows.forEach((row) => {
      const branchSync = String(row.branch_sync || '');
      const branchName = branchNameMap[branchSync] ?? `กิจการ ${branchSync}`;
      const lowStockCount = Number(row.count) || 0;
      if (!branchSync || lowStockCount <= 0) return;

      alerts.push({
        id: getAlertId(1, branchSync),
        type: 'warning',
        title: 'สินค้าใกล้หมด',
        message: `${branchName} มีสินค้า ${lowStockCount} SKU ที่สต็อกคงเหลือใช้งานได้ ≤ 7 วัน`,
        severity: 'warning',
        timestamp: now,
        branchSync,
        branchName,
        category: 'lowStock',
        count: lowStockCount,
        actionLabel: `ดู ${lowStockCount} SKU`,
      });
    });

    overstockRows.forEach((row) => {
      const branchSync = String(row.branch_sync || '');
      const branchName = branchNameMap[branchSync] ?? `กิจการ ${branchSync}`;
      const overstockCount = Number(row.count) || 0;
      if (!branchSync || overstockCount <= 0) return;

      alerts.push({
        id: getAlertId(2, branchSync),
        type: 'info',
        title: 'สินค้าเกินคลัง',
        message: `${branchName} มีสินค้า ${overstockCount} SKU ที่คาดว่าจะขายได้นานกว่า > 90 วัน`,
        severity: 'info',
        timestamp: now,
        branchSync,
        branchName,
        category: 'overstock',
        count: overstockCount,
        actionLabel: `ดู ${overstockCount} SKU`,
      });
    });

    overdueRows.forEach((row) => {
      const branchSync = String(row.branch_sync || '');
      const branchName = branchNameMap[branchSync] ?? `กิจการ ${branchSync}`;
      const overdueCount = Number(row.count) || 0;
      const overdueAmount = Number(row.amount) || 0;
      if (!branchSync || overdueCount <= 0) return;

      alerts.push({
        id: getAlertId(3, branchSync),
        type: 'error',
        title: 'ลูกหนี้ค้างชำระ',
        message: `${branchName} มี ${overdueCount} บิลเกินกำหนดชำระ มูลค่า ฿${overdueAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        severity: 'error',
        timestamp: now,
        branchSync,
        branchName,
        category: 'overdue',
        count: overdueCount,
        amount: overdueAmount,
        actionLabel: `ดู ${overdueCount} บิล`,
      });
    });

    return alerts;
  } catch (error) {
    console.error('Error fetching dashboard alerts:', error);
    return [];
  }
}
