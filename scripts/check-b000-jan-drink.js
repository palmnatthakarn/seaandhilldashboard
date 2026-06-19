const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

async function runCase(ch, label, dateExpr, monthExpr) {
  const rows = await queryRows(ch, `
    SELECT
      '${label}' AS label,
      formatDateTime(${monthExpr}, '%Y-%m') AS month,
      account_code,
      account_name,
      round(sum(credit - debit), 2) AS amount
    FROM journal_transaction_detail
    WHERE branch_sync = 'b000'
      AND account_code = '4100-00'
      AND ${dateExpr} BETWEEN '2026-01-01' AND '2026-01-31'
    GROUP BY month, account_code, account_name
    ORDER BY month
  `);
  console.log(label, rows);
}

async function main() {
  const { data: config } = readConfig(CONFIG_PATH);
  const ch = createClickHouse(config);
  try {
    await runCase(ch, 'raw', 'date(doc_datetime)', 'toStartOfMonth(doc_datetime)');
    await runCase(ch, 'thai', 'date(doc_datetime + INTERVAL 7 HOUR)', 'toStartOfMonth(doc_datetime + INTERVAL 7 HOUR)');
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
