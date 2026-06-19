const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');
const { createClient } = require('@clickhouse/client');

const CONFIG_PATH = process.argv[2] || 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';
const FROM = process.env.FROM_DATE || '2026-06-01';
const TO = process.env.TO_DATE || '2026-06-30';

function readConfig() {
  const resolved = path.resolve(CONFIG_PATH);
  return { path: resolved, data: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function clickhouseUrl(clickhouse) {
  const host = String(clickhouse.host || '').replace(/^https?:\/\//, '');
  const protocol = clickhouse.secure ? 'https' : 'http';
  const port = clickhouse.http_port || 8123;
  return `${protocol}://${host}:${port}`;
}

function n(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value) || 0;
}

function amountExpr(prefix = '') {
  return `sum(CASE
    WHEN ${prefix}account_code LIKE '4%' THEN ${prefix}credit - ${prefix}debit
    WHEN ${prefix}account_code LIKE '5%' THEN ${prefix}debit - ${prefix}credit
    ELSE 0
  END)`;
}

async function pgRows(pg, query, params = []) {
  const result = await pg.query(query, params);
  return result.rows;
}

async function chRows(ch, query, query_params = {}) {
  const result = await ch.query({ query, query_params, format: 'JSONEachRow' });
  return result.json();
}

function keyOf(row) {
  return `${row.account_code || row.accountCode}|${row.account_name || row.accountName}`;
}

function printAccountDiff(pgAccounts, chAccounts) {
  const byKey = new Map();
  for (const row of pgAccounts) {
    byKey.set(keyOf(row), {
      account: `${row.account_code} ${row.account_name}`,
      pg_rows: n(row.rows),
      pg_amount: n(row.amount),
      ch_rows: 0,
      ch_amount: 0,
    });
  }
  for (const row of chAccounts) {
    const key = keyOf(row);
    const item = byKey.get(key) || {
      account: `${row.account_code} ${row.account_name}`,
      pg_rows: 0,
      pg_amount: 0,
      ch_rows: 0,
      ch_amount: 0,
    };
    item.ch_rows = n(row.rows);
    item.ch_amount = n(row.amount);
    byKey.set(key, item);
  }

  const rows = Array.from(byKey.values())
    .map((row) => ({
      ...row,
      row_diff: row.ch_rows - row.pg_rows,
      amount_diff: row.ch_amount - row.pg_amount,
    }))
    .filter((row) => row.row_diff !== 0 || Math.abs(row.amount_diff) > 0.005)
    .sort((a, b) => Math.abs(b.amount_diff) - Math.abs(a.amount_diff));

  console.log('\nAccount differences (ClickHouse - PostgreSQL):');
  if (rows.length === 0) {
    console.log('  none');
    return;
  }
  for (const row of rows.slice(0, 80)) {
    console.log(`  ${row.account}: rows PG=${row.pg_rows} CH=${row.ch_rows} diff=${row.row_diff}; amount PG=${row.pg_amount.toFixed(2)} CH=${row.ch_amount.toFixed(2)} diff=${row.amount_diff.toFixed(2)}`);
  }
}

async function main() {
  const { path: configPath, data: config } = readConfig();
  const branchSync = config.transfer?.branch_sync || 'b000';

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
    request_timeout: 60000,
  });

  console.log(`config=${configPath}`);
  console.log(`branch_sync=${branchSync}`);
  console.log(`period=${FROM} -> ${TO}`);

  await pg.connect();
  try {
    const pgSummary = await pgRows(pg, `
      SELECT
        count(*)::bigint AS rows,
        coalesce(sum(debit), 0)::numeric AS debit,
        coalesce(sum(credit), 0)::numeric AS credit,
        coalesce(${amountExpr()}, 0)::numeric AS amount,
        min(doc_date) AS min_date,
        max(doc_date) AS max_date
      FROM gl_journal_detail
      WHERE doc_date >= $1 AND doc_date <= $2
        AND (account_code LIKE '4%' OR account_code LIKE '5%')
    `, [FROM, TO]);

    const chSummary = await chRows(ch, `
      SELECT
        count() AS rows,
        coalesce(sum(debit), 0) AS total_debit,
        coalesce(sum(credit), 0) AS total_credit,
        coalesce(sum(multiIf(left(account_code, 1) = '4', credit - debit, left(account_code, 1) = '5', debit - credit, 0)), 0) AS amount,
        min(doc_datetime) AS min_date,
        max(doc_datetime) AS max_date
      FROM journal_transaction_detail
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) >= toDate({from:String})
        AND toDate(doc_datetime) <= toDate({to:String})
        AND (account_code LIKE '4%' OR account_code LIKE '5%')
    `, { branchSync, from: FROM, to: TO });

    console.log('\nP&L source vs ClickHouse summary:');
    const pgS = pgSummary[0] || {};
    const chS = chSummary[0] || {};
    console.log(`  rows: PostgreSQL=${n(pgS.rows)} ClickHouse=${n(chS.rows)} diff=${n(chS.rows) - n(pgS.rows)}`);
    console.log(`  debit: PostgreSQL=${n(pgS.debit).toFixed(2)} ClickHouse=${n(chS.total_debit).toFixed(2)} diff=${(n(chS.total_debit) - n(pgS.debit)).toFixed(2)}`);
    console.log(`  credit: PostgreSQL=${n(pgS.credit).toFixed(2)} ClickHouse=${n(chS.total_credit).toFixed(2)} diff=${(n(chS.total_credit) - n(pgS.credit)).toFixed(2)}`);
    console.log(`  amount: PostgreSQL=${n(pgS.amount).toFixed(2)} ClickHouse=${n(chS.amount).toFixed(2)} diff=${(n(chS.amount) - n(pgS.amount)).toFixed(2)}`);
    console.log(`  date: PostgreSQL=${pgS.min_date || '-'} -> ${pgS.max_date || '-'} | ClickHouse=${chS.min_date || '-'} -> ${chS.max_date || '-'}`);

    const [pgAccounts, chAccounts] = await Promise.all([
      pgRows(pg, `
        SELECT
          account_code,
          coalesce(account_name, '') AS account_name,
          count(*)::bigint AS rows,
          coalesce(${amountExpr()}, 0)::numeric AS amount
        FROM gl_journal_detail
        WHERE doc_date >= $1 AND doc_date <= $2
          AND (account_code LIKE '4%' OR account_code LIKE '5%')
        GROUP BY account_code, account_name
        ORDER BY account_code, account_name
      `, [FROM, TO]),
      chRows(ch, `
        SELECT
          account_code,
          account_name,
          count() AS rows,
          coalesce(sum(multiIf(left(account_code, 1) = '4', credit - debit, left(account_code, 1) = '5', debit - credit, 0)), 0) AS amount
        FROM journal_transaction_detail
        WHERE branch_sync = {branchSync:String}
          AND toDate(doc_datetime) >= toDate({from:String})
          AND toDate(doc_datetime) <= toDate({to:String})
          AND (account_code LIKE '4%' OR account_code LIKE '5%')
        GROUP BY account_code, account_name
        ORDER BY account_code, account_name
      `, { branchSync, from: FROM, to: TO }),
    ]);
    printAccountDiff(pgAccounts, chAccounts);

    const futureRows = await chRows(ch, `
      SELECT
        toDate(doc_datetime) AS doc_date,
        account_code,
        account_name,
        count() AS rows,
        sum(multiIf(left(account_code, 1) = '4', credit - debit, left(account_code, 1) = '5', debit - credit, 0)) AS amount
      FROM journal_transaction_detail
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) > today()
        AND toDate(doc_datetime) <= toDate({to:String})
        AND (account_code LIKE '4%' OR account_code LIKE '5%')
      GROUP BY doc_date, account_code, account_name
      ORDER BY doc_date, account_code
    `, { branchSync, to: TO });
    console.log('\nFuture-dated ClickHouse P&L rows after today:');
    if (!futureRows.length) console.log('  none');
    for (const row of futureRows.slice(0, 80)) {
      console.log(`  ${row.doc_date} ${row.account_code} ${row.account_name}: rows=${row.rows} amount=${n(row.amount).toFixed(2)}`);
    }

    const duplicateRows = await chRows(ch, `
      SELECT
        doc_datetime,
        doc_no,
        account_code,
        account_name,
        debit,
        credit,
        count() AS copies
      FROM journal_transaction_detail
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) >= toDate({from:String})
        AND toDate(doc_datetime) <= toDate({to:String})
        AND (account_code LIKE '4%' OR account_code LIKE '5%')
      GROUP BY doc_datetime, doc_no, account_code, account_name, debit, credit
      HAVING copies > 1
      ORDER BY copies DESC, doc_datetime, doc_no, account_code
      LIMIT 80
    `, { branchSync, from: FROM, to: TO });
    console.log('\nExact duplicate ClickHouse P&L lines:');
    if (!duplicateRows.length) console.log('  none');
    for (const row of duplicateRows) {
      const amount = String(row.account_code).startsWith('4') ? n(row.credit) - n(row.debit) : n(row.debit) - n(row.credit);
      console.log(`  ${row.doc_datetime} ${row.doc_no} ${row.account_code} ${row.account_name}: debit=${n(row.debit).toFixed(2)} credit=${n(row.credit).toFixed(2)} amount=${amount.toFixed(2)} copies=${row.copies}`);
    }

    const sampleDuplicates = duplicateRows.slice(0, 12);
    if (sampleDuplicates.length > 0) {
      console.log('\nSource check for top ClickHouse duplicates:');
      for (const row of sampleDuplicates) {
        const sourceRows = await pgRows(pg, `
          SELECT count(*)::bigint AS rows
          FROM gl_journal_detail
          WHERE doc_date = $1::date
            AND doc_no = $2
            AND account_code = $3
            AND coalesce(account_name, '') = $4
            AND debit = $5
            AND credit = $6
        `, [
          String(row.doc_datetime).slice(0, 10),
          row.doc_no,
          row.account_code,
          row.account_name || '',
          n(row.debit),
          n(row.credit),
        ]);
        console.log(`  ${String(row.doc_datetime).slice(0, 10)} ${row.doc_no} ${row.account_code} ${row.account_name || '(blank)'}: PostgreSQL=${sourceRows[0]?.rows || 0} ClickHouse=${row.copies}`);
      }
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
