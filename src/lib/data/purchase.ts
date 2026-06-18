// Purchase data queries for ClickHouse
import 'server-only';

import { clickhouse } from '@/lib/clickhouse';
import type {
  DateRange,
  PurchaseKPIs,
  PurchaseTrendData,
  TopSupplier,
  PurchaseByCategory,
  PurchaseByBrand,
  APOutstanding,
  KPIData,
  SupplierPODetail,
} from './types';
import { calculateGrowth, getPreviousPeriod } from '@/lib/comparison';

// Re-export query functions for convenience (server-side usage only)
export * from './purchase-queries';

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

function buildPurchaseReturnDocsCte(
  cteName: string,
  startParam: string,
  endParam: string,
  branchFilterSql: string
): string {
  return `
    ${cteName} AS (
      SELECT
        j.doc_no,
        j.branch_sync,
        sum(j.debit - j.credit) as return_amount,
        toUInt8(1) as has_return
      FROM journal_transaction_detail j
      WHERE j.account_type = 'EXPENSES'
        AND position(j.account_name, 'ส่งคืน') > 0
        AND j.doc_datetime BETWEEN {${startParam}:String} AND {${endParam}:String}
        ${branchFilterSql.replace(/branch_sync/g, 'j.branch_sync')}
      GROUP BY j.doc_no, j.branch_sync
    )
  `;
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

/**
 * Get Purchase KPIs: Total purchases, items purchased, orders, avg order value
 */
export async function getPurchaseKPIs(dateRange: DateRange, branchSync?: string[]): Promise<PurchaseKPIs> {
  try {
    const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);
    const prevDateParams = buildDateTimeRangeParamsInclusive(previousPeriod);

    const currentReturnDocsCte = buildPurchaseReturnDocsCte('return_docs', 'start_date', 'end_date', branchFilter.sql);
    const previousReturnDocsCte = buildPurchaseReturnDocsCte('previous_return_docs', 'previous_start', 'previous_end', branchFilter.sql);

    // Total Purchases
    const purchaseQuery = `
      WITH
      ${currentReturnDocsCte},
      ${previousReturnDocsCte},
      current_purchases AS (
        SELECT
          pt.total_amount + coalesce(r.return_amount, 0) as net_amount
        FROM purchase_transaction pt
        LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      ),
      previous_purchases AS (
        SELECT
          pt.total_amount + coalesce(r.return_amount, 0) as net_amount
        FROM purchase_transaction pt
        LEFT JOIN previous_return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND pt.doc_datetime BETWEEN {previous_start:String} AND {previous_end:String}
          ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      )
      SELECT
        (SELECT sumIf(net_amount, abs(net_amount) > 0.01) FROM current_purchases) as current_value,
        (SELECT sumIf(net_amount, abs(net_amount) > 0.01) FROM previous_purchases) as previous_value
    `;

    // Total Items Purchased
    const itemsQuery = `
      WITH
      ${currentReturnDocsCte},
      ${previousReturnDocsCte}
      SELECT
        sumIf(ptd.qty, coalesce(r.has_return, 0) = 0) as current_value,
        (SELECT sumIf(ptd.qty, coalesce(pr.has_return, 0) = 0)
         FROM purchase_transaction_detail ptd
         JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
         LEFT JOIN previous_return_docs pr ON pt.doc_no = pr.doc_no AND pt.branch_sync = pr.branch_sync
         WHERE pt.status_cancel != 'Cancel'
           AND pt.doc_datetime BETWEEN {previous_start:String} AND {previous_end:String}
           ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
        ) as previous_value
      FROM purchase_transaction_detail ptd
      JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
    `;

    // Total Orders
    const ordersQuery = `
      WITH
      ${currentReturnDocsCte},
      ${previousReturnDocsCte}
      SELECT
        countIf(coalesce(r.has_return, 0) = 0) as current_value,
        (SELECT countIf(coalesce(pr.has_return, 0) = 0)
         FROM purchase_transaction pt
         LEFT JOIN previous_return_docs pr ON pt.doc_no = pr.doc_no AND pt.branch_sync = pr.branch_sync
         WHERE pt.status_cancel != 'Cancel'
           AND pt.doc_datetime BETWEEN {previous_start:String} AND {previous_end:String}
           ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
        ) as previous_value
      FROM purchase_transaction pt
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
    `;

    // Average Order Value
    const avgOrderQuery = `
      WITH
      ${currentReturnDocsCte},
      ${previousReturnDocsCte},
      current_purchases AS (
        SELECT
          pt.total_amount + coalesce(r.return_amount, 0) as net_amount
        FROM purchase_transaction pt
        LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      ),
      previous_purchases AS (
        SELECT
          pt.total_amount + coalesce(r.return_amount, 0) as net_amount
        FROM purchase_transaction pt
        LEFT JOIN previous_return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND pt.doc_datetime BETWEEN {previous_start:String} AND {previous_end:String}
          ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      )
      SELECT
        (SELECT avgIf(net_amount, abs(net_amount) > 0.01) FROM current_purchases) as current_value,
        (SELECT avgIf(net_amount, abs(net_amount) > 0.01) FROM previous_purchases) as previous_value
    `;

    const params = {
      start_date: dateParams.start_date,
      end_date: dateParams.end_date,
      previous_start: prevDateParams.start_date,
      previous_end: prevDateParams.end_date,
      ...branchFilter.params
    };

    const [purchaseResult, itemsResult, ordersResult, avgOrderResult] = await Promise.all([
      clickhouse.query({ query: purchaseQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: itemsQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: ordersQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: avgOrderQuery, query_params: params, format: 'JSONEachRow' }),
    ]);

    const purchaseData = await purchaseResult.json();
    const itemsData = await itemsResult.json();
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

    return {
      totalPurchases: createKPI(purchaseData),
      totalItemsPurchased: createKPI(itemsData),
      totalPOCount: createKPI(ordersData),
      totalOrders: createKPI(ordersData),
      avgPOValue: createKPI(avgOrderData),
      avgOrderValue: createKPI(avgOrderData),
      apOutstanding: createKPI([{ current_value: 0, previous_value: 0 }]),
    };
  } catch (error) {
    console.error('Error fetching purchase KPIs:', error);

    const emptyKPI: KPIData = {
      value: 0,
      previousValue: 0,
      growth: 0,
      growthPercentage: 0,
      trend: 'neutral',
    };

    // Return safe defaults so Purchase page can still render other sections.
    return {
      totalPurchases: emptyKPI,
      totalItemsPurchased: emptyKPI,
      totalPOCount: emptyKPI,
      totalOrders: emptyKPI,
      avgPOValue: emptyKPI,
      avgOrderValue: emptyKPI,
      apOutstanding: emptyKPI,
    };
  }
}

/**
 * Get Purchase Trend data by day
 */
export async function getPurchaseTrendData(dateRange: DateRange, branchSync?: string[]): Promise<PurchaseTrendData[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);
    const returnDocsCte = buildPurchaseReturnDocsCte('return_docs', 'start_date', 'end_date', branchFilter.sql);

    const query = `
      WITH ${returnDocsCte}
      SELECT
        toDate(pt.doc_datetime + INTERVAL 7 HOUR) as month,
        sumIf(pt.total_amount + coalesce(r.return_amount, 0), abs(pt.total_amount + coalesce(r.return_amount, 0)) > 0.01) as totalPurchases,
        countIf(coalesce(r.has_return, 0) = 0) as poCount
      FROM purchase_transaction pt
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      GROUP BY month
      ORDER BY month ASC
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
    return data.map((row: Record<string, unknown>) => ({
      month: row.month,
      totalPurchases: Number(row.totalPurchases) || 0,
      poCount: Number(row.poCount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching purchase trend:', error);
    throw error;
  }
}

/**
 * Get Top Suppliers
 */
export async function getTopSuppliers(dateRange: DateRange, branchSync?: string[], limit: number = 0): Promise<TopSupplier[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);
    const returnDocsCte = buildPurchaseReturnDocsCte('return_docs', 'start_date', 'end_date', branchFilter.sql);

    const query = `
      WITH ${returnDocsCte}
      SELECT
        pt.supplier_code as supplierCode,
        pt.supplier_name as supplierName,
        countIf(coalesce(r.has_return, 0) = 0) as poCount,
        sumIf(pt.total_amount + coalesce(r.return_amount, 0), abs(pt.total_amount + coalesce(r.return_amount, 0)) > 0.01) as totalPurchases,
        avgIf(pt.total_amount + coalesce(r.return_amount, 0), abs(pt.total_amount + coalesce(r.return_amount, 0)) > 0.01) as avgPOValue,
        maxIf(pt.doc_datetime, coalesce(r.has_return, 0) = 0) as lastPurchaseDate
      FROM purchase_transaction pt
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.supplier_code != ''
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      GROUP BY supplier_code, supplier_name
      HAVING totalPurchases != 0
      ORDER BY totalPurchases DESC
      ${limit > 0 ? `LIMIT ${limit}` : ''}
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
    return data.map((row: Record<string, unknown>) => ({
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
      poCount: Number(row.poCount) || 0,
      totalPurchases: Number(row.totalPurchases) || 0,
      avgPOValue: Number(row.avgPOValue) || 0,
      lastPurchaseDate: row.lastPurchaseDate,
    }));
  } catch (error) {
    console.error('Error fetching top suppliers:', error);
    throw error;
  }
}

/**
 * Get Purchase by Category
 */
export async function getPurchaseByCategory(dateRange: DateRange, branchSync?: string[]): Promise<PurchaseByCategory[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);
    const returnDocsCte = buildPurchaseReturnDocsCte('return_docs', 'start_date', 'end_date', branchFilter.sql);

    const query = `
      WITH ${returnDocsCte}
      SELECT
        COALESCE(NULLIF(ptd.item_category_code, ''), 'N/A') as categoryCode,
        COALESCE(NULLIF(ptd.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
        ptd.item_code as itemCode,
        ptd.item_name as itemName,
        sum(ptd.qty) as totalQty,
        sum(ptd.sum_amount) as totalPurchaseValue,
        count(DISTINCT ptd.item_code) as uniqueItems
      FROM purchase_transaction_detail ptd
      JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        AND coalesce(r.has_return, 0) = 0
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      GROUP BY categoryCode, categoryName, ptd.item_code, ptd.item_name
      ORDER BY categoryName ASC, totalPurchaseValue DESC
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
    return data.map((row: Record<string, unknown>) => ({
      categoryCode: row.categoryCode || 'N/A',
      categoryName: row.categoryName || 'ไม่ระบุหมวดหมู่',
      itemCode: row.itemCode,
      itemName: row.itemName,
      totalQty: Number(row.totalQty) || 0,
      totalPurchaseValue: Number(row.totalPurchaseValue) || 0,
      uniqueItems: Number(row.uniqueItems) || 0,
    }));
  } catch (error) {
    console.error('Error fetching purchase by category:', error);
    throw error;
  }
}

/**
 * Get Purchase by Category Summary (แสดงตามผังบัญชีค่าใช้จ่าย EXPENSES)
 * เปลี่ยนจากดึงจาก purchase_transaction_detail มาเป็นดึงจาก journal_transaction_detail
 * เพื่อแสดงผังบัญชีจริงที่เป็นค่าใช้จ่าย แทนการแสดงหมวดหมู่สินค้า
 */
export async function getPurchaseByCategorySummary(
  dateRange: DateRange,
  branchSync?: string[],
  accountType: 'EXPENSES' | 'ASSETS' = 'EXPENSES'
): Promise<PurchaseByCategory[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      WITH journal_summary AS (
        SELECT 
          doc_no,
          branch_sync,
          account_code,
          account_name,
          sum(debit - credit) as amount
        FROM journal_transaction_detail
        WHERE account_type = {account_type:String}
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql}
        GROUP BY doc_no, branch_sync, account_code, account_name
        HAVING amount != 0
      ),
      purchase_summary AS (
        SELECT
          ptd.doc_no,
          ptd.branch_sync,
          sum(ptd.qty) as total_qty
        FROM purchase_transaction_detail ptd
        JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql.replace(/branch_sync/g, 'ptd.branch_sync')}
        GROUP BY ptd.doc_no, ptd.branch_sync
      )
      SELECT
        j.account_code as categoryCode,
        j.account_name as categoryName,
        sum(j.amount) as totalPurchaseValue,
        count(DISTINCT j.doc_no, j.branch_sync) as orderCount,
        sum(p.total_qty) as totalQty
      FROM journal_summary j
      JOIN purchase_summary p ON j.doc_no = p.doc_no AND j.branch_sync = p.branch_sync
      GROUP BY j.account_code, j.account_name
      ORDER BY totalPurchaseValue DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        account_type: accountType,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: Record<string, unknown>) => ({
      categoryCode: row.categoryCode || 'N/A',
      categoryName: row.categoryName || 'ไม่ระบุหมวดหมู่',
      itemCode: '',  // Not applicable in summary
      itemName: '',  // Not applicable in summary
      totalQty: Number(row.totalQty) || 0,
      totalPurchaseValue: Number(row.totalPurchaseValue) || 0,
      orderCount: Number(row.orderCount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching purchase by category summary:', error);
    throw error;
  }
}

/**
 * Get Purchase Analysis Data (detailed purchase transactions)
 * Similar to Sales Analysis - shows all purchase line items
 */
export async function getPurchaseAnalysisData(dateRange: DateRange, branchSync?: string[]): Promise<import('./types').PurchaseAnalysisData[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const returnDocsCte = buildPurchaseReturnDocsCte('return_docs', 'start_date', 'end_date', branchFilter.sql);

    const query = `
      WITH ${returnDocsCte}
      SELECT
        COALESCE(NULLIF(ptd.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
        toDate(toTimeZone(pt.doc_datetime, 'Asia/Bangkok')) as docDate,
        pt.doc_no as docNo,
        ptd.item_code as itemCode,
        ptd.item_name as itemName,
        ptd.unit_code as unitCode,
        ptd.qty as qty,
        ptd.sum_amount / NULLIF(ptd.qty, 0) as price,
        ptd.sum_amount as totalAmount
      FROM purchase_transaction_detail ptd
      JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        AND coalesce(r.has_return, 0) = 0
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      ORDER BY categoryName, docDate, docNo
    `;

    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: Record<string, unknown>) => ({
      categoryName: row.categoryName || 'ไม่ระบุหมวดหมู่',
      docDate: row.docDate,
      docNo: row.docNo,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unitCode: row.unitCode || '',
      qty: Number(row.qty) || 0,
      price: Number(row.price) || 0,
      totalAmount: Number(row.totalAmount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching purchase analysis:', error);
    throw error;
  }
}

/**
 * Get Purchase by Brand
 */
export async function getPurchaseByBrand(dateRange: DateRange, branchSync?: string[]): Promise<PurchaseByBrand[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const returnDocsCte = buildPurchaseReturnDocsCte('return_docs', 'start_date', 'end_date', branchFilter.sql);

    const query = `
      WITH ${returnDocsCte}
      SELECT
        ptd.item_brand_code as brandCode,
        ptd.item_brand_name as brandName,
        sum(ptd.sum_amount) as totalPurchaseValue,
        uniq(ptd.item_code) as uniqueItems
      FROM purchase_transaction_detail ptd
      JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        AND ptd.item_brand_name != ''
        AND coalesce(r.has_return, 0) = 0
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      GROUP BY ptd.item_brand_code, ptd.item_brand_name
      ORDER BY totalPurchaseValue DESC
      LIMIT 15
    `;
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: Record<string, unknown>) => ({
      brandCode: row.brandCode || '',
      brandName: row.brandName || 'ไม่ระบุ',
      totalPurchaseValue: Number(row.totalPurchaseValue) || 0,
      uniqueItems: Number(row.uniqueItems) || 0,
    }));
  } catch (error) {
    console.error('Error fetching purchase by brand:', error);
    throw error;
  }
}

/**
 * Get AP Outstanding (Accounts Payable)
 */
export async function getAPOutstanding(dateRange: DateRange, branchSync?: string[]): Promise<APOutstanding[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        supplier_code as supplierCode,
        supplier_name as supplierName,
        sum(total_amount - \`sum_pay_money\`) as totalOutstanding,
        sum(CASE WHEN due_date < toDate({end_date:String}) AND total_amount > \`sum_pay_money\` THEN total_amount - \`sum_pay_money\` ELSE 0 END) as overdueAmount,
        count(DISTINCT doc_no, branch_sync) as docCount
      FROM purchase_transaction
      WHERE status_cancel != 'Cancel'
        AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        AND total_amount > \`sum_pay_money\`
        ${branchFilter.sql}
      GROUP BY supplier_code, supplier_name
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

    const data = await result.json();
    return data.map((row: Record<string, unknown>) => ({
      supplierCode: row.supplierCode || '',
      supplierName: row.supplierName || 'ไม่ระบุ',
      totalOutstanding: Number(row.totalOutstanding) || 0,
      overdueAmount: Number(row.overdueAmount) || 0,
      docCount: Number(row.docCount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching AP outstanding:', error);
    throw error;
  }
}

/**
 * Get Purchase data joined with Journal by Product Category
 * Similar to sales P&L by product category but for purchases
 */
export async function getPurchaseByProductCategory(
  dateRange: DateRange,
  branchSync?: string[]
): Promise<import('./types').PurchaseAccountData[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);
    const query = `WITH purchases AS (
SELECT
ptd.doc_no,
ptd.branch_sync,
if(ptd.item_category_code = '' OR ptd.item_category_code IS NULL, 'OTHER', ptd.item_category_code) AS item_category_code,
if(ptd.item_category_name = '' OR ptd.item_category_name IS NULL, 'N/A', ptd.item_category_name) AS item_category_name,
SUM(ptd.sum_amount) AS sum_amount,
SUM(ptd.qty) AS qty
FROM purchase_transaction_detail ptd
WHERE ptd.doc_no IN (
SELECT doc_no FROM purchase_transaction WHERE status_cancel != 'Cancel'
)
AND ptd.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
${branchFilter.sql.replace(/branch_sync/g, 'ptd.branch_sync')}
GROUP BY ptd.doc_no, ptd.branch_sync, item_category_code, item_category_name
),
journals AS (
SELECT
doc_no,
branch_sync,
account_type,
account_code,
account_name,
SUM(credit - debit) AS credit_net,
SUM(debit - credit) AS debit_net
FROM journal_transaction_detail
WHERE account_type IN ('EXPENSES', 'ASSETS', 'LIABILITIES')
AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
${branchFilter.sql}
GROUP BY doc_no, branch_sync, account_type, account_code, account_name
)
SELECT
p.item_category_code AS categoryCode,
p.item_category_name AS categoryName,
j.account_type AS accountType,
j.account_code AS accountCode,
j.account_name AS accountName,
SUM(if(j.account_type = 'EXPENSES', j.debit_net, 0)) AS expenses,
SUM(if(j.account_type = 'ASSETS', j.debit_net, 0)) AS assets,
SUM(if(j.account_type = 'LIABILITIES', j.credit_net, 0)) AS liabilities,
SUM(p.sum_amount) AS totalPurchaseValue,
SUM(p.qty) AS totalQty
FROM purchases p
INNER JOIN journals j
ON p.doc_no = j.doc_no AND p.branch_sync = j.branch_sync
GROUP BY p.item_category_code, p.item_category_name, j.account_type, j.account_code, j.account_name
ORDER BY j.account_type, totalPurchaseValue DESC`;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params
      },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: Record<string, unknown>) => ({
      categoryCode: row.categoryCode ?? 'OTHER',
      categoryName: row.categoryName ?? 'ไม่ระบุหมวด',
      accountType: row.accountType as 'EXPENSES' | 'ASSETS' | 'LIABILITIES',
      accountCode: row.accountCode ?? '',
      accountName: row.accountName ?? '',
      expenses: Number(row.expenses) || 0,
      assets: Number(row.assets) || 0,
      liabilities: Number(row.liabilities) || 0,
      totalPurchaseValue: Number(row.totalPurchaseValue) || 0,
      totalQty: Number(row.totalQty) || 0,
    }));
  } catch (error) {
    console.error('Error fetching purchase by product category (with journal):', error);
    throw error;
  }
}

/**
 * Get Chart of Accounts list joined with Purchase transactions
 */
export async function getPurchaseChartOfAccounts(
  dateRange: DateRange,
  branchSync?: string[]
): Promise<import('./types').PurchaseChartOfAccountItem[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);
    const query = `
      WITH purchases AS (
        SELECT DISTINCT 
          ptd.doc_no, 
          ptd.branch_sync
        FROM purchase_transaction_detail ptd
        JOIN purchase_transaction pt 
          ON ptd.doc_no = pt.doc_no 
          AND ptd.branch_sync = pt.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      )
      SELECT
        j.account_code AS accountCode,
        j.account_name AS accountName,
        j.account_type AS accountType,
        SUM(j.debit - j.credit) AS netAmount,
        COUNT(DISTINCT j.doc_no, j.branch_sync) AS docCount
      FROM journal_transaction_detail j
      INNER JOIN purchases p 
        ON j.doc_no = p.doc_no AND j.branch_sync = p.branch_sync
      WHERE j.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql}
      GROUP BY j.account_code, j.account_name, j.account_type
      HAVING netAmount != 0
      ORDER BY j.account_type, j.account_code
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
    return data.map((row: Record<string, unknown>) => ({
      accountCode: row.accountCode ?? '',
      accountName: row.accountName ?? '',
      accountType: row.accountType ?? '',
      netAmount: Number(row.netAmount) || 0,
      docCount: Number(row.docCount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching purchase chart of accounts:', error);
    throw error;
  }
}

/**
 * Get Purchase Items filtered by Account Code (from Journal)
 * If accountCode is empty string or 'ALL', returns all expense items
 */
export async function getPurchaseItemsByAccount(
  dateRange: DateRange,
  accountCode: string,
  branchSync?: string[]
): Promise<import('./types').PurchaseItemsByAccount[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const returnDocsCte = buildPurchaseReturnDocsCte('return_docs', 'start_date', 'end_date', branchFilter.sql);

    // If no specific account, get all EXPENSES accounts
    const accountFilter = accountCode && accountCode !== 'ALL'
      ? `AND j.account_code = {account_code:String}`
      : `AND j.account_type = 'EXPENSES'`;

    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      WITH ${returnDocsCte}
      SELECT
        DATE(ptd.doc_datetime) AS docDate,
        ptd.doc_no AS docNo,
        ptd.item_code AS itemCode,
        ptd.item_name AS itemName,
        COALESCE(NULLIF(ptd.item_category_code, ''), 'N/A') AS categoryCode,
        COALESCE(NULLIF(ptd.item_category_name, ''), 'ไม่ระบุหมวดหมู่') AS categoryName,
        COALESCE(NULLIF(ptd.item_brand_name, ''), 'ไม่ระบุแบรนด์') AS brandName,
        ptd.unit_code AS unitCode,
        if(coalesce(r.has_return, 0) = 0, ptd.qty, -ptd.qty) AS qty,
        ptd.price AS price,
        if(coalesce(r.has_return, 0) = 0, ptd.sum_amount, -ptd.sum_amount) AS totalAmount
      FROM purchase_transaction_detail ptd
      JOIN purchase_transaction pt 
        ON ptd.doc_no = pt.doc_no 
        AND ptd.branch_sync = pt.branch_sync
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        AND ptd.doc_no IN (
          SELECT DISTINCT j.doc_no
          FROM journal_transaction_detail j
          WHERE j.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
            ${accountFilter}
            ${branchFilter.sql}
        )
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      ORDER BY ptd.doc_datetime DESC, ptd.doc_no DESC
    `;

    const queryParams: Record<string, unknown> = {
      ...dateParams,
      ...branchFilter.params
    };
    
    if (accountCode && accountCode !== 'ALL') {
      queryParams.account_code = accountCode;
    }

    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: Record<string, unknown>) => ({
      docDate: row.docDate ?? '',
      docNo: row.docNo ?? '',
      itemCode: row.itemCode ?? '',
      itemName: row.itemName ?? '',
      categoryCode: row.categoryCode ?? 'N/A',
      categoryName: row.categoryName ?? 'ไม่ระบุหมวดหมู่',
      brandName: row.brandName ?? 'ไม่ระบุแบรนด์',
      unitCode: row.unitCode ?? '',
      qty: Number(row.qty ?? 0),
      price: Number(row.price ?? 0),
      totalAmount: Number(row.totalAmount ?? 0),
    }));
  } catch (error) {
    console.error('Error fetching purchase items by account:', error);
    throw error;
  }
}

/**
 * Get Purchase Expense Breakdown by account code
 * Shows EXPENSES accounts that have purchase documents
 */
export async function getPurchaseExpenseBreakdown(
  dateRange: DateRange,
  branchSync?: string[]
): Promise<import('./types').CategoryBreakdown[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        account_code AS accountGroup,
        account_name AS accountName,
        sum(debit - credit) AS amount,
        (amount / (
          SELECT sum(debit - credit)
          FROM journal_transaction_detail
          WHERE account_type = 'EXPENSES'
            AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
            AND doc_no IN (
              SELECT DISTINCT doc_no
              FROM purchase_transaction
              WHERE status_cancel != 'Cancel'
                AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
            )
            ${branchFilter.sql}
        )) * 100 AS percentage
      FROM journal_transaction_detail
      WHERE account_type = 'EXPENSES'
        AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        AND doc_no IN (
          SELECT DISTINCT doc_no
          FROM purchase_transaction
          WHERE status_cancel != 'Cancel'
            AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        )
        ${branchFilter.sql}
      GROUP BY account_code, account_name
      HAVING amount != 0
      ORDER BY amount DESC
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
    return data.map((row: Record<string, unknown>) => ({
      accountGroup: row.accountGroup ?? '',
      accountName: row.accountName ?? '',
      amount: Number(row.amount ?? 0),
      percentage: Number(row.percentage ?? 0),
    }));
  } catch (error) {
    console.error('Error fetching purchase expense breakdown:', error);
    throw error;
  }
}

/**
 * Get Detailed PO breakdown for a specific supplier
 * Includes Account Mapping and Item Categories
 */
export async function getSupplierPODetails(
  dateRange: DateRange,
  supplierCode: string,
  branchSync?: string[]
): Promise<SupplierPODetail[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

    const query = `
      SELECT
        DATE(pt.doc_datetime) as docDate,
        pt.doc_no as docNo,
        pt.supplier_code as supplierCode,
        pt.supplier_name as supplierName,
        j.account_code as accountCode,
        j.account_name as accountName,
        COALESCE(NULLIF(ptd.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
        COALESCE(NULLIF(ptd.item_category_code, ''), 'N/A') as categoryCode,
        ptd.item_code as itemCode,
        ptd.item_name as itemName,
        ptd.unit_code as unitCode,
        ptd.qty as qty,
        ptd.price as price,
        ptd.sum_amount as totalAmount
      FROM purchase_transaction pt
      LEFT JOIN purchase_transaction_detail ptd 
        ON pt.doc_no = ptd.doc_no 
        AND pt.branch_sync = ptd.branch_sync
      LEFT JOIN journal_transaction_detail j 
        ON pt.doc_no = j.doc_no 
        AND pt.branch_sync = j.branch_sync 
        AND j.account_type IN ('EXPENSES', 'ASSETS')
      WHERE pt.status_cancel != 'Cancel'
        AND pt.supplier_code = {supplier_code:String}
        AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql.replace(/branch_sync/g, 'pt.branch_sync')}
      ORDER BY pt.doc_datetime DESC, pt.doc_no DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        ...dateParams,
        ...branchFilter.params,
        supplier_code: supplierCode
      },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: Record<string, unknown>) => ({
      docDate: row.docDate ?? '',
      docNo: row.docNo ?? '',
      supplierCode: row.supplierCode ?? '',
      supplierName: row.supplierName ?? '',
      accountCode: row.accountCode ?? 'N/A',
      accountName: row.accountName ?? 'ไม่พบผังบัญชี',
      categoryCode: row.categoryCode ?? 'N/A',
      categoryName: row.categoryName ?? 'ไม่ระบุหมวดหมู่',
      itemCode: row.itemCode ?? '',
      itemName: row.itemName ?? '',
      unitCode: row.unitCode ?? '',
      qty: Number(row.qty ?? 0),
      price: Number(row.price ?? 0),
      totalAmount: Number(row.totalAmount ?? 0),
    }));
  } catch (error) {
    console.error('Error fetching supplier PO details:', error);
    throw error;
  }
}
