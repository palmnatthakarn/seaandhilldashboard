import { createClient } from '@clickhouse/client';

async function run() {
  const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  const result = await client.query({ query: 'SELECT version()', format: 'JSONEachRow' });
  const rows = await result.json();
  console.log('ClickHouse version:', JSON.stringify(rows));

  // test if SETTINGS final=1 works
  try {
    const test = await client.query({ query: "SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) >= '2026-06-28' SETTINGS final=1", format: 'JSONEachRow' });
    const testRows = await test.json();
    console.log('SETTINGS final=1 works:', JSON.stringify(testRows));
  } catch (err) {
    console.log('SETTINGS final=1 FAILED:', err.message);
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
