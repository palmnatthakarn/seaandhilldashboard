import { createClient } from '@clickhouse/client';

async function run() {
  const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
  });

  async function q(query) {
    const result = await client.query({ query, format: 'JSONEachRow' });
    return result.json();
  }

  // Check detail rows
  const det = await q(`
    SELECT doc_no, branch_sync, count() AS items, toString(sum(sum_amount)) AS total
    FROM datachangsiam.saleinvoice_transaction_detail
    WHERE (doc_no = 'CA690629-0001' AND branch_sync = 'b000')
       OR (doc_no = 'CRD26060002' AND branch_sync = 'b000')
    GROUP BY doc_no, branch_sync
  `);
  console.log('Detail rows:', JSON.stringify(det));

  // Delete from transaction
  await client.exec({ query: `ALTER TABLE datachangsiam.saleinvoice_transaction DELETE WHERE (doc_no = 'CA690629-0001' AND branch_sync = 'b000') OR (doc_no = 'CRD26060002' AND branch_sync = 'b000')` });
  console.log('Deleted from saleinvoice_transaction');

  // Delete from detail
  await client.exec({ query: `ALTER TABLE datachangsiam.saleinvoice_transaction_detail DELETE WHERE (doc_no = 'CA690629-0001' AND branch_sync = 'b000') OR (doc_no = 'CRD26060002' AND branch_sync = 'b000')` });
  console.log('Deleted from saleinvoice_transaction_detail');

  // Verify
  const v = await q(`SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) = '2026-06-29'`);
  console.log('Remaining June 29 docs:', v[0]?.cnt);

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
