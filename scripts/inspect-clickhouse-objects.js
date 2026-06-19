const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

async function main() {
  const configPath = process.argv[2];
  const { path, data: config } = readConfig(configPath);
  const ch = createClickHouse(config);
  console.log(`config=${path}`);
  try {
    const rows = await queryRows(ch, `
      SELECT name, engine
      FROM system.tables
      WHERE database = currentDatabase()
        AND (
          name LIKE '%queue'
          OR name LIKE '%_mv'
          OR name LIKE '%transaction%'
          OR name LIKE '%raw'
        )
      ORDER BY name
    `);
    for (const row of rows) console.log(`${row.name}\t${row.engine}`);
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
