// Inventory data queries for ClickHouse
import 'server-only';

import { clickhouse } from '@/lib/clickhouse';
import type {
  DateRange,
  InventoryKPIs,
  StockMovement,
  LowStockItem,
  OverstockItem,
  SlowMovingItem,
  InventoryTurnover,
  StockByBranch,
  KPIData,
} from './types';
import { calculateGrowth } from '@/lib/comparison';

// Re-export query functions for convenience (server-side usage only)
export * from './inventory-queries';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build branch filter SQL clause and parameters
 * Handles single branch, multiple branches, or ALL branches
 */
function buildBranchFilter(branches?: string[]): { sql: string; params: Record<string, any> } {
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

// ============================================================================
// Data Fetching Functions
// ============================================================================

/**
 * Get Inventory KPIs: Total purchase value, purchased items, low stock alerts, overstock alerts
 * Note: Now fetches PURCHASE QUANTITY in the selected date range, not cumulative balance
 * stock_transaction table has qty (>0=in, <0=out), cost, amount
 */
export async function getInventoryKPIs(dateRange: DateRange, branchSync?: string[]): Promise<InventoryKPIs> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const stBranchFilter = branchFilter.sql ? branchFilter.sql.replace(/branch_sync/g, 'st.branch_sync') : '';
    const plainBranchFilter = branchFilter.sql || '';

    // Total Purchase Value in date range (qty * cost for purchases only)
    let valueQuery = `
      SELECT
        sum(purchase_value) as current_value
      FROM (
        SELECT
          st.item_code,
          sumIf(st.qty, st.qty > 0) as total_purchase_qty,
          sumIf(st.qty * st.cost, st.qty > 0) as purchase_value
        FROM stock_transaction st
        INNER JOIN (
          SELECT DISTINCT doc_no, branch_sync
          FROM purchase_transaction
          WHERE status_cancel != 'Cancel'
          ${plainBranchFilter}
        ) pt ON st.doc_no = pt.doc_no AND st.branch_sync = pt.branch_sync
        WHERE st.doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        ${stBranchFilter}
    `;

    valueQuery += `
        GROUP BY st.item_code
        HAVING total_purchase_qty > 0
      )
    `;

    // Total Unique Items purchased in date range
    let itemsQuery = `
      SELECT
        count(*) as current_value
      FROM (
        SELECT
          st.item_code,
          sumIf(st.qty, st.qty > 0) as total_purchase_qty
        FROM stock_transaction st
        INNER JOIN (
          SELECT DISTINCT doc_no, branch_sync
          FROM purchase_transaction
          WHERE status_cancel != 'Cancel'
          ${plainBranchFilter}
        ) pt ON st.doc_no = pt.doc_no AND st.branch_sync = pt.branch_sync
        WHERE st.doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        ${stBranchFilter}
    `;

    itemsQuery += `
        GROUP BY st.item_code
        HAVING total_purchase_qty > 0
      )
    `;

    // Low Stock Items - items with Days on Hand <= 7
    let lowStockQuery = `
      SELECT
        count(*) as current_value
      FROM (
        SELECT
          item_code,
          sum(qty) as total_qty,
          abs(sumIf(qty, qty < 0 AND toDate(doc_datetime) >= toDate('${dateRange.start}'))) as total_out,
          greatest(1, dateDiff('day', toDate('${dateRange.start}'), toDate('${dateRange.end}'))) as days_period,
          total_out / days_period as avg_daily_out,
          if(avg_daily_out > 0, total_qty / avg_daily_out, 999999) as days_on_hand
        FROM stock_transaction
        WHERE toDate(doc_datetime) <= toDate('${dateRange.end}')
        ${branchFilter.sql}
    `;

    lowStockQuery += `
        GROUP BY item_code
        HAVING total_qty > 0 AND avg_daily_out > 0 AND days_on_hand <= 7
      )
    `;

    // Overstock Items - items with Days on Hand > 90
    let overstockQuery = `
      SELECT
        count(*) as current_value
      FROM (
        SELECT
          item_code,
          sum(qty) as total_qty,
          abs(sumIf(qty, qty < 0 AND toDate(doc_datetime) >= toDate('${dateRange.start}'))) as total_out,
          greatest(1, dateDiff('day', toDate('${dateRange.start}'), toDate('${dateRange.end}'))) as days_period,
          total_out / days_period as avg_daily_out,
          if(avg_daily_out > 0, total_qty / avg_daily_out, 999999) as days_on_hand
        FROM stock_transaction
        WHERE toDate(doc_datetime) <= toDate('${dateRange.end}')
        ${branchFilter.sql}
    `;

    overstockQuery += `
        GROUP BY item_code
        HAVING total_qty > 0 AND days_on_hand > 90
      )
    `;

    const params = {
      start_date: dateRange.start,
      end_date: dateRange.end,
      ...branchFilter.params
    };

    const [valueResult, itemsResult, lowStockResult, overstockResult] = await Promise.all([
      clickhouse.query({ query: valueQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: itemsQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: lowStockQuery, query_params: params, format: 'JSONEachRow' }),
      clickhouse.query({ query: overstockQuery, query_params: params, format: 'JSONEachRow' }),
    ]);

    const valueData = await valueResult.json();
    const itemsData = await itemsResult.json();
    const lowStockData = await lowStockResult.json();
    const overstockData = await overstockResult.json();

    const createKPI = (data: any[]): KPIData => {
      const row = data[0] || { current_value: 0 };
      const current = Number(row.current_value) || 0;

      return {
        value: current,
        previousValue: 0,
        growth: 0,
        growthPercentage: 0,
        trend: 'neutral',
      };
    };

    return {
      totalInventoryValue: createKPI(valueData),
      totalItems: createKPI(itemsData),
      totalItemsInStock: createKPI(itemsData),
      lowStockItems: createKPI(lowStockData),
      lowStockAlerts: createKPI(lowStockData),
      overstockItems: createKPI(overstockData),
      overstockAlerts: createKPI(overstockData),
    };
  } catch (error) {
    console.error('Error fetching inventory KPIs:', error);
    throw error;
  }
}

/**
 * Get Stock Movement (Purchases IN / Sales OUT) over time
 *
 * Logic:
 *   purchaseValue = sum_amount from purchase_transaction_detail
 *                  (actual purchase price per line, ERP-calculated, unit-correct)
 *   saleValue     = sum_of_cost from saleinvoice_transaction_detail
 *                  (COGS per line, ERP-calculated, unit-correct)
 *
 * Both values come from detail tables so unit conversion is handled by the ERP.
 */
export async function getStockMovement(dateRange: DateRange, branchSync?: string[]): Promise<StockMovement[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);
    const plainBranchFilter = branchFilter.sql || '';

    const query = `
      SELECT
        toStartOfDay(doc_datetime) AS date,
        SUM(purchaseValue)         AS purchaseValue,
        SUM(saleValue)             AS saleValue
      FROM (
        -- ซื้อเข้า: ต้นทุนสินค้ารับเข้าสต็อก (sum_of_cost จาก purchase_transaction_detail)
        SELECT
          doc_datetime,
          sum_of_cost AS purchaseValue,
          0           AS saleValue
        FROM purchase_transaction_detail
        WHERE status_cancel != 'Cancel'
          AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
          ${plainBranchFilter}
        UNION ALL
        -- ขายออก: ต้นทุนสินค้าขาย (COGS) = sum_of_cost จาก ERP
        SELECT
          doc_datetime,
          0           AS purchaseValue,
          sum_of_cost AS saleValue
        FROM saleinvoice_transaction_detail
        WHERE status_cancel != 'Cancel'
          AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
          ${plainBranchFilter}
      )
      GROUP BY date
      ORDER BY date ASC
    `;

    const result = await clickhouse.query({
      query,
      query_params: branchFilter.params,
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: any) => ({
      date: row.date,
      qtyIn:  0,
      qtyOut: 0,
      valueIn:  Number(row.purchaseValue) || 0,  // ราคาซื้อเข้า (sum_amount)
      valueOut: Number(row.saleValue)     || 0,  // ต้นทุนขายออก COGS (sum_of_cost)
    }));
  } catch (error) {
    console.error('Error fetching stock movement:', error);
    throw error;
  }
}


/**
 * Get Low Stock Items (items with stock balance <= 10 units)
 */
export async function getLowStockItems(dateRange: DateRange, branchSync?: string[]): Promise<LowStockItem[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    let query = `
      SELECT
        item_code as itemCode,
        any(item_name) as itemName,
        any(item_category_name) as categoryName,
        any(item_brand_name) as brandName,
        any(wh_name) as whName,
        any(wh_name) as branchName,
        sum(qty) as currentStock,
        if(sum(qty) > 0, sum(qty * cost) / sum(qty), 0) as costAvg,
        abs(sumIf(qty, qty < 0 AND toDate(doc_datetime) >= toDate('${dateRange.start}'))) as totalOut,
        greatest(1, dateDiff('day', toDate('${dateRange.start}'), toDate('${dateRange.end}'))) as daysPeriod,
        totalOut / daysPeriod as avgDailySales,
        if(avgDailySales > 0, currentStock / avgDailySales, 999999) as daysOnHand
      FROM stock_transaction
      WHERE toDate(doc_datetime) <= toDate('${dateRange.end}')
      ${branchFilter.sql}
    `;

    query += `
      GROUP BY item_code
      HAVING currentStock > 0 AND avgDailySales > 0 AND daysOnHand <= 7
      ORDER BY daysOnHand ASC
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

    const data = await result.json();
    return data.map((row: any) => ({
      itemCode: row.itemCode,
      itemName: row.itemName,
      categoryName: row.categoryName || '-',
      brandName: row.brandName || '-',
      whName: row.whName || '-',
      branchName: row.branchName || '-',
      currentStock: Number(row.currentStock) || 0,
      qtyOnHand: Number(row.currentStock) || 0,
      stockValue: Number(row.currentStock) * Number(row.costAvg) || 0,
      avgDailySales: Number(row.avgDailySales) || 0,
      daysOnHand: Number(row.daysOnHand) || 0,
    }));
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    throw error;
  }
}

/**
 * Get Overstock Items (items with stock > 1000 units)
 */
export async function getOverstockItems(dateRange: DateRange, branchSync?: string[]): Promise<OverstockItem[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    let query = `
      SELECT
        item_code as itemCode,
        any(item_name) as itemName,
        any(item_category_name) as categoryName,
        any(item_brand_name) as brandName,
        any(ic_unit_code) as unitCode,
        any(wh_name) as branchName,
        sum(qty) as currentStock,
        if(sum(qty) > 0, sum(qty * cost) / sum(qty), 0) as costAvg,
        abs(sumIf(qty, qty < 0 AND toDate(doc_datetime) >= toDate('${dateRange.start}'))) as totalOut,
        greatest(1, dateDiff('day', toDate('${dateRange.start}'), toDate('${dateRange.end}'))) as daysPeriod,
        totalOut / daysPeriod as avgDailySales,
        if(avgDailySales > 0, currentStock / avgDailySales, 999999) as daysOnHand
      FROM stock_transaction
      WHERE toDate(doc_datetime) <= toDate('${dateRange.end}')
      ${branchFilter.sql}
    `;

    query += `
      GROUP BY item_code
      HAVING currentStock > 0 AND daysOnHand > 90
      ORDER BY daysOnHand DESC
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

    const data = await result.json();
    return data.map((row: any) => {
      const currentStock = Number(row.currentStock) || 0;
      const costAvg = Number(row.costAvg) || 0;
      return {
        itemCode: row.itemCode,
        itemName: row.itemName,
        categoryName: row.categoryName || '-',
        brandName: row.brandName || '-',
        unitCode: row.unitCode || '-',
        branchName: row.branchName || '-',
        currentStock: currentStock,
        qtyOnHand: currentStock,
        stockValue: currentStock * costAvg,
        avgDailySales: Number(row.avgDailySales) || 0,
        daysOnHand: Number(row.daysOnHand) || 0,
      };
    });
  } catch (error) {
    console.error('Error fetching overstock items:', error);
    throw error;
  }
}

/**
 * Get Slow Moving Items (items with low turnover)
 * Calculate current stock by summing qty movements
 */
export async function getSlowMovingItems(dateRange: DateRange, branchSync?: string[]): Promise<SlowMovingItem[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    const query = `
      SELECT
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
        ${branchFilter.sql}
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
          ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
        GROUP BY sid.item_code
      ) sales ON stock.item_code = sales.item_code
      WHERE daysOfStock > 90
      ORDER BY stockValue DESC
      LIMIT 50
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

    const data = await result.json();
    return data.map((row: any) => {
      const currentStock = Number(row.currentStock) || 0;
      const costAvg = Number(row.costAvg) || 0;
      return {
        itemCode: row.itemCode,
        itemName: row.itemName,
        categoryName: row.categoryName || '-',
        brandName: row.brandName || '-',
        currentStock: currentStock,
        qtyOnHand: currentStock,
        costAvg: costAvg,
        stockValue: Number(row.stockValue) || 0,
        inventoryValue: Number(row.stockValue) || 0,
        qtySold: Number(row.qtySold) || 0,
        daysOfStock: Number(row.daysOfStock) || 0,
      };
    });
  } catch (error) {
    console.error('Error fetching slow moving items:', error);
    throw error;
  }
}

/**
 * Get Inventory Turnover by Category
 * Calculate using stock movements (qty) instead of non-existent columns
 */
export async function getInventoryTurnover(dateRange: DateRange, branchSync?: string[]): Promise<InventoryTurnover[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    const query = `
      SELECT
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
          ${branchFilter.sql}
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
          ${branchFilter.sql.replace(/branch_sync/g, 'si.branch_sync')}
        GROUP BY sid.item_category_name
      ) sales ON stock.categoryName = sales.categoryName
      ORDER BY turnoverRatio DESC
      LIMIT 15
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

    const data = await result.json();
    return data.map((row: any) => {
      const turnoverRatio = Number(row.turnoverRatio) || 0;
      const daysToSell = Number(row.daysToSell) || 0;
      return {
        itemCode: '', // Category-level aggregation, no specific item
        itemName: row.categoryName || 'ไม่ระบุ',
        categoryName: row.categoryName || 'ไม่ระบุ',
        totalCOGS: Number(row.totalCOGS) || 0,
        avgInventoryValue: Number(row.avgInventoryValue) || 0,
        turnoverRatio: turnoverRatio,
        daysInventoryOutstanding: daysToSell,
        daysToSell: daysToSell,
      };
    });
  } catch (error) {
    console.error('Error fetching inventory turnover:', error);
    throw error;
  }
}

/**
 * Get Stock by Branch
 * Note: stock_transaction doesn't have branch_code/branch_name, using wh_code/wh_name (warehouse) instead
 */
export async function getStockByBranch(dateRange: DateRange, branchSync?: string[]): Promise<StockByBranch[]> {
  try {
    const branchFilter = buildBranchFilter(branchSync);

    let query = `
      SELECT
        wh_code as branchCode,
        any(wh_name) as branchName,
        count(DISTINCT item_code) as itemCount,
        sum(qty) as qtyOnHand,
        sum(qty * cost) as inventoryValue
      FROM stock_transaction
      WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        AND wh_code != ''
        ${branchFilter.sql}
    `;

    query += `
      GROUP BY wh_code
      HAVING qtyOnHand > 0
      ORDER BY inventoryValue DESC
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

    const data = await result.json();
    return data.map((row: any) => ({
      branchCode: row.branchCode,
      branchName: row.branchName || row.branchCode,
      itemCount: Number(row.itemCount) || 0,
      qtyOnHand: Number(row.qtyOnHand) || 0,
      inventoryValue: Number(row.inventoryValue) || 0,
    }));
  } catch (error) {
    console.error('Error fetching stock by branch:', error);
    throw error;
  }
}
