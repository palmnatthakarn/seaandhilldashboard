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

  // Check the 2 docs for June 29
  console.log('=== June 29 documents ===');
  const docs = await q(`
    SELECT doc_no, doc_datetime, branch_sync, customer_code, customer_name,
           total_amount, status_cancel, status_payment
    FROM datachangsiam.saleinvoice_transaction
    WHERE toDate(doc_datetime) = '2026-06-29'
  `);
  for (const d of docs) {
    console.log(`  ${d.doc_no} | ${d.doc_datetime} | ${d.branch_sync} | ${d.customer_name} | ${d.total_amount} | cancel=${d.status_cancel} | pay=${d.status_payment}`);
  }

  // Total June per branch (for comparison with source)
  console.log('\n=== June totals per branch ===');
  const totals = await q(`
    SELECT branch_sync,
           count() AS docs,
           toString(sum(total_amount)) AS total
    FROM datachangsiam.saleinvoice_transaction
    WHERE toDate(doc_datetime) >= '2026-06-01' AND toDate(doc_datetime) <= '2026-06-29'
      AND status_cancel != 'Cancel'
    GROUP BY branch_sync
    ORDER BY branch_sync
  `);
  for (const t of totals) {
    console.log(`  ${t.branch_sync}: ${t.docs} docs, ${t.total} baht`);
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
