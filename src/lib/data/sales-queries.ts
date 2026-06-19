// Sales data queries - Pure functions safe for client-side usage

import type { DateRange } from './types';
import { getPreviousPeriod } from '@/lib/comparison';

// ============================================
// SQL Query Functions - Generate queries with actual dates
// ============================================

function getSellableItemWhere(alias = 'sid'): string {
  return `
  AND ${alias}.status_cancel != 'Cancel'
  AND trim(${alias}.item_code) != ''
  AND trim(${alias}.item_name) != ''
  AND ${alias}.qty > 0
  AND ${alias}.sum_amount > 0
  AND trim(${alias}.unit_code) != ''
  AND (${alias}.unit_code != 'บาท' OR ${alias}.item_code = 'RR-0001')
  AND (NOT startsWith(${alias}.item_code, 'RR-') OR ${alias}.item_code = 'RR-0001')`;
}

function getProductSalesKpiWhere(alias = 'sid'): string {
  return `
  AND ${alias}.status_cancel != 'Cancel'
  AND trim(${alias}.item_code) != ''
  AND trim(${alias}.item_name) != ''
  AND ${alias}.qty > 0
  AND ${alias}.sum_amount > 0
  AND trim(${alias}.unit_code) != ''`;
}

/**
 * Get Total Sales KPI Query
 */
export function getTotalSalesQuery(dateRange: DateRange): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const startDate = dateRange.start;
  const endDate = dateRange.end;
  const previousStartDate = previousPeriod.start;
  const previousEndDate = previousPeriod.end;

  return `SELECT
  coalesce(sum(sid.sum_amount), 0) as current_value,
  (SELECT coalesce(sum(sid2.sum_amount), 0)
   FROM saleinvoice_transaction_detail sid2
   JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
   WHERE si2.status_cancel != 'Cancel' AND sid2.status_cancel != 'Cancel'
     AND date(si2.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('${previousStartDate}') AND toDate('${previousEndDate}')
     AND trim(sid2.item_code) != '' AND trim(sid2.item_name) != ''
     AND sid2.qty > 0 AND sid2.sum_amount > 0 AND trim(sid2.unit_code) != ''
  ) as previous_value
FROM saleinvoice_transaction_detail sid
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel' AND sid.status_cancel != 'Cancel'
  AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('${startDate}') AND toDate('${endDate}')
  AND trim(sid.item_code) != '' AND trim(sid.item_name) != ''
  AND sid.qty > 0 AND sid.sum_amount > 0 AND trim(sid.unit_code) != ''`;
}

/**
 * Get Gross Profit KPI Query
 */
export function getGrossProfitQuery(dateRange: DateRange): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const startDate = `${dateRange.start} 00:00:00`;
  const endDate = `${dateRange.end} 23:59:59`;
  const previousStartDate = `${previousPeriod.start} 00:00:00`;
  const previousEndDate = `${previousPeriod.end} 23:59:59`;

  return `SELECT
  coalesce(sum(sid.sum_amount - sid.sum_of_cost), 0) as current_value,
  (SELECT coalesce(sum(sid2.sum_amount - sid2.sum_of_cost), 0)
   FROM saleinvoice_transaction_detail sid2
   JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
   WHERE si2.status_cancel != 'Cancel'
     AND si2.doc_datetime BETWEEN '${previousStartDate}' AND '${previousEndDate}'
${getProductSalesKpiWhere('sid2')}) as previous_value
FROM saleinvoice_transaction_detail sid
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel'
  AND si.doc_datetime BETWEEN '${startDate}' AND '${endDate}'
${getProductSalesKpiWhere('sid')}`;
}

/**
 * Get Total Orders KPI Query
 */
export function getTotalOrdersQuery(dateRange: DateRange): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const startDate = dateRange.start;
  const endDate = dateRange.end;
  const previousStartDate = previousPeriod.start;
  const previousEndDate = previousPeriod.end;

  return `SELECT
  count(DISTINCT concat(si.branch_sync, ':', si.doc_no)) as current_value,
  (SELECT count(DISTINCT concat(si2.branch_sync, ':', si2.doc_no))
   FROM saleinvoice_transaction_detail sid2
   JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
   WHERE si2.status_cancel != 'Cancel' AND sid2.status_cancel != 'Cancel'
     AND date(si2.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('${previousStartDate}') AND toDate('${previousEndDate}')
     AND trim(sid2.item_code) != '' AND trim(sid2.item_name) != ''
     AND sid2.qty > 0 AND sid2.sum_amount > 0 AND trim(sid2.unit_code) != ''
  ) as previous_value
FROM saleinvoice_transaction_detail sid
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel' AND sid.status_cancel != 'Cancel'
  AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('${startDate}') AND toDate('${endDate}')
  AND trim(sid.item_code) != '' AND trim(sid.item_name) != ''
  AND sid.qty > 0 AND sid.sum_amount > 0 AND trim(sid.unit_code) != ''`;
}

/**
 * Get Average Order Value KPI Query
 */
export function getAvgOrderValueQuery(dateRange: DateRange): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const startDate = dateRange.start;
  const endDate = dateRange.end;
  const previousStartDate = previousPeriod.start;
  const previousEndDate = previousPeriod.end;

  return `SELECT
  coalesce(sum(order_sales) / nullIf(count(), 0), 0) as current_value,
  (SELECT coalesce(sum(order_sales) / nullIf(count(), 0), 0)
   FROM (
     SELECT si2.branch_sync, si2.doc_no, sum(sid2.sum_amount) AS order_sales
     FROM saleinvoice_transaction_detail sid2
     JOIN saleinvoice_transaction si2 ON sid2.doc_no = si2.doc_no AND sid2.branch_sync = si2.branch_sync
     WHERE si2.status_cancel != 'Cancel' AND sid2.status_cancel != 'Cancel'
       AND date(si2.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('${previousStartDate}') AND toDate('${previousEndDate}')
       AND trim(sid2.item_code) != '' AND trim(sid2.item_name) != ''
       AND sid2.qty > 0 AND sid2.sum_amount > 0 AND trim(sid2.unit_code) != ''
     GROUP BY si2.branch_sync, si2.doc_no
   )) as previous_value
FROM (
  SELECT si.branch_sync, si.doc_no, sum(sid.sum_amount) AS order_sales
  FROM saleinvoice_transaction_detail sid
  JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
  WHERE si.status_cancel != 'Cancel' AND sid.status_cancel != 'Cancel'
    AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('${startDate}') AND toDate('${endDate}')
    AND trim(sid.item_code) != '' AND trim(sid.item_name) != ''
    AND sid.qty > 0 AND sid.sum_amount > 0 AND trim(sid.unit_code) != ''
  GROUP BY si.branch_sync, si.doc_no
)`;
}

/**
 * Get Sales Trend Query with actual dates
 */
export function getSalesTrendQuery(startDate: string, endDate: string): string {
  return `
SELECT
  toStartOfDay(si.doc_datetime) as date,
  sum(sid.sum_amount) as sales,
  count(DISTINCT concat(si.branch_sync, ':', si.doc_no)) as orderCount
FROM saleinvoice_transaction_detail sid
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel'
  AND si.doc_datetime BETWEEN '${startDate}' AND '${endDate}'
${getProductSalesKpiWhere('sid')}
GROUP BY date
ORDER BY date ASC
  `.trim();
}

/**
 * Get Top Products Query with actual dates
 */
export function getTopProductsQuery(startDate: string, endDate: string): string {
  return `
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
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel'
  AND si.doc_datetime BETWEEN '${startDate} 00:00:00' AND '${endDate} 23:59:59'
${getSellableItemWhere('sid')}
GROUP BY sid.item_code, sid.item_name, sid.unit_code, sid.item_brand_name, sid.item_category_name
ORDER BY totalSales DESC
  `.trim();
}

/**
 * Get Sales by Branch Query with actual dates
 */
export function getSalesByBranchQuery(startDate: string, endDate: string): string {
  return `
SELECT
  branch_code as branchCode,
  branch_name as branchName,
  count(DISTINCT doc_no) as orderCount,
  sum(total_amount) as totalSales
FROM saleinvoice_transaction
WHERE status_cancel != 'Cancel'
  AND doc_datetime BETWEEN '${startDate}' AND '${endDate}'
  AND branch_code != ''
GROUP BY branch_code, branch_name
ORDER BY totalSales DESC
  `.trim();
}

/**
 * Get Sales by Salesperson Query with actual dates
 */
export function getSalesBySalespersonQuery(startDate: string, endDate: string): string {
  return `
SELECT
  sale_code as saleCode,
  sale_name as saleName,
  count(DISTINCT doc_no) as orderCount,
  sum(total_amount) as totalSales,
  avg(total_amount) as avgOrderValue,
  uniq(customer_code) as customerCount
FROM saleinvoice_transaction
WHERE status_cancel != 'Cancel'
  AND doc_datetime BETWEEN '${startDate}' AND '${endDate}'
  AND sale_code != ''
GROUP BY sale_code, sale_name
ORDER BY totalSales DESC
LIMIT 20
  `.trim();
}

/**
 * Get Top Customers Query with actual dates
 */
export function getTopCustomersQuery(startDate: string, endDate: string): string {
  return `
SELECT
  customer_code as customerCode,
  customer_name as customerName,
  count(DISTINCT doc_no) as orderCount,
  sum(total_amount) as totalSpent,
  avg(total_amount) as avgOrderValue,
  max(doc_datetime) as lastOrderDate,
  dateDiff('day', lastOrderDate, now()) as daysSinceLastOrder
FROM saleinvoice_transaction
WHERE status_cancel != 'Cancel'
  AND customer_code != ''
  AND doc_datetime BETWEEN '${startDate}' AND '${endDate}'
GROUP BY customer_code, customer_name
ORDER BY totalSpent DESC
LIMIT 20
  `.trim();
}

/**
 * Get AR Status Query with actual dates
 */
export function getARStatusQuery(startDate: string, endDate: string): string {
  return `
SELECT
  status_payment as statusPayment,
  count(DISTINCT doc_no) as invoiceCount,
  sum(total_amount) as totalInvoiceAmount,
  sum(sum_pay_money) as totalPaid,
  sum(total_amount - sum_pay_money) as totalOutstanding
FROM saleinvoice_transaction
WHERE status_cancel != 'Cancel'
  AND doc_type = 'CREDIT'
  AND doc_datetime BETWEEN '${startDate}' AND '${endDate}'
GROUP BY statusPayment
ORDER BY totalOutstanding DESC
  `.trim();
}

/**
 * Get Sales by Category Summary Query with actual dates
 * Aggregates sales by category across selected branches
 */
export function getSalesByCategorySummaryQuery(startDate: string, endDate: string): string {
  return `
SELECT
  COALESCE(NULLIF(sid.item_category_code, ''), 'ไม่ระบุ') as categoryCode,
  COALESCE(NULLIF(sid.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
  sum(sid.sum_amount) as totalSales,
  count(DISTINCT si.doc_no) as orderCount
FROM saleinvoice_transaction_detail sid
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel'
  AND si.doc_datetime BETWEEN '${startDate}' AND '${endDate}'
GROUP BY categoryCode, categoryName
ORDER BY totalSales DESC
  `.trim();
}

/**
 * Get Sales by Category Detail Query with actual dates
 * Returns detailed item-level sales data grouped by category (matches actual API data)
 */
export function getSalesByCategoryDetailQuery(startDate: string, endDate: string): string {
  return `
SELECT
  'All' as branchName,
  COALESCE(NULLIF(sid.item_category_code, ''), 'N/A') as categoryCode,
  COALESCE(NULLIF(sid.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
  sid.item_code as itemCode,
  sid.item_name as itemName,
  count(DISTINCT si.doc_no) as orderCount,
  sum(sid.qty) as totalQtySold,
  sum(sid.sum_amount) as totalSales,
  sum(sid.sum_amount - sid.sum_of_cost) as totalProfit,
  (totalProfit / totalSales) * 100 as profitMarginPct
FROM saleinvoice_transaction_detail sid
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel'
  AND si.doc_datetime BETWEEN '${startDate}' AND '${endDate}'
GROUP BY categoryCode, categoryName, sid.item_code, sid.item_name
ORDER BY categoryName ASC, totalSales DESC
  `.trim();
}

/**
 * Get Sales Analysis Query with actual dates
 * Detailed sales transaction data by category
 */
export function getSalesAnalysisQuery(startDate: string, endDate: string): string {
  return `
  SELECT
  COALESCE(NULLIF(sid.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
    toDate(toTimeZone(si.doc_datetime, 'Asia/Bangkok')) as docDate,
    si.doc_no as docNo,
    sid.item_code as itemCode,
    sid.item_name as itemName,
    sid.unit_code as unitCode,
    sid.qty as qty,
    sid.sum_amount / NULLIF(sid.qty, 0) as price,
    sid.discount_amount as discountAmount,
    sid.sum_amount as totalAmount
FROM saleinvoice_transaction_detail sid
JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
WHERE si.status_cancel != 'Cancel'
  AND si.doc_datetime BETWEEN '${startDate}' AND '${endDate}'
ORDER BY categoryName, docDate, docNo
    `.trim();
}
