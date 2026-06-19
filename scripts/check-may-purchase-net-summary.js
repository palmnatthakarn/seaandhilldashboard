const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

async function main() {
  const { data: config } = readConfig();
  const ch = createClickHouse(config);

  try {
    const rows = await queryRows(ch, `
      WITH return_docs AS (
        SELECT
          j.doc_no,
          j.branch_sync,
          sum(j.debit - j.credit) AS return_amount,
          toUInt8(1) AS has_return
        FROM journal_transaction_detail j
        WHERE j.account_type = 'EXPENSES'
          AND position(j.account_name, 'ส่งคืน') > 0
          AND j.doc_datetime BETWEEN {start:String} AND {end:String}
          AND j.branch_sync = 'b000'
        GROUP BY j.doc_no, j.branch_sync
      )
      SELECT
        round(sum(pt.total_amount), 2) AS header_total,
        round(sum(coalesce(r.return_amount, 0)), 2) AS return_adjustment,
        round(sum(pt.total_amount + coalesce(r.return_amount, 0)), 2) AS net_total,
        count() AS raw_doc_count,
        countIf(coalesce(r.has_return, 0) = 0) AS net_doc_count,
        round(avgIf(pt.total_amount + coalesce(r.return_amount, 0), abs(pt.total_amount + coalesce(r.return_amount, 0)) > 0.01), 2) AS net_avg_po
      FROM purchase_transaction pt
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start:String} AND {end:String}
        AND pt.branch_sync = 'b000'
    `, {
      start: '2026-05-01 00:00:00',
      end: '2026-05-31 23:59:59',
    });

    const itemRows = await queryRows(ch, `
      WITH return_docs AS (
        SELECT
          j.doc_no,
          j.branch_sync,
          sum(j.debit - j.credit) AS return_amount,
          toUInt8(1) AS has_return
        FROM journal_transaction_detail j
        WHERE j.account_type = 'EXPENSES'
          AND position(j.account_name, 'ส่งคืน') > 0
          AND j.doc_datetime BETWEEN {start:String} AND {end:String}
          AND j.branch_sync = 'b000'
        GROUP BY j.doc_no, j.branch_sync
      )
      SELECT
        round(sumIf(ptd.qty, coalesce(r.has_return, 0) = 0), 2) AS total_items
      FROM purchase_transaction_detail ptd
      INNER JOIN purchase_transaction pt ON ptd.doc_no = pt.doc_no AND ptd.branch_sync = pt.branch_sync
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start:String} AND {end:String}
        AND pt.branch_sync = 'b000'
    `, {
      start: '2026-05-01 00:00:00',
      end: '2026-05-31 23:59:59',
    });

    const trendRows = await queryRows(ch, `
      WITH return_docs AS (
        SELECT
          j.doc_no,
          j.branch_sync,
          sum(j.debit - j.credit) AS return_amount,
          toUInt8(1) AS has_return
        FROM journal_transaction_detail j
        WHERE j.account_type = 'EXPENSES'
          AND position(j.account_name, 'ส่งคืน') > 0
          AND j.doc_datetime BETWEEN {start:String} AND {end:String}
          AND j.branch_sync = 'b000'
        GROUP BY j.doc_no, j.branch_sync
      )
      SELECT
        toDate(pt.doc_datetime + INTERVAL 7 HOUR) AS date,
        round(sumIf(pt.total_amount + coalesce(r.return_amount, 0), abs(pt.total_amount + coalesce(r.return_amount, 0)) > 0.01), 2) AS totalPurchases,
        countIf(coalesce(r.has_return, 0) = 0) AS poCount
      FROM purchase_transaction pt
      LEFT JOIN return_docs r ON pt.doc_no = r.doc_no AND pt.branch_sync = r.branch_sync
      WHERE pt.status_cancel != 'Cancel'
        AND pt.doc_datetime BETWEEN {start:String} AND {end:String}
        AND pt.branch_sync = 'b000'
      GROUP BY date
      ORDER BY date
    `, {
      start: '2026-05-01 00:00:00',
      end: '2026-05-31 23:59:59',
    });

    console.log(JSON.stringify({
      summary: rows,
      items: itemRows,
      trendDays: trendRows.length,
      trendSample: trendRows.slice(0, 5),
    }, null, 2));
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
