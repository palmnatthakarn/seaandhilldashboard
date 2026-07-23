import { createClient } from '@clickhouse/client';

async function run() {
  const client = createClient({
    host: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  async function q(query) {
    const result = await client.query({ query, format: 'JSONEachRow' });
    return result.json();
  }

  // 1. Engine types for ALL tables
  console.log('=== TABLE ENGINES ===');
  const engines = await q(`SELECT name, engine FROM system.tables WHERE database='datachangsiam' ORDER BY name`);
  for (const e of engines) {
    console.log(`  ${e.name}: ${e.engine}`);
  }

  // 2. Check all tables for duplicate groups (tables with > 0 duplicates in June)
  console.log('\n=== DUPLICATE CHECK (June) ===');

  const tablesToCheck = [
    { name: 'stock_transaction', groupCols: ['doc_no', 'branch_sync', 'item_code', 'barcode', 'wh_code', 'shelf_code'], dateCol: 'doc_datetime', filter: '' },
    { name: 'stock_transaction_detail', groupCols: ['doc_no', 'branch_sync', 'item_code', 'barcode', 'wh_code', 'shelf_code'], dateCol: 'doc_datetime', filter: '' },
    { name: 'payment_transaction', groupCols: ['doc_no', 'branch_sync'], dateCol: 'doc_datetime', filter: '' },
    { name: 'purchase_transaction', groupCols: ['doc_no', 'branch_sync'], dateCol: 'doc_datetime', filter: '' },
    { name: 'purchase_transaction_detail', groupCols: ['doc_no', 'branch_sync', 'item_code', 'barcode', 'wh_code', 'shelf_code'], dateCol: 'doc_datetime', filter: '' },
    { name: 'journal_transaction', groupCols: ['doc_no', 'branch_sync'], dateCol: 'doc_datetime', filter: '' },
    { name: 'journal_transaction_detail', groupCols: ['doc_no', 'branch_sync'], dateCol: 'doc_datetime', filter: '' },
    { name: 'account_transaction', groupCols: ['doc_no', 'branch_sync'], dateCol: 'doc_datetime', filter: '' },
    { name: 'account_transaction_detail', groupCols: ['doc_no', 'branch_sync'], dateCol: 'doc_datetime', filter: '' },
  ];

  for (const table of tablesToCheck) {
    try {
      const groupCols = table.groupCols.join(', ');
      const filter = table.filter ? ` AND ${table.filter}` : '';
      const dupCount = await q(`
        SELECT count() AS cnt
        FROM (
          SELECT ${groupCols}
          FROM datachangsiam.${table.name}
          WHERE toDate(${table.dateCol}) >= '2026-06-01'${filter}
          GROUP BY ${groupCols}
          HAVING count(*) > 1
        )
      `);
      const rows = await q(`
        SELECT count() AS cnt
        FROM datachangsiam.${table.name}
        WHERE toDate(${table.dateCol}) >= '2026-06-01'${filter}
      `);
      console.log(`  ${table.name}: ${rows[0]?.cnt || 0} rows, ${dupCount[0]?.cnt || 0} duplicate groups`);
    } catch (err) {
      console.log(`  ${table.name}: ERROR - ${err.message}`);
    }
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
