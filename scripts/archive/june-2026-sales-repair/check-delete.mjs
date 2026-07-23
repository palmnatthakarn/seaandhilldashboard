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

  // Check with FINAL
  const v = await q(`SELECT doc_no, total_amount, status_cancel FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) = '2026-06-29' SETTINGS final = 1`);
  console.log('June 29 with FINAL:', JSON.stringify(v));

  // Check mutations
  const m = await q(`SELECT database, table, command, is_done FROM system.mutations WHERE database='datachangsiam' AND table='saleinvoice_transaction' ORDER BY create_time DESC LIMIT 5`);
  console.log('Mutations:', JSON.stringify(m));

  const m2 = await q(`SELECT database, table, command, is_done FROM system.mutations WHERE database='datachangsiam' AND table='saleinvoice_transaction_detail' ORDER BY create_time DESC LIMIT 5`);
  console.log('Detail mutations:', JSON.stringify(m2));

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
