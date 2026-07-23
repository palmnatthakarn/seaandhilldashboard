import { createClient } from '@clickhouse/client';

async function run() {
  const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  await client.exec({ query: 'DROP TABLE IF EXISTS datachangsiam.saleinvoice_transaction_new' });
  console.log('Dropped saleinvoice_transaction_new');
  await client.exec({ query: 'DROP TABLE IF EXISTS datachangsiam.saleinvoice_transaction_detail_new' });
  console.log('Dropped saleinvoice_transaction_detail_new');
  await client.close();
}

run().catch(console.error);
