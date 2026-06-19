import { NextRequest, NextResponse } from 'next/server';
import { clickhouse } from '@/lib/clickhouse';
import { getAuthorizedBranches } from '@/lib/api-branch-auth';
import { formatErrorResponse, getErrorStatusCode, logError } from '@/lib/errors';
import { resolveBranchSyncName } from '@/lib/branch-names';

type EntitySearchRow = {
  type: 'customer' | 'supplier' | 'product' | 'document';
  title: string;
  subtitle: string;
  href: string;
  amount?: number;
  count?: number;
  latestDate?: string;
};

function dateTimeBounds(startDate: string | null, endDate: string | null) {
  const today = new Date();
  const fallbackEnd = today.toISOString().slice(0, 10);
  const fallbackStartDate = new Date(today);
  fallbackStartDate.setDate(today.getDate() - 30);
  const fallbackStart = fallbackStartDate.toISOString().slice(0, 10);

  return {
    start_date: `${startDate || fallbackStart} 00:00:00`,
    end_date: `${endDate || fallbackEnd} 23:59:59`,
  };
}

function branchClause(branches: string[], alias: string) {
  return branches.includes('ALL') ? '' : `AND ${alias}.branch_sync IN ({selected_branches:Array(String)})`;
}

function baseParams(query: string, startDate: string | null, endDate: string | null, branches: string[]) {
  return {
    query,
    ...dateTimeBounds(startDate, endDate),
    selected_branches: branches,
  };
}

async function runSearch<T>(query: string, queryParams: Record<string, unknown>) {
  const result = await clickhouse.query<T[]>({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  });
  return result.json();
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawQuery = searchParams.get('q')?.trim() ?? '';

    if (rawQuery.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const branches = await getAuthorizedBranches(searchParams);

    const commonParams = baseParams(rawQuery, startDate, endDate, branches);
    const salesBranch = branchClause(branches, 'si');
    const purchaseBranch = branchClause(branches, 'pt');

    const [customers, suppliers, salesProducts, purchaseProducts, salesDocs, purchaseDocs] = await Promise.all([
      runSearch<EntitySearchRow>(`
        SELECT
          'customer' AS type,
          any(customer_name) AS title,
          concat('ลูกค้า • ', customer_code, ' • ', toString(count())) AS subtitle,
          concat('/reports/sales?report=top-customers&customerCode=', customer_code) AS href,
          sum(total_amount) AS amount,
          count() AS count,
          toString(max(doc_datetime)) AS latestDate
        FROM saleinvoice_transaction si
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          AND customer_code != ''
          AND (
            positionCaseInsensitive(customer_code, {query:String}) > 0
            OR positionCaseInsensitive(customer_name, {query:String}) > 0
          )
          ${salesBranch}
        GROUP BY customer_code
        ORDER BY amount DESC
        LIMIT 5
      `, commonParams),
      runSearch<EntitySearchRow>(`
        SELECT
          'supplier' AS type,
          any(supplier_name) AS title,
          concat('Supplier • ', supplier_code, ' • ', toString(count())) AS subtitle,
          concat('/reports/purchase?report=top-suppliers&supplierCode=', supplier_code) AS href,
          sum(total_amount) AS amount,
          count() AS count,
          toString(max(doc_datetime)) AS latestDate
        FROM purchase_transaction pt
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          AND supplier_code != ''
          AND (
            positionCaseInsensitive(supplier_code, {query:String}) > 0
            OR positionCaseInsensitive(supplier_name, {query:String}) > 0
          )
          ${purchaseBranch}
        GROUP BY supplier_code
        ORDER BY amount DESC
        LIMIT 5
      `, commonParams),
      runSearch<EntitySearchRow>(`
        SELECT
          'product' AS type,
          any(sid.item_name) AS title,
          concat('สินค้า (ขาย) • ', sid.item_code, ' • ', toString(sum(sid.qty)), ' ชิ้น') AS subtitle,
          concat('/reports/sales?report=by-category&productCode=', sid.item_code) AS href,
          sum(sid.sum_amount) AS amount,
          count() AS count,
          toString(max(si.doc_datetime)) AS latestDate
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND si.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          AND sid.item_code != ''
          AND (
            positionCaseInsensitive(sid.item_code, {query:String}) > 0
            OR positionCaseInsensitive(sid.item_name, {query:String}) > 0
          )
          ${salesBranch}
        GROUP BY sid.item_code
        ORDER BY amount DESC
        LIMIT 5
      `, commonParams),
      runSearch<EntitySearchRow>(`
        SELECT
          'product' AS type,
          any(ptd.item_name) AS title,
          concat('สินค้า (จัดซื้อ) • ', ptd.item_code, ' • ', toString(sum(ptd.qty)), ' ชิ้น') AS subtitle,
          concat('/reports/purchase?report=by-category&productCode=', ptd.item_code) AS href,
          sum(ptd.sum_amount) AS amount,
          count() AS count,
          toString(max(pt.doc_datetime)) AS latestDate
        FROM purchase_transaction_detail ptd
        JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND pt.doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          AND ptd.item_code != ''
          AND (
            positionCaseInsensitive(ptd.item_code, {query:String}) > 0
            OR positionCaseInsensitive(ptd.item_name, {query:String}) > 0
          )
          ${purchaseBranch}
        GROUP BY ptd.item_code
        ORDER BY amount DESC
        LIMIT 5
      `, commonParams),
      runSearch<EntitySearchRow & { branchSyncName: string; customerNameRaw: string }>(`
        SELECT
          'document' AS type,
          doc_no AS title,
          '' AS subtitle,
          concat('/reports/sales?docNo=', doc_no) AS href,
          sum(total_amount) AS amount,
          count() AS count,
          toString(max(doc_datetime)) AS latestDate,
          any(branch_sync_name) AS branchSyncName,
          any(customer_name) AS customerNameRaw
        FROM saleinvoice_transaction si
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          AND positionCaseInsensitive(doc_no, {query:String}) > 0
          ${salesBranch}
        GROUP BY doc_no
        ORDER BY latestDate DESC
        LIMIT 5
      `, commonParams).then((rows) =>
        rows.map((r) => ({ ...r, subtitle: `Invoice • ${r.customerNameRaw} • ${resolveBranchSyncName(r.branchSyncName)}` }))
      ),
      runSearch<EntitySearchRow & { branchSyncName: string; supplierNameRaw: string }>(`
        SELECT
          'document' AS type,
          doc_no AS title,
          '' AS subtitle,
          concat('/reports/purchase?docNo=', doc_no) AS href,
          sum(total_amount) AS amount,
          count() AS count,
          toString(max(doc_datetime)) AS latestDate,
          any(branch_sync_name) AS branchSyncName,
          any(supplier_name) AS supplierNameRaw
        FROM purchase_transaction pt
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
          AND positionCaseInsensitive(doc_no, {query:String}) > 0
          ${purchaseBranch}
        GROUP BY doc_no
        ORDER BY latestDate DESC
        LIMIT 5
      `, commonParams).then((rows) =>
        rows.map((r) => ({ ...r, subtitle: `PO • ${r.supplierNameRaw} • ${resolveBranchSyncName(r.branchSyncName)}` }))
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: [...customers, ...suppliers, ...salesProducts, ...purchaseProducts, ...salesDocs, ...purchaseDocs].slice(0, 12),
    });
  } catch (error) {
    logError(error, 'GET /api/search/entities');
    return NextResponse.json(formatErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
