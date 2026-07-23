import { createClient } from '@clickhouse/client';

const DATE = process.argv[2] || '2026-06-29';

async function run() {
  const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  async function q(query) {
    const result = await client.query({ query, format: 'JSONEachRow' });
    return result.json();
  }

  const baseQuery = (finalSettings) => `
    WITH product_docs AS (
      SELECT
        si.branch_sync AS branch_sync,
        si.doc_no,
        sum(sid.sum_amount) AS product_sales
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND toDate(si.doc_datetime) = toDate('${DATE}')
        AND sid.status_cancel != 'Cancel'
        AND trim(sid.item_code) != ''
        AND trim(sid.item_name) != ''
        AND sid.qty > 0
        AND sid.sum_amount > 0
        AND trim(sid.unit_code) != ''
      GROUP BY si.branch_sync, si.doc_no
    )
    SELECT
      branch_sync,
      count() AS orders,
      toString(sum(product_sales)) AS total
    FROM product_docs
    GROUP BY branch_sync
    ORDER BY branch_sync
    ${finalSettings ? 'SETTINGS final = 1' : ''}
  `;

  console.log(`=== ${DATE} sales WITHOUT FINAL (old dashboard behavior) ===`);
  const withoutFinal = await q(baseQuery(false));
  for (const r of withoutFinal) console.log(`  ${r.branch_sync}: ${r.orders} orders, ${r.total} baht`);

  console.log(`\n=== ${DATE} sales WITH FINAL (fixed behavior) ===`);
  const withFinal = await q(baseQuery(true));
  for (const r of withFinal) console.log(`  ${r.branch_sync}: ${r.orders} orders, ${r.total} baht`);

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
