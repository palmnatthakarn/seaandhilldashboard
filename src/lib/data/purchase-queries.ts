// Purchase data queries - Pure functions safe for client-side usage

import type { DateRange } from './types';
import { getPreviousPeriod } from '@/lib/comparison';

// ============================================================================
// Query Export Functions for View SQL Query Feature
// ============================================================================

function getReturnDocsCte(start: string, end: string, cteName = 'return_docs'): string {
    return `${cteName} AS (
  SELECT
    j.doc_no,
    j.branch_sync,
    sum(j.debit - j.credit) as return_amount,
    toUInt8(1) as has_return
  FROM journal_transaction_detail j
  WHERE j.account_type = 'EXPENSES'
    AND position(j.account_name, 'ส่งคืน') > 0
    AND j.doc_datetime BETWEEN '${start} 00:00:00' AND '${end} 23:59:59'
  GROUP BY j.doc_no, j.branch_sync
)`;
}

/**
 * Get Total Purchases Query
 */
export function getTotalPurchasesQuery(dateRange: DateRange): string {
    const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
    return `WITH
${getReturnDocsCte(dateRange.start, dateRange.end)},
${getReturnDocsCte(previousPeriod.start, previousPeriod.end, 'previous_return_docs')},
current_purchases AS (
  SELECT pt.total_amount + coalesce(r.return_amount, 0) as net_amount
  FROM purchase_transaction pt
  LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
  WHERE pt.status_cancel != 'Cancel'
    AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
),
previous_purchases AS (
  SELECT pt.total_amount + coalesce(r.return_amount, 0) as net_amount
  FROM purchase_transaction pt
  LEFT JOIN previous_return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
  WHERE pt.status_cancel != 'Cancel'
    AND pt.doc_datetime BETWEEN '${previousPeriod.start} 00:00:00' AND '${previousPeriod.end} 23:59:59'
)
SELECT
  (SELECT sumIf(net_amount, abs(net_amount) > 0.01) FROM current_purchases) as current_value,
  (SELECT sumIf(net_amount, abs(net_amount) > 0.01) FROM previous_purchases) as previous_value`;
}

/**
 * Get Total Items Purchased Query
 */
export function getTotalItemsPurchasedQuery(dateRange: DateRange): string {
    const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
    return `WITH
${getReturnDocsCte(dateRange.start, dateRange.end)},
${getReturnDocsCte(previousPeriod.start, previousPeriod.end, 'previous_return_docs')}
SELECT
  sumIf(ptd.qty, coalesce(r.has_return, 0) = 0) as current_value,
  (SELECT sumIf(ptd.qty, coalesce(pr.has_return, 0) = 0)
   FROM purchase_transaction_detail ptd
   JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
   LEFT JOIN previous_return_docs pr ON pt.doc_no = pr.doc_no AND pt.branch_sync = pr.branch_sync
   WHERE pt.status_cancel != 'Cancel'
     AND pt.doc_datetime BETWEEN '${previousPeriod.start} 00:00:00' AND '${previousPeriod.end} 23:59:59') as previous_value
FROM purchase_transaction_detail ptd
JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
WHERE pt.status_cancel != 'Cancel'
  AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'`;
}

/**
 * Get Total Orders Query
 */
export function getTotalOrdersQuery(dateRange: DateRange): string {
    const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
    return `WITH
${getReturnDocsCte(dateRange.start, dateRange.end)},
${getReturnDocsCte(previousPeriod.start, previousPeriod.end, 'previous_return_docs')}
SELECT
  countIf(coalesce(r.has_return, 0) = 0) as current_value,
  (SELECT countIf(coalesce(pr.has_return, 0) = 0)
   FROM purchase_transaction pt
   LEFT JOIN previous_return_docs pr ON pt.doc_no = pr.doc_no AND pt.branch_sync = pr.branch_sync
   WHERE pt.status_cancel != 'Cancel'
     AND pt.doc_datetime BETWEEN '${previousPeriod.start} 00:00:00' AND '${previousPeriod.end} 23:59:59') as previous_value
FROM purchase_transaction pt
LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
WHERE pt.status_cancel != 'Cancel'
  AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'`;
}

/**
 * Get Average Order Value Query
 */
export function getAvgOrderValueQuery(dateRange: DateRange): string {
    const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
    return `WITH
${getReturnDocsCte(dateRange.start, dateRange.end)},
${getReturnDocsCte(previousPeriod.start, previousPeriod.end, 'previous_return_docs')},
current_purchases AS (
  SELECT pt.total_amount + coalesce(r.return_amount, 0) as net_amount
  FROM purchase_transaction pt
  LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
  WHERE pt.status_cancel != 'Cancel'
    AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
),
previous_purchases AS (
  SELECT pt.total_amount + coalesce(r.return_amount, 0) as net_amount
  FROM purchase_transaction pt
  LEFT JOIN previous_return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
  WHERE pt.status_cancel != 'Cancel'
    AND pt.doc_datetime BETWEEN '${previousPeriod.start} 00:00:00' AND '${previousPeriod.end} 23:59:59'
)
SELECT
  (SELECT avgIf(net_amount, abs(net_amount) > 0.01) FROM current_purchases) as current_value,
  (SELECT avgIf(net_amount, abs(net_amount) > 0.01) FROM previous_purchases) as previous_value`;
}

/**
 * Get Purchase Trend Query
 */
export function getPurchaseTrendQuery(dateRange: DateRange): string {
    return `WITH ${getReturnDocsCte(dateRange.start, dateRange.end)}
SELECT
  toDate(pt.doc_datetime + INTERVAL 7 HOUR) as month,
  sumIf(pt.total_amount + coalesce(r.return_amount, 0), abs(pt.total_amount + coalesce(r.return_amount, 0)) > 0.01) as totalPurchases,
  countIf(coalesce(r.has_return, 0) = 0) as poCount
FROM purchase_transaction pt
LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
WHERE pt.status_cancel != 'Cancel'
  AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
GROUP BY month
ORDER BY month ASC`;
}

/**
 * Get Top Suppliers Query
 */
export function getTopSuppliersQuery(dateRange: DateRange): string {
    return `WITH ${getReturnDocsCte(dateRange.start, dateRange.end)}
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
  AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
GROUP BY pt.supplier_code, pt.supplier_name
HAVING totalPurchases != 0
ORDER BY totalPurchases DESC`;
}

/**
 * Get Purchase By Category Query
 */
export function getPurchaseByCategoryQuery(dateRange: DateRange): string {
    return `WITH ${getReturnDocsCte(dateRange.start, dateRange.end)}
SELECT
  COALESCE(NULLIF(ptd.item_category_code, ''), 'N/A') as categoryCode,
  COALESCE(NULLIF(ptd.item_category_name, ''), 'ไม่ระบุหมวดหมู่') as categoryName,
  sum(ptd.qty) as totalQty,
  sum(ptd.sum_amount) as totalPurchaseValue,
  count(DISTINCT ptd.item_code) as uniqueItems
FROM purchase_transaction_detail ptd
JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
WHERE pt.status_cancel != 'Cancel'
  AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
  AND coalesce(r.has_return, 0) = 0
GROUP BY categoryCode, categoryName
ORDER BY totalPurchaseValue DESC
LIMIT 15`;
}

/**
 * Get Purchase By Brand Query
 */
export function getPurchaseByBrandQuery(dateRange: DateRange): string {
    return `WITH ${getReturnDocsCte(dateRange.start, dateRange.end)}
SELECT
  COALESCE(NULLIF(ptd.item_brand_code, ''), 'N/A') as brandCode,
  COALESCE(NULLIF(ptd.item_brand_name, ''), 'ไม่ระบุแบรนด์') as brandName,
  sum(ptd.sum_amount) as totalPurchaseValue,
  uniq(ptd.item_code) as uniqueItems
FROM purchase_transaction_detail ptd
JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
WHERE pt.status_cancel != 'Cancel'
  AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
  AND coalesce(r.has_return, 0) = 0
GROUP BY brandCode, brandName
ORDER BY totalPurchaseValue DESC
LIMIT 15`;
}

/**
 * Get Purchase By Category Summary Query
 */
export function getPurchaseByCategorySummaryQuery(dateRange: DateRange, accountType: 'EXPENSES' | 'ASSETS' = 'EXPENSES'): string {
    return `WITH journal_summary AS (
  SELECT 
    doc_no,
    branch_sync,
    account_code,
    account_name,
    sum(debit - credit) as amount
  FROM journal_transaction_detail
  WHERE account_type = '${accountType}'
    AND doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
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
    AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
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
ORDER BY totalPurchaseValue DESC`;
}

/**
 * Get AP Outstanding Query
 */
export function getAPOutstandingQuery(dateRange: DateRange): string {
    return `SELECT
  supplier_code as supplierCode,
  supplier_name as supplierName,
  sum(total_amount - \`sum_pay_money\`) as totalOutstanding,
  sum(CASE WHEN due_date < toDate('${dateRange.end} 23:59:59') AND total_amount > \`sum_pay_money\` THEN total_amount - \`sum_pay_money\` ELSE 0 END) as overdueAmount,
  count(DISTINCT doc_no, branch_sync) as docCount
FROM purchase_transaction
WHERE status_cancel != 'Cancel'
  AND doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
  AND total_amount > \`sum_pay_money\`
GROUP BY supplier_code, supplier_name
ORDER BY totalOutstanding DESC`;
}

/**
 * Helper function to build branch filter SQL
 */
function buildBranchFilterSql(branchSync?: string[]): string {
  if (!branchSync || branchSync.length === 0 || branchSync.includes('ALL')) {
    return '';
  }
  const branches = branchSync.map(b => `'${b}'`).join(', ');
  return `AND branch_sync IN (${branches})`;
}

/**
 * Get Purchase Expense Breakdown Query
 * Groups purchase expenses by account code from journal_transaction_detail
 * Only shows EXPENSES accounts that have purchase documents
 */
export function getPurchaseExpenseBreakdownQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      account_code AS accountGroup,
      account_name AS accountName,
      sum(debit - credit) AS amount,
      (amount / (
        SELECT sum(debit - credit)
        FROM journal_transaction_detail
        WHERE account_type = 'EXPENSES'
          AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
          AND doc_no IN (
            SELECT DISTINCT doc_no
            FROM purchase_transaction
            WHERE status_cancel != 'Cancel'
              AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
          )
          ${branchFilter}
      )) * 100 AS percentage
    FROM journal_transaction_detail
    WHERE account_type = 'EXPENSES'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND doc_no IN (
        SELECT DISTINCT doc_no
        FROM purchase_transaction
        WHERE status_cancel != 'Cancel'
          AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      )
      ${branchFilter}
    GROUP BY account_code, account_name
    HAVING amount != 0
    ORDER BY amount DESC
  `;
}

/**
 * Get Purchase Items by Account Code
 * Shows detailed purchase items for a specific account
 */
export function getPurchaseItemsByAccountQuery(
  dateRange: DateRange,
  accountCode: string = 'ALL',
  branchSync?: string[]
): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  
  const accountFilter = accountCode && accountCode !== 'ALL'
    ? `AND j.account_code = '${accountCode}'`
    : `AND j.account_type = 'EXPENSES'`;

  return `WITH ${getReturnDocsCte(dateRange.start, dateRange.end)}
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
  AND pt.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
  AND ptd.doc_no IN (
    SELECT DISTINCT j.doc_no
    FROM journal_transaction_detail j
    WHERE j.doc_datetime BETWEEN '${dateRange.start} 00:00:00' AND '${dateRange.end} 23:59:59'
      ${accountFilter}
      ${branchFilter}
  )
  ${branchFilter.replace(/branch_sync/g, 'pt.branch_sync')}
ORDER BY ptd.doc_datetime DESC, ptd.doc_no DESC, ptd.item_code ASC
LIMIT 1000`;
}
