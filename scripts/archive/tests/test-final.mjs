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

  // 1. Test SETTINGS final=1 works for saleinvoice_transaction
  console.log('=== Test 1: saleinvoice with SETTINGS final=1 ===');
  const r1 = await q(`SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) >= '2026-06-28' AND toDate(doc_datetime) <= '2026-06-29' SETTINGS final = 1`);
  console.log(`  With FINAL: ${r1[0]?.cnt} rows`);

  const r2 = await q(`SELECT count() AS cnt FROM datachangsiam.saleinvoice_transaction WHERE toDate(doc_datetime) >= '2026-06-28' AND toDate(doc_datetime) <= '2026-06-29'`);
  console.log(`  Without FINAL: ${r2[0]?.cnt} rows`);

  // 2. Test WITH query with SETTINGS
  console.log('\n=== Test 2: WITH query with SETTINGS final=1 ===');
  const r3 = await q(`
    WITH t AS (
      SELECT doc_no, total_amount
      FROM datachangsiam.saleinvoice_transaction
      WHERE toDate(doc_datetime) >= '2026-06-29'
    )
    SELECT count() AS cnt FROM t
    SETTINGS final = 1
  `);
  console.log(`  WITH + FINAL: ${r3[0]?.cnt} rows`);

  // 3. ReplacingMergeTree dedup verification
  console.log('\n=== Test 3: ReplacingMergeTree dedup check ===');
  const r4 = await q(`
    SELECT engine, name
    FROM system.tables
    WHERE database='datachangsiam' AND name LIKE 'saleinvoice%' AND engine != 'MergeTree'
  `);
  for (const r of r4) {
    console.log(`  ${r.name}: ${r.engine}`);
  }

  // 4. Check if June 29 data actually exists
  console.log('\n=== Test 4: June 29 data check ===');
  const r5 = await q(`
    SELECT toDate(doc_datetime) AS d, count() AS cnt, toString(sum(total_amount)) AS total
    FROM datachangsiam.saleinvoice_transaction
    WHERE toDate(doc_datetime) >= '2026-06-28'
    GROUP BY d ORDER BY d
  `);
  for (const r of r5) {
    console.log(`  ${r.d}: ${r.cnt} docs, ${r.total} total`);
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
