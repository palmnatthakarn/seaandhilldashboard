const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const START = '2026-05-01';
const END = '2026-05-31';

async function main() {
  const { data: config } = readConfig();
  const ch = createClickHouse(config);

  try {
    const totals = await queryRows(ch, `
      WITH purchases AS (
        SELECT DISTINCT doc_no, branch_sync
        FROM purchase_transaction
        WHERE status_cancel != 'Cancel'
          AND date(doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
      ),
      journal AS (
        SELECT
          branch_sync,
          sumIf(debit - credit, account_type = 'EXPENSES') AS expenses,
          sumIf(debit - credit, account_type = 'ASSETS') AS assets,
          sumIf(credit - debit, account_type = 'LIABILITIES') AS liabilities,
          sumIf(debit - credit, account_type NOT IN ('EXPENSES', 'ASSETS', 'LIABILITIES')) AS other_debit_net
        FROM journal_transaction_detail j
        INNER JOIN purchases p ON j.doc_no = p.doc_no AND j.branch_sync = p.branch_sync
        WHERE date(j.doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
        GROUP BY branch_sync
      ),
      purchase_header AS (
        SELECT
          branch_sync,
          sum(total_amount) AS header_total,
          count(DISTINCT doc_no, branch_sync) AS po_count,
          avg(total_amount) AS avg_po
        FROM purchase_transaction
        WHERE status_cancel != 'Cancel'
          AND date(doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
        GROUP BY branch_sync
      ),
      purchase_detail AS (
        SELECT
          pt.branch_sync AS branch_sync,
          sum(ptd.sum_amount) AS detail_total,
          sum(ptd.qty) AS qty
        FROM purchase_transaction_detail ptd
        INNER JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
        WHERE pt.status_cancel != 'Cancel'
          AND date(pt.doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
        GROUP BY pt.branch_sync
      )
      SELECT
        h.branch_sync,
        round(h.header_total, 2) AS header_total,
        round(d.detail_total, 2) AS detail_total,
        round(j.expenses, 2) AS expenses,
        round(j.assets, 2) AS assets,
        round(j.expenses + j.assets, 2) AS expenses_plus_assets,
        round(j.liabilities, 2) AS liabilities,
        round(j.other_debit_net, 2) AS other_debit_net,
        h.po_count,
        round(h.avg_po, 2) AS avg_po,
        round(d.qty, 2) AS qty
      FROM purchase_header h
      LEFT JOIN purchase_detail d ON h.branch_sync = d.branch_sync
      LEFT JOIN journal j ON h.branch_sync = j.branch_sync
      ORDER BY h.branch_sync
    `, { start: START, end: END });

    const byAccount = await queryRows(ch, `
      WITH purchases AS (
        SELECT DISTINCT doc_no, branch_sync
        FROM purchase_transaction
        WHERE status_cancel != 'Cancel'
          AND date(doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
      )
      SELECT
        j.branch_sync,
        j.account_type,
        j.account_code,
        j.account_name,
        round(sum(j.debit - j.credit), 2) AS debit_net,
        round(sum(j.credit - j.debit), 2) AS credit_net,
        count(DISTINCT j.doc_no, j.branch_sync) AS doc_count
      FROM journal_transaction_detail j
      INNER JOIN purchases p ON j.doc_no = p.doc_no AND j.branch_sync = p.branch_sync
      WHERE date(j.doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
      GROUP BY j.branch_sync, j.account_type, j.account_code, j.account_name
      HAVING debit_net != 0 OR credit_net != 0
      ORDER BY j.branch_sync, j.account_type, j.account_code
    `, { start: START, end: END });

    const suspiciousDocs = await queryRows(ch, `
      WITH journal_by_doc AS (
        SELECT
          doc_no,
          branch_sync,
          sumIf(debit - credit, account_type = 'EXPENSES') AS expenses,
          sumIf(debit - credit, account_type = 'ASSETS') AS assets
        FROM journal_transaction_detail
        WHERE date(doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
        GROUP BY doc_no, branch_sync
      )
      SELECT
        pt.branch_sync,
        pt.doc_no,
        pt.supplier_code,
        pt.supplier_name,
        round(pt.total_amount, 2) AS header_total,
        round(j.expenses, 2) AS expenses,
        round(j.assets, 2) AS assets,
        round(pt.total_amount - (j.expenses + j.assets), 2) AS header_minus_expense_asset
      FROM purchase_transaction pt
      LEFT JOIN journal_by_doc j ON pt.doc_no = j.doc_no AND pt.branch_sync = j.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND date(pt.doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
        AND abs(pt.total_amount - (j.expenses + j.assets)) > 0.01
      ORDER BY abs(header_minus_expense_asset) DESC
      LIMIT 50
    `, { start: START, end: END });

    const returnsByDoc = await queryRows(ch, `
      SELECT
        j.branch_sync,
        j.doc_no,
        any(pt.supplier_code) AS supplier_code,
        any(pt.supplier_name) AS supplier_name,
        round(any(pt.total_amount), 2) AS header_total,
        round(sum(j.debit - j.credit), 2) AS return_amount
      FROM journal_transaction_detail j
      INNER JOIN purchase_transaction pt ON j.doc_no = pt.doc_no AND j.branch_sync = pt.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND date(pt.doc_datetime + INTERVAL 7 HOUR) BETWEEN {start:String} AND {end:String}
        AND j.account_type = 'EXPENSES'
        AND position(j.account_name, 'ส่งคืน') > 0
      GROUP BY j.branch_sync, j.doc_no
      ORDER BY j.branch_sync, j.doc_no
    `, { start: START, end: END });

    console.log(JSON.stringify({
      period: { start: START, end: END },
      totals,
      byAccount,
      suspiciousDocs,
      returnsByDoc,
    }, null, 2));
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
