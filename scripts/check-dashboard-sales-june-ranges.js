const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

const CONFIG_PATH = 'D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json';

const productFilter = `
  AND sid.status_cancel != 'Cancel'
  AND trim(sid.item_code) != ''
  AND trim(sid.item_name) != ''
  AND sid.qty > 0
  AND sid.sum_amount > 0
  AND trim(sid.unit_code) != ''
`;

const sellableFilter = `
  ${productFilter}
  AND (sid.unit_code != 'บาท' OR sid.item_code = 'RR-0001')
  AND (NOT startsWith(sid.item_code, 'RR-') OR sid.item_code = 'RR-0001')
`;

async function main() {
  const { data: config } = readConfig(CONFIG_PATH);
  const ch = createClickHouse(config);

  const ranges = [
    { rangeName: 'last_7_days_11_17', start: '2026-06-11', end: '2026-06-17' },
    { rangeName: 'month_to_date_1_17', start: '2026-06-01', end: '2026-06-17' },
  ];

  try {
    for (const range of ranges) {
      const rows = await queryRows(ch, `
        SELECT
          metric,
          branchSync,
          round(totalSales, 2) AS totalSales,
          orders,
          customers,
          round(totalSales / nullIf(orders, 0), 2) AS avgOrderValue
        FROM (
          SELECT
            metric,
            branchSync,
            sum(productSales) AS totalSales,
            count() AS orders,
            uniq(customerCode) AS customers
          FROM (
            SELECT
              metric,
              branchSync,
              docNo,
              any(customerCode) AS customerCode,
              sum(sumAmount) AS productSales
            FROM (
            SELECT
              'raw_toDate' AS metric,
                si.branch_sync AS branchSync,
                si.doc_no AS docNo,
                si.customer_code AS customerCode,
                sid.sum_amount AS sumAmount
              FROM saleinvoice_transaction_detail sid
              JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
              WHERE si.status_cancel != 'Cancel'
                AND toDate(si.doc_datetime) BETWEEN toDate({start:String}) AND toDate({end:String})
                ${productFilter}

              UNION ALL

              SELECT
                'sellable_filter' AS metric,
                si.branch_sync AS branchSync,
                si.doc_no AS docNo,
                si.customer_code AS customerCode,
                sid.sum_amount AS sumAmount
              FROM saleinvoice_transaction_detail sid
              JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
              WHERE si.status_cancel != 'Cancel'
                AND toDate(si.doc_datetime) BETWEEN toDate({start:String}) AND toDate({end:String})
                ${sellableFilter}

              UNION ALL

              SELECT
                'exclude_rr_all' AS metric,
                si.branch_sync AS branchSync,
                si.doc_no AS docNo,
                si.customer_code AS customerCode,
                sid.sum_amount AS sumAmount
              FROM saleinvoice_transaction_detail sid
              JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
              WHERE si.status_cancel != 'Cancel'
                AND toDate(si.doc_datetime) BETWEEN toDate({start:String}) AND toDate({end:String})
                ${productFilter}
                AND sid.unit_code != 'บาท'
                AND NOT startsWith(sid.item_code, 'RR-')

              UNION ALL

              SELECT
                'bangkok_toDate' AS metric,
                si.branch_sync AS branchSync,
                si.doc_no AS docNo,
                si.customer_code AS customerCode,
                sid.sum_amount AS sumAmount
              FROM saleinvoice_transaction_detail sid
              JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
              WHERE si.status_cancel != 'Cancel'
                AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate({start:String}) AND toDate({end:String})
                ${productFilter}

              UNION ALL

              SELECT
                'inclusive_datetime' AS metric,
                si.branch_sync AS branchSync,
                si.doc_no AS docNo,
                si.customer_code AS customerCode,
                sid.sum_amount AS sumAmount
              FROM saleinvoice_transaction_detail sid
              JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
              WHERE si.status_cancel != 'Cancel'
                AND si.doc_datetime BETWEEN concat({start:String}, ' 00:00:00') AND concat({end:String}, ' 23:59:59')
                ${productFilter}
            )
            GROUP BY metric, branchSync, docNo
          )
          GROUP BY metric, branchSync
        )
        ORDER BY metric, branchSync
      `, range);

      console.log(`\n${range.rangeName} ${range.start}..${range.end}`);
      for (const row of rows) {
        console.log(`${row.metric} ${row.branchSync}: sales=${Number(row.totalSales || 0).toFixed(2)} orders=${row.orders} customers=${row.customers} avg=${Number(row.avgOrderValue || 0).toFixed(2)}`);
      }

      const daily = await queryRows(ch, `
        SELECT
          toDate(si.doc_datetime) AS date,
          round(sum(sid.sum_amount), 2) AS productSales,
          round(sumIf(sid.sum_amount,
            sid.unit_code = 'บาท'
            AND sid.item_code != 'RR-0001'
          ), 2) AS unitBahtNonRR0001,
          round(sumIf(sid.sum_amount,
            startsWith(sid.item_code, 'RR-')
            AND sid.item_code != 'RR-0001'
          ), 2) AS rrNonRR0001,
          round(sumIf(sid.sum_amount,
            (sid.unit_code != 'บาท' OR sid.item_code = 'RR-0001')
            AND (NOT startsWith(sid.item_code, 'RR-') OR sid.item_code = 'RR-0001')
          ), 2) AS sellableSales
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.branch_sync = 'b000'
          AND si.status_cancel != 'Cancel'
          AND toDate(si.doc_datetime) BETWEEN toDate({start:String}) AND toDate({end:String})
          ${productFilter}
        GROUP BY date
        ORDER BY date
      `, range);

      console.log('b000 daily:');
      for (const row of daily) {
        console.log(`  ${row.date}: product=${Number(row.productSales || 0).toFixed(2)} sellable=${Number(row.sellableSales || 0).toFixed(2)} unitBaht=${Number(row.unitBahtNonRR0001 || 0).toFixed(2)} rrNon=${Number(row.rrNonRR0001 || 0).toFixed(2)}`);
      }
    }

    const topDocs = await queryRows(ch, `
      SELECT
        toDate(si.doc_datetime) AS date,
        si.doc_no AS docNo,
        any(si.customer_code) AS customerCode,
        any(si.customer_name) AS customerName,
        round(sum(sid.sum_amount), 2) AS productSales,
        count() AS rows
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.branch_sync = 'b000'
        AND si.status_cancel != 'Cancel'
        AND toDate(si.doc_datetime) BETWEEN toDate('2026-06-11') AND toDate('2026-06-17')
        ${productFilter}
      GROUP BY date, si.doc_no
      ORDER BY productSales DESC
      LIMIT 20
    `);

    console.log('\nb000 top docs 2026-06-11..2026-06-17:');
    for (const row of topDocs) {
      console.log(`  ${row.date} ${row.docNo}: sales=${Number(row.productSales || 0).toFixed(2)} rows=${row.rows} customer=${row.customerName || row.customerCode || '-'}`);
    }

    const targetLines = await queryRows(ch, `
      SELECT
        si.doc_datetime AS docDatetime,
        si.doc_no AS docNo,
        si.customer_code AS customerCode,
        si.customer_name AS customerName,
        sid.item_code AS itemCode,
        sid.item_name AS itemName,
        sid.item_category_code AS categoryCode,
        sid.item_category_name AS categoryName,
        sid.unit_code AS unitCode,
        sid.qty AS qty,
        sid.sum_amount AS sumAmount
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.branch_sync = 'b000'
        AND si.status_cancel != 'Cancel'
        AND toDate(si.doc_datetime) BETWEEN toDate('2026-06-11') AND toDate('2026-06-17')
        ${productFilter}
        AND si.doc_no IN (
          SELECT docNo
          FROM (
            SELECT si.doc_no AS docNo, sum(sid.sum_amount) AS productSales
            FROM saleinvoice_transaction_detail sid
            JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
            WHERE si.branch_sync = 'b000'
              AND si.status_cancel != 'Cancel'
              AND toDate(si.doc_datetime) BETWEEN toDate('2026-06-11') AND toDate('2026-06-17')
              ${productFilter}
            GROUP BY si.doc_no
            ORDER BY productSales DESC
            LIMIT 1
          )
        )
      ORDER BY sid.sum_amount DESC
    `);

    console.log('\nb000 largest doc lines:');
    for (const row of targetLines) {
      console.log(`  ${row.docNo} ${row.itemCode} ${row.itemName || '-'} category=${row.categoryCode || '-'}:${row.categoryName || '-'} unit=${row.unitCode || '-'} qty=${row.qty} amount=${Number(row.sumAmount || 0).toFixed(2)} customer=${row.customerName || row.customerCode || '-'}`);
    }
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
