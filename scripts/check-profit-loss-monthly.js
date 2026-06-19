const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

async function printRows(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
}

async function main() {
  const { data: config } = readConfig(CONFIG_PATH);
  const ch = createClickHouse(config);
  try {
    const rawMonthly = await queryRows(ch, `
      SELECT
        formatDateTime(toStartOfMonth(doc_datetime), '%Y-%m') AS month,
        round(sumIf(credit - debit, account_type = 'INCOME'), 2) AS revenue,
        round(sumIf(debit - credit, account_type = 'EXPENSES'), 2) AS expenses,
        round(revenue - expenses, 2) AS net_profit
      FROM journal_transaction_detail
      WHERE branch_sync = 'b000'
        AND doc_datetime >= '2026-01-01'
        AND doc_datetime < '2026-07-01'
      GROUP BY month
      ORDER BY month
    `);

    const thaiMonthly = await queryRows(ch, `
      SELECT
        formatDateTime(toStartOfMonth(doc_datetime + INTERVAL 7 HOUR), '%Y-%m') AS month,
        round(sumIf(credit - debit, account_type = 'INCOME'), 2) AS revenue,
        round(sumIf(debit - credit, account_type = 'EXPENSES'), 2) AS expenses,
        round(revenue - expenses, 2) AS net_profit
      FROM journal_transaction_detail
      WHERE branch_sync = 'b000'
        AND doc_datetime + INTERVAL 7 HOUR >= '2026-01-01'
        AND doc_datetime + INTERVAL 7 HOUR < '2026-07-01'
      GROUP BY month
      ORDER BY month
    `);

    const incomeByAccount = await queryRows(ch, `
      SELECT
        formatDateTime(toStartOfMonth(doc_datetime + INTERVAL 7 HOUR), '%Y-%m') AS month,
        account_code,
        account_name,
        round(sum(credit - debit), 2) AS amount
      FROM journal_transaction_detail
      WHERE branch_sync = 'b000'
        AND account_type = 'INCOME'
        AND doc_datetime + INTERVAL 7 HOUR >= '2026-01-01'
        AND doc_datetime + INTERVAL 7 HOUR < '2026-07-01'
      GROUP BY month, account_code, account_name
      HAVING amount != 0
      ORDER BY month, account_code
    `);

    const boundary = await queryRows(ch, `
      SELECT
        formatDateTime(doc_datetime, '%Y-%m-%d %H:%M:%S') AS stored_time,
        formatDateTime(doc_datetime + INTERVAL 7 HOUR, '%Y-%m-%d %H:%M:%S') AS thai_time,
        count() AS rows,
        round(sumIf(credit - debit, account_type = 'INCOME'), 2) AS revenue
      FROM journal_transaction_detail
      WHERE branch_sync = 'b000'
        AND (
          toDayOfMonth(doc_datetime + INTERVAL 7 HOUR) = 1
          OR toDayOfMonth(doc_datetime + INTERVAL 7 HOUR) >= 28
        )
      GROUP BY stored_time, thai_time
      ORDER BY thai_time
      LIMIT 40
    `);

    await printRows('raw month using stored doc_datetime', rawMonthly);
    await printRows('month using doc_datetime + 7 hours', thaiMonthly);
    await printRows('income by account using +7 hours', incomeByAccount);
    await printRows('date boundary samples', boundary);
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
