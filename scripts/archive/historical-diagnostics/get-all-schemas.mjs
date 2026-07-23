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

  const tables = ['stock_transaction', 'payment_transaction', 'journal_transaction_detail'];
  for (const name of tables) {
    console.log(`\n\n=== ${name} ===`);
    const cols = await q(`SELECT name, type FROM system.columns WHERE database='datachangsiam' AND table='${name}' ORDER BY position`);
    for (const c of cols) {
      console.log(`${c.name} ${c.type}`);
    }
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
