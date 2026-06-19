// Sales data queries for ClickHouse
import 'server-only';

import { clickhouse } from '@/lib/clickhouse';
import type {
  DateRange,
  SalesKPIs,
  SalesTrendData,
  TopProduct,
  TopProductByBranch,
  SalesByBranch,
  SalesBySalesperson,
  SalesByCategory,
  SalesByAccount,
  SalesAnalysisData,
  TopCustomer,
  ARStatus,
  KPIData,
} from './types';
import { calculateGrowth, getPreviousPeriod } from '@/lib/comparison';
import { resolveBranchName } from '@/lib/branch-names';

// Re-export query functions for convenience (server-side usage only)
export * from './sales-queries';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build branch filter SQL clause and parameters
 * Handles single branch, multiple branches, or ALL branches
 */
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
  `;
}

function reportDateExpr(column = 'doc_datetime'): string {
  return `date(${column} + INTERVAL 7 HOUR)`;
}

function salesAccountFilter(alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  return `
        AND left(${prefix}account_code, 2) = '41'
        AND ${prefix}account_code != '4110-05'
        AND (${prefix}account_type = 'INCOME' OR (${prefix}account_type = '' AND left(${prefix}account_code, 1) = '4'))
  `;
}

function getNextDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function buildDateTimeRangeParams(dateRange: DateRange): {
  start_date: string;
  end_date_exclusive: string;
} {
  return {
    start_date: `${dateRange.start} 00:00:00`,
    end_date_exclusive: `${getNextDate(dateRange.end)} 00:00:00`,
  };
}

/**
 * Build date-time range parameters for BETWEEN queries (inclusive end)
 * Returns start_date at 00:00:00 and end_date at 23:59:59
 */
function buildDateTimeRangeParamsInclusive(dateRange: DateRange): {
  start_date: string;
  end_date: string;
} {
  return {
    start_date: `${dateRange.start} 00:00:00`,
    end_date: `${dateRange.end} 23:59:59`,
  };
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

/**
 * Get Sales KPIs: Total sales, gross profit, orders, avg order value
 */
export async function getSalesKPIs(dateRange: DateRange, branchSync?: string[]): Promise<SalesKPIs> {
  try {
    const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
    const branchFilter = buildBranchFilter(branchSync);

    // Total Sales — sum detail line amounts with Thai timezone date filter
    const salesQuery = `
      SELECT
        coalesce(sum(sid.sum_amount), 0) as current_value,
        (SELECT coalesce(sum(sid2.sum_amount), 0)
         FROM saleinvoice_transaction_detail sid2
         JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
         WHERE si2.status_cancel != 'Cancel'
           AND sid2.status_cancel != 'Cancel'
           AND date(si2.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({previous_start:String}) AND toDate({previous_end:String})
           AND trim(sid2.item_code) != ''
           AND trim(sid2.item_name) != ''
           AND sid2.qty > 0
           AND sid2.sum_amount > 0
           AND trim(sid2.unit_code) != ''
           ${branchFilter.sql.replace(/branch_sync/g, 'si2.branch_sync')}
        ) as previous_value
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND sid.status_cancel != 'Cancel'
        AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({start_date:String}) AND toDate({end_date:String})
        AND trim(sid.item_code) != ''
        AND trim(sid.item_name) != ''
        AND sid.qty > 0
        AND sid.sum_amount > 0
        AND trim(sid.unit_code) != ''
        ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
    `;

    // Gross Profit
    const profitQuery = `
      SELECT
        coalesce(sum(sid.sum_amount - sid.sum_of_cost), 0) as current_value,
        coalesce(sum(sid.sum_amount), 0) as revenue,
        (SELECT coalesce(sum(sid2.sum_amount - sid2.sum_of_cost), 0)
         FROM saleinvoice_transaction_detail sid2
         JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
         WHERE si2.status_cancel != 'Cancel'
           AND sid2.status_cancel != 'Cancel'
           AND date(si2.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({previous_start:String}) AND toDate({previous_end:String})
           AND trim(sid2.item_code) != ''
           AND trim(sid2.item_name) != ''
           AND sid2.qty > 0
           AND sid2.sum_amount > 0
           AND trim(sid2.unit_code) != ''
           ${branchFilter.sql.replace(/branch_sync/g, 'si2.branch_sync')}
        ) as previous_value
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND sid.status_cancel != 'Cancel'
        AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({start_date:String}) AND toDate({end_date:String})
        AND trim(sid.item_code) != ''
        AND trim(sid.item_name) != ''
        AND sid.qty > 0
        AND sid.sum_amount > 0
        AND trim(sid.unit_code) != ''
        ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
    `;

    // Total Orders
    const ordersQuery = `
      SELECT
        count(DISTINCT concat(si.branch_sync, ':', si.doc_no)) as current_value,
        (SELECT count(DISTINCT concat(si2.branch_sync, ':', si2.doc_no))
         FROM saleinvoice_transaction_detail sid2
         JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
         WHERE si2.status_cancel != 'Cancel'
           AND sid2.status_cancel != 'Cancel'
           AND date(si2.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({previous_start:String}) AND toDate({previous_end:String})
           AND trim(sid2.item_code) != ''
           AND trim(sid2.item_name) != ''
           AND sid2.qty > 0
           AND sid2.sum_amount > 0
           AND trim(sid2.unit_code) != ''
           ${branchFilter.sql.replace(/branch_sync/g, 'si2.branch_sync')}
        ) as previous_value
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND sid.status_cancel != 'Cancel'
        AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({start_date:String}) AND toDate({end_date:String})
        AND trim(sid.item_code) != ''
        AND trim(sid.item_name) != ''
        AND sid.qty > 0
        AND sid.sum_amount > 0
        AND trim(sid.unit_code) != ''
        ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
    `;

    // Average Order Value
    const avgOrderQuery = `
      SELECT
        coalesce(sum(order_sales) / nullIf(count(), 0), 0) as current_value,
        (SELECT coalesce(sum(order_sales) / nullIf(count(), 0), 0)
         FROM (
           SELECT si2.branch_sync, si2.doc_no, sum(sid2.sum_amount) AS order_sales
           FROM saleinvoice_transaction_detail sid2
           JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
           WHERE si2.status_cancel != 'Cancel'
             AND sid2.status_cancel != 'Cancel'
             AND date(si2.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({previous_start:String}) AND toDate({previous_end:String})
             AND trim(sid2.item_code) != ''
             AND trim(sid2.item_name) != ''
             AND sid2.qty > 0
             AND sid2.sum_amount > 0
             AND trim(sid2.unit_code) != ''
             ${branchFilter.sql.replace(/branch_sync/g, 'si2.branch_sync')}
           GROUP BY si2.branch_sync, si2.doc_no
         )
        ) as previous_value
      FROM (
        SELECT si.branch_sync, si.doc_no, sum(sid.sum_amount) AS order_sales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND sid.status_cancel != 'Cancel'
          AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({start_date:String}) AND toDate({end_date:String})
          AND trim(sid.item_code) != ''
          AND trim(sid.item_name) != ''
          AND sid.qty > 0
          AND sid.sum_amount > 0
          AND trim(sid.unit_code) != ''
          ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
        GROUP BY si.branch_sync, si.doc_no
      )
    `;

    const params = {
      start_date: dateRange.start,
      end_date: dateRange.end,
      previous_start: previousPeriod.start,
      previous_end: previousPeriod.end,
      ...branchFilter.params
    };

    const [salesResult, profitResult, ordersResult, avgOrderResult] = await Promise.all([
      clickhouse.query({ query: salesQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: profitQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: ordersQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: avgOrderQuery, query_params: params, format: 'JSONEachRow' }),
    ]);

    const salesData = await salesResult.json();
    const profitData = await profitResult.json();
    const ordersData = await ordersResult.json();
    const avgOrderData = await avgOrderResult.json();

    const createKPI = (data: Array<Record<string, unknown>>): KPIData => {
      const row = data[0] || { current_value: 0, previous_value: 0 };
      const current = Number(row.current_value) || 0;
      const previous = Number(row.previous_value) || 0;
      const growth = calculateGrowth(current, previous);

      return {
        value: current,
        previousValue: previous,
        growth: growth.value,
        growthPercentage: growth.percentage,
        trend: growth.trend,
      };
    };

    const profitRow = (profitData[0] || { current_value: 0, revenue: 0 }) as Record<string, unknown>;
    const grossProfit = Number(profitRow.current_value) || 0;
    const revenue = Number(profitRow.revenue) || 0;
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      totalSales: createKPI(salesData),
      grossProfit: createKPI(profitData),
      totalOrders: createKPI(ordersData),
      avgOrderValue: createKPI(avgOrderData),
      grossMarginPct,
    };
  } catch (error) {
    console.error('Error fetching sales KPIs:', error);
    throw error;
  }
}

/**
 * Get sales totals from chart of accounts.
 */
export async function getSalesByAccountSummary(dateRange: DateRange, branchSync?: string[]): Promise<SalesByAccount[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    const query = `
      WITH account_amounts AS (
        SELECT
          account_code AS accountCode,
          account_name AS accountName,
          round(sum(credit - debit), 2) AS totalSales
        FROM journal_transaction_detail
        WHERE ${reportDateExpr()} BETWEEN {start_date:String} AND {end_date:String}
          ${salesAccountFilter()}
          ${branchFilter.sql}
        GROUP BY accountCode, accountName
        HAVING totalSales != 0
      ),
      account_docs AS (
        SELECT DISTINCT
          doc_no,
          branch_sync,
          account_code
        FROM journal_transaction_detail
        WHERE ${reportDateExpr()} BETWEEN {start_date:String} AND {end_date:String}
          ${salesAccountFilter()}
          ${branchFilter.sql}
      ),
      account_qty AS (
        SELECT
          ad.account_code AS accountCode,
          round(sum(std.qty), 2) AS totalQtySold
        FROM account_docs ad
        LEFT JOIN saleinvoice_transaction_detail std
          ON ad.doc_no = std.doc_no
          AND ad.branch_sync = std.branch_sync
          AND std.status_cancel != 'Cancel'
        GROUP BY accountCode
      )
      SELECT
        aa.accountCode,
        aa.accountName,
        coalesce(aq.totalQtySold, 0) AS totalQtySold,
        aa.totalSales
      FROM account_amounts aa
      LEFT JOIN account_qty aq ON aa.accountCode = aq.accountCode
      ORDER BY aa.totalSales DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        start_date: dateRange.start,
        end_date: dateRange.end,
        ...branchFilter.params,
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<{
      accountCode?: string;
      accountName?: string;
      totalQtySold?: number | string;
      totalSales?: number | string;
    }>;
    return data.map((row) => ({
      accountCode: row.accountCode ?? '',
      accountName: row.accountName ?? '',
      totalQtySold: Number(row.totalQtySold) || 0,
      totalSales: Number(row.totalSales) || 0,
    }));
  } catch (error) {
    console.error('Error fetching sales by account summary:', error);
    throw error;
  }
}

/**
 * Get Sales Trend data by day/month
 */
export async function getSalesTrendData(dateRange: DateRange, branchSync?: string[]): Promise<SalesTrendData[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    const query = `
      SELECT
        date,
        sum(product_sales) as sales,
        count() as orderCount
      FROM (
        SELECT
          toStartOfDay(h.headerDocDatetime + INTERVAL 7 HOUR) as date,
          h.branch_sync,
          h.doc_no,
          sum(sid.sum_amount) AS product_sales
        FROM (
          SELECT branch_sync, doc_no, any(doc_datetime) AS headerDocDatetime
          FROM saleinvoice_transaction
          WHERE status_cancel != 'Cancel'
            AND date(doc_datetime + INTERVAL 7 HOUR) >= {start_date:String}
            AND date(doc_datetime + INTERVAL 7 HOUR) <= {end_date:String}
            ${branchFilter.sql}
          GROUP BY branch_sync, doc_no
        ) h
        INNER JOIN saleinvoice_transaction_detail sid ON h.branch_sync = sid.branch_sync AND h.doc_no = sid.doc_no
        WHERE 1 = 1
          ${buildProductSalesKpiFilter('sid')}
        GROUP BY date, h.branch_sync, h.doc_no
      )
      GROUP BY date
      ORDER BY date ASC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        start_date: dateRange.start,
        end_date: dateRange.end,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      date: String(row.date),
      sales: Number(row.sales) || 0,
      orderCount: Number(row.orderCount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    throw error;
  }
}

/**
 * Get Top 10 selling products
 */
export async function getTopProducts(dateRange: DateRange, branchSync?: string[]): Promise<TopProduct[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        sid.item_code as itemCode,
        sid.item_name as itemName,
        sid.unit_code as unitCode,
        sid.item_brand_name as brandName,
        sid.item_category_name as categoryName,
        sum(sid.qty) as totalQtySold,
        sum(sid.sum_amount) as totalSales,
        sum(sid.sum_amount - sid.sum_of_cost) as totalProfit,
        (totalProfit / totalSales) * 100 as profitMarginPct
      FROM saleinvoice_transaction_detail sid
      INNER JOIN (
        SELECT branch_sync, doc_no
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql}
        GROUP BY branch_sync, doc_no
      ) si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE 1 = 1
        ${buildProductSalesKpiFilter('sid')}
      GROUP BY sid.item_code, sid.item_name, sid.unit_code, sid.item_brand_name, sid.item_category_name
      ORDER BY totalSales DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      itemCode: String(row.itemCode),
      itemName: String(row.itemName),
      unitCode: String(row.unitCode || ''),
      brandName: String(row.brandName || '-'),
      categoryName: String(row.categoryName || '-'),
      totalQtySold: Number(row.totalQtySold) || 0,
      totalSales: Number(row.totalSales) || 0,
      totalProfit: Number(row.totalProfit) || 0,
      profitMarginPct: Number(row.profitMarginPct) || 0,
    }));
  } catch (error) {
    console.error('Error fetching top products:', error);
    throw error;
  }
}

/**
 * Get Top Products broken down per branch (for comparison mode)
 */
export async function getTopProductsByBranch(dateRange: DateRange, branchSync?: string[]): Promise<TopProductByBranch[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        sid.item_code as itemCode,
        sid.item_name as itemName,
        sid.unit_code as unitCode,
        si.branch_sync as branchSync,
        sum(sid.qty) as totalQtySold,
        sum(sid.sum_amount) as totalSales
      FROM saleinvoice_transaction_detail sid
      INNER JOIN (
        SELECT branch_sync, doc_no
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql}
        GROUP BY branch_sync, doc_no
      ) si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE 1 = 1
        ${buildProductSalesKpiFilter('sid')}
      GROUP BY sid.item_code, sid.item_name, sid.unit_code, si.branch_sync
      ORDER BY totalSales DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params,
      },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return (data as Record<string, unknown>[]).map((row) => ({
      itemCode: String(row.itemCode),
      itemName: String(row.itemName),
      unitCode: String(row.unitCode || ''),
      branchSync: String(row.branchSync),
      totalQtySold: Number(row.totalQtySold) || 0,
      totalSales: Number(row.totalSales) || 0,
    }));
  } catch (error) {
    console.error('Error fetching top products by branch:', error);
    throw error;
  }
}

/**
 * Get Sales by Branch
 */
export async function getSalesByBranch(dateRange: DateRange, branchSync?: string[]): Promise<SalesByBranch[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        branchSync,
        count() as orderCount,
        sum(product_sales) as totalSales
      FROM (
        SELECT
          h.branch_sync as branchSync,
          h.doc_no,
          sum(sid.sum_amount) as product_sales
        FROM (
          SELECT branch_sync, doc_no
          FROM saleinvoice_transaction
          WHERE status_cancel != 'Cancel'
            AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
            AND branch_sync != ''
            ${branchFilter.sql}
          GROUP BY branch_sync, doc_no
        ) h
        INNER JOIN saleinvoice_transaction_detail sid ON h.branch_sync = sid.branch_sync AND h.doc_no = sid.doc_no
        WHERE 1 = 1
          ${buildProductSalesKpiFilter('sid')}
        GROUP BY h.branch_sync, h.doc_no
      )
      GROUP BY branchSync
      ORDER BY totalSales DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    const byBusinessName = new Map<string, SalesByBranch & { branchCodes: string[] }>();

    for (const row of data as Record<string, unknown>[]) {
      const branchCode = String(row.branchSync || '');
      const branchName = resolveBranchName(branchCode);
      const existing = byBusinessName.get(branchName);

      if (existing) {
        existing.branchCodes.push(branchCode);
        existing.branchCode = existing.branchCodes.join(', ');
        existing.orderCount += Number(row.orderCount) || 0;
        existing.totalSales += Number(row.totalSales) || 0;
      } else {
        byBusinessName.set(branchName, {
          branchCode,
          branchCodes: [branchCode],
          branchName,
          orderCount: Number(row.orderCount) || 0,
          totalSales: Number(row.totalSales) || 0,
        });
      }
    }

    return Array.from(byBusinessName.values())
      .map((row) => ({
        branchCode: row.branchCode,
        branchName: row.branchName,
        orderCount: row.orderCount,
        totalSales: row.totalSales,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  } catch (error) {
    console.error('Error fetching sales by branch:', error);
    throw error;
  }
}

/**
 * Get Sales by Salesperson
 */
export async function getSalesBySalesperson(dateRange: DateRange, branchSync?: string[]): Promise<SalesBySalesperson[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        sale_code as saleCode,
        sale_name as saleName,
        count() as orderCount,
        sum(product_sales) as totalSales,
        totalSales / nullIf(orderCount, 0) as avgOrderValue,
        uniq(customer_code) as customerCount
      FROM (
        SELECT
          h.headerSaleCode AS sale_code,
          h.headerSaleName AS sale_name,
          h.headerCustomerCode AS customer_code,
          h.branch_sync,
          h.doc_no,
          sum(sid.sum_amount) as product_sales
        FROM (
          SELECT
            branch_sync,
            doc_no,
            any(sale_code) AS headerSaleCode,
            any(sale_name) AS headerSaleName,
            any(customer_code) AS headerCustomerCode
          FROM saleinvoice_transaction
          WHERE status_cancel != 'Cancel'
            AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
            AND sale_code != ''
            ${branchFilter.sql}
          GROUP BY branch_sync, doc_no
        ) h
        INNER JOIN saleinvoice_transaction_detail sid ON h.branch_sync = sid.branch_sync AND h.doc_no = sid.doc_no
        WHERE 1 = 1
          ${buildProductSalesKpiFilter('sid')}
        GROUP BY h.headerSaleCode, h.headerSaleName, h.headerCustomerCode, h.branch_sync, h.doc_no
      )
      GROUP BY sale_code, sale_name
      ORDER BY totalSales DESC
      LIMIT 20
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      saleCode: String(row.saleCode),
      saleName: String(row.saleName),
      orderCount: Number(row.orderCount) || 0,
      totalSales: Number(row.totalSales) || 0,
      avgOrderValue: Number(row.avgOrderValue) || 0,
      customerCount: Number(row.customerCount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching sales by salesperson:', error);
    throw error;
  }
}

/**
 * Get Top Customers
 */
export async function getTopCustomers(dateRange: DateRange, branchSync?: string[]): Promise<TopCustomer[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParams(dateRange);

    const query = `
      SELECT
        customer_code as customerCode,
        customer_name as customerName,
        count() as orderCount,
        sum(product_sales) as totalSpent,
        totalSpent / nullIf(orderCount, 0) as avgOrderValue,
        max(doc_datetime) as lastOrderDate,
        dateDiff('day', lastOrderDate, now()) as daysSinceLastOrder
      FROM (
        SELECT
          h.headerCustomerCode AS customer_code,
          h.headerCustomerName AS customer_name,
          h.headerDocDatetime AS doc_datetime,
          h.branch_sync,
          h.doc_no,
          sum(sid.sum_amount) as product_sales
        FROM (
          SELECT
            branch_sync,
            doc_no,
            any(customer_code) AS headerCustomerCode,
            any(customer_name) AS headerCustomerName,
            any(doc_datetime) AS headerDocDatetime
          FROM saleinvoice_transaction
          WHERE status_cancel != 'Cancel'
            AND customer_code != ''
            AND doc_datetime >= {start_date:String}
            AND doc_datetime < {end_date_exclusive:String}
            ${branchFilter.sql}
          GROUP BY branch_sync, doc_no
        ) h
        INNER JOIN saleinvoice_transaction_detail sid ON h.branch_sync = sid.branch_sync AND h.doc_no = sid.doc_no
        WHERE 1 = 1
          ${buildProductSalesKpiFilter('sid')}
        GROUP BY h.headerCustomerCode, h.headerCustomerName, h.headerDocDatetime, h.branch_sync, h.doc_no
      )
      GROUP BY customer_code, customer_name
      ORDER BY totalSpent DESC
      LIMIT 20
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      customerCode: String(row.customerCode),
      customerName: String(row.customerName),
      orderCount: Number(row.orderCount) || 0,
      totalSpent: Number(row.totalSpent) || 0,
      avgOrderValue: Number(row.avgOrderValue) || 0,
      lastOrderDate: String(row.lastOrderDate),
      daysSinceLastOrder: Number(row.daysSinceLastOrder) || 0,
    }));
  } catch (error) {
    console.error('Error fetching top customers:', error);
    throw error;
  }
}

/**
 * Get AR Status Summary
 */
export async function getARStatus(dateRange: DateRange, branchSync?: string[]): Promise<ARStatus[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        status_payment as statusPayment,
        count(DISTINCT doc_no) as invoiceCount,
        sum(total_amount) as totalInvoiceAmount,
        sum(sum_pay_money) as totalPaid,
        sum(total_amount - sum_pay_money) as totalOutstanding
      FROM saleinvoice_transaction
      WHERE status_cancel != 'Cancel'
        AND doc_type = 'CREDIT'
        AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql}
      GROUP BY statusPayment
      ORDER BY totalOutstanding DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      statusPayment: String(row.statusPayment),
      invoiceCount: Number(row.invoiceCount) || 0,
      totalInvoiceAmount: Number(row.totalInvoiceAmount) || 0,
      totalPaid: Number(row.totalPaid) || 0,
      totalOutstanding: Number(row.totalOutstanding) || 0,
    }));
  } catch (error) {
    console.error('Error fetching AR status:', error);
    throw error;
  }
}

/**
 * Get Sales by Category
 */
export async function getSalesByCategory(dateRange: DateRange, branchSync?: string[]): Promise<SalesByCategory[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParams(dateRange);

    const query = `
      SELECT
        'All' as branchName,
        COALESCE(NULLIF(sid.item_category_code, ''), 'N/A') as categoryCode,
        COALESCE(NULLIF(sid.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
        sid.item_code as itemCode,
        sid.item_name as itemName,
        count(DISTINCT concat(si.branch_sync, ':', si.doc_no)) as orderCount,
        sum(sid.qty) as totalQtySold,
        sum(sid.sum_amount) as totalSales,
        sum(sid.sum_amount - sid.sum_of_cost) as totalProfit,
        (totalProfit / totalSales) * 100 as profitMarginPct
      FROM saleinvoice_transaction_detail sid
      INNER JOIN (
        SELECT branch_sync, doc_no
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND doc_datetime >= {start_date:String}
          AND doc_datetime < {end_date_exclusive:String}
          ${branchFilter.sql}
        GROUP BY branch_sync, doc_no
      ) si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE 1 = 1
        ${buildProductSalesKpiFilter('sid')}
      GROUP BY categoryCode, categoryName, sid.item_code, sid.item_name
      ORDER BY categoryName ASC, totalSales DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      branchName: String(row.branchName || 'ไม่ระบุสาขา'),
      categoryCode: String(row.categoryCode || 'N/A'),
      categoryName: String(row.categoryName || 'ไม่ระบุหมวดหมู่'),
      itemCode: String(row.itemCode),
      itemName: String(row.itemName),
      orderCount: Number(row.orderCount) || 0,
      totalQtySold: Number(row.totalQtySold) || 0,
      totalSales: Number(row.totalSales) || 0,
      totalProfit: Number(row.totalProfit) || 0,
      profitMarginPct: Number(row.profitMarginPct) || 0,
    }));
  } catch (error) {
    console.error('Error fetching sales by category:', error);
    throw error;
  }
}

/**
 * Get Sales by Category Summary (Aggregated)
 */
export async function getSalesByCategorySummary(dateRange: DateRange, branchSync?: string[]): Promise<SalesByCategory[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        COALESCE(NULLIF(sid.item_category_code, ''), 'N/A') as categoryCode,
        COALESCE(NULLIF(sid.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
        sum(sid.sum_amount) as totalSales,
        count(DISTINCT concat(si.branch_sync, ':', si.doc_no)) as orderCount
      FROM saleinvoice_transaction_detail sid
      INNER JOIN (
        SELECT branch_sync, doc_no
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql}
        GROUP BY branch_sync, doc_no
      ) si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE 1 = 1
        ${buildProductSalesKpiFilter('sid')}
      GROUP BY categoryCode, categoryName
      ORDER BY totalSales DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      branchName: 'All', // Placeholder as this is aggregated
      categoryCode: String(row.categoryCode || 'N/A'),
      categoryName: String(row.categoryName || 'ไม่ระบุหมวดหมู่'),
      itemCode: '',  // Not applicable in summary
      itemName: '',  // Not applicable in summary
      orderCount: Number(row.orderCount) || 0,
      totalQtySold: 0, // Not fetched in summary
      totalSales: Number(row.totalSales) || 0,
      totalProfit: 0, // Not fetched in summary
      profitMarginPct: 0, // Not fetched in summary
    }));
  } catch (error) {
    console.error('Error fetching sales by category summary:', error);
    throw error;
  }
}

/**
 * Get Detailed Sales Analysis Data
 */
export async function getSalesAnalysisData(dateRange: DateRange, branchSync?: string[]): Promise<SalesAnalysisData[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        COALESCE(NULLIF(sid.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
        toDate(toTimeZone(si.headerDocDatetime, 'Asia/Bangkok')) as docDate,
        si.doc_no as docNo,
        sid.item_code as itemCode,
        sid.item_name as itemName,
        sid.unit_code as unitCode,
        sid.qty as qty,
        sid.sum_amount / NULLIF(sid.qty, 0) as price,
        sid.discount_amount as discountAmount,
        sid.sum_amount as totalAmount
      FROM saleinvoice_transaction_detail sid
      INNER JOIN (
        SELECT branch_sync, doc_no, any(doc_datetime) AS headerDocDatetime
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql}
        GROUP BY branch_sync, doc_no
      ) si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE 1 = 1
        ${buildProductSalesKpiFilter('sid')}
      ORDER BY categoryName, docDate, docNo
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<Record<string, unknown>>;
    return data.map((row) => ({
      categoryName: String(row.categoryName || 'ไม่ระบุหมวดหมู่'),
      docDate: String(row.docDate),
      docNo: String(row.docNo),
      itemCode: String(row.itemCode),
      itemName: String(row.itemName),
      unitCode: String(row.unitCode || ''),
      qty: Number(row.qty) || 0,
      price: Number(row.price) || 0,
      discountAmount: Number(row.discountAmount) || 0,
      totalAmount: Number(row.totalAmount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching sales analysis:', error);
    throw error;
  }
}
