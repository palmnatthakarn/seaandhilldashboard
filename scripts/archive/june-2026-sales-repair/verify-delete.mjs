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

  console.log('June 29 without FINAL:');
  const v1 = await q(`SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) = '2026-06-29'`);
  console.log(`  ${v1[0]?.cnt} rows`);

  console.log('\nJune 29 with FINAL:');
  const v2 = await q(`SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) = '2026-06-29' SETTINGS final=1`);
  console.log(`  ${v2[0]?.cnt} rows`);

  console.log('\nJune 29 detail without FINAL:');
  const v3 = await q(`SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction_detail WHERE toDate(doc_datetime) = '2026-06-29'`);
  console.log(`  ${v3[0]?.cnt} rows`);

  console.log('\nJune 29 detail with FINAL:');
  const v4 = await q(`SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction_detail WHERE toDate(doc_datetime) = '2026-06-29' SETTINGS final=1`);
  console.log(`  ${v4[0]?.cnt} rows`);

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
