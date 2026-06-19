const { Client: PgClient } = require('pg');
const {
  createClickHouse,
  queryRows,
  readConfig,
} = require('./cdc-clickhouse-utils');

async function pgQuery(pg, label, query) {
  console.log(`\n${label}`);
  const result = await pg.query(query);
  for (const row of result.rows) {
    console.log(JSON.stringify(row));
  }
}

async function chQuery(ch, label, query) {
  console.log(`\n${label}`);
  const rows = await queryRows(ch, query);
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
}

async function main() {
  const { data: config } = readConfig(process.argv[2]);
  const from = config.transfer?.date_range_from || '1900-01-01';
  const to = config.transfer?.date_range_to || '2999-12-31';

  const pg = new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    connectionTimeoutMillis: 10000,
  });
  const ch = createClickHouse(config);

  await pg.connect();
  try {
    await pgQuery(pg, 'PostgreSQL ic_trans_detail columns of interest', `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ic_trans_detail'
        AND column_name IN (
          'doc_date', 'doc_no', 'trans_type', 'trans_flag', 'calc_flag',
          'item_code', 'qty', 'sum_amount', 'sum_of_cost', 'cost', 'average_cost',
          'last_status'
        )
      ORDER BY ordinal_position
    `);

    await pgQuery(pg, 'PostgreSQL source columns', `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('ic_trans', 'ic_trans_detail', 'ap_ar_trans', 'gl_journal_detail')
      ORDER BY table_name, ordinal_position
    `);

    await pgQuery(pg, 'PostgreSQL ic_trans_detail distribution', `
      SELECT
        COALESCE(trans_type::text, '') AS trans_type,
        COALESCE(trans_flag::text, '') AS trans_flag,
        COALESCE(calc_flag::text, '') AS calc_flag,
        COUNT(*)::bigint AS rows,
        MIN(doc_date) AS min_doc_date,
        MAX(doc_date) AS max_doc_date,
        COALESCE(SUM(qty), 0)::numeric AS qty_sum,
        COALESCE(SUM(sum_amount), 0)::numeric AS amount_sum,
        COALESCE(SUM(sum_of_cost), 0)::numeric AS cost_sum
      FROM ic_trans_detail
      WHERE doc_date >= '${from}' AND doc_date <= '${to}'
      GROUP BY trans_type, trans_flag, calc_flag
      ORDER BY rows DESC
      LIMIT 50
    `);

    await pgQuery(pg, 'PostgreSQL ic_trans distribution', `
      SELECT
        COALESCE(trans_type::text, '') AS trans_type,
        COALESCE(trans_flag::text, '') AS trans_flag,
        COUNT(*)::bigint AS rows,
        MIN(doc_date) AS min_doc_date,
        MAX(doc_date) AS max_doc_date,
        COALESCE(SUM(total_amount), 0)::numeric AS amount_sum
      FROM ic_trans
      WHERE doc_date >= '${from}' AND doc_date <= '${to}'
      GROUP BY trans_type, trans_flag
      ORDER BY rows DESC
      LIMIT 50
    `);

    await chQuery(ch, 'ClickHouse ic_trans_detail_raw branch_000 distribution', `
      SELECT
        JSONExtractInt(raw_data, 'payload', 'after', 'trans_type') AS trans_type,
        JSONExtractInt(raw_data, 'payload', 'after', 'trans_flag') AS trans_flag,
        JSONExtractInt(raw_data, 'payload', 'after', 'calc_flag') AS calc_flag,
        count() AS rows,
        min(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date'))) AS min_doc_date,
        max(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date'))) AS max_doc_date,
        sum(JSONExtractFloat(raw_data, 'payload', 'after', 'qty')) AS qty_sum,
        sum(JSONExtractFloat(raw_data, 'payload', 'after', 'sum_amount')) AS amount_sum,
        sum(JSONExtractFloat(raw_data, 'payload', 'after', 'sum_of_cost')) AS cost_sum
      FROM ic_trans_detail_raw
      WHERE _topic = 'branch_000.public.ic_trans_detail'
      GROUP BY trans_type, trans_flag, calc_flag
      ORDER BY rows DESC
      LIMIT 50
    `);

    await chQuery(ch, 'ClickHouse raw op distribution', `
      SELECT
        'ic_trans_raw' AS table_name,
        _topic,
        JSONExtractString(raw_data, 'payload', 'op') AS op,
        count() AS rows
      FROM ic_trans_raw
      GROUP BY _topic, op
      UNION ALL
      SELECT
        'ic_trans_detail_raw' AS table_name,
        _topic,
        JSONExtractString(raw_data, 'payload', 'op') AS op,
        count() AS rows
      FROM ic_trans_detail_raw
      GROUP BY _topic, op
      ORDER BY table_name, _topic, op
    `);
  } finally {
    await pg.end();
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
