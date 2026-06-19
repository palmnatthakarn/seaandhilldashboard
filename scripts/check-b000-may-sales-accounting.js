const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

async function main() {
  const { data: config } = readConfig(CONFIG_PATH);
  const ch = createClickHouse(config);
  try {
    const accountingRows = await queryRows(ch, `
      SELECT
        account_code,
        account_name,
        round(sum(credit - debit), 2) AS amount
      FROM journal_transaction_detail
      WHERE branch_sync = 'b000'
        AND (account_type = 'INCOME' OR (account_type = '' AND left(account_code, 1) = '4'))
        AND date(doc_datetime + INTERVAL 7 HOUR) BETWEEN '2026-05-01' AND '2026-05-31'
      GROUP BY account_code, account_name
      HAVING amount != 0
      ORDER BY account_code
    `);

    const detailTotal = await queryRows(ch, `
      SELECT round(sum(sid.sum_amount), 2) AS total
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.branch_sync = 'b000'
        AND si.status_cancel != 'Cancel'
        AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN '2026-05-01' AND '2026-05-31'
    `);

    const invoiceTotal = await queryRows(ch, `
      SELECT round(sum(total_amount), 2) AS total
      FROM saleinvoice_transaction
      WHERE branch_sync = 'b000'
        AND status_cancel != 'Cancel'
        AND date(doc_datetime + INTERVAL 7 HOUR) BETWEEN '2026-05-01' AND '2026-05-31'
    `);

    console.log('accounting income rows');
    console.log(accountingRows);
    console.log('accounting income total', accountingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    console.log('sale detail total', detailTotal);
    console.log('sale invoice total', invoiceTotal);
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
