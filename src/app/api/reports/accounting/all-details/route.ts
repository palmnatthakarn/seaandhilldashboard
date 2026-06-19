import { NextResponse } from 'next/server';
import { clickhouse } from '@/lib/clickhouse';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { createCachedQuery, CacheDuration } from '@/lib/cache';

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

const ACCOUNT_TYPE_PREFIXES: Record<string, string> = {
  INCOME: '4', EXPENSES: '5', ASSETS: '1', LIABILITIES: '2', EQUITY: '3',
};

type DetailRow = {
  docDate?: string;
  docNo?: string;
  accountCode?: string;
  accountName?: string;
  bookName?: string;
  branchName?: string;
  debit?: number | string;
  credit?: number | string;
  amount?: number | string;
  itemCode?: string;
  itemName?: string;
  categoryCode?: string;
  categoryName?: string;
  unitCode?: string;
  qty?: number | string;
  price?: number | string;
  itemAmount?: number | string;
};

function accountTypeFilter(type: string): string {
  const prefix = ACCOUNT_TYPE_PREFIXES[type];
  if (!prefix) return `account_type = '${type}'`;
  return `(account_type = '${type}' OR (account_type = '' AND left(account_code, 1) = '${prefix}'))`;
}

function reportDateExpr(column = 'doc_datetime'): string {
  return `date(${column} + INTERVAL 7 HOUR)`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const accountType = searchParams.get('account_type'); // 'INCOME' or 'EXPENSES'

    if (!startDate || !endDate || !accountType) {
      return NextResponse.json(
        { error: 'start_date, end_date, and account_type are required' },
        { status: 400 }
      );
    }

    let branches = searchParams.getAll('branch');
    if (branches.length === 0) {
      branches = ['ALL'];
    } else if (branches.length === 1 && branches[0].includes(',')) {
      branches = branches[0].split(',');
    }

    const branchFilter = buildBranchFilterSql(branches);

    // สร้างคิวรี่ต่างกันตาม account_type
    // INCOME ใช้ saleinvoice_transaction_detail
    // EXPENSES ใช้ purchase_transaction_detail
    const isIncome = accountType === 'INCOME';
    
    const query = `
      WITH journal_docs AS (
        SELECT
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
        WHERE ${accountTypeFilter(accountType)}
          AND ${reportDateExpr()} BETWEEN '${startDate}' AND '${endDate}'
          ${branchFilter}
          AND (credit - debit) != 0
      )
      SELECT
        DATE(jd.doc_datetime + INTERVAL 7 HOUR)                AS docDate,
        jd.doc_no                                             AS docNo,
        jd.account_code                                       AS accountCode,
        jd.account_name                                       AS accountName,
        COALESCE(jd.book_name, '-')                          AS bookName,
        COALESCE(jd.branch_name, '-')                        AS branchName,
        jd.debit                                             AS debit,
        jd.credit                                            AS credit,
        jd.amount                                            AS amount,
        ${isIncome 
          ? `COALESCE(std.item_code, '-')                         AS itemCode,
        COALESCE(std.item_name, 'ไม่มีรายการสินค้า')          AS itemName,
        COALESCE(NULLIF(std.item_category_code, ''), 'N/A')  AS categoryCode,
        COALESCE(NULLIF(std.item_category_name, ''), 'ไม่ระบุหมวดหมู่') AS categoryName,
        COALESCE(std.unit_code, '-')                         AS unitCode,
        COALESCE(std.qty, 0)                                 AS qty,
        COALESCE(std.price, 0)                               AS price,
        COALESCE(std.sum_amount, 0)                          AS itemAmount`
          : `COALESCE(ptd.item_code, '-')                         AS itemCode,
        COALESCE(ptd.item_name, 'ไม่มีรายการสินค้า')          AS itemName,
        COALESCE(NULLIF(ptd.item_category_code, ''), 'N/A')  AS categoryCode,
        COALESCE(NULLIF(ptd.item_category_name, ''), 'ไม่ระบุหมวดหมู่') AS categoryName,
        COALESCE(ptd.unit_code, '-')                         AS unitCode,
        COALESCE(ptd.qty, 0)                                 AS qty,
        COALESCE(ptd.price, 0)                               AS price,
        COALESCE(ptd.sum_amount, 0)                          AS itemAmount`
        }
      FROM journal_docs jd
      ${isIncome 
        ? `LEFT JOIN saleinvoice_transaction_detail std
        ON jd.doc_no = std.doc_no
        AND jd.branch_sync = std.branch_sync
        AND std.status_cancel != 'Cancel'`
        : `LEFT JOIN purchase_transaction_detail ptd
        ON jd.doc_no = ptd.doc_no
        AND jd.branch_sync = ptd.branch_sync`
      }
      ORDER BY jd.doc_datetime DESC, jd.doc_no DESC, jd.account_code ASC, ${isIncome ? 'std' : 'ptd'}.item_code ASC
    `;

    const cachedQuery = createCachedQuery(
      async () => {
        const result = await clickhouse.query({ query, format: 'JSONEachRow' });
        const data = await result.json() as DetailRow[];
        return data.map((row) => ({
          docDate: row.docDate ?? '',
          docNo: row.docNo ?? '',
          accountCode: row.accountCode ?? '',
          accountName: row.accountName ?? '',
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
      },
      ['reports', 'accounting', 'all-details-v2-thai-date', accountType, startDate, endDate, ...branches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, 'GET /api/reports/accounting/all-details');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
