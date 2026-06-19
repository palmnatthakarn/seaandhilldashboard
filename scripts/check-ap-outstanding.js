const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const START = '2026-05-01 00:00:00';
const END = '2026-05-31 23:59:59';
const BRANCH = 'b000';

async function main() {
  const { data: config } = readConfig();
  const ch = createClickHouse(config);

  try {
    const docTypes = await queryRows(ch, `
      SELECT
        doc_type,
        count() AS docs,
        round(sum(total_amount), 2) AS totalAmount,
        round(sum(\`sum_pay_money\`), 2) AS paid,
        round(sum(total_amount - \`sum_pay_money\`), 2) AS outstanding
      FROM purchase_transaction
      WHERE status_cancel != 'Cancel'
        AND branch_sync = {branch:String}
        AND doc_datetime BETWEEN {start:String} AND {end:String}
      GROUP BY doc_type
      ORDER BY docs DESC
    `, { start: START, end: END, branch: BRANCH });

    const currentFilter = await queryRows(ch, `
      SELECT
        supplier_code,
        supplier_name,
        round(sum(total_amount - \`sum_pay_money\`), 2) AS totalOutstanding,
        count(DISTINCT doc_no, branch_sync) AS docCount
      FROM purchase_transaction
      WHERE status_cancel != 'Cancel'
        AND branch_sync = {branch:String}
        AND doc_type = 'CREDIT'
        AND doc_datetime BETWEEN {start:String} AND {end:String}
        AND total_amount > \`sum_pay_money\`
      GROUP BY supplier_code, supplier_name
      ORDER BY totalOutstanding DESC
      LIMIT 20
    `, { start: START, end: END, branch: BRANCH });

    const byOutstandingToEndDate = await queryRows(ch, `
      SELECT
        supplier_code,
        supplier_name,
        round(sum(total_amount - \`sum_pay_money\`), 2) AS totalOutstanding,
        round(sum(if(due_date < toDate({endDate:String}), total_amount - \`sum_pay_money\`, 0)), 2) AS overdueAmount,
        count(DISTINCT doc_no, branch_sync) AS docCount
      FROM purchase_transaction
      WHERE status_cancel != 'Cancel'
        AND branch_sync = {branch:String}
        AND doc_datetime <= {end:String}
        AND total_amount > \`sum_pay_money\`
      GROUP BY supplier_code, supplier_name
      ORDER BY totalOutstanding DESC
      LIMIT 20
    `, { end: END, endDate: '2026-05-31', branch: BRANCH });

    console.log(JSON.stringify({ docTypes, currentFilter, byOutstandingToEndDate }, null, 2));
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
