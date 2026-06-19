const { Client: PgClient } = require('pg');
const {
  branchNameExpr,
  branchSyncExpr,
  createClickHouse,
  queryRows,
  readConfig,
} = require('./cdc-clickhouse-utils');

const APPLY = process.argv.includes('--apply');
const FIX_MV = process.argv.includes('--fix-mv') || APPLY;
const CONFIG_PATH = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const FROM_DATE = process.env.FROM_DATE || '2026-06-01';
const TO_DATE = process.env.TO_DATE || '2026-06-30';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dt(value) {
  if (!value) return '1970-01-01 00:00:00';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4] || '00'}:${match[5] || '00'}:${match[6] || '00'}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  return [
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
  ].join(' ');
}

function s(value) {
  return value === null || value === undefined ? '' : String(value);
}

function n(value) {
  return value === null || value === undefined || value === '' ? 0 : Number(value);
}

function deriveAccountType(accountCode) {
  const prefix = s(accountCode).charAt(0);
  if (prefix === '1') return 'ASSETS';
  if (prefix === '2') return 'LIABILITIES';
  if (prefix === '3') return 'EQUITY';
  if (prefix === '4') return 'INCOME';
  if (prefix === '5') return 'EXPENSES';
  return '';
}

function amountOf(row) {
  const accountCode = s(row.account_code);
  if (accountCode.startsWith('4')) return n(row.credit) - n(row.debit);
  if (accountCode.startsWith('5')) return n(row.debit) - n(row.credit);
  return 0;
}

function mapJournal(row, branchSync, branchName) {
  const accountCode = s(row.account_code);
  return {
    doc_datetime: dt(row.doc_date),
    doc_no: s(row.doc_no),
    period_number: s(row.period_number),
    account_year: s(row.account_year),
    book_code: s(row.book_code),
    book_name: '',
    account_code: accountCode,
    account_name: s(row.account_name),
    debit: n(row.debit),
    credit: n(row.credit),
    account_type: s(row.account_type) || deriveAccountType(accountCode),
    branch_code: s(row.branch_code),
    branch_name: '',
    branch_sync: branchSync,
    branch_sync_name: branchName,
  };
}

async function execCh(ch, sql) {
  console.log(`${APPLY ? 'EXEC' : 'DRY'}: ${sql.replace(/\s+/g, ' ').trim().slice(0, 180)}`);
  if (!APPLY) return;
  await ch.command({ query: sql });
}

async function waitForMutations(ch) {
  if (!APPLY) return;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const rows = await queryRows(ch, `
      SELECT mutation_id, command, is_done
      FROM system.mutations
      WHERE database = currentDatabase()
        AND table = 'journal_transaction_detail'
        AND is_done = 0
      ORDER BY create_time DESC
    `);
    if (rows.length === 0) return;
    console.log(`  waiting mutation ${attempt}/60 pending=${rows.length}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Timed out waiting for ClickHouse mutations');
}

async function insertRows(ch, rows) {
  console.log(`${APPLY ? 'INSERT' : 'DRY INSERT'}: journal_transaction_detail rows=${rows.length}`);
  if (!APPLY || rows.length === 0) return;
  const batchSize = 1000;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    console.log(`  batch ${Math.floor(index / batchSize) + 1}/${Math.ceil(rows.length / batchSize)} rows=${batch.length}`);
    await ch.insert({
      table: 'journal_transaction_detail',
      values: batch,
      format: 'JSONEachRow',
    });
  }
}

function glJournalMvSql() {
  const accountCodeExpr = "JSONExtractString(raw_data, 'payload', 'after', 'account_code')";
  return `
CREATE MATERIALIZED VIEW gl_journal_to_journal_mv TO journal_transaction_detail
(
  doc_datetime DateTime,
  doc_no String,
  period_number String,
  account_year String,
  book_code String,
  book_name String,
  account_code String,
  account_name String,
  debit Float64,
  credit Float64,
  account_type String,
  branch_code String,
  branch_name String,
  branch_sync LowCardinality(String),
  branch_sync_name String
) AS
SELECT
  toDateTime(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
  JSONExtractString(raw_data, 'payload', 'after', 'doc_no') AS doc_no,
  JSONExtractString(raw_data, 'payload', 'after', 'period_number') AS period_number,
  JSONExtractString(raw_data, 'payload', 'after', 'account_year') AS account_year,
  JSONExtractString(raw_data, 'payload', 'after', 'book_code') AS book_code,
  '' AS book_name,
  ${accountCodeExpr} AS account_code,
  JSONExtractString(raw_data, 'payload', 'after', 'account_name') AS account_name,
  JSONExtractFloat(raw_data, 'payload', 'after', 'debit') AS debit,
  JSONExtractFloat(raw_data, 'payload', 'after', 'credit') AS credit,
  multiIf(
    JSONExtractString(raw_data, 'payload', 'after', 'account_type') != '',
      JSONExtractString(raw_data, 'payload', 'after', 'account_type'),
    left(${accountCodeExpr}, 1) = '1', 'ASSETS',
    left(${accountCodeExpr}, 1) = '2', 'LIABILITIES',
    left(${accountCodeExpr}, 1) = '3', 'EQUITY',
    left(${accountCodeExpr}, 1) = '4', 'INCOME',
    left(${accountCodeExpr}, 1) = '5', 'EXPENSES',
    ''
  ) AS account_type,
  JSONExtractString(raw_data, 'payload', 'after', 'branch_code') AS branch_code,
  '' AS branch_name,
  ${branchSyncExpr()} AS branch_sync,
  ${branchNameExpr()} AS branch_sync_name
FROM gl_journal_detail_queue
WHERE JSONExtractString(raw_data, 'payload', 'op') IN ('c', 'r')
`;
}

async function printSummary(ch, branchSync, label) {
  const rows = await queryRows(ch, `
    SELECT
      count() AS rows,
      sum(multiIf(left(account_code, 1) = '4', credit - debit, left(account_code, 1) = '5', debit - credit, 0)) AS amount,
      countIf(account_name = '') AS blank_names
    FROM journal_transaction_detail
    WHERE branch_sync = {branchSync:String}
      AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
      AND (account_code LIKE '4%' OR account_code LIKE '5%')
  `, { branchSync, from: FROM_DATE, to: TO_DATE });
  const row = rows[0] || {};
  console.log(`${label}: rows=${n(row.rows)} amount=${n(row.amount).toFixed(2)} blank_account_names=${n(row.blank_names)}`);
}

async function printDuplicateSummary(ch, branchSync, label) {
  const rows = await queryRows(ch, `
    SELECT
      count() AS duplicate_line_keys,
      sum(copies - 1) AS extra_rows
    FROM (
      SELECT doc_datetime, doc_no, account_code, account_name, debit, credit, count() AS copies
      FROM journal_transaction_detail
      WHERE branch_sync = {branchSync:String}
        AND toDate(doc_datetime) BETWEEN toDate({from:String}) AND toDate({to:String})
        AND (account_code LIKE '4%' OR account_code LIKE '5%')
      GROUP BY doc_datetime, doc_no, account_code, account_name, debit, credit
      HAVING copies > 1
    )
  `, { branchSync, from: FROM_DATE, to: TO_DATE });
  const row = rows[0] || {};
  console.log(`${label}: duplicate_line_keys=${n(row.duplicate_line_keys)} extra_rows=${n(row.extra_rows)}`);
}

async function main() {
  const { path, data: config } = readConfig(CONFIG_PATH);
  const branchSync = config.transfer?.branch_sync || 'b000';
  const branchName = config.transfer?.branch_sync_name || 'บริษัท ช้าง สยาม กัมปนี จำกัด';

  if (branchSync !== 'b000') {
    throw new Error(`This repair script is intentionally limited to b000, got ${branchSync}`);
  }

  const pg = new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    connectionTimeoutMillis: 10000,
  });
  const ch = createClickHouse(config);

  console.log(APPLY ? 'APPLY MODE' : 'DRY RUN MODE - pass --apply to change ClickHouse');
  console.log(`config=${path}`);
  console.log(`branch_sync=${branchSync}`);
  console.log(`period=${FROM_DATE} -> ${TO_DATE}`);

  await pg.connect();
  try {
    const source = await pg.query(
      `SELECT *
       FROM gl_journal_detail
       WHERE doc_date >= $1 AND doc_date <= $2
       ORDER BY doc_date, doc_no, account_code, debit, credit`,
      [FROM_DATE, TO_DATE],
    );
    const sourceRows = source.rows.map((row) => mapJournal(row, branchSync, branchName));

    const plRows = sourceRows.filter((row) => row.account_code.startsWith('4') || row.account_code.startsWith('5'));
    const sourceAmount = plRows.reduce((sum, row) => sum + amountOf(row), 0);
    console.log(`source gl_journal_detail rows=${sourceRows.length}`);
    console.log(`source P&L rows=${plRows.length} amount=${sourceAmount.toFixed(2)}`);

    await printSummary(ch, branchSync, 'ClickHouse before');
    await printDuplicateSummary(ch, branchSync, 'ClickHouse before');

    if (FIX_MV) {
      await execCh(ch, 'DROP TABLE IF EXISTS gl_journal_to_journal_mv');
    }

    await execCh(ch, `
      ALTER TABLE journal_transaction_detail
      DELETE WHERE branch_sync = '${branchSync}'
        AND toDate(doc_datetime) BETWEEN toDate('${FROM_DATE}') AND toDate('${TO_DATE}')
    `);
    await waitForMutations(ch);
    await insertRows(ch, sourceRows);

    if (FIX_MV) {
      await execCh(ch, glJournalMvSql());
    }

    if (APPLY) {
      await printSummary(ch, branchSync, 'ClickHouse after');
      await printDuplicateSummary(ch, branchSync, 'ClickHouse after');
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
