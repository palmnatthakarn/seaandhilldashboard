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

  // Which Kafka topics do the _queue tables consume from?
  const kafkaTables = await queryRows(ch, `
    SELECT name, engine_full
    FROM system.tables
    WHERE database = 'datachangsiam'
      AND engine = 'Kafka'
    ORDER BY name
  `);

  console.log('\n=== Kafka Engine Tables (consume from these topics) ===');
  for (const t of kafkaTables) {
    console.log(`\n[${t.name}]`);
    // Extract topic from engine_full string
    const topicMatch = t.engine_full.match(/kafka_topic_list\s*=\s*'([^']+)'/);
    const groupMatch = t.engine_full.match(/kafka_group_name\s*=\s*'([^']+)'/);
    console.log(`  topic : ${topicMatch?.[1] || 'N/A'}`);
    console.log(`  group : ${groupMatch?.[1] || 'N/A'}`);
  }

  // All tables in datachangsiam for reference
  const allTables = await queryRows(ch, `
    SELECT name, engine
    FROM system.tables
    WHERE database = 'datachangsiam'
    ORDER BY engine, name
  `);

  console.log('\n=== All Tables in datachangsiam ===');
  console.table(allTables);

  await ch.close();
}

main().catch(console.error);
