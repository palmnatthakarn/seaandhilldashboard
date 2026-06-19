const { Client: PgClient } = require('pg');
const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

function pgClient(config) {
  return new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
  });
}

async function main() {
  const { data: config } = readConfig(CONFIG_PATH);
  const pg = pgClient(config);
  const ch = createClickHouse(config);

  try {
    await pg.connect();

    for (const [startDate, endDate] of [
      ['2026-06-11', '2026-06-17'],
      ['2026-06-01', '2026-06-17'],
      ['2026-05-01', '2026-05-31'],
    ]) {
    const pgDocs = await pg.query(`
      SELECT
        doc_no,
        round(sum(sum_amount)::numeric, 2) AS product_sales,
        count(*)::int AS rows
      FROM ic_trans_detail
      WHERE trans_type = 2
        AND doc_date BETWEEN $1 AND $2
        AND coalesce(status, 0) <> 1
        AND trim(coalesce(item_code, '')) <> ''
        AND trim(coalesce(item_name, '')) <> ''
        AND qty > 0
        AND sum_amount > 0
        AND trim(coalesce(unit_code, '')) <> ''
      GROUP BY doc_no
    `, [startDate, endDate]);

    const chDocs = await queryRows(ch, `
      WITH detail_lines AS (
        SELECT DISTINCT
          branch_sync,
          doc_no,
          doc_datetime,
          item_code,
          barcode,
          item_name,
          unit_code,
          unit_name,
          qty,
          price,
          discount_amount,
          sum_amount,
          sum_of_cost,
          average_cost,
          item_category_code,
          item_category_name
        FROM saleinvoice_transaction_detail
        WHERE branch_sync = 'b000'
          AND toDate(doc_datetime) BETWEEN toDate({startDate:String}) AND toDate({endDate:String})
          AND status_cancel != 'Cancel'
          AND trim(item_code) != ''
          AND trim(item_name) != ''
          AND qty > 0
          AND sum_amount > 0
          AND trim(unit_code) != ''
      )
      SELECT
        doc_no AS doc_no,
        round(sum(sum_amount), 2) AS product_sales,
        count() AS rows
      FROM detail_lines
      GROUP BY doc_no
    `, { startDate, endDate });

    const joinedDocs = await queryRows(ch, `
      WITH header_docs AS (
        SELECT
          branch_sync,
          doc_no,
          any(customer_code) AS customer_code
        FROM saleinvoice_transaction
        WHERE branch_sync = 'b000'
          AND status_cancel != 'Cancel'
          AND toDate(doc_datetime) BETWEEN toDate({startDate:String}) AND toDate({endDate:String})
        GROUP BY branch_sync, doc_no
      ),
      detail_lines AS (
        SELECT DISTINCT
          branch_sync,
          doc_no,
          doc_datetime,
          item_code,
          barcode,
          item_name,
          unit_code,
          unit_name,
          qty,
          price,
          discount_amount,
          sum_amount,
          sum_of_cost,
          average_cost,
          item_category_code,
          item_category_name
        FROM saleinvoice_transaction_detail
        WHERE branch_sync = 'b000'
          AND toDate(doc_datetime) BETWEEN toDate({startDate:String}) AND toDate({endDate:String})
          AND status_cancel != 'Cancel'
          AND trim(item_code) != ''
          AND trim(item_name) != ''
          AND qty > 0
          AND sum_amount > 0
          AND trim(unit_code) != ''
      )
      SELECT
        round(sum(product_sales), 2) AS total_sales,
        count() AS orders,
        uniq(customer_code) AS customers
      FROM (
        SELECT
          h.branch_sync,
          h.doc_no,
          h.customer_code,
          sum(d.sum_amount) AS product_sales
        FROM header_docs h
        INNER JOIN detail_lines d ON h.branch_sync = d.branch_sync AND h.doc_no = d.doc_no
        GROUP BY h.branch_sync, h.doc_no, h.customer_code
      )
    `, { startDate, endDate });

    const pgMap = new Map(pgDocs.rows.map((row) => [row.doc_no, row]));
    const chMap = new Map(chDocs.map((row) => [row.doc_no, row]));
    const docNos = Array.from(new Set([...pgMap.keys(), ...chMap.keys()])).sort();

    let totalPg = 0;
    let totalCh = 0;
    const diffs = [];

    for (const docNo of docNos) {
      const pgRow = pgMap.get(docNo) || { product_sales: 0, rows: 0 };
      const chRow = chMap.get(docNo) || { product_sales: 0, rows: 0 };
      const pgSales = Number(pgRow.product_sales || 0);
      const chSales = Number(chRow.product_sales || 0);
      totalPg += pgSales;
      totalCh += chSales;
      const diff = chSales - pgSales;
      if (Math.abs(diff) > 0.005 || Number(chRow.rows || 0) !== Number(pgRow.rows || 0)) {
        diffs.push({
          docNo,
          pgSales,
          chSales,
          diff,
          pgRows: Number(pgRow.rows || 0),
          chRows: Number(chRow.rows || 0),
        });
      }
    }

    console.log(`\n${startDate}..${endDate}`);
    console.log(`PG total: ${totalPg.toFixed(2)}`);
    console.log(`CH distinct detail total: ${totalCh.toFixed(2)}`);
    console.log(`Diff: ${(totalCh - totalPg).toFixed(2)}`);
    const joined = joinedDocs[0] || {};
    console.log(`CH dashboard formula: sales=${Number(joined.total_sales || 0).toFixed(2)} orders=${joined.orders || 0} customers=${joined.customers || 0}`);
    console.log('Top diffs:');
    for (const row of diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 20)) {
      console.log(`  ${row.docNo}: PG=${row.pgSales.toFixed(2)} rows=${row.pgRows} | CH=${row.chSales.toFixed(2)} rows=${row.chRows} | diff=${row.diff.toFixed(2)}`);
    }
    }
  } finally {
    await ch.close();
    await pg.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
