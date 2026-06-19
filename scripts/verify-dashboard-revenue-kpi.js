const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

async function main() {
  const { data: config } = readConfig('D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json');
  const ch = createClickHouse(config);
  try {
    const rows = await queryRows(ch, `
      SELECT coalesce(sum(credit - debit), 0) AS currentSales
      FROM journal_transaction_detail
      WHERE (account_type = 'INCOME' OR (account_type = '' AND left(account_code, 1) = '4'))
        AND date(doc_datetime + INTERVAL 7 HOUR) >= toDate({startDate:String})
        AND date(doc_datetime + INTERVAL 7 HOUR) <= toDate({endDate:String})
    `, { startDate: '2026-06-01', endDate: '2026-06-30' });
    console.log(JSON.stringify(rows));
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
