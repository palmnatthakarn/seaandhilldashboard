const { Client: PgClient } = require('pg');
const { readConfig } = require('./cdc-clickhouse-utils');

const CONFIGS = [
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B001 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B002 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B003 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B004 - 69 - SAH\\connect.json',
];

const SOURCE_TABLES = ['ic_trans', 'ic_trans_detail', 'ap_ar_trans', 'gl_journal_detail'];

async function getColumns(config, table) {
  const pg = new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    connectionTimeoutMillis: 10000,
  });
  await pg.connect();
  try {
    const result = await pg.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    return result.rows.map((row) => `${row.column_name}:${row.data_type}`);
  } finally {
    await pg.end();
  }
}

async function main() {
  const branches = CONFIGS.map((path) => {
    const { data } = readConfig(path);
    return {
      branch: data.transfer.branch_sync,
      database: data.postgres.database,
      config: data,
    };
  });

  for (const table of SOURCE_TABLES) {
    console.log(`\n${table}`);
    const baseline = await getColumns(branches[0].config, table);
    console.log(`  ${branches[0].branch} ${branches[0].database}: ${baseline.length} columns`);

    for (const branch of branches.slice(1)) {
      const columns = await getColumns(branch.config, table);
      const missing = baseline.filter((column) => !columns.includes(column));
      const extra = columns.filter((column) => !baseline.includes(column));
      const same = missing.length === 0 && extra.length === 0;
      console.log(`  ${branch.branch} ${branch.database}: ${columns.length} columns same_as_b000=${same}`);
      if (!same) {
        console.log(`    missing_from_branch: ${missing.join(', ') || '-'}`);
        console.log(`    extra_in_branch: ${extra.join(', ') || '-'}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
