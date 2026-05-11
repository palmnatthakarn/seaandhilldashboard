import { createClient } from '@clickhouse/client';
const ch = createClient({ url: 'http://103.13.30.32:8123', username: 'changsiam', password: 'n300sJzuR0ArXpbo', database: 'datachangsiam' });

const DATE = '2026-04-22';

// ดู doc_type ทั้งหมดใน stock_transaction + ค่า amount แต่ละ type
const r1 = await ch.query({
  query: `SELECT doc_type, count() AS cnt, round(sum(amount),2) AS total_amount, round(sum(if(qty>0, amount, 0)),2) AS amount_in, round(sum(if(qty<0, amount, 0)),2) AS amount_out FROM stock_transaction WHERE date(doc_datetime) = '${DATE}' GROUP BY doc_type ORDER BY cnt DESC`,
  format: 'JSONEachRow'
});
console.log('doc_types on', DATE, ':');
(await r1.json()).forEach(r => console.log(JSON.stringify(r)));

// ดู cost*qty แยก doc_type 
const r2 = await ch.query({
  query: `SELECT doc_type, round(sum(if(qty>0, cost*qty, 0)),2) AS cost_in, round(sum(if(qty<0, abs(cost*qty), 0)),2) AS cost_out FROM stock_transaction WHERE date(doc_datetime) = '${DATE}' GROUP BY doc_type ORDER BY doc_type`,
  format: 'JSONEachRow'
});
console.log('\ncost*qty per doc_type:');
(await r2.json()).forEach(r => console.log(JSON.stringify(r)));

// ดู calc_type
const r3 = await ch.query({
  query: `SELECT calc_type, count() AS cnt, round(sum(if(qty>0, amount, 0)),2) AS amount_in FROM stock_transaction WHERE date(doc_datetime) = '${DATE}' GROUP BY calc_type`,
  format: 'JSONEachRow'
});
console.log('\ncalc_type:');
(await r3.json()).forEach(r => console.log(JSON.stringify(r)));

// ลอง: cost*qty สำหรับ doc_type='ซื้อ' เฉพาะ เฉพาะ INNER JOIN purchase_transaction (not cancelled)
const r4 = await ch.query({
  query: `SELECT round(sum(st.cost * st.qty),2) AS val FROM stock_transaction st INNER JOIN (SELECT DISTINCT doc_no, branch_sync FROM purchase_transaction WHERE status_cancel != 'Cancel') pt ON st.doc_no = pt.doc_no AND st.branch_sync = pt.branch_sync WHERE st.qty > 0 AND date(st.doc_datetime) = '${DATE}'`,
  format: 'JSONEachRow'
});
console.log('\ncost*qty JOIN purchase_transaction:', await r4.json());

// total ทุก branches ของ stock_transaction qty>0 amount
const r5 = await ch.query({
  query: `SELECT branch_sync, round(sum(amount),2) AS val FROM stock_transaction WHERE qty > 0 AND date(doc_datetime) = '${DATE}' GROUP BY branch_sync ORDER BY branch_sync`,
  format: 'JSONEachRow'
});
console.log('\namount by branch (qty>0):', await r5.json());

await ch.close();
