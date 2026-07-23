import { createClient } from '@clickhouse/client';

async function run() {
  const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  // Full SHOW CREATE TABLE
  const colQuery = `SELECT name, type, position FROM system.columns WHERE database='datachangsiam' AND table='saleinvoice_transaction' ORDER BY position`;
  const cols = await client.query({ query: colQuery, format: 'JSONEachRow' });
  const rows = await cols.json();
  console.log('=== saleinvoice_transaction columns ===');
  for (const r of rows) {
    console.log(`${r.position} ${r.name} ${r.type}`);
  }
  console.log(`\nTotal columns: ${rows.length}`);

  const colQuery2 = `SELECT name, type, position FROM system.columns WHERE database='datachangsiam' AND table='saleinvoice_transaction_detail' ORDER BY position`;
  const cols2 = await client.query({ query: colQuery2, format: 'JSONEachRow' });
  const rows2 = await cols2.json();
  console.log('\n=== saleinvoice_transaction_detail columns ===');
  for (const r of rows2) {
    console.log(`${r.position} ${r.name} ${r.type}`);
  }
  console.log(`\nTotal columns: ${rows2.length}`);

  await client.close();
}

run().catch(console.error);
