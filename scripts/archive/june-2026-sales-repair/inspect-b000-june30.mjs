import { createClient } from '@clickhouse/client';

const HOST = process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123';

async function run() {
  const client = createClient({
    url: HOST,
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  async function q(query) {
    const result = await client.query({ query, format: 'JSONEachRow' });
    return result.json();
  }

  console.log('=== Header rows (saleinvoice_transaction) for b000 on 2026-06-30 ===');
  const headers = await q(`
    SELECT doc_no, branch_sync, doc_datetime, status_cancel, total_amount, customer_code
    FROM saleinvoice_transaction
    WHERE branch_sync = 'b000' AND toDate(doc_datetime) = '2026-06-30'
    ORDER BY doc_no
    SETTINGS final = 1
  `);
  console.log(`Count: ${headers.length}`);
  for (const h of headers) console.log(' ', JSON.stringify(h));

  console.log('\n=== Check for duplicate doc_no+branch_sync in header (should be none after FINAL) ===');
  const dupHeaders = await q(`
    SELECT doc_no, branch_sync, count() AS cnt
    FROM saleinvoice_transaction
    WHERE branch_sync = 'b000' AND toDate(doc_datetime) = '2026-06-30'
    GROUP BY doc_no, branch_sync
    HAVING cnt > 1
    SETTINGS final = 1
  `);
  console.log(`Duplicate header groups: ${dupHeaders.length}`, JSON.stringify(dupHeaders));

  console.log('\n=== Detail line totals per doc_no for b000 on 2026-06-30 ===');
  const details = await q(`
    SELECT doc_no, branch_sync, count() AS lines, toString(sum(sum_amount)) AS total
    FROM saleinvoice_transaction_detail
    WHERE branch_sync = 'b000' AND toDate(doc_datetime) = '2026-06-30'
    GROUP BY doc_no, branch_sync
    ORDER BY doc_no
    SETTINGS final = 1
  `);
  for (const d of details) console.log(' ', JSON.stringify(d));

  console.log('\n=== Raw detail rows for the biggest doc_no (to check for line-level dup) ===');
  if (details.length > 0) {
    const biggest = details.reduce((a, b) => (Number(a.total) > Number(b.total) ? a : b));
    const rawLines = await q(`
      SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code, qty, sum_amount, status_cancel, doc_datetime
      FROM saleinvoice_transaction_detail
      WHERE branch_sync = 'b000' AND doc_no = '${biggest.doc_no}'
      ORDER BY item_code, barcode, wh_code, shelf_code
      SETTINGS final = 1
    `);
    console.log(`doc_no=${biggest.doc_no} has ${rawLines.length} raw lines:`);
    for (const r of rawLines) console.log(' ', JSON.stringify(r));
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
