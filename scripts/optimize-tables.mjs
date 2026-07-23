import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
  username: process.env.CLICKHOUSE_USER || 'admin',
  password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
  database: process.env.CLICKHOUSE_DB || 'datachangsiam',
});

async function optimize(table) {
  console.log(`OPTIMIZE TABLE ${table} FINAL ...`);
  try {
    await client.query({ query: `OPTIMIZE TABLE datachangsiam.${table} FINAL` });
    console.log(`  ✅ ${table} done`);
  } catch (err) {
    console.error(`  ❌ ${table}: ${err.message}`);
  }
}

const tables = [
  'saleinvoice_transaction',
  'saleinvoice_transaction_detail',
  'stock_transaction',
  'purchase_transaction',
  'purchase_transaction_detail',
  'payment_transaction',
  'journal_transaction_detail',
];

async function run() {
  console.log('=== OPTIMIZE TABLE FINAL ===');
  for (const t of tables) {
    await optimize(t);
  }
  await client.close();
  console.log('=== DONE ===');
}

run().catch((err) => { console.error(err); process.exit(1); });
