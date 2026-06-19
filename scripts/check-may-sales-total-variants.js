const { createClickHouse, queryRows, readConfig } = require('./cdc-clickhouse-utils');

async function main() {
  const { data: config } = readConfig('D:\\connect\\smlaiconnect-windows-v1.2.6 - B000 - 69 ver SAH\\connect.json');
  const ch = createClickHouse(config);
  const params = { from: '2026-05-01 00:00:00', to: '2026-05-31 23:59:59' };
  try {
    const rows = await queryRows(ch, `
      SELECT 'invoice_total_amount' AS metric, sum(total_amount) AS amount
      FROM saleinvoice_transaction
      WHERE status_cancel != 'Cancel'
        AND doc_datetime BETWEEN {from:String} AND {to:String}

      UNION ALL

      SELECT 'detail_sum_amount_all' AS metric, sum(sid.sum_amount) AS amount
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND si.doc_datetime BETWEEN {from:String} AND {to:String}

      UNION ALL

      SELECT 'product_detail_total' AS metric, sum(sid.sum_amount) AS amount
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND si.doc_datetime BETWEEN {from:String} AND {to:String}
        AND sid.status_cancel != 'Cancel'
        AND trim(sid.item_code) != ''
        AND trim(sid.item_name) != ''
        AND sid.qty > 0
        AND sid.sum_amount > 0
        AND trim(sid.unit_code) != ''

      UNION ALL

      SELECT 'detail_sum_amount_sellable_filter' AS metric, sum(sid.sum_amount) AS amount
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND si.doc_datetime BETWEEN {from:String} AND {to:String}
        AND sid.status_cancel != 'Cancel'
        AND trim(sid.item_code) != ''
        AND trim(sid.item_name) != ''
        AND sid.qty > 0
        AND sid.sum_amount > 0
        AND trim(sid.unit_code) != ''
        AND (sid.unit_code != 'บาท' OR sid.item_code = 'RR-0001')
        AND (NOT startsWith(sid.item_code, 'RR-') OR sid.item_code = 'RR-0001')

      UNION ALL

      SELECT 'journal_income_4xxx' AS metric, sum(credit - debit) AS amount
      FROM journal_transaction_detail
      WHERE date(doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('2026-05-01') AND toDate('2026-05-31')
        AND (account_type = 'INCOME' OR (account_type = '' AND left(account_code, 1) = '4'))

      UNION ALL

      SELECT 'journal_sales_41_ex_discount' AS metric, sum(credit - debit) AS amount
      FROM journal_transaction_detail
      WHERE date(doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('2026-05-01') AND toDate('2026-05-31')
        AND left(account_code, 2) = '41'
        AND account_code != '4110-05'
        AND (account_type = 'INCOME' OR (account_type = '' AND left(account_code, 1) = '4'))

      UNION ALL

      SELECT 'detail_sum_amount_all_report_tz' AS metric, sum(sid.sum_amount) AS amount
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('2026-05-01') AND toDate('2026-05-31')

      UNION ALL

      SELECT 'detail_sum_amount_sellable_report_tz' AS metric, sum(sid.sum_amount) AS amount
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.status_cancel != 'Cancel'
        AND date(si.doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('2026-05-01') AND toDate('2026-05-31')
        AND sid.status_cancel != 'Cancel'
        AND trim(sid.item_code) != ''
        AND trim(sid.item_name) != ''
        AND sid.qty > 0
        AND sid.sum_amount > 0
        AND trim(sid.unit_code) != ''
        AND (sid.unit_code != 'บาท' OR sid.item_code = 'RR-0001')
        AND (NOT startsWith(sid.item_code, 'RR-') OR sid.item_code = 'RR-0001')
    `, params);
    for (const row of rows) console.log(`${row.metric}: ${Number(row.amount || 0).toFixed(2)}`);

    const byBranch = await queryRows(ch, `
      SELECT metric, branchSync, amount
      FROM (
        SELECT 'invoice_total_amount' AS metric, branch_sync AS branchSync, sum(total_amount) AS amount
        FROM saleinvoice_transaction
        WHERE status_cancel != 'Cancel'
          AND doc_datetime BETWEEN {from:String} AND {to:String}
        GROUP BY branchSync

        UNION ALL

        SELECT 'detail_sum_amount_all' AS metric, si.branch_sync AS branchSync, sum(sid.sum_amount) AS amount
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND si.doc_datetime BETWEEN {from:String} AND {to:String}
        GROUP BY branchSync

        UNION ALL

        SELECT 'detail_sum_amount_sellable_filter' AS metric, si.branch_sync AS branchSync, sum(sid.sum_amount) AS amount
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND si.doc_datetime BETWEEN {from:String} AND {to:String}
          AND sid.status_cancel != 'Cancel'
          AND trim(sid.item_code) != ''
          AND trim(sid.item_name) != ''
          AND sid.qty > 0
          AND sid.sum_amount > 0
          AND trim(sid.unit_code) != ''
          AND (sid.unit_code != 'บาท' OR sid.item_code = 'RR-0001')
          AND (NOT startsWith(sid.item_code, 'RR-') OR sid.item_code = 'RR-0001')
        GROUP BY branchSync

        UNION ALL

        SELECT 'product_detail_total' AS metric, si.branch_sync AS branchSync, sum(sid.sum_amount) AS amount
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.status_cancel != 'Cancel'
          AND si.doc_datetime BETWEEN {from:String} AND {to:String}
          AND sid.status_cancel != 'Cancel'
          AND trim(sid.item_code) != ''
          AND trim(sid.item_name) != ''
          AND sid.qty > 0
          AND sid.sum_amount > 0
          AND trim(sid.unit_code) != ''
        GROUP BY branchSync

        UNION ALL

        SELECT 'journal_sales_41_ex_discount' AS metric, branch_sync AS branchSync, sum(credit - debit) AS amount
        FROM journal_transaction_detail
        WHERE date(doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('2026-05-01') AND toDate('2026-05-31')
          AND left(account_code, 2) = '41'
          AND account_code != '4110-05'
          AND (account_type = 'INCOME' OR (account_type = '' AND left(account_code, 1) = '4'))
        GROUP BY branchSync
      )
      ORDER BY branchSync, metric
    `, params);
    console.log('by_branch:');
    for (const row of byBranch) console.log(`  ${row.branchSync} ${row.metric}: ${Number(row.amount || 0).toFixed(2)}`);

    const b000Accounts = await queryRows(ch, `
      SELECT
        account_code AS accountCode,
        any(account_name) AS accountName,
        round(sum(credit - debit), 2) AS amount
      FROM journal_transaction_detail
      WHERE branch_sync = 'b000'
        AND date(doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('2026-05-01') AND toDate('2026-05-31')
        AND (account_type = 'INCOME' OR (account_type = '' AND left(account_code, 1) = '4'))
      GROUP BY accountCode
      ORDER BY accountCode
    `);
    console.log('b000_income_accounts:');
    for (const row of b000Accounts) {
      console.log(`  ${row.accountCode} ${row.accountName || '-'}: ${Number(row.amount || 0).toFixed(2)}`);
    }

    const b000JournalByDoc = await queryRows(ch, `
      SELECT
        account_code AS accountCode,
        doc_no AS docNo,
        round(sum(credit - debit), 2) AS amount
      FROM journal_transaction_detail
      WHERE branch_sync = 'b000'
        AND date(doc_datetime + INTERVAL 7 HOUR) BETWEEN toDate('2026-05-01') AND toDate('2026-05-31')
        AND (account_type = 'INCOME' OR (account_type = '' AND left(account_code, 1) = '4'))
      GROUP BY accountCode, docNo
      HAVING abs(amount) IN (37470, 41070, 38950, 3600)
      ORDER BY accountCode, docNo
      LIMIT 50
    `);
    console.log('b000_income_docs_matching_differences:');
    for (const row of b000JournalByDoc) {
      console.log(`  ${row.accountCode} ${row.docNo}: ${Number(row.amount || 0).toFixed(2)}`);
    }

    const detailColumns = await queryRows(ch, `
      DESCRIBE TABLE saleinvoice_transaction_detail
    `);
    console.log('detail_discount_like_columns:');
    for (const row of detailColumns.filter((row) => /discount|amount|sum/i.test(String(row.name)))) {
      console.log(`  ${row.name}: ${row.type}`);
    }

    const b000DetailBuckets = await queryRows(ch, `
      SELECT
        bucket,
        round(sum(sum_amount), 2) AS sumAmount,
        round(sum(qty), 2) AS qty,
        count() AS rows
      FROM (
        SELECT
          multiIf(
            status_cancel = 'Cancel', 'cancelled_detail',
            trim(item_code) = '', 'blank_item_code',
            trim(item_name) = '', 'blank_item_name',
            qty <= 0, 'qty_lte_zero',
            sum_amount <= 0, 'sum_amount_lte_zero',
            trim(unit_code) = '', 'blank_unit_code',
            unit_code = 'บาท' AND item_code != 'RR-0001', 'unit_baht_non_rr0001',
            startsWith(item_code, 'RR-') AND item_code != 'RR-0001', 'rr_non_rr0001',
            'included_sellable'
          ) AS bucket,
          sid.sum_amount AS sum_amount,
          sid.qty AS qty
        FROM saleinvoice_transaction_detail sid
        JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
        WHERE si.branch_sync = 'b000'
          AND si.status_cancel != 'Cancel'
          AND si.doc_datetime BETWEEN {from:String} AND {to:String}
      )
      GROUP BY bucket
      ORDER BY bucket
    `, params);
    console.log('b000_detail_buckets:');
    for (const row of b000DetailBuckets) {
      console.log(`  ${row.bucket}: amount=${Number(row.sumAmount || 0).toFixed(2)} qty=${Number(row.qty || 0).toFixed(2)} rows=${row.rows}`);
    }

    const b000SpecialDetail = await queryRows(ch, `
      SELECT
        sid.item_code AS itemCode,
        any(sid.item_name) AS itemName,
        any(sid.unit_code) AS unitCode,
        round(sum(sid.sum_amount), 2) AS sumAmount,
        round(sum(sid.discount_amount), 2) AS discountAmount,
        round(sum(sid.qty), 2) AS qty,
        count() AS rows
      FROM saleinvoice_transaction_detail sid
      JOIN saleinvoice_transaction si ON sid.doc_no = si.doc_no AND sid.branch_sync = si.branch_sync
      WHERE si.branch_sync = 'b000'
        AND si.status_cancel != 'Cancel'
        AND si.doc_datetime BETWEEN {from:String} AND {to:String}
        AND (
          sid.unit_code = 'บาท'
          OR startsWith(sid.item_code, 'RR-')
          OR sid.sum_amount <= 0
          OR sid.qty <= 0
          OR sid.discount_amount != 0
        )
      GROUP BY sid.item_code
      ORDER BY abs(discountAmount) DESC, abs(sumAmount) DESC
      LIMIT 80
    `, params);
    console.log('b000_special_detail_items:');
    for (const row of b000SpecialDetail) {
      console.log(`  ${row.itemCode} ${row.itemName || '-'} unit=${row.unitCode || '-'} amount=${Number(row.sumAmount || 0).toFixed(2)} discount=${Number(row.discountAmount || 0).toFixed(2)} qty=${Number(row.qty || 0).toFixed(2)} rows=${row.rows}`);
    }
  } finally {
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
