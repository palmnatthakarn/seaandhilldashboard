import { createClient } from '@clickhouse/client';

async function run() {
  const client = createClient({
    host: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  async function q(query) {
    const result = await client.query({ query, format: 'JSONEachRow' });
    return result.json();
  }

  // 1. Table engines
  console.log('=== TABLE ENGINES ===');
  const engines = await q(`SELECT name, engine FROM system.tables WHERE database='datachangsiam' AND name LIKE 'saleinvoice%' ORDER BY name`);
  console.log(JSON.stringify(engines, null, 2));

  // 2. Duplicates in saleinvoice_transaction
  console.log('\n=== DUPLICATE saleinvoice_transaction (June, top 20) ===');
  const dupTxn = await q(`SELECT doc_no, branch_sync, count(*) AS cnt FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) >= '2026-06-01' GROUP BY doc_no, branch_sync HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20`);
  console.log(JSON.stringify(dupTxn, null, 2));
  const dupTxnCount = await q(`SELECT count() AS cnt FROM (SELECT doc_no, branch_sync FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) >= '2026-06-01' GROUP BY doc_no, branch_sync HAVING count(*) > 1)`);
  console.log('Total duplicate groups:', dupTxnCount[0]?.cnt);

  // 3. Duplicates in saleinvoice_transaction_detail
  console.log('\n=== DUPLICATE saleinvoice_transaction_detail (June, top 20) ===');
  const dupDet = await q(`SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code, count(*) AS cnt FROM datachangsiam.saleinvoice_transaction_detail WHERE toDate(doc_datetime) >= '2026-06-01' AND qty > 0 AND sum_amount > 0 GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20`);
  console.log(JSON.stringify(dupDet, null, 2));
  const dupDetCount = await q(`SELECT count() AS cnt FROM (SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code FROM datachangsiam.saleinvoice_transaction_detail WHERE toDate(doc_datetime) >= '2026-06-01' AND qty > 0 AND sum_amount > 0 GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code HAVING count(*) > 1)`);
  console.log('Total duplicate groups:', dupDetCount[0]?.cnt);

  // 4. Row count vs distinct count
  console.log('\n=== ROW COUNTS (June) ===');
  const txn = await q(`SELECT count() AS total_rows, uniqExact(doc_no, branch_sync) AS distinct_docs FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) >= '2026-06-01'`);
  console.log('saleinvoice_transaction:', JSON.stringify(txn));
  const det = await q(`SELECT count() AS total_rows, uniqExact(doc_no, branch_sync, item_code, barcode, wh_code, shelf_code) AS distinct_rows FROM datachangsiam.saleinvoice_transaction_detail WHERE toDate(doc_datetime) >= '2026-06-01' AND qty > 0 AND sum_amount > 0`);
  console.log('saleinvoice_transaction_detail:', JSON.stringify(det));

  // 5. Sum comparison: total vs distinct
  console.log('\n=== SUM COMPARISON (June) ===');
  const sums = await q(`
    SELECT
      (SELECT toString(sum(sum_amount)) FROM datachangsiam.saleinvoice_transaction_detail WHERE toDate(doc_datetime) >= '2026-06-01' AND qty > 0 AND sum_amount > 0) AS total_sum,
      (SELECT toString(sum(DISTINCT sum_amount)) FROM datachangsiam.saleinvoice_transaction_detail WHERE toDate(doc_datetime) >= '2026-06-01' AND qty > 0 AND sum_amount > 0) AS distinct_sum
  `);
  console.log(JSON.stringify(sums));

  // 6. Per-branch sum
  console.log('\n=== SUM PER BRANCH (June) ===');
  const branchSums = await q(`
    SELECT branch_sync, count() AS rows, uniqExact(doc_no) AS docs, toString(sum(sum_amount)) AS total_sum
    FROM datachangsiam.saleinvoice_transaction_detail
    WHERE toDate(doc_datetime) >= '2026-06-01' AND qty > 0 AND sum_amount > 0
    GROUP BY branch_sync ORDER BY branch_sync
  `);
  console.log(JSON.stringify(branchSums, null, 2));

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
