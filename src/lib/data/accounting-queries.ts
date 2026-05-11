// Accounting data queries - Pure functions safe for client-side usage

import type { DateRange } from './types';
import { getPreviousPeriod } from '@/lib/comparison';

// ============================================================================
// Helper Functions
// ============================================================================

function buildBranchFilterSql(branches?: string[]): string {
  if (!branches || branches.length === 0 || branches.includes('ALL')) {
    return '';
  }
  if (branches.length === 1) {
    return `AND branch_sync = '${branches[0]}'`;
  }
  const branchList = branches.map(b => `'${b}'`).join(', ');
  return `AND branch_sync IN (${branchList})`;
}

// ============================================================================
// Query Export Functions (for View SQL Query feature)
// ============================================================================

export function getAssetsQuery(dateRange: DateRange, branchSync?: string[]): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      SUM(debit - credit) as current_value,
      (SELECT SUM(debit - credit)
       FROM journal_transaction_detail
       WHERE account_type = 'ASSETS'
         AND date(doc_datetime) BETWEEN '${previousPeriod.start}' AND '${previousPeriod.end}'
         ${branchFilter}) as previous_value
    FROM journal_transaction_detail
    WHERE account_type = 'ASSETS'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
  `;
}

export function getLiabilitiesQuery(dateRange: DateRange, branchSync?: string[]): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      SUM(credit - debit) as current_value,
      (SELECT SUM(credit - debit)
       FROM journal_transaction_detail
       WHERE account_type = 'LIABILITIES'
         AND date(doc_datetime) BETWEEN '${previousPeriod.start}' AND '${previousPeriod.end}'
         ${branchFilter}) as previous_value
    FROM journal_transaction_detail
    WHERE account_type = 'LIABILITIES'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
  `;
}

export function getEquityQuery(dateRange: DateRange, branchSync?: string[]): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      SUM(credit - debit) as current_value,
      (SELECT SUM(credit - debit)
       FROM journal_transaction_detail
       WHERE account_type = 'EQUITY'
         AND date(doc_datetime) BETWEEN '${previousPeriod.start}' AND '${previousPeriod.end}'
         ${branchFilter}) as previous_value
    FROM journal_transaction_detail
    WHERE account_type = 'EQUITY'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
  `;
}

export function getRevenueQuery(dateRange: DateRange, branchSync?: string[]): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      SUM(credit - debit) as current_value,
      (SELECT SUM(credit - debit)
       FROM journal_transaction_detail
       WHERE account_type = 'INCOME'
         AND date(doc_datetime) BETWEEN '${previousPeriod.start}' AND '${previousPeriod.end}'
         ${branchFilter}) as previous_value
    FROM journal_transaction_detail
    WHERE account_type = 'INCOME'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
  `;
}

export function getExpensesQuery(dateRange: DateRange, branchSync?: string[]): string {
  const previousPeriod = getPreviousPeriod(dateRange, 'PreviousPeriod');
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      SUM(debit - credit) as current_value,
      (SELECT SUM(debit - credit)
       FROM journal_transaction_detail
       WHERE account_type = 'EXPENSES'
         AND date(doc_datetime) BETWEEN '${previousPeriod.start}' AND '${previousPeriod.end}'
         ${branchFilter}) as previous_value
    FROM journal_transaction_detail
    WHERE account_type = 'EXPENSES'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
  `;
}

// Query string functions for DataCard queryInfo
export function getProfitLossQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      toStartOfMonth(doc_datetime) as month,
      sum(if(account_type = 'INCOME', credit - debit, 0)) as revenue,
      sum(if(account_type = 'EXPENSES', debit - credit, 0)) as expenses,
      revenue - expenses as netProfit
    FROM journal_transaction_detail
    WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    GROUP BY month
    ORDER BY month ASC
  `;
}

export function getBalanceSheetQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      substring(account_code, 1, 1) as accountType,
      account_type,
      CASE
        WHEN account_type = 'ASSETS' THEN 'สินทรัพย์'
        WHEN account_type = 'LIABILITIES' THEN 'หนี้สิน'
        WHEN account_type = 'EQUITY' THEN 'ส่วนของผู้ถือหุ้น'
      END as typeName,
      account_code,
      account_name,
      if(account_type = 'ASSETS', sum(debit - credit), sum(credit - debit)) as balance
    FROM journal_transaction_detail
    WHERE (account_type = 'ASSETS' OR account_type = 'LIABILITIES' OR account_type = 'EQUITY')
      AND doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    GROUP BY account_type, accountType, typeName, account_code, account_name
    ORDER BY account_code ASC
  `;
}

export function getCashFlowQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT 'Operating' as activityType,
      sum(if(account_type = 'INCOME', credit - debit, 0)) as revenue,
      sum(if(account_type = 'EXPENSES', debit - credit, 0)) as expenses,
      revenue - expenses as netCashFlow
    FROM journal_transaction_detail
    WHERE doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    
    UNION ALL
    
    SELECT 'Investing', 0, sum(debit - credit), -sum(debit - credit)
    FROM journal_transaction_detail
    WHERE account_code LIKE '12%'
      AND doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    
    UNION ALL
    
    SELECT 'Financing', sum(credit - debit), 0, sum(credit - debit)
    FROM journal_transaction_detail
    WHERE (account_code LIKE '21%' OR account_type = 'EQUITY')
      AND doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
  `;
}

export function getARAgingQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      customer_code as code,
      customer_name as name,
      doc_no as docNo,
      toTimeZone(doc_datetime, 'Asia/Bangkok') as docDate,
      due_date as dueDate,
      total_amount as totalAmount,
      sum_pay_money as paidAmount,
      total_amount - sum_pay_money as outstanding,
      dateDiff('day', due_date, now()) as daysOverdue,
      CASE
        WHEN dateDiff('day', due_date, now()) <= 0 THEN 'ยังไม่ครบกำหนด'
        WHEN dateDiff('day', due_date, now()) <= 30 THEN '1-30 วัน'
        WHEN dateDiff('day', due_date, now()) <= 60 THEN '31-60 วัน'
        WHEN dateDiff('day', due_date, now()) <= 90 THEN '61-90 วัน'
        ELSE 'เกิน 90 วัน'
      END as agingBucket
    FROM saleinvoice_transaction
    WHERE status_payment IN ('Outstanding', 'Partially Paid')
      AND status_cancel != 'Cancel'
      AND doc_type = 'CREDIT'
      AND doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    ORDER BY daysOverdue DESC
    LIMIT 100
  `;
}

export function getAPAgingQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      supplier_code as code,
      supplier_name as name,
      doc_no as docNo,
      toTimeZone(doc_datetime, 'Asia/Bangkok') as docDate,
      due_date as dueDate,
      total_amount as totalAmount,
      sum_pay_money as paidAmount,
      total_amount - sum_pay_money as outstanding,
      dateDiff('day', due_date, now()) as daysOverdue,
      CASE
        WHEN dateDiff('day', due_date, now()) <= 0 THEN 'ยังไม่ครบกำหนด'
        WHEN dateDiff('day', due_date, now()) <= 30 THEN '1-30 วัน'
        WHEN dateDiff('day', due_date, now()) <= 60 THEN '31-60 วัน'
        WHEN dateDiff('day', due_date, now()) <= 90 THEN '61-90 วัน'
        ELSE 'เกิน 90 วัน'
      END as agingBucket
    FROM purchase_transaction
    WHERE status_payment IN ('Outstanding', 'Partially Paid')
      AND status_cancel != 'Cancel'
      AND doc_type = 'CREDIT'
      AND doc_datetime BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    ORDER BY daysOverdue DESC
    LIMIT 100
  `;
}

export function getRevenueBreakdownQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    SELECT
      account_code AS accountGroup,
      account_name AS accountName,
      sum(credit - debit) AS amount,
      (amount / (
        SELECT sum(credit - debit)
        FROM journal_transaction_detail
        WHERE account_type = 'INCOME'
          AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
          ${branchFilter}
      )) * 100 AS percentage
    FROM journal_transaction_detail
    WHERE account_type = 'INCOME'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    GROUP BY account_code, account_name
    HAVING amount != 0
    ORDER BY amount DESC
  `;
}

export function getExpenseBreakdownQuery(dateRange: DateRange, branchSync?: string[]): string {
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
          ${branchFilter}
      )) * 100 AS percentage
    FROM journal_transaction_detail
    WHERE account_type = 'EXPENSES'
      AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    GROUP BY account_code, account_name
    HAVING amount != 0
    ORDER BY amount DESC
  `;
}

export function getProfitLossByProductCategoryQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    WITH sales AS (
      SELECT
        doc_no,
        branch_sync,
        if(item_category_code = '' OR item_category_code IS NULL, 'OTHER', item_category_code) AS item_category_code,
        if(item_category_name = '' OR item_category_name IS NULL, 'ไม่ระบุหมวด', item_category_name) AS item_category_name,
        SUM(sum_amount)  AS sum_amount,
        SUM(sum_of_cost) AS sum_of_cost
      FROM saleinvoice_transaction_detail
      WHERE status_cancel != 'Cancel'
        AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        ${branchFilter}
      GROUP BY doc_no, branch_sync, item_category_code, item_category_name
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
      WHERE account_type IN ('INCOME', 'EQUITY', 'EXPENSES')
        AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        ${branchFilter}
      GROUP BY doc_no, branch_sync, account_type, account_code, account_name
    )
    SELECT
      s.item_category_code  AS categoryCode,
      s.item_category_name  AS categoryName,
      j.account_type        AS accountType,
      j.account_code        AS accountCode,
      j.account_name        AS accountName,
      SUM(if(j.account_type = 'INCOME',   j.credit_net, 0)) AS revenue,
      SUM(if(j.account_type = 'EQUITY',   j.credit_net, 0)) AS equity,
      SUM(if(j.account_type = 'EXPENSES', j.debit_net,  0)) AS expenses
    FROM sales s
    INNER JOIN journals j
      ON s.doc_no = j.doc_no AND s.branch_sync = j.branch_sync
    GROUP BY s.item_category_code, s.item_category_name, j.account_type, j.account_code, j.account_name
    ORDER BY j.account_type, revenue DESC
  `;
}

/**
 * Query to get account type (INCOME, EXPENSES, etc.) for a specific account code
 */
export function getAccountTypeQuery(accountCode: string): string {
  return `
    SELECT DISTINCT account_type
    FROM journal_transaction_detail
    WHERE account_code = '${accountCode}'
    LIMIT 1
  `;
}

export function getChartOfAccountsListQuery(dateRange: DateRange, branchSync?: string[]): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    WITH sales AS (
      SELECT DISTINCT doc_no, branch_sync
      FROM saleinvoice_transaction_detail
      WHERE status_cancel != 'Cancel'
        AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        ${branchFilter}
    )
    SELECT
      j.account_code AS accountCode,
      j.account_name AS accountName,
      j.account_type AS accountType,
      SUM(j.credit - j.debit) AS netAmount,
      COUNT(DISTINCT j.doc_no) AS docCount
    FROM journal_transaction_detail j
    INNER JOIN sales s ON j.doc_no = s.doc_no AND j.branch_sync = s.branch_sync
    WHERE date(j.doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      ${branchFilter}
    GROUP BY j.account_code, j.account_name, j.account_type
    HAVING netAmount != 0
    ORDER BY j.account_type, j.account_code
  `;
}

export function getAccountProductsQuery(
  dateRange: DateRange,
  accountCode: string,
  branchSync?: string[]
): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    WITH journal_docs AS (
      SELECT DISTINCT
        doc_no,
        branch_sync,
        doc_datetime,
        book_name,
        branch_name,
        debit,
        credit,
        (credit - debit) as amount,
        account_code,
        account_name
      FROM journal_transaction_detail
      WHERE account_code = '${accountCode}'
        AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        ${branchFilter}
        AND (credit - debit) != 0
    )
    SELECT
      DATE(jd.doc_datetime)                                 AS docDate,
      jd.doc_no                                             AS docNo,
      COALESCE(jd.book_name, '-')                          AS bookName,
      COALESCE(jd.branch_name, '-')                        AS branchName,
      jd.debit                                             AS debit,
      jd.credit                                            AS credit,
      jd.amount                                            AS amount,
      COALESCE(std.item_code, '-')                         AS itemCode,
      COALESCE(std.item_name, 'ไม่มีรายการสินค้า')          AS itemName,
      COALESCE(NULLIF(std.item_category_code, ''), 'N/A')  AS categoryCode,
      COALESCE(NULLIF(std.item_category_name, ''), 'ไม่ระบุหมวดหมู่') AS categoryName,
      COALESCE(std.unit_code, '-')                         AS unitCode,
      COALESCE(std.qty, 0)                                 AS qty,
      COALESCE(std.price, 0)                               AS price,
      COALESCE(std.sum_amount, 0)                          AS itemAmount
    FROM journal_docs jd
    LEFT JOIN saleinvoice_transaction_detail std
      ON jd.doc_no = std.doc_no
      AND jd.branch_sync = std.branch_sync
      AND std.status_cancel != 'Cancel'
    ORDER BY jd.doc_datetime DESC, jd.doc_no DESC, std.item_code ASC
  `;
}

export function getAccountPurchaseItemsQuery(
  dateRange: DateRange,
  accountCode: string,
  branchSync?: string[]
): string {
  const branchFilter = buildBranchFilterSql(branchSync);
  return `
    WITH journal_docs AS (
      SELECT DISTINCT
        doc_no,
        branch_sync,
        doc_datetime,
        book_name,
        branch_name,
        debit,
        credit,
        (credit - debit) as amount,
        account_code,
        account_name
      FROM journal_transaction_detail
      WHERE account_code = '${accountCode}'
        AND date(doc_datetime) BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        ${branchFilter}
        AND (credit - debit) != 0
    )
    SELECT
      DATE(jd.doc_datetime)                                 AS docDate,
      jd.doc_no                                             AS docNo,
      COALESCE(jd.book_name, '-')                          AS bookName,
      COALESCE(jd.branch_name, '-')                        AS branchName,
      jd.debit                                             AS debit,
      jd.credit                                            AS credit,
      jd.amount                                            AS amount,
      COALESCE(ptd.item_code, '-')                         AS itemCode,
      COALESCE(ptd.item_name, 'ไม่มีรายการสินค้า')          AS itemName,
      COALESCE(NULLIF(ptd.item_category_code, ''), 'N/A')  AS categoryCode,
      COALESCE(NULLIF(ptd.item_category_name, ''), 'ไม่ระบุหมวดหมู่') AS categoryName,
      COALESCE(ptd.unit_code, '-')                         AS unitCode,
      COALESCE(ptd.qty, 0)                                 AS qty,
      COALESCE(ptd.price, 0)                               AS price,
      COALESCE(ptd.sum_amount, 0)                          AS itemAmount
    FROM journal_docs jd
    LEFT JOIN purchase_transaction_detail ptd
      ON jd.doc_no = ptd.doc_no
      AND jd.branch_sync = ptd.branch_sync
    ORDER BY jd.doc_datetime DESC, jd.doc_no DESC, ptd.item_code ASC
  `;
}
