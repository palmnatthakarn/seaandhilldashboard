const { createClickHouse, queryRows } = require('./cdc-clickhouse-utils');

const config = {
  clickhouse: {
    host: '147.50.69.68',
    port: 8123,
    user: 'admin',
    password: 'Admin123',
    database: 'datachangsiam',
  },
};

async function main() {
  const ch = createClickHouse(config);

  // Set TTL on ClickHouse system logs
  const systemTtls = [
    `ALTER TABLE system.query_log MODIFY TTL event_date + INTERVAL 7 DAY`,
    `ALTER TABLE system.query_thread_log MODIFY TTL event_date + INTERVAL 7 DAY`,
    `ALTER TABLE system.part_log MODIFY TTL event_date + INTERVAL 7 DAY`,
    `ALTER TABLE system.trace_log MODIFY TTL event_date + INTERVAL 3 DAY`,
    `ALTER TABLE system.metric_log MODIFY TTL event_date + INTERVAL 7 DAY`,
    `ALTER TABLE system.asynchronous_metric_log MODIFY TTL event_date + INTERVAL 7 DAY`,
    `ALTER TABLE system.session_log MODIFY TTL event_date + INTERVAL 7 DAY`,
    `ALTER TABLE system.crash_log MODIFY TTL event_date + INTERVAL 30 DAY`,
  ];

  for (const sql of systemTtls) {
    try {
      await ch.command({ query: sql });
      console.log(`OK: ${sql.split(' MODIFY')[0].replace('ALTER TABLE ', '')}`);
    } catch (e) {
      console.log(`SKIP (table may not exist): ${e.message.split('\n')[0]}`);
    }
  }

  // Check system table sizes
  const sizes = await queryRows(ch, `
    SELECT table,
      formatReadableSize(sum(bytes_on_disk)) AS size,
      sum(rows) AS rows
    FROM system.parts
    WHERE database = 'system' AND active = 1
    GROUP BY table
    ORDER BY sum(bytes_on_disk) DESC
    LIMIT 10
  `);

  console.log('\nSystem table sizes after TTL set:');
  console.table(sizes);

  await ch.close();
}

main().catch(console.error);
