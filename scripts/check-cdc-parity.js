const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');
const { createClient } = require('@clickhouse/client');

const DEFAULT_CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

const TABLES = [
  { name: 'purchase_transaction', dateColumn: 'doc_datetime', sums: ['total_amount', 'sum_pay_money'] },
  { name: 'purchase_transaction_detail', dateColumn: 'doc_datetime', sums: ['qty', 'sum_amount', 'sum_of_cost'] },
  { name: 'saleinvoice_transaction', dateColumn: 'doc_datetime', sums: ['total_amount', 'sum_pay_money'] },
  { name: 'saleinvoice_transaction_detail', dateColumn: 'doc_datetime', sums: ['qty', 'sum_amount', 'sum_of_cost'] },
  { name: 'stock_transaction', dateColumn: 'doc_datetime', sums: ['qty', 'amount', 'cost'] },
  { name: 'payment_transaction', dateColumn: 'doc_datetime', sums: ['total_amount', 'total_net_amount', 'total_amount_pay'] },
  { name: 'journal_transaction_detail', dateColumn: 'doc_datetime', sums: ['debit', 'credit'] },
];

const SOURCE_TABLES = [
  { name: 'ic_trans', dateColumns: ['doc_date', 'doc_datetime'] },
  { name: 'ic_trans_detail', dateColumns: ['doc_date', 'doc_datetime'] },
  { name: 'ap_ar_trans', dateColumns: ['doc_date', 'doc_datetime'] },
  { name: 'gl_journal_detail', dateColumns: ['doc_date', 'doc_datetime'] },
  { name: 'gl_journal', dateColumns: ['doc_date', 'doc_datetime'] },
  { name: 'cb_trans', dateColumns: ['doc_date', 'doc_datetime'] },
];

const RAW_TABLES = ['ic_trans_raw', 'ic_trans_detail_raw'];

function readConfig() {
  const configPath = process.argv[2] || process.env.SMLAI_CONNECT_CONFIG || DEFAULT_CONFIG_PATH;
  const resolved = path.resolve(configPath);
  return {
    path: resolved,
    data: JSON.parse(fs.readFileSync(resolved, 'utf8')),
  };
}

function q(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function clickhouseUrl(clickhouse) {
  const host = String(clickhouse.host || '').replace(/^https?:\/\//, '');
  const protocol = clickhouse.secure ? 'https' : 'http';
  const port = clickhouse.http_port || 8123;
  return `${protocol}://${host}:${port}`;
}

async function pgTableExists(pg, table) {
  const result = await pg.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table],
  );
  return result.rows[0]?.exists === true;
}

async function pgRelationMatches(pg, table) {
  const tokens = table.split('_').filter(Boolean);
  const result = await pg.query(
    `SELECT table_schema, table_name, table_type
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND (
         table_name = $1
         OR table_name ILIKE ANY($2)
       )
     ORDER BY table_schema, table_name
     LIMIT 25`,
    [table, tokens.map((token) => `%${token}%`)],
  );
  return result.rows;
}

async function pgRelationOverview(pg) {
  const result = await pg.query(
    `SELECT table_schema, table_type, COUNT(*)::int AS count
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
     GROUP BY table_schema, table_type
     ORDER BY table_schema, table_type`,
  );
  return result.rows;
}

async function chEngineOverview(ch) {
  const result = await ch.query({
    query: `SELECT
      name,
      engine,
      total_rows
    FROM system.tables
    WHERE database = currentDatabase()
      AND (name LIKE '%transaction%' OR name LIKE '%_queue' OR name LIKE '%_mv')
    ORDER BY name`,
    format: 'JSONEachRow',
  });
  return result.json();
}

async function chCdcDefinitions(ch) {
  const result = await ch.query({
    query: `SELECT
      name,
      engine,
      create_table_query
    FROM system.tables
    WHERE database = currentDatabase()
      AND (name LIKE '%_mv' OR name LIKE '%_queue' OR name LIKE '%_raw')
    ORDER BY name`,
    format: 'JSONEachRow',
  });
  return result.json();
}

async function pgColumnExists(pg, table, column) {
  const result = await pg.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return result.rows[0]?.exists === true;
}

async function pgSourceSummary(pg, source, from, to) {
  const exists = await pgTableExists(pg, source.name);
  if (!exists) return { exists };

  let dateColumn = null;
  for (const candidate of source.dateColumns) {
    if (await pgColumnExists(pg, source.name, candidate)) {
      dateColumn = candidate;
      break;
    }
  }

  const where = dateColumn ? `WHERE ${q(dateColumn)} >= $1 AND ${q(dateColumn)} <= $2` : '';
  const params = dateColumn ? [from, to] : [];
  const result = await pg.query(
    `SELECT COUNT(*)::bigint AS rows ${dateColumn ? `, MIN(${q(dateColumn)}) AS min_date, MAX(${q(dateColumn)}) AS max_date` : ''}
     FROM ${q(source.name)}
     ${where}`,
    params,
  );
  return { exists, dateColumn, ...result.rows[0] };
}

async function chTableRowCount(ch, table) {
  const exists = await chTableExists(ch, table);
  if (!exists) return { exists };
  const engineResult = await ch.query({
    query: `SELECT engine FROM system.tables WHERE database = currentDatabase() AND name = {table:String}`,
    query_params: { table },
    format: 'JSONEachRow',
  });
  const engineRows = await engineResult.json();
  const engine = engineRows[0]?.engine;
  if (engine === 'Kafka') return { exists, engine, rows: 'not-read' };

  const result = await ch.query({
    query: 'SELECT count() AS rows FROM {table:Identifier}',
    query_params: { table },
    format: 'JSONEachRow',
  });
  const rows = await result.json();
  return { exists, engine, rows: rows[0]?.rows };
}

async function chRawSummary(ch, table) {
  const exists = await chTableExists(ch, table);
  if (!exists) return { exists };
  const result = await ch.query({
    query: `SELECT
      count() AS rows,
      min(_inserted) AS min_inserted,
      max(_inserted) AS max_inserted
    FROM {table:Identifier}`,
    query_params: { table },
    format: 'JSONEachRow',
  });
  const rows = await result.json();

  const topicResult = await ch.query({
    query: `SELECT
      _topic,
      count() AS rows
    FROM {table:Identifier}
    GROUP BY _topic
    ORDER BY _topic`,
    query_params: { table },
    format: 'JSONEachRow',
  });
  const topicRows = await topicResult.json();
  return { exists, ...rows[0], topics: topicRows };
}

async function chTargetBranchSummary(ch, table, branchSync) {
  const exists = await chTableExists(ch, table);
  if (!exists) return { exists };
  const result = await ch.query({
    query: `SELECT
      branch_sync,
      count() AS rows,
      min(doc_datetime) AS min_date,
      max(doc_datetime) AS max_date
    FROM {table:Identifier}
    GROUP BY branch_sync
    ORDER BY branch_sync`,
    query_params: { table },
    format: 'JSONEachRow',
  });
  const branchRows = await result.json();

  const duplicateResult = await ch.query({
    query: `SELECT
      count() AS duplicate_keys,
      sum(rows_per_key - 1) AS extra_rows
    FROM (
      SELECT branch_sync, doc_no, count() AS rows_per_key
      FROM {table:Identifier}
      WHERE branch_sync = {branch_sync:String}
      GROUP BY branch_sync, doc_no
      HAVING rows_per_key > 1
    )`,
    query_params: { table, branch_sync: branchSync },
    format: 'JSONEachRow',
  });
  const duplicateRows = await duplicateResult.json();
  return { exists, branches: branchRows, duplicates: duplicateRows[0] };
}

async function chTableExists(ch, table) {
  const result = await ch.query({
    query: 'EXISTS TABLE {table:Identifier}',
    query_params: { table },
    format: 'JSONEachRow',
  });
  const rows = await result.json();
  return Number(rows[0]?.result || 0) === 1;
}

async function pgSummary(pg, table, dateColumn, sums, from, to) {
  const sumSql = sums
    .map((column) => `COALESCE(SUM(${q(column)}), 0)::numeric AS ${q(`sum_${column}`)}`)
    .join(',\n      ');
  const result = await pg.query(
    `SELECT
       COUNT(*)::bigint AS rows,
       MIN(${q(dateColumn)}) AS min_date,
       MAX(${q(dateColumn)}) AS max_date,
       ${sumSql}
     FROM ${q(table)}
     WHERE ${q(dateColumn)} >= $1 AND ${q(dateColumn)} <= $2`,
    [from, to],
  );
  return result.rows[0];
}

async function chSummary(ch, table, dateColumn, sums, branchSync, from, to) {
  const sumSql = sums
    .map((column) => `coalesce(sum(${column}), 0) AS sum_${column}`)
    .join(',\n      ');
  const result = await ch.query({
    query: `SELECT
      count() AS rows,
      min(${dateColumn}) AS min_date,
      max(${dateColumn}) AS max_date,
      ${sumSql}
    FROM {table:Identifier}
    WHERE branch_sync = {branch_sync:String}
      AND ${dateColumn} >= {from:String}
      AND ${dateColumn} <= {to:String}`,
    query_params: { table, branch_sync: branchSync, from, to },
    format: 'JSONEachRow',
  });
  const rows = await result.json();
  return rows[0];
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value);
}

function printComparison(table, pgRow, chRow, sums) {
  const pgRows = numberValue(pgRow.rows);
  const chRows = numberValue(chRow.rows);
  console.log(`\n${table}`);
  console.log(`  rows: PostgreSQL=${pgRows} ClickHouse=${chRows} diff=${chRows - pgRows}`);
  console.log(`  date: PostgreSQL=${pgRow.min_date || '-'} -> ${pgRow.max_date || '-'} | ClickHouse=${chRow.min_date || '-'} -> ${chRow.max_date || '-'}`);

  for (const column of sums) {
    const key = `sum_${column}`;
    const pgSum = numberValue(pgRow[key]);
    const chSum = numberValue(chRow[key]);
    console.log(`  ${key}: PostgreSQL=${pgSum.toFixed(2)} ClickHouse=${chSum.toFixed(2)} diff=${(chSum - pgSum).toFixed(2)}`);
  }
}

async function main() {
  const { path: configPath, data: config } = readConfig();
  const branchSync = config.transfer?.branch_sync || 'b000';
  const from = config.transfer?.date_range_from || '1900-01-01';
  const to = config.transfer?.date_range_to || '2999-12-31';

  console.log(`config: ${configPath}`);
  console.log(`branch_sync: ${branchSync}`);
  console.log(`date range: ${from} -> ${to}`);

  const pg = new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    connectionTimeoutMillis: 10000,
  });

  const ch = createClient({
    url: clickhouseUrl(config.clickhouse),
    username: config.clickhouse.user,
    password: config.clickhouse.password,
    database: config.clickhouse.database,
    request_timeout: 30000,
  });

  await pg.connect();

  try {
    const [pgOverview, chOverview, chDefinitions] = await Promise.all([
      pgRelationOverview(pg),
      chEngineOverview(ch),
      chCdcDefinitions(ch),
    ]);

    console.log('\nPostgreSQL relation overview:');
    for (const row of pgOverview) {
      console.log(`  ${row.table_schema}.${row.table_type}: ${row.count}`);
    }

    console.log('\nClickHouse transaction/CDC object overview:');
    for (const row of chOverview) {
      console.log(`  ${row.name}: engine=${row.engine} rows=${row.total_rows ?? '-'}`);
    }

    console.log('\nSource table counts:');
    for (const source of SOURCE_TABLES) {
      const [pgSource, chSource, chQueue] = await Promise.all([
        pgSourceSummary(pg, source, from, to),
        chTableRowCount(ch, source.name),
        chTableRowCount(ch, `${source.name}_queue`),
      ]);
      console.log(`  ${source.name}: PostgreSQL exists=${pgSource.exists} rows=${pgSource.rows ?? '-'} date_column=${pgSource.dateColumn ?? '-'} range=${pgSource.min_date ?? '-'} -> ${pgSource.max_date ?? '-'} | ClickHouse raw exists=${chSource.exists} rows=${chSource.rows ?? '-'} | queue exists=${chQueue.exists} rows=${chQueue.rows ?? '-'}`);
    }

    console.log('\nClickHouse raw CDC capture:');
    for (const rawTable of RAW_TABLES) {
      const summary = await chRawSummary(ch, rawTable);
      console.log(`  ${rawTable}: exists=${summary.exists} rows=${summary.rows ?? '-'} inserted=${summary.min_inserted ?? '-'} -> ${summary.max_inserted ?? '-'}`);
      for (const topic of summary.topics || []) {
        console.log(`    ${topic._topic}: ${topic.rows}`);
      }
    }

    console.log('\nClickHouse target branch and duplicate-doc summary:');
    for (const table of TABLES) {
      const summary = await chTargetBranchSummary(ch, table.name, branchSync);
      console.log(`  ${table.name}: exists=${summary.exists} duplicate_doc_keys=${summary.duplicates?.duplicate_keys ?? '-'} extra_doc_rows=${summary.duplicates?.extra_rows ?? '-'}`);
      for (const branch of summary.branches || []) {
        console.log(`    branch=${branch.branch_sync || '(empty)'} rows=${branch.rows} range=${branch.min_date} -> ${branch.max_date}`);
      }
    }

    console.log('\nCDC definitions:');
    for (const row of chDefinitions) {
      const compact = String(row.create_table_query || '').replace(/\s+/g, ' ').slice(0, 1200);
      console.log(`  ${row.name} (${row.engine}): ${compact}`);
    }

    console.log('\nCDC MV filters and branch mapping signals:');
    for (const row of chDefinitions.filter((definition) => definition.engine === 'MaterializedView')) {
      const query = String(row.create_table_query || '').replace(/\s+/g, ' ');
      const whereIndex = query.toUpperCase().indexOf(' WHERE ');
      const where = whereIndex >= 0 ? query.slice(whereIndex, whereIndex + 700) : 'NO WHERE';
      const hasBranchSyncColumn = /\b`branch_sync`\b/.test(query);
      const hasTopicBranchMapping = /_topic|branch_000|branch_001|multiIf|CASE/i.test(query);
      console.log(`  ${row.name}: has_branch_sync_column=${hasBranchSyncColumn} has_topic_branch_mapping=${hasTopicBranchMapping} ${where}`);
    }

    for (const table of TABLES) {
      const [pgExists, chExists] = await Promise.all([
        pgTableExists(pg, table.name),
        chTableExists(ch, table.name),
      ]);

      if (!pgExists || !chExists) {
        console.log(`\n${table.name}`);
        console.log(`  exists: PostgreSQL=${pgExists} ClickHouse=${chExists}`);
        if (!pgExists) {
          const matches = await pgRelationMatches(pg, table.name);
          if (matches.length > 0) {
            console.log('  PostgreSQL close matches:');
            for (const match of matches) {
              console.log(`    ${match.table_schema}.${match.table_name} (${match.table_type})`);
            }
          }
        }
        continue;
      }

      const [pgRow, chRow] = await Promise.all([
        pgSummary(pg, table.name, table.dateColumn, table.sums, from, to),
        chSummary(ch, table.name, table.dateColumn, table.sums, branchSync, from, to),
      ]);

      printComparison(table.name, pgRow, chRow, table.sums);
    }
  } finally {
    await pg.end();
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
