import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: 'admin',
  password: 'Admin123',
  database: 'datachangsiam',
});

async function q(query) {
  const r = await client.query({ query, format: 'JSONEachRow' });
  return r.json();
}

async function main() {
  // sanity-check the branch extraction first
  const test = await q(`
    SELECT DISTINCT _topic, extract(_topic, 'branch_(\\d+)') AS branch_num
    FROM ic_trans_raw
    WHERE toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date')) = '2026-06-29'
    LIMIT 10
  `);
  console.log('Branch extraction test:', JSON.stringify(test));
  if (test.some((r) => !r.branch_num)) {
    throw new Error('branch_num extraction still broken, aborting');
  }

  const backfillHeader = `
    INSERT INTO saleinvoice_transaction
    SELECT
      toDateTime(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
      JSONExtractString(raw_data, 'payload', 'after', 'doc_no') AS doc_no,
      JSONExtractString(raw_data, 'payload', 'after', 'creator_code') AS creator_code,
      '' AS creator_name,
      if((JSONExtractString(raw_data, 'payload', 'after', 'is_cancel') IN ('true','1')), 'Cancel', '') AS status_cancel,
      JSONExtractString(raw_data, 'payload', 'after', 'pos_id') AS pos_id,
      JSONExtractString(raw_data, 'payload', 'after', 'cust_code') AS customer_code,
      '' AS customer_name,
      JSONExtractString(raw_data, 'payload', 'after', 'sale_code') AS sale_code,
      '' AS sale_name,
      JSONExtractString(raw_data, 'payload', 'after', 'doc_type') AS doc_type,
      toDateTime(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'due_date'))) AS due_date,
      JSONExtractFloat(raw_data, 'payload', 'after', 'sum_point') AS sum_point,
      JSONExtractFloat(raw_data, 'payload', 'after', 'total_value') AS total_value,
      JSONExtractFloat(raw_data, 'payload', 'after', 'total_discount') AS total_discount,
      JSONExtractFloat(raw_data, 'payload', 'after', 'total_before_vat') AS total_before_vat,
      JSONExtractFloat(raw_data, 'payload', 'after', 'total_vat_value') AS total_vat_value,
      JSONExtractFloat(raw_data, 'payload', 'after', 'total_after_vat') AS total_after_vat,
      JSONExtractFloat(raw_data, 'payload', 'after', 'total_except_vat') AS total_except_vat,
      JSONExtractFloat(raw_data, 'payload', 'after', 'total_amount') AS total_amount,
      JSONExtractString(raw_data, 'payload', 'after', 'remark') AS remark,
      JSONExtractString(raw_data, 'payload', 'after', 'branch_code') AS branch_code,
      '' AS branch_name,
      JSONExtractString(raw_data, 'payload', 'after', 'department_code') AS department_code,
      '' AS department_name,
      JSONExtractString(raw_data, 'payload', 'after', 'side_code') AS side_code,
      '' AS side_name,
      JSONExtractString(raw_data, 'payload', 'after', 'project_code') AS project_code,
      '' AS project_name,
      JSONExtractString(raw_data, 'payload', 'after', 'job_code') AS job_code,
      '' AS job_name,
      JSONExtractString(raw_data, 'payload', 'after', 'allocate_code') AS allocate_code,
      '' AS allocate_name,
      '' AS billing_no_array,
      JSONExtractFloat(raw_data, 'payload', 'after', 'pay_amount') AS sum_pay_money,
      multiIf(JSONExtractInt(raw_data, 'payload', 'after', 'last_status') = 0, 'Outstanding', JSONExtractInt(raw_data, 'payload', 'after', 'last_status') = 1, 'Partially Paid', JSONExtractInt(raw_data, 'payload', 'after', 'last_status') = 2, 'Fully Paid', '') AS status_payment,
      concat('b', extract(_topic, 'branch_(\\d+)')) AS branch_sync,
      '' AS branch_sync_name
    FROM ic_trans_raw
    WHERE (JSONExtractInt(raw_data, 'payload', 'after', 'trans_type') = 2) AND (JSONExtractString(raw_data, 'payload', 'op') IN ('c','u','r'))
      AND toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date')) = '2026-06-29'
      AND NOT (JSONExtractString(raw_data,'payload','after','doc_no')='CA690629-0001' AND extract(_topic,'branch_(\\d+)')='000' AND JSONExtractFloat(raw_data,'payload','after','total_amount') != 71452)
      AND NOT (JSONExtractString(raw_data,'payload','after','doc_no')='CRD26060002' AND extract(_topic,'branch_(\\d+)')='000')
  `;
  await client.command({ query: backfillHeader });
  console.log('Backfilled saleinvoice_transaction for 2026-06-29');

  const backfillDetail = `
    INSERT INTO saleinvoice_transaction_detail
    SELECT
      toDateTime(toDate(JSONExtractInt(r.raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
      JSONExtractString(r.raw_data, 'payload', 'after', 'doc_no') AS doc_no,
      JSONExtractString(r.raw_data, 'payload', 'after', 'branch_code') AS branch_code,
      '' AS branch_name,
      r.item_code_value AS item_code,
      JSONExtractString(r.raw_data, 'payload', 'after', 'barcode') AS barcode,
      JSONExtractString(r.raw_data, 'payload', 'after', 'item_name') AS item_name,
      JSONExtractString(r.raw_data, 'payload', 'after', 'unit_code') AS unit_code,
      '' AS unit_name,
      JSONExtractString(r.raw_data, 'payload', 'after', 'wh_code') AS wh_code,
      '' AS wh_name,
      JSONExtractString(r.raw_data, 'payload', 'after', 'shelf_code') AS shelf_code,
      '' AS shelf_name,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'qty') AS qty,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'price') AS price,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'discount_amount') AS discount_amount,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'sum_amount') AS sum_amount,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'sum_of_cost') AS sum_of_cost,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'average_cost') AS average_cost,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'stand_value') AS stand_value,
      JSONExtractFloat(r.raw_data, 'payload', 'after', 'divide_value') AS divide_value,
      multiIf(JSONExtractInt(r.raw_data, 'payload', 'after', 'tax_type') = 1, 'VAT', JSONExtractInt(r.raw_data, 'payload', 'after', 'tax_type') = 2, 'EXCEPTVAT', 'VAT') AS tax_type,
      ifNull(im.item_brand_code, '') AS item_brand_code,
      ifNull(im.item_brand_name, '') AS item_brand_name,
      JSONExtractString(r.raw_data, 'payload', 'after', 'ic_pattern') AS item_pattern_code,
      '' AS item_pattern_name, '' AS item_design_code, '' AS item_design_name, '' AS item_grade_code, '' AS item_grade_name,
      '' AS item_model_code, '' AS item_model_name,
      ifNull(im.item_category_code, '') AS item_category_code,
      ifNull(im.item_category_name, '') AS item_category_name,
      '' AS item_class_code, '' AS item_class_name,
      ifNull(im.group_main_code, '') AS group_main_code,
      ifNull(im.group_main_name, '') AS group_main_name,
      ifNull(im.group_sub_code, '') AS group_sub_code,
      ifNull(im.group_sub_name, '') AS group_sub_name,
      ifNull(im.group_sub2_code, '') AS group_sub2_code,
      ifNull(im.group_sub2_name, '') AS group_sub2_name,
      JSONExtractString(r.raw_data, 'payload', 'after', 'remark') AS description,
      if(JSONExtractInt(r.raw_data, 'payload', 'after', 'status') = 1, 'Cancel', '') AS status_cancel,
      r.branch_sync_value AS branch_sync,
      r.branch_sync_name_value AS branch_sync_name
    FROM (
      SELECT raw_data, _topic,
        concat('b', extract(_topic, 'branch_(\\d+)')) AS branch_sync_value,
        multiIf(position(_topic, 'branch_000.') > 0, 'บริษัท ช้าง สยาม กัมปนี จำกัด', position(_topic, 'branch_001.') > 0, 'บริษัท ช้างสยามรวย จำกัด', position(_topic, 'branch_002.') > 0, 'บริษัท ช้าง ทรัพย์ ทวี จำกัด', position(_topic, 'branch_003.') > 0, 'บริษัท ชาวทะเลเฮฮา จำกัด', position(_topic, 'branch_004.') > 0, 'บริษัท ดีจิงจัง 5665 จำกัด', position(_topic, 'branch_005.') > 0, 'บริษัท ฮอมฮัก จำกัด', '') AS branch_sync_name_value,
        JSONExtractString(raw_data, 'payload', 'after', 'item_code') AS item_code_value
      FROM ic_trans_detail_raw
      WHERE toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date')) = '2026-06-29'
    ) AS r
    LEFT JOIN item_master AS im ON (im.branch_sync = r.branch_sync_value) AND (im.item_code = r.item_code_value)
    WHERE (JSONExtractString(r.raw_data, 'payload', 'op') IN ('c','r')) AND (JSONExtractInt(r.raw_data, 'payload', 'after', 'trans_type') = 2)
      AND NOT (JSONExtractString(r.raw_data,'payload','after','doc_no')='CRD26060002' AND r.branch_sync_value='b000')
  `;
  await client.command({ query: backfillDetail });
  console.log('Backfilled saleinvoice_transaction_detail for 2026-06-29');

  await client.command({ query: 'OPTIMIZE TABLE saleinvoice_transaction FINAL' });
  await client.command({ query: 'OPTIMIZE TABLE saleinvoice_transaction_detail FINAL' });
  console.log('Optimized');

  const docs = ['CA690629-0001','CA690629-0002','CT690629-0001','CT690629-0002','CT690629-0003','CRD26060002'];
  const rows = await q(`SELECT doc_no, branch_sync, total_amount FROM saleinvoice_transaction WHERE branch_sync='b000' AND doc_no IN ('${docs.join("','")}') SETTINGS final=1`);
  console.log('b000 docs now:', JSON.stringify(rows, null, 1));

  const total = await q(`SELECT sum(total_amount) AS grand_total FROM saleinvoice_transaction WHERE branch_sync='b000' AND toDate(doc_datetime)='2026-06-29' SETTINGS final=1`);
  console.log('b000 header total_amount sum (2026-06-29):', total[0].grand_total);

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
