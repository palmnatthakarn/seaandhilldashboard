const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

const params = {
  start_date: '2026-06-01 00:00:00',
  end_date: '2026-06-30 23:59:59',
  end_date_exclusive: '2026-07-01 00:00:00',
  branchSync: 'b000',
};

function productFilter(alias = 'sid') {
  return `
        AND ${alias}.status_cancel != 'Cancel'
        AND trim(${alias}.item_code) != ''
        AND trim(${alias}.item_name) != ''
        AND ${alias}.qty > 0
        AND ${alias}.sum_amount > 0
        AND trim(${alias}.unit_code) != ''
  `;
}

const queries = {
  trend: `
      SELECT
        date,
        sum(product_sales) as sales,
        count() as orderCount
      FROM (
        SELECT
          toStartOfDay(h.headerDocDatetime) as date,
          h.branch_sync,
          h.doc_no,
          sum(sid.sum_amount) AS product_sales
        FROM (
          SELECT branch_sync, doc_no, any(doc_datetime) AS headerDocDatetime
          FROM saleinvoice_transaction
          WHERE status_cancel != 'Cancel'
            AND doc_datetime >= {start_date:String}
            AND doc_datetime < {end_date_exclusive:String}
            AND branch_sync = {branchSync:String}
          GROUP BY branch_sync, doc_no
        ) h
        INNER JOIN saleinvoice_transaction_detail sid ON h.branch_sync = sid.branch_sync AND h.doc_no = sid.doc_no
        WHERE 1 = 1
          ${productFilter('sid')}
        GROUP BY date, h.branch_sync, h.doc_no
      )
      GROUP BY date
      ORDER BY date ASC
    `,
  bySalesperson: `
      SELECT
        sale_code as saleCode,
        sale_name as saleName,
        count() as orderCount,
        sum(product_sales) as totalSales,
        totalSales / nullIf(orderCount, 0) as avgOrderValue,
        uniq(customer_code) as customerCount
      FROM (
        SELECT
          h.headerSaleCode AS sale_code,
          h.headerSaleName AS sale_name,
          h.headerCustomerCode AS customer_code,
          h.branch_sync,
          h.doc_no,
          sum(sid.sum_amount) as product_sales
        FROM (
          SELECT branch_sync, doc_no, any(sale_code) AS headerSaleCode, any(sale_name) AS headerSaleName, any(customer_code) AS headerCustomerCode
          FROM saleinvoice_transaction
          WHERE status_cancel != 'Cancel'
            AND doc_datetime BETWEEN {start_date:String} AND {end_date:String}
            AND sale_code != ''
            AND branch_sync = {branchSync:String}
          GROUP BY branch_sync, doc_no
        ) h
        INNER JOIN saleinvoice_transaction_detail sid ON h.branch_sync = sid.branch_sync AND h.doc_no = sid.doc_no
        WHERE 1 = 1
          ${productFilter('sid')}
        GROUP BY h.headerSaleCode, h.headerSaleName, h.headerCustomerCode, h.branch_sync, h.doc_no
      )
      GROUP BY sale_code, sale_name
      ORDER BY totalSales DESC
      LIMIT 20
    `,
  topCustomers: `
      SELECT
        customer_code as customerCode,
        customer_name as customerName,
        count() as orderCount,
        sum(product_sales) as totalSpent,
        totalSpent / nullIf(orderCount, 0) as avgOrderValue,
        max(doc_datetime) as lastOrderDate,
        dateDiff('day', lastOrderDate, now()) as daysSinceLastOrder
      FROM (
        SELECT
          h.headerCustomerCode AS customer_code,
          h.headerCustomerName AS customer_name,
          h.headerDocDatetime AS doc_datetime,
          h.branch_sync,
          h.doc_no,
          sum(sid.sum_amount) as product_sales
        FROM (
          SELECT
            branch_sync,
            doc_no,
            any(customer_code) AS headerCustomerCode,
            any(customer_name) AS headerCustomerName,
            any(doc_datetime) AS headerDocDatetime
          FROM saleinvoice_transaction
          WHERE status_cancel != 'Cancel'
            AND customer_code != ''
            AND doc_datetime >= {start_date:String}
            AND doc_datetime < {end_date_exclusive:String}
            AND branch_sync = {branchSync:String}
          GROUP BY branch_sync, doc_no
        ) h
        INNER JOIN saleinvoice_transaction_detail sid ON h.branch_sync = sid.branch_sync AND h.doc_no = sid.doc_no
        WHERE 1 = 1
          ${productFilter('sid')}
        GROUP BY h.headerCustomerCode, h.headerCustomerName, h.headerDocDatetime, h.branch_sync, h.doc_no
      )
      GROUP BY customer_code, customer_name
      ORDER BY totalSpent DESC
      LIMIT 20
    `,
};

async function main() {
  const { data: config } = readConfig(CONFIG_PATH);
  const ch = createClickHouse(config);
  try {
    for (const [name, query] of Object.entries(queries)) {
      try {
        const rows = await queryRows(ch, query, params);
        console.log(`${name}: OK rows=${rows.length}`);
      } catch (error) {
        console.log(`${name}: ERROR`);
        console.error(error.message || error);
      }
    }
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
