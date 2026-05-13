import { clickhouse } from '../clickhouse';

export interface BranchComparisonData {
  branchKey: string;
  branchName: string;
  totalSales: number;
  totalOrders: number;
  totalExpense: number;
  netProfit: number;
  salesGrowth: number; // vs previous period
  avgTicketSize: number;
  profitMargin: number;

  // Inventory Health
  inventoryValue: number;
  inventoryTurnover: number;
  deadStockValue: number;

  // Customer Metrics
  totalTransactions: number; // Total sales count (including same customer multiple times)
  uniqueCustomers: number;
  repeatCustomerRate: number;

  // Product Performance
  topProducts: Array<{ productName: string; sales: number }>;

  // Trend Data (for sparklines)
  monthlySales: Array<{ month: string; sales: number }>;
}


// Helper to build branch filter
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

export async function getBranchComparisonData(startDate?: string, endDate?: string, branchSync?: string[]): Promise<BranchComparisonData[]> {
  try {
    const today = new Date();
    // Default to current month if no dates provided
    const currentStart = startDate || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const currentEnd = endDate || today.toISOString().split('T')[0];

    // Build branch filter
    const branchFilter = buildBranchFilter(branchSync);
    const filterSql = branchFilter.sql;
    const filterParams = branchFilter.params;

    // Calculate previous period for growth (Same duration as selected period)
    const start = new Date(currentStart);
    const end = new Date(currentEnd);
    const duration = end.getTime() - start.getTime();

    // Previous period starts before the current start date by the same duration
    const prevEnd = new Date(start.getTime() - 86400000); // 1 day before start
    const prevStart = new Date(prevEnd.getTime() - duration);

    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];

    // 1. Get Sales & Orders (Selected Period)
    const salesQuery = `
      SELECT
        branch_sync,
        sum(total_amount) as totalSales,
        count(DISTINCT doc_no) as totalOrders
      FROM saleinvoice_transaction
      WHERE status_cancel != 'Cancel'
        AND toDate(doc_datetime) >= toDate({currentStart:String})
        AND toDate(doc_datetime) <= toDate({currentEnd:String})
        AND branch_sync != ''
        ${filterSql}
      GROUP BY branch_sync
    `;

    // 2. Get Expenses (Selected Period)
    const expenseQuery = `
      SELECT
        branch_sync,
        sum(total_amount) as totalExpense
      FROM purchase_transaction
      WHERE status_cancel != 'Cancel'
        AND toDate(doc_datetime) >= toDate({currentStart:String})
        AND toDate(doc_datetime) <= toDate({currentEnd:String})
        AND branch_sync != ''
        ${filterSql}
      GROUP BY branch_sync
    `;

    // 3. Get Previous Period Sales for Growth Calculation
    const prevSalesQuery = `
      SELECT
        branch_sync,
        sum(total_amount) as prevSales
      FROM saleinvoice_transaction
      WHERE status_cancel != 'Cancel'
        AND toDate(doc_datetime) >= toDate({prevStartStr:String})
        AND toDate(doc_datetime) <= toDate({prevEndStr:String})
        AND branch_sync != ''
        ${filterSql}
      GROUP BY branch_sync
    `;

    // 4. Get Inventory Value per Branch (as of end date)
    const inventoryQuery = `
      SELECT
        wh_code as branch_sync,
        sum(qty * cost) as inventoryValue
      FROM stock_transaction
      WHERE toDate(doc_datetime) <= toDate({currentEnd:String})
        AND wh_code != ''
        ${filterSql.replace(/branch_sync/g, 'wh_code')}
      GROUP BY wh_code
      HAVING sum(qty) > 0
    `;


    // 5. Get Customer Metrics per Branch
    const customerQuery = `
      SELECT
        branch_sync,
        count(*) as totalTransactions,
        count(DISTINCT customer_code) as uniqueCustomers,
        countIf(DISTINCT customer_code, visit_count > 1) as repeatCustomers
      FROM (
        SELECT
          branch_sync,
          customer_code,
          count(*) as visit_count
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND toDate(doc_datetime) >= toDate({currentStart:String})
          AND toDate(doc_datetime) <= toDate({currentEnd:String})
          AND branch_sync != ''
          AND customer_code != ''
          ${filterSql}
        GROUP BY branch_sync, customer_code
      )
      GROUP BY branch_sync
    `;

    // 6. Get Top 3 Products per Branch
    const topProductsQuery = `
      SELECT
        si.branch_sync,
        sid.item_name as productName,
        sum(sid.qty * sid.price) as sales
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND toDate(si.doc_datetime) >= toDate({currentStart:String})
        AND toDate(si.doc_datetime) <= toDate({currentEnd:String})
        AND si.branch_sync != ''
        ${filterSql.replace(/branch_sync/g, 'si.branch_sync')}
      GROUP BY si.branch_sync, sid.item_name
      ORDER BY si.branch_sync ASC, sales DESC
    `;

    // 7. Get 6-Month Sales Trend (for sparklines)
    const trendQuery = `
      SELECT
        branch_sync,
        formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') as month,
        sum(total_amount) as sales
      FROM saleinvoice_transaction
      WHERE status_cancel != 'Cancel'
        AND doc_datetime >= now() - INTERVAL 6 MONTH
        AND branch_sync != ''
        ${filterSql}
      GROUP BY branch_sync, month
      ORDER BY branch_sync ASC, month ASC
    `;

    // 8. Get Dead Stock Value (inventory with no sales in last 90 days)
    const deadStockQuery = `
      SELECT
        stock.wh_code as branch_sync,
        sum(stock.stockValue) as deadStockValue
      FROM (
        SELECT
          wh_code,
          item_code,
          sum(qty * cost) as stockValue
        FROM stock_transaction
        WHERE toDate(doc_datetime) <= toDate({currentEnd:String})
          AND wh_code != ''
          ${filterSql.replace(/branch_sync/g, 'wh_code')}
        GROUP BY wh_code, item_code
        HAVING sum(qty) > 0
      ) stock
      LEFT JOIN (
        SELECT DISTINCT
          si.branch_sync as branch_sync,
          sid.item_code as item_code
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND si.doc_datetime >= toDate({currentEnd:String}) - INTERVAL 90 DAY
      ) sales ON stock.wh_code = sales.branch_sync AND stock.item_code = sales.item_code
      WHERE sales.item_code IS NULL
      GROUP BY stock.wh_code
    `;

    const branchNameQuery = `
      SELECT branch_sync, any(branch_sync_name) as branch_sync_name
      FROM saleinvoice_transaction
      WHERE branch_sync != ''
      GROUP BY branch_sync
    `;

    const [
      salesResult,
      expenseResult,
      prevSalesResult,
      inventoryResult,
      customerResult,
      topProductsResult,
      trendResult,
      deadStockResult,
      branchNameResult,
    ] = await Promise.all([
      clickhouse.query({
        query: salesQuery,
        query_params: { currentStart, currentEnd, ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: expenseQuery,
        query_params: { currentStart, currentEnd, ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: prevSalesQuery,
        query_params: { prevStartStr, prevEndStr, ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: inventoryQuery,
        query_params: { currentEnd, ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: customerQuery,
        query_params: { currentStart, currentEnd, ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: topProductsQuery,
        query_params: { currentStart, currentEnd, ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: trendQuery,
        query_params: { ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: deadStockQuery,
        query_params: { currentEnd, ...filterParams },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: branchNameQuery,
        format: 'JSONEachRow',
      }),
    ]);

    const salesData = await salesResult.json();
    const expenseData = await expenseResult.json();
    const prevSalesData = await prevSalesResult.json();
    const inventoryData = await inventoryResult.json();
    const customerData = await customerResult.json();
    const topProductsData = await topProductsResult.json();
    const trendData = await trendResult.json();
    const deadStockData = await deadStockResult.json();
    const branchNameRows = await branchNameResult.json() as Array<{ branch_sync: string; branch_sync_name: string }>;

    const branchNameMap: Record<string, string> = {};
    branchNameRows.forEach((row) => {
      if (row.branch_sync) {
        branchNameMap[row.branch_sync] = row.branch_sync_name || `กิจการ ${row.branch_sync}`;
      }
    });

    // Map data for easy lookup
    const salesMap = new Map();
    salesData.forEach((row: any) => salesMap.set(row.branch_sync, row));

    const expenseMap = new Map();
    expenseData.forEach((row: any) => expenseMap.set(row.branch_sync, row));

    const prevSalesMap = new Map();
    prevSalesData.forEach((row: any) => prevSalesMap.set(row.branch_sync, row));

    const inventoryMap = new Map();
    inventoryData.forEach((row: any) => inventoryMap.set(row.branch_sync, row));

    const customerMap = new Map();
    customerData.forEach((row: any) => customerMap.set(row.branch_sync, row));

    const deadStockMap = new Map();
    deadStockData.forEach((row: any) => deadStockMap.set(row.branch_sync, row));

    // Process top products - group by branch, take top 3
    const topProductsMap = new Map<string, Array<{ productName: string; sales: number }>>();
    topProductsData.forEach((row: any) => {
      const branchKey = row.branch_sync;
      if (!topProductsMap.has(branchKey)) {
        topProductsMap.set(branchKey, []);
      }
      const products = topProductsMap.get(branchKey)!;
      if (products.length < 3) {
        products.push({
          productName: row.productName || 'N/A',
          sales: Number(row.sales) || 0
        });
      }
    });

    // Process monthly trends - group by branch
    const trendMap = new Map<string, Array<{ month: string; sales: number }>>();
    trendData.forEach((row: any) => {
      const branchKey = row.branch_sync;
      if (!trendMap.has(branchKey)) {
        trendMap.set(branchKey, []);
      }
      trendMap.get(branchKey)!.push({
        month: row.month,
        sales: Number(row.sales) || 0
      });
    });

    // Consolidate branch keys – only include selected branches (or all if 'ALL')
    const wantedKeys = (!branchSync || branchSync.length === 0 || branchSync.includes('ALL'))
      ? Object.keys(branchNameMap)
      : branchSync;

    const allBranches = new Set([
      ...salesMap.keys(),
      ...expenseMap.keys(),
      ...wantedKeys,
    ]);

    const comparisonData: BranchComparisonData[] = [];

    allBranches.forEach((key) => {
      if (!key) return;

      const sales = salesMap.get(key);
      const expense = expenseMap.get(key);
      const prevSales = prevSalesMap.get(key);
      const inventory = inventoryMap.get(key);
      const customer = customerMap.get(key);
      const deadStock = deadStockMap.get(key);

      const currentSalesVal = Number(sales?.totalSales) || 0;
      const prevSalesVal = Number(prevSales?.prevSales) || 0;

      // Calculate Growth
      let growth = 0;
      if (prevSalesVal > 0) {
        growth = ((currentSalesVal - prevSalesVal) / prevSalesVal) * 100;
      } else if (currentSalesVal > 0) {
        growth = 100; // New sales from zero
      }

      const currentExpenseVal = Number(expense?.totalExpense) || 0;
      const netProfit = currentSalesVal - currentExpenseVal;

      // Basic Metrics Calculation
      const totalOrders = Number(sales?.totalOrders) || 0;
      const avgTicketSize = totalOrders > 0 ? currentSalesVal / totalOrders : 0;
      const profitMargin = currentSalesVal > 0 ? (netProfit / currentSalesVal) * 100 : 0;

      // Inventory Metrics
      const inventoryValue = Number(inventory?.inventoryValue) || 0;
      const inventoryTurnover = inventoryValue > 0 ? currentSalesVal / inventoryValue : 0;
      const deadStockValue = Number(deadStock?.deadStockValue) || 0;

      // Customer Metrics
      const totalTransactions = Number(customer?.totalTransactions) || 0;
      const uniqueCustomers = Number(customer?.uniqueCustomers) || 0;
      const repeatCustomers = Number(customer?.repeatCustomers) || 0;
      const repeatCustomerRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;

      // Top Products (default to empty array if no data)
      const topProducts = topProductsMap.get(key) || [];

      // Monthly Sales Trend (default to empty array if no data)
      const monthlySales = trendMap.get(key) || [];

      comparisonData.push({
        branchKey: key,
        branchName: branchNameMap[key] ?? `กิจการ ${key}`,
        totalSales: currentSalesVal,
        totalOrders: totalOrders,
        totalExpense: currentExpenseVal,
        netProfit: netProfit,
        salesGrowth: growth,
        avgTicketSize,
        profitMargin,
        inventoryValue,
        inventoryTurnover,
        deadStockValue,
        totalTransactions,
        uniqueCustomers,
        repeatCustomerRate,
        topProducts,
        monthlySales
      });
    });

    // Sort by Total Sales Descending
    return comparisonData.sort((a, b) => b.totalSales - a.totalSales);

  } catch (error) {
    console.error('Failed to fetch branch comparison data:', error);
    throw error;
  }
}
