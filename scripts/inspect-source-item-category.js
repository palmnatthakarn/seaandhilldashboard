const { Client: PgClient } = require('pg');
const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const CONFIG_PATH = process.argv[2] || 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

async function pgRows(pg, sql, params = []) {
  const result = await pg.query(sql, params);
  return result.rows;
}

async function main() {
  const { data: config } = readConfig(CONFIG_PATH);
  const pg = new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    connectionTimeoutMillis: 30000,
  });
  const ch = createClickHouse(config);

  await pg.connect();
  try {
    console.log('config', {
      branch_sync: config.transfer?.branch_sync,
      database: config.postgres.database,
      date_range_from: config.transfer?.date_range_from,
      date_range_to: config.transfer?.date_range_to,
    });

    console.log('\nic_trans_detail category-like columns');
    console.table(await pgRows(pg, `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ic_trans_detail'
        AND (
          column_name ILIKE '%category%'
          OR column_name ILIKE '%group%'
          OR column_name ILIKE '%หมวด%'
        )
      ORDER BY ordinal_position
    `));

    console.log('\ntables/columns likely related to item category');
    console.table(await pgRows(pg, `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          column_name ILIKE '%category%'
          OR column_name ILIKE '%group%'
          OR column_name IN ('code', 'name_1', 'item_code')
        )
        AND (
          table_name ILIKE 'ic_%'
          OR table_name ILIKE '%category%'
          OR table_name ILIKE '%group%'
        )
      ORDER BY table_name, ordinal_position
      LIMIT 300
    `));

    const candidateTables = await pgRows(pg, `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND (
          table_name ILIKE 'ic_inventory%'
          OR table_name ILIKE 'ic_group%'
          OR table_name ILIKE '%category%'
          OR table_name ILIKE '%group%'
        )
      ORDER BY table_name
    `);
    console.log('\ncandidate tables');
    console.table(candidateTables);

    for (const { table_name: table } of candidateTables) {
      const columns = await pgRows(pg, `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      const names = columns.map((row) => row.column_name);
      if (!names.includes('code') && !names.includes('item_code')) continue;
      console.log(`\n${table} sample`);
      try {
        console.table(await pgRows(pg, `SELECT * FROM ${table} LIMIT 5`));
      } catch (error) {
        console.log(error.message);
      }
    }

    const branchSync = config.transfer?.branch_sync || 'b000';
    console.log('\nClickHouse current category fill');
    console.table(await queryRows(ch, `
      SELECT 'saleinvoice_transaction_detail' AS table_name, count() AS rows,
             countIf(item_category_code != '') AS code_rows,
             countIf(item_category_name != '') AS name_rows
      FROM saleinvoice_transaction_detail WHERE branch_sync = '${branchSync}'
      UNION ALL
      SELECT 'purchase_transaction_detail', count(), countIf(item_category_code != ''), countIf(item_category_name != '')
      FROM purchase_transaction_detail WHERE branch_sync = '${branchSync}'
      UNION ALL
      SELECT 'stock_transaction', count(), countIf(item_category_code != ''), countIf(item_category_name != '')
      FROM stock_transaction WHERE branch_sync = '${branchSync}'
    `));
  } finally {
    await pg.end();
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
