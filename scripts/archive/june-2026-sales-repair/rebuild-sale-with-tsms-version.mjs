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
async function exec(query) {
  await client.command({ query });
}

async function main() {
  console.log('=== STEP 1: Create new tables with _version (ts_ms) column ===');
  await exec(`
    CREATE TABLE saleinvoice_transaction_v2
    (
      doc_datetime DateTime, doc_no String, creator_code String, creator_name String,
      status_cancel String, pos_id String, customer_code String, customer_name String,
      sale_code String, sale_name String, doc_type String, due_date DateTime,
      sum_point Float64, total_value Float64, total_discount Float64, total_before_vat Float64,
      total_vat_value Float64, total_after_vat Float64, total_except_vat Float64, total_amount Float64,
      remark String, branch_code String, branch_name String, department_code String, department_name String,
      side_code String, side_name String, project_code String, project_name String, job_code String, job_name String,
      allocate_code String, allocate_name String, billing_no_array String, sum_pay_money Float64, status_payment String,
      branch_sync String, branch_sync_name String, _version UInt64
    )
    ENGINE = ReplacingMergeTree(_version)
    PARTITION BY toYYYYMM(doc_datetime)
    ORDER BY (doc_no, branch_sync)
    SETTINGS index_granularity = 8192
  `);
  console.log('Created saleinvoice_transaction_v2');

  await exec(`
    CREATE TABLE saleinvoice_transaction_detail_v2
    (
      doc_datetime DateTime, doc_no String, branch_code String, branch_name String, item_code String, barcode String,
      item_name String, unit_code String, unit_name String, wh_code String, wh_name String, shelf_code String, shelf_name String,
      qty Float64, price Float64, discount_amount Float64, sum_amount Float64, sum_of_cost Float64, average_cost Float64,
      stand_value Float64, divide_value Float64, tax_type String,
      item_brand_code String, item_brand_name String, item_pattern_code String, item_pattern_name String,
      item_design_code String, item_design_name String, item_grade_code String, item_grade_name String,
      item_model_code String, item_model_name String, item_category_code String, item_category_name String,
      item_class_code String, item_class_name String, group_main_code String, group_main_name String,
      group_sub_code String, group_sub_name String, group_sub2_code String, group_sub2_name String,
      description String, status_cancel String, branch_sync String, branch_sync_name String, _version UInt64
    )
    ENGINE = ReplacingMergeTree(_version)
    PARTITION BY toYear(doc_datetime)
    ORDER BY (doc_no, branch_sync, item_code, barcode, wh_code, shelf_code)
    SETTINGS index_granularity = 8192
  `);
  console.log('Created saleinvoice_transaction_detail_v2');

  console.log('\n=== STEP 2: Rebuild header from ic_trans_raw (full history, ts_ms as version) ===');
  await exec(`
    INSERT INTO saleinvoice_transaction_v2
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
      '' AS branch_sync_name,
      JSONExtractUInt(raw_data, 'payload', 'ts_ms') AS _version
    FROM ic_trans_raw
    WHERE (JSONExtractInt(raw_data, 'payload', 'after', 'trans_type') = 2) AND (JSONExtractString(raw_data, 'payload', 'op') IN ('c','u','r'))
  `);
  console.log('Header rebuilt');

  console.log('\n=== STEP 3: Rebuild detail from ic_trans_detail_raw (full history, ts_ms as version) ===');
  await exec(`
    INSERT INTO saleinvoice_transaction_detail_v2
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
      r.branch_sync_name_value AS branch_sync_name,
      JSONExtractUInt(r.raw_data, 'payload', 'ts_ms') AS _version
    FROM (
      SELECT raw_data, _topic,
        concat('b', extract(_topic, 'branch_(\\d+)')) AS branch_sync_value,
        multiIf(position(_topic, 'branch_000.') > 0, 'บริษัท ช้าง สยาม กัมปนี จำกัด', position(_topic, 'branch_001.') > 0, 'บริษัท ช้างสยามรวย จำกัด', position(_topic, 'branch_002.') > 0, 'บริษัท ช้าง ทรัพย์ ทวี จำกัด', position(_topic, 'branch_003.') > 0, 'บริษัท ชาวทะเลเฮฮา จำกัด', position(_topic, 'branch_004.') > 0, 'บริษัท ดีจิงจัง 5665 จำกัด', position(_topic, 'branch_005.') > 0, 'บริษัท ฮอมฮัก จำกัด', '') AS branch_sync_name_value,
        JSONExtractString(raw_data, 'payload', 'after', 'item_code') AS item_code_value
      FROM ic_trans_detail_raw
    ) AS r
    LEFT JOIN item_master AS im ON (im.branch_sync = r.branch_sync_value) AND (im.item_code = r.item_code_value)
    WHERE (JSONExtractString(r.raw_data, 'payload', 'op') IN ('c','r')) AND (JSONExtractInt(r.raw_data, 'payload', 'after', 'trans_type') = 2)
  `);
  console.log('Detail rebuilt');

  console.log('\n=== STEP 4: Row counts before swap ===');
  console.log(JSON.stringify(await q(`
    SELECT 'old header' t, count() c FROM saleinvoice_transaction
    UNION ALL SELECT 'new header', count() FROM saleinvoice_transaction_v2
    UNION ALL SELECT 'old detail', count() FROM saleinvoice_transaction_detail
    UNION ALL SELECT 'new detail', count() FROM saleinvoice_transaction_detail_v2
  `)));

  console.log('\n=== STEP 5: Swap tables ===');
  await exec(`RENAME TABLE saleinvoice_transaction TO saleinvoice_transaction_old2, saleinvoice_transaction_v2 TO saleinvoice_transaction`);
  await exec(`RENAME TABLE saleinvoice_transaction_detail TO saleinvoice_transaction_detail_old2, saleinvoice_transaction_detail_v2 TO saleinvoice_transaction_detail`);
  console.log('Swapped');

  console.log('\n=== STEP 6: OPTIMIZE FINAL ===');
  await exec('OPTIMIZE TABLE saleinvoice_transaction FINAL');
  await exec('OPTIMIZE TABLE saleinvoice_transaction_detail FINAL');
  console.log('Optimized');

  console.log('\n=== STEP 7: Verify b000 totals 20-30 June ===');
  const rows = await q(`
    SELECT toDate(doc_datetime) AS d, sum(total_amount) AS total, count() AS docs
    FROM saleinvoice_transaction
    WHERE branch_sync='b000' AND toDate(doc_datetime) BETWEEN '2026-06-20' AND '2026-06-30'
    GROUP BY d ORDER BY d
    SETTINGS final = 1
  `);
  console.log(JSON.stringify(rows, null, 1));

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
