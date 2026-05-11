import { createClient } from '@clickhouse/client';

const ch = createClient({
  url: 'http://103.13.30.32:8123',
  username: 'changsiam',
  password: 'n300sJzuR0ArXpbo',
  database: 'datachangsiam',
});

const DATE = '2026-04-22';

async function q(label, sql) {
  try {
    const r = await ch.query({ query: sql, format: 'JSONEachRow' });
    const d = await r.json();
    console.log(`[${label}]:`, JSON.stringify(d));
  } catch (e) {
    console.error(`[${label}] ERROR:`, e.message);
  }
}

await q(
  'Source1: st.amount qty>0 JOIN purchase_transaction',
  `SELECT date(st.doc_datetime) AS dt, round(sum(st.amount),2) AS val
   FROM stock_transaction st
   INNER JOIN (
     SELECT DISTINCT doc_no, branch_sync FROM purchase_transaction
     WHERE status_cancel != 'Cancel'
   ) pt ON st.doc_no = pt.doc_no AND st.branch_sync = pt.branch_sync
   WHERE st.qty > 0 AND date(st.doc_datetime) = '${DATE}'
   GROUP BY dt`
);

await q(
  'Source2: ptd.sum_amount',
  `SELECT date(doc_datetime) AS dt, round(sum(sum_amount),2) AS val
   FROM purchase_transaction_detail
   WHERE status_cancel != 'Cancel' AND date(doc_datetime) = '${DATE}'
   GROUP BY dt`
);

await q(
  'Source3: ptd.sum_of_cost',
  `SELECT date(doc_datetime) AS dt, round(sum(sum_of_cost),2) AS val
   FROM purchase_transaction_detail
   WHERE status_cancel != 'Cancel' AND date(doc_datetime) = '${DATE}'
   GROUP BY dt`
);

await q(
  'Source4: st.amount qty>0 doc_type=ซื้อ only',
  `SELECT date(doc_datetime) AS dt, round(sum(amount),2) AS val
   FROM stock_transaction
   WHERE qty > 0 AND doc_type = 'ซื้อ' AND date(doc_datetime) = '${DATE}'
   GROUP BY dt`
);

await q(
  'Source5: st.amount qty>0 (all types, no JOIN)',
  `SELECT date(doc_datetime) AS dt, round(sum(amount),2) AS val, groupArray(DISTINCT doc_type) AS types
   FROM stock_transaction
   WHERE qty > 0 AND date(doc_datetime) = '${DATE}'
   GROUP BY dt`
);

// ดูว่า inventory report "มูลค่าเพิ่ม" คำนวณยังไง
await q(
  'Source6: ptd.sum_amount DISTINCT doc_no',
  `SELECT round(sum(sum_amount),2) AS val, count() AS rows
   FROM (
     SELECT doc_no, branch_sync, sum(sum_amount) AS sum_amount
     FROM purchase_transaction_detail
     WHERE status_cancel != 'Cancel' AND date(doc_datetime) = '${DATE}'
     GROUP BY doc_no, branch_sync
   )`
);

// ดู distinct doc_no ใน purchase_transaction วันนั้น
await q(
  'Source7: purchase_transaction doc summary',
  `SELECT count() AS doc_count, round(sum(pt.total_amount),2) AS total
   FROM purchase_transaction pt
   WHERE status_cancel != 'Cancel' AND date(doc_datetime) = '${DATE}'`
);

await ch.close();
