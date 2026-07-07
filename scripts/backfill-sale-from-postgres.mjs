import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';
import { createClient } from '@clickhouse/client';

// Return DATE columns as raw 'YYYY-MM-DD' strings — avoids the pg driver's
// default JS Date parsing, which applies local-timezone midnight and shifts
// the calendar day when later serialized via toISOString() on a non-UTC host.
pg.types.setTypeParser(1082, (val) => val);

const { Client } = pg;

const BRANCHES = [
  { db: 'changsiamcompany_2569', sync: 'b000', name: 'บริษัท ช้าง สยาม กัมปนี จำกัด' },
  { db: 'changsiamruay_2569', sync: 'b001', name: 'บริษัท ช้างสยามรวย จำกัด' },
  { db: 'changsupthawee_2569', sync: 'b002', name: 'บริษัท ช้าง ทรัพย์ ทวี จำกัด' },
  { db: 'chaothalayheha_2569', sync: 'b003', name: 'บริษัท ชาวทะเลเฮฮา จำกัด' },
  { db: 'deejingjung_2569', sync: 'b004', name: 'บริษัท ดีจิงจัง 5665 จำกัด' },
  { db: 'homhug_2569', sync: 'b005', name: 'บริษัท ฮอมฮัก จำกัด' },
];

function statusPayment(lastStatus) {
  const map = { 0: 'Outstanding', 1: 'Partially Paid', 2: 'Fully Paid' };
  return map[Number(lastStatus)] ?? '';
}

function taxType(v) {
  return Number(v) === 2 ? 'EXCEPTVAT' : 'VAT';
}

async function main() {
  const version = Date.now(); // lower than any future real ts_ms from ongoing CDC
  const ch = createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DB,
  });

  let totalHeaders = 0;
  let totalDetails = 0;

  for (const branch of BRANCHES) {
    const pgClient = new Client({
      host: '147.50.69.68',
      port: 54322,
      user: 'postgres',
      password: 'seaandhill',
      database: branch.db,
    });
    await pgClient.connect();

    const headers = await pgClient.query(`
      SELECT doc_date, doc_no, creator_code, is_cancel, pos_id, cust_code, sale_code, doc_type,
             due_date, sum_point, total_value, total_discount, total_before_vat, total_vat_value,
             total_after_vat, total_except_vat, total_amount, remark, branch_code, department_code,
             side_code, project_code, job_code, allocate_code, pay_amount, last_status
      FROM ic_trans
      WHERE trans_type = 2
    `);

    const headerRows = headers.rows.map((r) => ({
      doc_datetime: `${r.doc_date} 00:00:00`,
      doc_no: r.doc_no || '',
      creator_code: r.creator_code || '',
      creator_name: '',
      status_cancel: Number(r.is_cancel) === 1 ? 'Cancel' : '',
      pos_id: r.pos_id || '',
      customer_code: r.cust_code || '',
      customer_name: '',
      sale_code: r.sale_code || '',
      sale_name: '',
      doc_type: String(r.doc_type ?? ''),
      due_date: r.due_date ? `${r.due_date} 00:00:00` : '1970-01-01 00:00:00',
      sum_point: Number(r.sum_point) || 0,
      total_value: Number(r.total_value) || 0,
      total_discount: Number(r.total_discount) || 0,
      total_before_vat: Number(r.total_before_vat) || 0,
      total_vat_value: Number(r.total_vat_value) || 0,
      total_after_vat: Number(r.total_after_vat) || 0,
      total_except_vat: Number(r.total_except_vat) || 0,
      total_amount: Number(r.total_amount) || 0,
      remark: r.remark || '',
      branch_code: r.branch_code || '',
      branch_name: '',
      department_code: r.department_code || '',
      department_name: '',
      side_code: r.side_code || '',
      side_name: '',
      project_code: r.project_code || '',
      project_name: '',
      job_code: r.job_code || '',
      job_name: '',
      allocate_code: r.allocate_code || '',
      allocate_name: '',
      billing_no_array: '',
      sum_pay_money: Number(r.pay_amount) || 0,
      status_payment: statusPayment(r.last_status),
      branch_sync: branch.sync,
      branch_sync_name: branch.name,
      _version: version,
    }));

    if (headerRows.length > 0) {
      await ch.insert({ table: 'saleinvoice_transaction_v3', values: headerRows, format: 'JSONEachRow' });
    }
    console.log(`${branch.sync} header: inserted ${headerRows.length} rows`);
    totalHeaders += headerRows.length;

    const details = await pgClient.query(`
      SELECT d.doc_date, d.doc_no, d.branch_code, d.item_code, d.barcode, d.item_name, d.unit_code,
             d.wh_code, d.shelf_code, d.qty, d.price, d.discount_amount, d.sum_amount, d.sum_of_cost,
             d.average_cost, d.stand_value, d.divide_value, d.tax_type, d.ic_pattern, d.remark, d.status,
             d.line_number
      FROM ic_trans_detail d
      JOIN ic_trans h ON d.doc_no = h.doc_no
      WHERE h.trans_type = 2
    `);
    await pgClient.end();

    const detailRows = details.rows.map((r) => ({
      doc_datetime: `${r.doc_date} 00:00:00`,
      doc_no: r.doc_no || '',
      branch_code: r.branch_code || '',
      item_code: r.item_code || '',
      barcode: r.barcode || '',
      item_name: r.item_name || '',
      unit_code: r.unit_code || '',
      wh_code: r.wh_code || '',
      shelf_code: r.shelf_code || '',
      qty: Number(r.qty) || 0,
      price: Number(r.price) || 0,
      discount_amount: Number(r.discount_amount) || 0,
      sum_amount: Number(r.sum_amount) || 0,
      sum_of_cost: Number(r.sum_of_cost) || 0,
      average_cost: Number(r.average_cost) || 0,
      stand_value: Number(r.stand_value) || 0,
      divide_value: Number(r.divide_value) || 0,
      tax_type: taxType(r.tax_type),
      item_pattern_code: r.ic_pattern || '',
      description: r.remark || '',
      status_cancel: Number(r.status) === 1 ? 'Cancel' : '',
      branch_sync: branch.sync,
      branch_sync_name: branch.name,
      line_number: r.line_number == null ? 0 : Number(r.line_number),
      _version: version,
    }));

    if (detailRows.length > 0) {
      await ch.insert({ table: 'saleinvoice_transaction_detail_stage', values: detailRows, format: 'JSONEachRow' });
    }
    console.log(`${branch.sync} detail: inserted ${detailRows.length} rows`);
    totalDetails += detailRows.length;
  }

  console.log(`Total header rows: ${totalHeaders}, detail rows: ${totalDetails}`);
  await ch.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
