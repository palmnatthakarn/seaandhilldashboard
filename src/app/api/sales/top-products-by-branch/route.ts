import { NextRequest, NextResponse } from 'next/server';
import { clickhouse } from '@/lib/clickhouse';
import { createCachedQuery, CacheDuration } from '@/lib/cache';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';

function buildBranchFilter(branches?: string[]): { sql: string; params: Record<string, unknown> } {
  if (!branches || branches.length === 0 || branches.includes('ALL')) {
    return { sql: '', params: {} };
  }

  if (branches.length === 1) {
    return {
      sql: 'AND branch_sync = {branchSync:String}',
      params: { branchSync: branches[0] },
    };
  }

  return {
    sql: 'AND branch_sync IN {branchList:Array(String)}',
    params: { branchList: branches },
  };
}

function buildDateTimeRangeParamsInclusive(dateRange: { start: string; end: string }): {
  start_date: string;
  end_date: string;
} {
  return {
    start_date: `${dateRange.start} 00:00:00`,
    end_date: `${dateRange.end} 23:59:59`,
  };
}

function buildProductSalesKpiFilter(alias = 'sid'): string {
  return `
        AND ${alias}.status_cancel != 'Cancel'
        AND trim(${alias}.item_code) != ''
        AND trim(${alias}.item_name) != ''
        AND ${alias}.qty > 0
        AND ${alias}.sum_amount > 0
        AND trim(${alias}.unit_code) != ''
  `;
}

async function getTopProductsByBranch(dateRange: { start: string; end: string }, branchSync?: string[]) {
  const branchFilter = buildBranchFilter(branchSync);
  const dateParams = buildDateTimeRangeParamsInclusive(dateRange);

  const query = `
    SELECT
      sid.item_code as itemCode,
      sid.item_name as itemName,
      sid.unit_code as unitCode,
      si.branch_sync as branchSync,
      sum(sid.qty) as totalQtySold,
      sum(sid.sum_amount) as totalSales
    FROM saleinvoice_transaction_detail sid
    INNER JOIN (
      SELECT branch_sync, doc_no
      FROM saleinvoice_transaction
      WHERE status_cancel != 'Cancel'
        AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
        ${branchFilter.sql}
      GROUP BY branch_sync, doc_no
    ) si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
    WHERE 1 = 1
      ${buildProductSalesKpiFilter('sid')}
    GROUP BY sid.item_code, sid.item_name, sid.unit_code, si.branch_sync
    ORDER BY totalSales DESC
  `;

  const result = await clickhouse.query({
    query,
    query_params: {
      ...dateParams,
      ...branchFilter.params,
    },
    format: 'JSONEachRow',
  });

  const data = await result.json();
  return (data as Record<string, unknown>[]).map((row) => ({
    itemCode: String(row.itemCode),
    itemName: String(row.itemName),
    unitCode: String(row.unitCode || ''),
    branchSync: String(row.branchSync),
    totalQtySold: Number(row.totalQtySold) || 0,
    totalSales: Number(row.totalSales) || 0,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: start_date, end_date' },
        { status: 400 }
      );
    }

    const branches = searchParams.getAll('branch');
    let normalizedBranches = branches;
    if (branches.length === 0) {
      normalizedBranches = ['ALL'];
    } else if (branches.length === 1 && branches[0].includes(',')) {
      normalizedBranches = branches[0].split(',');
    }

    const cachedQuery = createCachedQuery(
      () => getTopProductsByBranch({ start: startDate, end: endDate }, normalizedBranches),
      ['sales', 'top-products-by-branch-v2-product-detail-total', startDate, endDate, ...normalizedBranches],
      CacheDuration.MEDIUM
    );

    const data = await cachedQuery();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, 'GET /api/sales/top-products-by-branch');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
