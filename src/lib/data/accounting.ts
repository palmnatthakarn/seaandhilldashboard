// Accounting data queries for ClickHouse
import 'server-only';

import { clickhouse } from '@/lib/clickhouse';
import type {
  DateRange,
  AccountingKPIs,
  ProfitLossData,
  BalanceSheetItem,
  CashFlowData,
  AgingItem,
  CategoryBreakdown,
  KPIData,
} from './types';
import { calculateGrowth } from '@/lib/comparison';
import {
  getAssetsQuery,
  getLiabilitiesQuery,
  getEquityQuery,
  getRevenueQuery,
  getExpensesQuery,
  getProfitLossQuery,
  getBalanceSheetQuery,
  getCashFlowQuery,
  getARAgingQuery,
  getAPAgingQuery,
  getRevenueBreakdownQuery,
  getExpenseBreakdownQuery,
  getProfitLossByProductCategoryQuery,
  getAccountProductsQuery,
  getAccountPurchaseItemsQuery,
  getAccountTypeQuery,
  getChartOfAccountsListQuery,
  getBranchProfitLossQuery,
} from './accounting-queries';

// Re-export query functions for convenience (server-side usage only)
export * from './accounting-queries';

// ============================================================================
// Data Fetching Functions
// ============================================================================

/**
 * Get Accounting KPIs: Assets, Liabilities, Equity, Revenue, Expenses
 */
export async function getAccountingKPIs(dateRange: DateRange, branchSync?: string[]): Promise<AccountingKPIs> {
  try {
    // Get queries with actual dates
    const assetsQuery = getAssetsQuery(dateRange, branchSync);
    const liabilitiesQuery = getLiabilitiesQuery(dateRange, branchSync);
    const equityQuery = getEquityQuery(dateRange, branchSync);
    const revenueQuery = getRevenueQuery(dateRange, branchSync);
    const expensesQuery = getExpensesQuery(dateRange, branchSync);

    // Debug: Log queries
    console.log('=== Accounting KPIs Debug ===');
    console.log('[Assets Query]:', assetsQuery);
    console.log('[Liabilities Query]:', liabilitiesQuery);
    console.log('[Equity Query]:', equityQuery);
    console.log('[Income Query]:', revenueQuery);
    console.log('[Expenses Query]:', expensesQuery);

    // Execute queries in parallel (NO query_params needed since dates are hardcoded)
    const [assetsResult, liabilitiesResult, equityResult, revenueResult, expensesResult] =
      await Promise.all([
        clickhouse.query({ query: assetsQuery, format: 'JSONEachRow' }),
        clickhouse.query({ query: liabilitiesQuery, format: 'JSONEachRow' }),
        clickhouse.query({ query: equityQuery, format: 'JSONEachRow' }),
        clickhouse.query({ query: revenueQuery, format: 'JSONEachRow' }),
        clickhouse.query({ query: expensesQuery, format: 'JSONEachRow' }),
      ]);

    const assetsData = await assetsResult.json();
    const liabilitiesData = await liabilitiesResult.json();
    const equityData = await equityResult.json();
    const revenueData = await revenueResult.json();
    const expensesData = await expensesResult.json();

    // Debug: Log results
    console.log('\n=== Query Results ===');
    console.log('[Assets Result]:', JSON.stringify(assetsData, null, 2));
    console.log('[Liabilities Result]:', JSON.stringify(liabilitiesData, null, 2));
    console.log('[Equity Result]:', JSON.stringify(equityData, null, 2));
    console.log('[Revenue Result]:', JSON.stringify(revenueData, null, 2));
    console.log('[Expenses Result]:', JSON.stringify(expensesData, null, 2));
    console.log('=== End Debug ===\n');

    const createKPI = (data: any[]): KPIData => {
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
      assets: createKPI(assetsData),
      liabilities: createKPI(liabilitiesData),
      equity: createKPI(equityData),
      revenue: createKPI(revenueData),
      expenses: createKPI(expensesData),
    };
  } catch (error) {
    console.error('Error fetching accounting KPIs:', error);
    throw error;
  }
}

export interface BranchProfitLossSummary {
  branchSync: string;
  revenue: number;
  expenses: number;
  profit: number;
}

/**
 * Get revenue/expenses/profit grouped by branch (used for LINE branch-comparison cards)
 */
export async function getBranchProfitLossSummaries(dateRange: DateRange, branchSync?: string[]): Promise<BranchProfitLossSummary[]> {
  const query = getBranchProfitLossQuery(dateRange, branchSync);
  const result = await clickhouse.query({ query, format: 'JSONEachRow' });
  const rows = await result.json() as Array<{ branchSync: string; revenue: number | string; expenses: number | string }>;

  return rows.map((row) => {
    const revenue = Number(row.revenue) || 0;
    const expenses = Number(row.expenses) || 0;
    return { branchSync: row.branchSync, revenue, expenses, profit: revenue - expenses };
  });
}

/**
 * Get Profit & Loss data by month
 */
export async function getProfitLossData(dateRange: DateRange, branchSync?: string[]): Promise<ProfitLossData[]> {
  try {
    const query = getProfitLossQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      query_params: { start_date: dateRange.start, end_date: dateRange.end },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: any) => ({
      month: row.month,
      revenue: Number(row.revenue) || 0,
      expenses: Number(row.expenses) || 0,
      netProfit: Number(row.netProfit) || 0,
    }));
  } catch (error) {
    console.error('Error fetching P&L data:', error);
    throw error;
  }
}

/**
 * Get Balance Sheet data
 */
export async function getBalanceSheetData(dateRange: DateRange, branchSync?: string[]): Promise<BalanceSheetItem[]> {
  try {
    const query = getBalanceSheetQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      query_params: { start_date: dateRange.start, end_date: dateRange.end },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: any) => ({
      accountType: row.accountType,
      account_type: row.account_type, // Map the full account type (ASSETS, LIABILITIES, EQUITY)
      typeName: row.typeName,
      accountCode: row.account_code,
      accountName: row.account_name,
      balance: Number(row.balance) || 0,
    }));
  } catch (error) {
    console.error('Error fetching balance sheet data:', error);
    throw error;
  }
}

/**
 * Get Cash Flow data
 */
export async function getCashFlowData(dateRange: DateRange, branchSync?: string[]): Promise<CashFlowData[]> {
  try {
    const query = getCashFlowQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      query_params: { start_date: dateRange.start, end_date: dateRange.end },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: any) => ({
      activityType: row.activityType as 'Operating' | 'Investing' | 'Financing',
      revenue: Number(row.revenue) || 0,
      expenses: Number(row.expenses) || 0,
      netCashFlow: Number(row.netCashFlow) || 0,
    }));
  } catch (error) {
    console.error('Error fetching cash flow data:', error);
    throw error;
  }
}

/**
 * Get AR (Accounts Receivable) Aging data
 */
export async function getARAgingData(dateRange: DateRange, branchSync?: string[]): Promise<AgingItem[]> {
  try {
    const query = getARAgingQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      query_params: { start_date: dateRange.start, end_date: dateRange.end },
      format: 'JSONEachRow'
    });
    const data = await result.json();

    return data.map((row: any) => ({
      code: row.code,
      name: row.name,
      docNo: row.docNo,
      docDate: row.docDate,
      dueDate: row.dueDate,
      totalAmount: Number(row.totalAmount) || 0,
      paidAmount: Number(row.paidAmount) || 0,
      outstanding: Number(row.outstanding) || 0,
      daysOverdue: Number(row.daysOverdue) || 0,
      agingBucket: row.agingBucket,
    }));
  } catch (error) {
    console.error('Error fetching AR aging data:', error);
    throw error;
  }
}

/**
 * Get AP (Accounts Payable) Aging data
 */
export async function getAPAgingData(dateRange: DateRange, branchSync?: string[]): Promise<AgingItem[]> {
  try {
    const query = getAPAgingQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      query_params: { start_date: dateRange.start, end_date: dateRange.end },
      format: 'JSONEachRow'
    });
    const data = await result.json();

    return data.map((row: any) => ({
      code: row.code,
      name: row.name,
      docNo: row.docNo,
      docDate: row.docDate,
      dueDate: row.dueDate,
      totalAmount: Number(row.totalAmount) || 0,
      paidAmount: Number(row.paidAmount) || 0,
      outstanding: Number(row.outstanding) || 0,
      daysOverdue: Number(row.daysOverdue) || 0,
      agingBucket: row.agingBucket,
    }));
  } catch (error) {
    console.error('Error fetching AP aging data:', error);
    throw error;
  }
}

/**
 * Get Revenue breakdown by category
 */
export async function getRevenueBreakdown(dateRange: DateRange, branchSync?: string[]): Promise<CategoryBreakdown[]> {
  try {
    const query = getRevenueBreakdownQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      query_params: { start_date: dateRange.start, end_date: dateRange.end },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: any) => ({
      accountGroup: row.accountGroup,
      accountName: row.accountName,
      amount: Number(row.amount) || 0,
      percentage: Number(row.percentage) || 0,
    }));
  } catch (error) {
    console.error('Error fetching revenue breakdown:', error);
    throw error;
  }
}

/**
 * Get Expense breakdown by category
 */
export async function getExpenseBreakdown(dateRange: DateRange, branchSync?: string[]): Promise<CategoryBreakdown[]> {
  try {
    const query = getExpenseBreakdownQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      query_params: { start_date: dateRange.start, end_date: dateRange.end },
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: any) => ({
      accountGroup: row.accountGroup,
      accountName: row.accountName,
      amount: Number(row.amount) || 0,
      percentage: Number(row.percentage) || 0,
    }));
  } catch (error) {
    console.error('Error fetching expense breakdown:', error);
    throw error;
  }
}

/**
 * Get transaction documents with items for a specific account code (Sales/Revenue)
 */
export async function getAccountProducts(
  dateRange: DateRange,
  accountCode: string,
  branchSync?: string[]
): Promise<import('./types').AccountProductItem[]> {
  try {
    const query = getAccountProductsQuery(dateRange, accountCode, branchSync);
    const result = await clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json();
    return data.map((row: any) => ({
      docDate: row.docDate ?? '',
      docNo: row.docNo ?? '',
      bookName: row.bookName ?? '-',
      branchName: row.branchName ?? '-',
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      amount: Number(row.amount ?? 0),
      itemCode: row.itemCode ?? '-',
      itemName: row.itemName ?? 'ไม่มีรายการสินค้า',
      categoryCode: row.categoryCode ?? 'N/A',
      categoryName: row.categoryName ?? 'ไม่ระบุหมวดหมู่',
      unitCode: row.unitCode ?? '-',
      qty: Number(row.qty ?? 0),
      price: Number(row.price ?? 0),
      itemAmount: Number(row.itemAmount ?? 0),
    }));
  } catch (error) {
    console.error('Error fetching account products:', error);
    throw error;
  }
}

/**
 * Get transaction documents with items for a specific account code (Purchase/Expense)
 */
export async function getAccountPurchaseItems(
  dateRange: DateRange,
  accountCode: string,
  branchSync?: string[]
): Promise<import('./types').AccountProductItem[]> {
  try {
    const query = getAccountPurchaseItemsQuery(dateRange, accountCode, branchSync);
    const result = await clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json();
    return data.map((row: any) => ({
      docDate: row.docDate ?? '',
      docNo: row.docNo ?? '',
      bookName: row.bookName ?? '-',
      branchName: row.branchName ?? '-',
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      amount: Number(row.amount ?? 0),
      itemCode: row.itemCode ?? '-',
      itemName: row.itemName ?? 'ไม่มีรายการสินค้า',
      categoryCode: row.categoryCode ?? 'N/A',
      categoryName: row.categoryName ?? 'ไม่ระบุหมวดหมู่',
      unitCode: row.unitCode ?? '-',
      qty: Number(row.qty ?? 0),
      price: Number(row.price ?? 0),
      itemAmount: Number(row.itemAmount ?? 0),
    }));
  } catch (error) {
    console.error('Error fetching account purchase items:', error);
    throw error;
  }
}

/**
 * Get account type for a specific account code
 */
export async function getAccountType(accountCode: string): Promise<string> {
  try {
    const query = getAccountTypeQuery(accountCode);
    const result = await clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json();
    if (data.length === 0 || !data[0].account_type) {
      return 'UNKNOWN';
    }
    return data[0].account_type as string;
  } catch (error) {
    console.error('Error fetching account type:', error);
    throw error;
  }
}

/**
 * Get Profit & Loss breakdown by product category (JOIN sales + journal)
 */
export async function getProfitLossByProductCategory(
  dateRange: DateRange,
  branchSync?: string[]
): Promise<import('./types').ProductAccountData[]> {
  try {
    const query = getProfitLossByProductCategoryQuery(dateRange, branchSync);

    const result = await clickhouse.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.map((row: any) => ({
      categoryCode: row.categoryCode ?? '',
      categoryName: row.categoryName ?? 'ไม่ระบุหมวด',
      accountType: row.accountType as 'INCOME' | 'EQUITY' | 'EXPENSES',
      accountCode: row.accountCode ?? '',
      accountName: row.accountName ?? '',
      revenue: Number(row.revenue) || 0,
      equity: Number(row.equity) || 0,
      expenses: Number(row.expenses) || 0,
    }));
  } catch (error) {
    console.error('Error fetching P&L by product category:', error);
    throw error;
  }
}

/**
 * Get chart of accounts list joined with saleinvoice_transaction_detail
 */
export async function getChartOfAccountsList(
  dateRange: DateRange,
  branchSync?: string[]
): Promise<import('./types').ChartOfAccountItem[]> {
  try {
    const query = getChartOfAccountsListQuery(dateRange, branchSync);
    const result = await clickhouse.query({ query, format: 'JSONEachRow' });
    const data = await result.json();
    return data.map((row: any) => ({
      accountCode: row.accountCode ?? '',
      accountName: row.accountName ?? '',
      accountType: row.accountType ?? '',
      netAmount: Number(row.netAmount) || 0,
      docCount: Number(row.docCount) || 0,
    }));
  } catch (error) {
    console.error('Error fetching chart of accounts list:', error);
    throw error;
  }
}
