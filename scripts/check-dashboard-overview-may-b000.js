const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

async function main() {
  const { data: config } = readConfig('D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json');
  const ch = createClickHouse(config);

  try {
    const rows = await queryRows(ch, `
      WITH product_docs AS (
        SELECT
          si.branch_sync,
          si.doc_no,
          any(si.customer_code) AS customer_code,
          sum(sid.sum_amount) AS product_sales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.branch_sync = 'b000'
          AND si.status_cancel != 'Cancel'
          AND si.doc_datetime BETWEEN '2026-05-01 00:00:00' AND '2026-05-31 23:59:59'
          AND sid.status_cancel != 'Cancel'
          AND trim(sid.item_code) != ''
          AND trim(sid.item_name) != ''
          AND sid.qty > 0
          AND sid.sum_amount > 0
          AND trim(sid.unit_code) != ''
        GROUP BY si.branch_sync, si.doc_no
      )
      SELECT
        round(sum(product_sales), 2) AS totalSales,
        count() AS orders,
        uniq(customer_code) AS customers,
        round(sum(product_sales) / nullIf(count(), 0), 2) AS avgOrderValue
      FROM product_docs
    `);

    console.log(JSON.stringify(rows, null, 2));

    const periods = await queryRows(ch, `
      WITH product_docs AS (
        SELECT
          period,
          si.branch_sync,
          si.doc_no,
          any(si.customer_code) AS customer_code,
          sum(sid.sum_amount) AS product_sales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        ARRAY JOIN
          multiIf(
            si.doc_datetime BETWEEN '2026-05-01 00:00:00' AND '2026-05-31 23:59:59', ['may'],
            si.doc_datetime BETWEEN '2026-04-01 00:00:00' AND '2026-04-30 23:59:59', ['april'],
            si.doc_datetime BETWEEN '2026-03-31 00:00:00' AND '2026-04-30 23:59:59', ['prev_31_days'],
            []
          ) AS period
        WHERE si.branch_sync = 'b000'
          AND si.status_cancel != 'Cancel'
          AND sid.status_cancel != 'Cancel'
          AND trim(sid.item_code) != ''
          AND trim(sid.item_name) != ''
          AND sid.qty > 0
          AND sid.sum_amount > 0
          AND trim(sid.unit_code) != ''
        GROUP BY period, si.branch_sync, si.doc_no
      )
      SELECT
        period,
        round(sum(product_sales), 2) AS totalSales,
        count() AS orders,
        uniq(customer_code) AS customers,
        round(sum(product_sales) / nullIf(count(), 0), 2) AS avgOrderValue
      FROM product_docs
      GROUP BY period
      ORDER BY period
    `);

    console.log(JSON.stringify(periods, null, 2));
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
