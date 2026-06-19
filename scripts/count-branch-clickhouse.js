const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const TABLES = [
  'purchase_transaction',
  'purchase_transaction_detail',
  'saleinvoice_transaction',
  'saleinvoice_transaction_detail',
  'stock_transaction',
  'payment_transaction',
  'journal_transaction_detail',
  'item_master',
];

async function main() {
  const configPath = process.argv[2];
  const { path, data: config } = readConfig(configPath);
  const branchSync = config.transfer?.branch_sync || 'b000';
  const ch = createClickHouse(config);
  console.log(`config=${path}`);
  console.log(`branch_sync=${branchSync}`);
  try {
    for (const table of TABLES) {
      const exists = await queryRows(ch, 'EXISTS TABLE {table:Identifier}', { table });
      if (Number(exists[0]?.result || 0) !== 1) {
        console.log(`${table}: missing`);
        continue;
      }
      const rows = await queryRows(ch, `
        SELECT count() AS rows
        FROM {table:Identifier}
        WHERE branch_sync = {branchSync:String}
      `, { table, branchSync });
      console.log(`${table}: ${rows[0]?.rows || 0}`);
    }
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
