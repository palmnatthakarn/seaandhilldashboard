import { createClient } from '@clickhouse/client';

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

  // stock_transaction columns
  console.log('=== stock_transaction columns ===');
  const stCols = await q(`SELECT name, type FROM system.columns WHERE database='datachangsiam' AND table='stock_transaction' ORDER BY position`);
  stCols.forEach((c, i) => console.log(`  ${i+1} ${c.name}: ${c.type}`));

  // stock_transaction duplicates (use correct group cols)
  console.log('\n=== stock_transaction duplicate check (June) ===');
  const stRows = await q(`SELECT count() AS cnt FROM datachangsiam.stock_transaction WHERE toDate(doc_datetime) >= '2026-06-01'`);
  console.log(`  Total rows: ${stRows[0]?.cnt}`);
  const stDup = await q(`SELECT count() AS cnt FROM (SELECT doc_no, branch_sync, item_code FROM datachangsiam.stock_transaction WHERE toDate(doc_datetime) >= '2026-06-01' GROUP BY doc_no, branch_sync, item_code HAVING count(*) > 1)`);
  console.log(`  Duplicate groups (doc_no, branch_sync, item_code): ${stDup[0]?.cnt}`);

  // payment_transaction duplicates
  console.log('\n=== payment_transaction duplicate check (June) ===');
  const ptDup = await q(`SELECT doc_no, branch_sync, count(*) AS cnt FROM datachangsiam.payment_transaction WHERE toDate(doc_datetime) >= '2026-06-01' GROUP BY doc_no, branch_sync HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20`);
  console.log(`  Top duplicates: ${JSON.stringify(ptDup)}`);

  // purchase_transaction_detail duplicates (despite being ReplacingMergeTree)
  console.log('\n=== purchase_transaction_detail duplicate check (June) ===');
  const ptdDup = await q(`SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code, count(*) AS cnt FROM datachangsiam.purchase_transaction_detail WHERE toDate(doc_datetime) >= '2026-06-01' GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20`);
  console.log(`  Top duplicates: ${JSON.stringify(ptdDup)}`);

  // journal_transaction_detail duplicates
  console.log('\n=== journal_transaction_detail duplicate check (June) ===');
  const jtdDup = await q(`SELECT doc_no, branch_sync, count(*) AS cnt FROM datachangsiam.journal_transaction_detail WHERE toDate(doc_datetime) >= '2026-06-01' GROUP BY doc_no, branch_sync HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20`);
  console.log(`  Top duplicates: ${JSON.stringify(jtdDup)}`);

  // Check ReplacingMergeTree details
  console.log('\n=== ReplacingMergeTree details ===');
  const rmt = await q(`SELECT name, engine, create_table_query FROM system.tables WHERE database='datachangsiam' AND engine='ReplacingMergeTree'`);
  for (const t of rmt) {
    console.log(`\n--- ${t.name} ---`);
    console.log(`  CREATE: ${t.create_table_query}`);
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
