// Inventory data queries - Pure functions safe for client-side usage

import type { DateRange } from './types';
import { getPreviousPeriod } from '@/lib/comparison';

// ============================================================================
// Query Export Functions (for View SQL Query feature)
// ============================================================================

export function getInventoryValueQuery(dateRange: DateRange): string {
    return `SELECT
  sum(total_value) as current_value
FROM (
  SELECT
    item_code,
    sum(qty) as total_qty,
    sum(qty * cost) as total_value
  FROM stock_transaction
  WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  GROUP BY item_code
  HAVING total_qty > 0
)`;
}

export function getTotalItemsQuery(dateRange: DateRange): string {
    return `SELECT
  count(*) as current_value
FROM (
  SELECT
    item_code,
    sum(qty) as total_qty
  FROM stock_transaction
  WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  GROUP BY item_code
  HAVING total_qty > 0
)`;
}

export function getLowStockCountQuery(dateRange: DateRange): string {
    return `SELECT
  count(*) as current_value
FROM (
  SELECT
    item_code,
    sum(qty) as total_qty
  FROM stock_transaction
  WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  GROUP BY item_code
  HAVING total_qty > 0 AND total_qty <= 10
)`;
}

export function getOverstockCountQuery(dateRange: DateRange): string {
    return `SELECT
  count(*) as current_value
FROM (
  SELECT
    item_code,
    sum(qty) as total_qty
  FROM stock_transaction
  WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  GROUP BY item_code
  HAVING total_qty > 1000
)`;
}

export function getStockMovementQuery(dateRange: DateRange): string {
    return `-- Stock Movement: Purchase cost (sum_amount) vs COGS (sum_of_cost)
SELECT
  toStartOfDay(doc_datetime) AS date,
  SUM(purchaseValue) AS purchaseValue,
  SUM(saleValue)     AS saleValue
FROM (
  SELECT doc_datetime,
    sum_amount AS purchaseValue,
    0          AS saleValue
  FROM purchase_transaction_detail
  WHERE status_cancel != 'Cancel'
    AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  UNION ALL
  SELECT doc_datetime,
    0            AS purchaseValue,
    sum_of_cost  AS saleValue
  FROM saleinvoice_transaction_detail
  WHERE status_cancel != 'Cancel'
    AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
)
GROUP BY date
ORDER BY date ASC`;
}

export function getLowStockItemsQuery(dateRange: DateRange): string {
    return `SELECT
  item_code as itemCode,
  any(item_name) as itemName,
  any(item_category_name) as categoryName,
  any(item_brand_name) as brandName,
  any(wh_name) as whName,
  any(wh_name) as branchName,
  sum(qty) as currentStock,
  10 as reorderPoint,
  if(sum(qty) > 0, sum(qty * cost) / sum(qty), 0) as costAvg
FROM stock_transaction
WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
GROUP BY item_code
HAVING currentStock > 0 AND currentStock <= 10
ORDER BY currentStock ASC
LIMIT 50`;
}

export function getOverstockItemsQuery(dateRange: DateRange): string {
    return `SELECT
  item_code as itemCode,
  any(item_name) as itemName,
  any(item_category_name) as categoryName,
  any(item_brand_name) as brandName,
  any(wh_name) as branchName,
  sum(qty) as currentStock,
  1000 as maxStockLevel,
  if(sum(qty) > 0, sum(qty * cost) / sum(qty), 0) as costAvg
FROM stock_transaction
WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
GROUP BY item_code
HAVING currentStock > 1000
ORDER BY currentStock DESC
LIMIT 50`;
}

export function getSlowMovingItemsQuery(dateRange: DateRange): string {
    return `SELECT
  stock.item_code as itemCode,
  stock.item_name as itemName,
  stock.categoryName as categoryName,
  stock.brandName as brandName,
  stock.currentStock as currentStock,
  stock.costAvg as costAvg,
  stock.stockValue as stockValue,
  coalesce(sales.qty_sold, 0) as qtySold,
  dateDiff('day', toDate('${dateRange.start}'), toDate('${dateRange.end}')) as daysPeriod,
  if(sales.qty_sold > 0, stock.currentStock / (sales.qty_sold / daysPeriod), 999) as daysOfStock
FROM (
  SELECT
    item_code,
    any(item_name) as item_name,
    any(item_category_name) as categoryName,
    any(item_brand_name) as brandName,
    sum(qty) as currentStock,
    if(sum(qty) > 0, sum(qty * cost) / sum(qty), 0) as costAvg,
    sum(qty * cost) as stockValue
  FROM stock_transaction
  WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  GROUP BY item_code
  HAVING currentStock > 0
) stock
LEFT JOIN (
  SELECT
    sid.item_code,
    sum(sid.qty) as qty_sold
  FROM saleinvoice_transaction_detail sid
  JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
  WHERE si.status_cancel != 'Cancel'
    AND toDate(si.doc_datetime) BETWEEN toDate('${dateRange.start}') AND toDate('${dateRange.end}')
  GROUP BY sid.item_code
) sales ON stock.item_code = sales.item_code
WHERE daysOfStock > 90
ORDER BY stockValue DESC
LIMIT 50`;
}

export function getInventoryTurnoverQuery(dateRange: DateRange): string {
    return `SELECT
  stock.categoryName as categoryName,
  stock.avgInventoryValue as avgInventoryValue,
  coalesce(sales.totalCOGS, 0) as totalCOGS,
  if(stock.avgInventoryValue > 0, coalesce(sales.totalCOGS, 0) / stock.avgInventoryValue, 0) as turnoverRatio,
  if(turnoverRatio > 0, 365 / turnoverRatio, 0) as daysToSell
FROM (
  SELECT
    item_category_name as categoryName,
    sum(qty * cost) as avgInventoryValue
  FROM stock_transaction
  WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
    AND item_category_name != ''
  GROUP BY item_category_name
  HAVING avgInventoryValue > 0
) stock
LEFT JOIN (
  SELECT
    sid.item_category_name as categoryName,
    sum(sid.sum_of_cost) as totalCOGS
  FROM saleinvoice_transaction_detail sid
  JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
  WHERE si.status_cancel != 'Cancel'
    AND si.doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  GROUP BY sid.item_category_name
) sales ON stock.categoryName = sales.categoryName
ORDER BY turnoverRatio DESC
LIMIT 15`;
}

export function getStockByBranchQuery(dateRange: DateRange): string {
    return `SELECT
  wh_code as branchCode,
  any(wh_name) as branchName,
  count(DISTINCT item_code) as itemCount,
  sum(qty) as qtyOnHand,
  sum(qty * cost) as inventoryValue
FROM stock_transaction
WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  AND wh_code != ''
GROUP BY wh_code
HAVING qtyOnHand > 0
ORDER BY inventoryValue DESC`;
}
