import { createClient } from '@clickhouse/client';
const ch = createClient({ url: 'http://103.13.30.32:8123', username: 'changsiam', password: 'n300sJzuR0ArXpbo', database: 'datachangsiam' });

const DATE = '2026-04-22';

// 1. ดู purchase_transaction_detail columns
const r1 = await ch.query({ query: `DESCRIBE TABLE purchase_transaction_detail`, format: 'JSONEachRow' });
console.log('purchase_transaction_detail columns:');
(await r1.json()).forEach(c => console.log(` - ${c.name}: ${c.type}`));

// 2. ดูตัวอย่างข้อมูล
const r2 = await ch.query({ query: `SELECT * FROM purchase_transaction_detail WHERE date(doc_datetime) = '${DATE}' LIMIT 3`, format: 'JSONEachRow' });
console.log('\nSample purchase_transaction_detail:');
(await r2.json()).forEach(r => console.log(JSON.stringify(r)));

// 3. กรอง branch_sync = 'b000'
const r3 = await ch.query({ query: `SELECT branch_sync, count() AS rows, round(sum(sum_amount),2) AS total_amount, round(sum(sum_of_cost),2) AS total_cost FROM purchase_transaction_detail WHERE status_cancel != 'Cancel' AND date(doc_datetime) = '${DATE}' GROUP BY branch_sync ORDER BY branch_sync`, format: 'JSONEachRow' });
console.log('\npurchase_transaction_detail by branch:');
(await r3.json()).forEach(r => console.log(JSON.stringify(r)));

// 4. stock_transaction.amount qty>0 by branch
const r4 = await ch.query({ query: `SELECT branch_sync, count() AS rows, round(sum(amount),2) AS total FROM stock_transaction WHERE qty > 0 AND date(doc_datetime) = '${DATE}' GROUP BY branch_sync ORDER BY branch_sync`, format: 'JSONEachRow' });
console.log('\nstock_transaction.amount (qty>0) by branch:');
(await r4.json()).forEach(r => console.log(JSON.stringify(r)));

// 5. เปรียบเทียบ row count ของทั้งสองตาราง
const r5 = await ch.query({ query: `SELECT count() AS ptd_rows FROM purchase_transaction_detail WHERE status_cancel != 'Cancel' AND date(doc_datetime) = '${DATE}'`, format: 'JSONEachRow' });
const r6 = await ch.query({ query: `SELECT count() AS st_rows FROM stock_transaction WHERE qty > 0 AND date(doc_datetime) = '${DATE}'`, format: 'JSONEachRow' });
console.log('\nRow count - purchase_transaction_detail:', await r5.json());
console.log('Row count - stock_transaction qty>0:', await r6.json());

// 6. purchase_transaction_detail branch b000 sum
const r7 = await ch.query({ query: `SELECT round(sum(sum_of_cost),2) AS val FROM purchase_transaction_detail WHERE status_cancel != 'Cancel' AND branch_sync = 'b000' AND date(doc_datetime) = '${DATE}'`, format: 'JSONEachRow' });
console.log('\npurchase_transaction_detail b000 sum_of_cost:', await r7.json());

await ch.close();
