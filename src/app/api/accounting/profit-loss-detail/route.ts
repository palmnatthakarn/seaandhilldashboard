import { NextResponse } from 'next/server';
import { clickhouse } from '@/lib/clickhouse';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { createCachedQuery, CacheDuration } from '@/lib/cache';

function buildBranchFilterSql(branches?: string[]): string {
  if (!branches || branches.length === 0 || branches.includes('ALL')) return '';
  if (branches.length === 1) return `AND branch_sync = '${branches[0]}'`;
  const list = branches.map((b) => `'${b}'`).join(', ');
  return `AND branch_sync IN (${list})`;
}

// account_type may be '' in CDC pipeline — derive from account_code prefix as fallback
function accountTypeExpr(type: string): string {
  const prefixMap: Record<string, string> = { INCOME: '4', EXPENSES: '5' };
  const p = prefixMap[type];
  if (!p) return `account_type = '${type}'`;
  return `(account_type = '${type}' OR (account_type = '' AND left(account_code, 1) = '${p}'))`;
}

function reportDateExpr(column = 'doc_datetime'): string {
  return `date(${column} + INTERVAL 7 HOUR)`;
}

function reportMonthExpr(column = 'doc_datetime'): string {
  return `toStartOfMonth(${column} + INTERVAL 7 HOUR)`;
}

/**
 * GET /api/accounting/profit-loss-detail
 * ดึงข้อมูลงบกำไรขาดทุนแบบแยกตามผังบัญชี และจัดกลุ่มตาม account_code prefix
 *   4xxx   → INCOME  (รายได้)
 *   51xx   → COGS    (ต้นทุนขาย/บริการ)
 *   53xx,54xx,55xx → OPERATING (ค่าใช้จ่ายดำเนินงาน)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
    }

    let branches = searchParams.getAll('branch');
    if (branches.length === 0) branches = ['ALL'];
    else if (branches.length === 1 && branches[0].includes(',')) branches = branches[0].split(',');

    const branchFilter = buildBranchFilterSql(branches.includes('ALL') ? [] : branches);

    const isIncome = accountTypeExpr('INCOME');
    const isExpenses = accountTypeExpr('EXPENSES');
    const query = `
      SELECT
        branch_sync                                                AS branchKey,
        multiIf(${isIncome}, 'INCOME', ${isExpenses}, 'EXPENSES', account_type) AS accountType,
        account_code                                             AS accountCode,
        account_name                                             AS accountName,
        CASE
          WHEN ${isIncome}                                        THEN 'INCOME'
          WHEN ${isExpenses} AND account_code LIKE '51%'         THEN 'COGS'
          WHEN ${isExpenses} AND (
               account_code LIKE '53%'
            OR account_code LIKE '54%'
            OR account_code LIKE '55%'
            OR account_code LIKE '57%'
          )                                                       THEN 'OPERATING'
          ELSE 'OTHER_EXPENSE'
        END                                                      AS plGroup,
        formatDateTime(${reportMonthExpr()}, '%Y-%m')            AS month,
        sum(
          CASE
            WHEN ${isIncome}    THEN credit - debit
            WHEN ${isExpenses}  THEN debit  - credit
            ELSE 0
          END
        ) AS amount
      FROM journal_transaction_detail
      WHERE (${isIncome} OR ${isExpenses})
        AND ${reportDateExpr()} BETWEEN '${startDate}' AND '${endDate}'
        ${branchFilter}
      GROUP BY branchKey, accountType, accountCode, accountName, plGroup, month
      HAVING amount != 0
      ORDER BY plGroup, accountCode ASC, month ASC
    `;

    const cachedQuery = createCachedQuery(
      async () => {
        const result = await clickhouse.query({ query, format: 'JSONEachRow' });
        return result.json();
      },
      ['accounting', 'profit-loss-detail-v5-thai-date', startDate, endDate, ...branches],
      CacheDuration.MEDIUM
    );

    const rows = await cachedQuery();

    return NextResponse.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (error) {
    logError(error, 'GET /api/accounting/profit-loss-detail');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
