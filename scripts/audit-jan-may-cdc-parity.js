const { Client: PgClient } = require('pg');
const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const APP_CLICKHOUSE_CONFIG = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';
const CONFIGS = [
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B001 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B002 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B003 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B004 - 69 - SAH\\connect.json',
  'D:\\connect\\smlaiconnect-windows-v1.2.6 - B005\\connect.json',
];

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];

const CHECKS = [
  {
    name: 'purchase_transaction',
    pg: `
      SELECT to_char(doc_date, 'YYYY-MM') AS month, count(*)::numeric AS rows,
             coalesce(sum(total_amount), 0)::numeric AS amount
      FROM ic_trans
      WHERE doc_date >= $1 AND doc_date <= $2 AND trans_type = 1
      GROUP BY 1
    `,
    ch: `
      SELECT formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month, count() AS rows,
             coalesce(sum(total_amount), 0) AS amount
      FROM purchase_transaction
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      GROUP BY month
    `,
    metrics: ['rows', 'amount'],
  },
  {
    name: 'saleinvoice_transaction',
    pg: `
      SELECT to_char(doc_date, 'YYYY-MM') AS month, count(*)::numeric AS rows,
             coalesce(sum(total_amount), 0)::numeric AS amount
      FROM ic_trans
      WHERE doc_date >= $1 AND doc_date <= $2 AND trans_type = 2
      GROUP BY 1
    `,
    ch: `
      SELECT formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month, count() AS rows,
             coalesce(sum(total_amount), 0) AS amount
      FROM saleinvoice_transaction
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      GROUP BY month
    `,
    metrics: ['rows', 'amount'],
  },
  {
    name: 'purchase_transaction_detail',
    pg: `
      SELECT to_char(doc_date, 'YYYY-MM') AS month, count(*)::numeric AS rows,
             coalesce(sum(qty), 0)::numeric AS qty,
             coalesce(sum(sum_amount), 0)::numeric AS amount,
             coalesce(sum(sum_of_cost), 0)::numeric AS cost
      FROM ic_trans_detail
      WHERE doc_date >= $1 AND doc_date <= $2 AND trans_type = 1
      GROUP BY 1
    `,
    ch: `
      SELECT formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month, count() AS rows,
             coalesce(sum(qty), 0) AS qty,
             coalesce(sum(sum_amount), 0) AS amount,
             coalesce(sum(sum_of_cost), 0) AS cost
      FROM purchase_transaction_detail
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      GROUP BY month
    `,
    metrics: ['rows', 'qty', 'amount', 'cost'],
  },
  {
    name: 'saleinvoice_transaction_detail',
    pg: `
      SELECT to_char(doc_date, 'YYYY-MM') AS month, count(*)::numeric AS rows,
             coalesce(sum(qty), 0)::numeric AS qty,
             coalesce(sum(sum_amount), 0)::numeric AS amount,
             coalesce(sum(sum_of_cost), 0)::numeric AS cost
      FROM ic_trans_detail
      WHERE doc_date >= $1 AND doc_date <= $2 AND trans_type = 2
      GROUP BY 1
    `,
    ch: `
      SELECT formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month, count() AS rows,
             coalesce(sum(qty), 0) AS qty,
             coalesce(sum(sum_amount), 0) AS amount,
             coalesce(sum(sum_of_cost), 0) AS cost
      FROM saleinvoice_transaction_detail
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      GROUP BY month
    `,
    metrics: ['rows', 'qty', 'amount', 'cost'],
  },
  {
    name: 'stock_transaction',
    pg: `
      SELECT to_char(doc_date, 'YYYY-MM') AS month, count(*)::numeric AS rows,
             coalesce(sum(qty * CASE WHEN coalesce(calc_flag, 0) = 0 THEN 1 ELSE calc_flag END), 0)::numeric AS qty,
             coalesce(sum(sum_amount * CASE WHEN coalesce(calc_flag, 0) < 0 THEN -1 ELSE 1 END), 0)::numeric AS amount
      FROM ic_trans_detail
      WHERE doc_date >= $1 AND doc_date <= $2 AND trans_type IN (1, 2, 3) AND qty <> 0
      GROUP BY 1
    `,
    ch: `
      SELECT formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month, count() AS rows,
             coalesce(sum(qty), 0) AS qty,
             coalesce(sum(amount), 0) AS amount
      FROM stock_transaction
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      GROUP BY month
    `,
    metrics: ['rows', 'qty', 'amount'],
  },
  {
    name: 'payment_transaction',
    pg: `
      SELECT to_char(doc_date, 'YYYY-MM') AS month, count(*)::numeric AS rows,
             coalesce(sum(amount), 0)::numeric AS amount,
             coalesce(sum(total_net_value), 0)::numeric AS net_amount,
             coalesce(sum(total_pay_money), 0)::numeric AS pay_amount
      FROM ap_ar_trans
      WHERE doc_date >= $1 AND doc_date <= $2
      GROUP BY 1
    `,
    ch: `
      SELECT formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month, count() AS rows,
             coalesce(sum(total_amount), 0) AS amount,
             coalesce(sum(total_net_amount), 0) AS net_amount,
             coalesce(sum(total_amount_pay), 0) AS pay_amount
      FROM payment_transaction
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      GROUP BY month
    `,
    metrics: ['rows', 'amount', 'net_amount', 'pay_amount'],
  },
  {
    name: 'journal_transaction_detail',
    pg: `
      SELECT to_char(doc_date, 'YYYY-MM') AS month, count(*)::numeric AS rows,
             coalesce(sum(debit), 0)::numeric AS debit,
             coalesce(sum(credit), 0)::numeric AS credit
      FROM gl_journal_detail
      WHERE doc_date >= $1 AND doc_date <= $2
      GROUP BY 1
    `,
    ch: `
      SELECT formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month, count() AS rows,
             coalesce(sum(debit), 0) AS debit,
             coalesce(sum(credit), 0) AS credit
      FROM journal_transaction_detail
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      GROUP BY month
    `,
    metrics: ['rows', 'debit', 'credit'],
  },
];

function num(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value) || 0;
}

function byMonth(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.month, row);
  return map;
}

function diffIsZero(diff, metric) {
  return metric === 'rows' ? diff === 0 : Math.abs(diff) < 0.01;
}

async function auditConfig(configPath, appClickhouseConfig) {
  const { data: config } = readConfig(configPath);
  const branchSync = config.transfer?.branch_sync;
  const branchName = config.transfer?.branch_sync_name || '';
  config.clickhouse = appClickhouseConfig.clickhouse;

  const pg = new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    connectionTimeoutMillis: 30000,
  });
  const ch = createClickHouse(config);

  console.log(`\n${branchSync} ${config.postgres.database} ${branchName.trim()}`);
  await pg.connect();
  let mismatchCount = 0;
  try {
    for (const check of CHECKS) {
      const pgResult = await pg.query(check.pg, ['2026-01-01', '2026-05-31']);
      const chResult = await queryRows(ch, check.ch, {
        branchSync,
        from: '2026-01-01',
        to: '2026-05-31',
      });
      const pgMap = byMonth(pgResult.rows);
      const chMap = byMonth(chResult);

      for (const month of MONTHS) {
        const pgRow = pgMap.get(month) || {};
        const chRow = chMap.get(month) || {};
        const diffs = [];
        for (const metric of check.metrics) {
          const diff = num(chRow[metric]) - num(pgRow[metric]);
          if (!diffIsZero(diff, metric)) diffs.push(`${metric}=${diff.toFixed(metric === 'rows' ? 0 : 2)}`);
        }
        if (diffs.length > 0) {
          mismatchCount += 1;
          console.log(`  DIFF ${check.name} ${month}: ${diffs.join(', ')}`);
        }
      }
    }
  } finally {
    await pg.end();
    await ch.close();
  }

  if (mismatchCount === 0) {
    console.log('  OK Jan-May all checked metrics match');
  }
  return mismatchCount;
}

async function main() {
  const { data: appClickhouseConfig } = readConfig(APP_CLICKHOUSE_CONFIG);
  let totalMismatches = 0;
  for (const configPath of CONFIGS) {
    totalMismatches += await auditConfig(configPath, appClickhouseConfig);
  }
  console.log(`\nTotal mismatches: ${totalMismatches}`);
  if (totalMismatches > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
